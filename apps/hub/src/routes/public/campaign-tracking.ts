/**
 * Campaign tracking and provider webhooks (arch §9.2):
 *
 * - `GET  /e/c/:token/:n` — click redirect. `token` = `<recipient>.<hmac>`; the target is link n of
 *   that recipient's campaign as frozen at send time — never a URL from the request (no open
 *   redirect). Unknown tokens/indexes get a 404 page.
 * - `GET  /e/o/:token.gif` — open pixel (only in campaigns with open tracking on).
 * - `POST /e/webhooks/:provider/:senderId` — bounces and complaints, authenticated per provider:
 *   Resend = Svix signature; Postmark / dev = Basic auth or `?token=` (a Hub-minted secret);
 *   SES = SNS message signature (certificate from an amazonaws.com SNS host) plus the token.
 */
import { Hono } from "hono";
import { timingSafeEqual } from "../../lib/crypto";
import { PAGE_HEADERS, publicPage } from "../../lib/page";
import { readBodyLimited } from "../../lib/public";
import { recordDeliveryEvent, trackClick, trackOpen } from "../../services/campaigns";
import { type SenderRow, senderWebhookSecret, verifySns, verifySvix } from "../../services/senders";
import type { AppEnv } from "../../types";

export const campaignTrackingRoutes = new Hono<AppEnv>();

const GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (ch) => ch.charCodeAt(0),
);

campaignTrackingRoutes.get("/e/c/:token/:idx", async (c) => {
  const idx = Number(c.req.param("idx"));
  const url = await trackClick(c.var.services, c.req.param("token"), idx);
  if (!url)
    return c.html(
      publicPage({
        title: "Link not found",
        heading: "This link isn't available",
        body: "It may be from an old email. Please open the latest one.",
      }),
      404,
      PAGE_HEADERS,
    );
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  return c.redirect(url, 302);
});

campaignTrackingRoutes.get("/e/o/:file", async (c) => {
  const file = c.req.param("file");
  if (file.endsWith(".gif"))
    await trackOpen(c.var.services, file.slice(0, -4)).catch(() => undefined);
  return c.body(GIF, 200, {
    "Content-Type": "image/gif",
    "Cache-Control": "no-store, private",
  });
});

type DeliveryEvent = Parameters<typeof recordDeliveryEvent>[2];

/** Hub-minted webhook secret, as `?token=` or the Basic-auth password. */
async function tokenOk(
  secret: string | null,
  query: string | undefined,
  auth = "",
): Promise<boolean> {
  if (!secret) return false;
  if (query && (await timingSafeEqual(query, secret))) return true;
  if (auth.startsWith("Basic ")) {
    try {
      const [, pass = ""] = atob(auth.slice(6)).split(":", 2);
      return timingSafeEqual(pass, secret);
    } catch {
      return false;
    }
  }
  return false;
}

/** Resend events (`email.bounced`, `email.complained`). */
function resendEvents(body: Record<string, unknown>): DeliveryEvent[] {
  const data = (body.data as Record<string, unknown> | undefined) ?? {};
  const to = Array.isArray(data.to) ? (data.to as string[]) : [];
  const id = typeof data.email_id === "string" ? data.email_id : null;
  if (body.type === "email.complained")
    return [{ messageId: id, email: to[0] ?? null, kind: "complaint", permanent: true }];
  if (body.type === "email.bounced") {
    const type = String((data.bounce as Record<string, unknown> | undefined)?.type ?? "Permanent");
    return [
      {
        messageId: id,
        email: to[0] ?? null,
        kind: "bounce",
        permanent: !/transient|temporary/i.test(type),
      },
    ];
  }
  return [];
}

/** Postmark bounce/spam webhooks (`RecordType`). */
function postmarkEvents(body: Record<string, unknown>): DeliveryEvent[] {
  const id = typeof body.MessageID === "string" ? body.MessageID : null;
  const email = typeof body.Email === "string" ? body.Email : null;
  if (body.RecordType === "SpamComplaint")
    return [{ messageId: id, email, kind: "complaint", permanent: true }];
  if (body.RecordType === "Bounce")
    return [
      {
        messageId: id,
        email,
        kind: "bounce",
        permanent: [
          "HardBounce",
          "BadEmailAddress",
          "ManuallyDeactivated",
          "SpamNotification",
        ].includes(String(body.Type)),
      },
    ];
  return [];
}

/** SES notifications (inside an SNS Notification's `Message`). */
function sesEvents(msg: Record<string, unknown>): DeliveryEvent[] {
  const type = String(msg.notificationType ?? msg.eventType ?? "");
  const mail = (msg.mail as Record<string, unknown> | undefined) ?? {};
  const id = typeof mail.messageId === "string" ? mail.messageId : null;
  if (type === "Bounce") {
    const b = (msg.bounce as Record<string, unknown> | undefined) ?? {};
    const permanent = b.bounceType === "Permanent";
    return ((b.bouncedRecipients as Array<{ emailAddress?: string }>) ?? []).map((r) => ({
      messageId: id,
      email: r.emailAddress ?? null,
      kind: "bounce" as const,
      permanent,
    }));
  }
  if (type === "Complaint") {
    const cpl = (msg.complaint as Record<string, unknown> | undefined) ?? {};
    return ((cpl.complainedRecipients as Array<{ emailAddress?: string }>) ?? []).map((r) => ({
      messageId: id,
      email: r.emailAddress ?? null,
      kind: "complaint" as const,
      permanent: true,
    }));
  }
  return [];
}

campaignTrackingRoutes.post("/e/webhooks/:provider/:senderId", async (c) => {
  const { services } = c.var;
  const provider = c.req.param("provider");
  const sender = await services.db
    .prepare("SELECT * FROM sender_connections WHERE id = ? AND provider = ?")
    .bind(c.req.param("senderId"), provider)
    .first<SenderRow>();
  if (!sender) return c.json({ error: { code: "not_found", message: "Not found." } }, 404);
  const raw = new TextDecoder().decode(await readBodyLimited(c.req.raw, 256 * 1024));
  const secret = await senderWebhookSecret(services, sender);
  const unauthorized = () =>
    c.json({ error: { code: "bad_signature", message: "Invalid signature." } }, 401);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return c.json({ error: { code: "bad_request", message: "Unreadable payload." } }, 400);
  }
  let events: DeliveryEvent[] = [];
  if (provider === "resend") {
    if (
      !secret ||
      !(await verifySvix(
        secret,
        {
          id: c.req.header("svix-id") ?? null,
          timestamp: c.req.header("svix-timestamp") ?? null,
          signature: c.req.header("svix-signature") ?? null,
        },
        raw,
        Math.floor(services.now() / 1000),
      ))
    )
      return unauthorized();
    events = resendEvents(body);
  } else if (provider === "postmark" || provider === "dev") {
    if (!(await tokenOk(secret, c.req.query("token"), c.req.header("authorization"))))
      return unauthorized();
    // The dev sender accepts Postmark-shaped events (handy for demos and tests).
    events = postmarkEvents(body);
  } else if (provider === "ses") {
    if (!(await tokenOk(secret, c.req.query("token"), c.req.header("authorization"))))
      return unauthorized();
    const msg = body as Record<string, string>;
    const fetchCert = async (url: string) => (await services.fetch(url)).text();
    if (!(await verifySns(msg, fetchCert))) return unauthorized();
    if (msg.Type === "SubscriptionConfirmation") {
      // Confirm the SNS subscription (URL host already pinned by the verified signature).
      if (/^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?\//.test(msg.SubscribeURL ?? ""))
        await services.fetch(msg.SubscribeURL as string);
      return c.json({ ok: true, confirmed: true });
    }
    try {
      events = sesEvents(JSON.parse(msg.Message ?? "{}") as Record<string, unknown>);
    } catch {
      events = [];
    }
  } else return c.json({ error: { code: "not_found", message: "Not found." } }, 404);
  let recorded = 0;
  for (const e of events) if (await recordDeliveryEvent(services, sender, e)) recorded++;
  return c.json({ ok: true, recorded });
});
