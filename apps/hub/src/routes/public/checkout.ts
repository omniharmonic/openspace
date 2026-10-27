/**
 * Commerce endpoints called from published sites and from Stripe (arch §8.2, §9.5):
 *
 * - `POST /c/:siteId/checkout` — the cart's JSON `{items:[{sku,qty}], successUrl?, cancelUrl?}`,
 *   the donation block's form post (`kind=donation`, `amount` | `custom_amount`, `currency`,
 *   `interval`) or a membership sign-up (`kind=membership`, `tier`). JSON → `{ok,url,orderId}`;
 *   a no-JS form post → 303 to Stripe Checkout (errors → 303 back with `?os_checkout=error`).
 * - `GET  /c/:siteId/stock?sku=…` — availability for product pages.
 * - `GET  /c/:siteId/download/:token` — digital delivery (signed, expiring).
 * - `POST /c/stripe/webhook` — Connect endpoint; `POST /c/stripe/webhook/:siteId` — sovereign.
 */
import { Hono } from "hono";
import { HttpError } from "../../lib/errors";
import { PAGE_HEADERS, publicPage } from "../../lib/page";
import {
  allowedOrigins,
  type FieldValues,
  failureBody,
  originAllowed,
  parseFields,
  publicErrors,
  publicSite,
  publicSiteCors,
  readBodyLimited,
  rememberReturn,
  returnUrl,
  single,
  wantsJson,
} from "../../lib/public";
import {
  type CheckoutInput,
  createCheckout,
  donationAmount,
  parseCartItems,
  validCurrency,
} from "../../services/checkout";
import { growthSettings, inventoryFor } from "../../services/commerce";
import { siteBaseUrl } from "../../services/email";
import {
  digitalKey,
  getOrder,
  handleStripeWebhook,
  orderItems,
  verifyDownloadToken,
} from "../../services/orders";
import type { AppEnv } from "../../types";
import { gate } from "./gate";

export const publicCheckoutRoutes = new Hono<AppEnv>();

publicCheckoutRoutes.use("/c/:siteId/checkout", publicSiteCors(), publicErrors("os_checkout"));
publicCheckoutRoutes.use("/c/:siteId/stock", publicSiteCors(), publicErrors());

interface CheckoutBody {
  fields: FieldValues;
  items?: unknown;
}

async function readCheckoutBody(c: Parameters<typeof wantsJson>[0]): Promise<CheckoutBody> {
  const type = (c.req.header("content-type") ?? "").toLowerCase();
  if (!type.includes("application/json")) return { fields: await parseFields(c) };
  let body: unknown;
  try {
    const text = new TextDecoder().decode(await readBodyLimited(c.req.raw, 64 * 1024));
    body = text ? JSON.parse(text) : {};
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "invalid_request", "We couldn't read that request.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new HttpError(400, "invalid_request", "Expected a JSON object.");
  const fields: FieldValues = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>))
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      fields[k] = String(v).slice(0, 2000);
  return { fields, items: (body as { items?: unknown }).items };
}

publicCheckoutRoutes.post("/c/:siteId/checkout", async (c) => {
  const { services } = c.var;
  const site = await publicSite(services.db, c.req.param("siteId"));
  if (!originAllowed(c.req.header("origin"), site, c.var.config))
    throw new HttpError(403, "forbidden_origin", "Checkout from this website isn't allowed.");
  const json = wantsJson(c);
  const { fields, items } = await readCheckoutBody(c);
  const source = single(fields._source) ?? single(fields.source);
  rememberReturn(c, source, single(fields._anchor));
  const base = siteBaseUrl(site, services.config.hubUrl);
  const allowed = allowedOrigins(site, c.var.config);
  const referer = c.req.header("referer") ?? null;
  // Where Stripe sends people back: only pages of this site (open-redirect safe).
  const success = returnUrl(
    base,
    allowed,
    single(fields.successUrl) ?? source,
    referer,
    "os_checkout",
    "success",
  );
  const cancel = returnUrl(
    base,
    allowed,
    single(fields.cancelUrl) ?? source,
    referer,
    "os_checkout",
    "cancel",
  );
  if (single(fields._hp))
    throw new HttpError(422, "invalid_request", "We couldn't start checkout. Please try again.");

  let started: { url: string; orderId: string };
  try {
    const blocked = await gate(c, site, "checkout", null, { turnstile: false });
    if (blocked) throw new HttpError(blocked.status, blocked.code, blocked.message);

    const kind = single(fields.kind) ?? "cart";
    const email = single(fields.email);
    let input: CheckoutInput;
    if (kind === "donation") {
      const settings = await growthSettings(services.db, site.id);
      const currency = validCurrency(single(fields.currency) ?? settings.currency);
      const interval = single(fields.interval) ?? "once";
      if (interval !== "once" && interval !== "month")
        throw new HttpError(422, "invalid_interval", "Choose one-time or monthly.");
      input = {
        kind: "donation",
        currency,
        interval,
        email,
        amount: donationAmount(
          {
            amount: single(fields.amount),
            custom_amount: single(fields.custom_amount),
            custom: single(fields.custom),
          },
          currency,
          { min: settings.donationMin, max: settings.donationMax },
        ),
      };
    } else if (kind === "membership") {
      const tierId = single(fields.tier) ?? "";
      if (!/^tier_[0-9a-z]{4,20}$/.test(tierId))
        throw new HttpError(422, "invalid_tier", "That membership isn't available.");
      input = { kind: "membership", tierId, email };
    } else if (kind === "cart") {
      input = { kind: "cart", items: parseCartItems(items), email };
    } else throw new HttpError(422, "invalid_request", "Unknown checkout type.");
    started = await createCheckout(services, site, input, { success, cancel });
  } catch (err) {
    // Visitors never see raw errors or the Hub's configuration (e.g. a missing Stripe key):
    // a plain page (no-JS form posts navigate here) or a short JSON message for the site's script.
    if (!(err instanceof HttpError) || err.status < 500) throw err;
    c.var.log.warn("checkout unavailable", { siteId: site.id, code: err.code });
    const message =
      err.code === "not_configured"
        ? `${site.name} isn't set up to take payments yet. Nothing was charged.`
        : "Checkout isn't available right now. Nothing was charged — please try again later.";
    if (json)
      return c.json({ ok: false, message, error: { code: "payments_unavailable", message } }, 503);
    return c.html(
      publicPage({
        title: "Payments aren't available",
        heading: "Payments aren't available yet",
        body: message,
        link: { href: base, label: `Back to ${site.name}` },
      }),
      503,
      PAGE_HEADERS,
    );
  }
  const { url, orderId } = started;
  return json ? c.json({ ok: true, url, orderId }) : c.redirect(url, 303);
});

/** Stock for product pages: `{ skus: { [sku]: { inStock, low, qty|null } } }` (tracked SKUs). */
publicCheckoutRoutes.get("/c/:siteId/stock", async (c) => {
  const { services } = c.var;
  const site = await publicSite(services.db, c.req.param("siteId"));
  const skus = [...new Set(c.req.queries("sku") ?? [])].filter((s) => s.length <= 64).slice(0, 50);
  const settings = await growthSettings(services.db, site.id);
  const rows = await inventoryFor(services.db, site.id, skus);
  const out: Record<
    string,
    { tracked: boolean; inStock: boolean; low: boolean; qty: number | null }
  > = {};
  for (const sku of skus) {
    const r = rows.get(sku);
    if (!r) out[sku] = { tracked: false, inStock: true, low: false, qty: null };
    else {
      const low = r.qty > 0 && r.qty <= (r.low_stock ?? settings.lowStockThreshold);
      // Exact counts only when low ("Only 2 left"); otherwise just in/out of stock.
      out[sku] = { tracked: true, inStock: r.qty > 0, low, qty: low ? r.qty : null };
    }
  }
  c.header("Cache-Control", "public, max-age=15");
  return c.json({ skus: out });
});

publicCheckoutRoutes.get("/c/:siteId/download/:token", async (c) => {
  const { services } = c.var;
  const site = await publicSite(services.db, c.req.param("siteId"));
  const gone = () =>
    c.text(
      "This download link has expired or isn't valid. Check your latest email from the shop.",
      404,
    );
  const t = await verifyDownloadToken(services, c.req.param("token"));
  if (!t) return gone();
  const order = await getOrder(services.db, site.id, t.orderId);
  if (!order || !["paid", "partially_refunded"].includes(order.status)) return gone();
  const item = orderItems(order)[t.idx];
  if (!item?.digital) return gone();
  const obj = await services.uploads.get(digitalKey(site.id, item.sku));
  if (!obj) return gone();
  const name = (obj.customMetadata?.filename ?? item.sku).replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

const webhook =
  (endpoint: "connect" | "sovereign") => async (c: Parameters<typeof wantsJson>[0]) => {
    const raw = new TextDecoder().decode(await readBodyLimited(c.req.raw, 512 * 1024));
    const siteId = c.req.param("siteId") ?? "";
    if (endpoint === "sovereign" && !/^st_[0-9a-z]{4,40}$/.test(siteId))
      return c.json(failureBody({ status: 404, code: "not_found", message: "Not found." }), 404);
    try {
      const result = await handleStripeWebhook(
        c.var.services,
        raw,
        c.req.header("stripe-signature") ?? null,
        endpoint === "connect" ? { kind: "connect" } : { kind: "sovereign", siteId },
        c.var.log,
      );
      return c.json(result.body, result.status);
    } catch (err) {
      // Not recorded as processed: Stripe redelivers, and idempotent follow-ups resume.
      c.var.log.error("stripe webhook processing failed", { err });
      return c.json(
        { error: { code: "processing_failed", message: "Couldn't process the event; retry." } },
        500,
      );
    }
  };

publicCheckoutRoutes.post("/c/stripe/webhook", webhook("connect"));
publicCheckoutRoutes.post("/c/stripe/webhook/:siteId", webhook("sovereign"));
