/**
 * Member sign-in (arch §8.2, §9.4):
 *
 * - `GET  /.well-known/jwks.json` — public ES256 keys for member tokens (site Workers verify).
 * - `GET  /m/:siteId/login?return=/path` — Hub-hosted sign-in page (where gated pages send
 *   visitors without a session).
 * - `POST /m/:siteId/login` — `{email, return_to?, _source?, _anchor?, _hp?, cf-turnstile-response?}`.
 *   JSON (fetch) → `{ok, message}`; no-JS → 303 back to the page (`?os_member=sent#anchor`, via the
 *   open-redirect-safe `returnUrl`); from the Hub page → a "check your inbox" page.
 * - `GET  /m/:siteId/verify/:token` — "Continue" page (GET never uses the link: mail scanners
 *   prefetch links). `POST` uses it once and 303s to `<site>/_os/auth/callback?token=<JWT>&return=`.
 */
import { esc } from "@omniharmonic/openspace-email-render";
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { emailDeliverable } from "../../lib/capabilities";
import { HttpError } from "../../lib/errors";
import { PAGE_HEADERS, PAGE_HEADERS_REDIRECTING, publicPage } from "../../lib/page";
import {
  allowedOrigins,
  failureBody,
  originAllowed,
  parseFields,
  publicErrors,
  publicSite,
  publicSiteCors,
  rememberReturn,
  returnUrl,
  single,
  wantsJson,
} from "../../lib/public";
import { siteBaseUrl } from "../../services/email";
import { jwks } from "../../services/member-keys";
import {
  consumeMagicLink,
  HUB_MEMBER_COOKIE,
  HUB_MEMBER_TTL_SEC,
  hubMemberCookieValue,
  memberCallbackUrl,
  peekMagicLink,
  rememberedMember,
  requestMagicLink,
} from "../../services/members";
import type { AppEnv } from "../../types";
import { gate } from "./gate";

export const publicMemberRoutes = new Hono<AppEnv>();

publicMemberRoutes.get("/.well-known/jwks.json", async (c) => {
  return c.json(await jwks(c.var.services), 200, {
    "Cache-Control": "public, max-age=300",
    "Access-Control-Allow-Origin": "*",
  });
});

publicMemberRoutes.use("/m/:siteId/login", publicSiteCors(), publicErrors("os_member"));

const SENT = "Check your inbox — we've sent you a sign-in link.";
const NO_EMAIL =
  "Sign-in links are sent by email, and this site can't send email yet. Please contact the site's owner.";

function loginPageHeaders(siteKey: string | null) {
  if (!siteKey) return PAGE_HEADERS;
  const ts = "https://challenges.cloudflare.com";
  return {
    ...PAGE_HEADERS,
    "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; script-src ${ts}; frame-src ${ts}; connect-src ${ts}; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  };
}

const hubMemberCookie = (c: Context<AppEnv>, siteId: string, value: string, maxAge: number) =>
  `${HUB_MEMBER_COOKIE}=${value}; Path=/m/${siteId}/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${c.var.config.secureCookies ? "; Secure" : ""}`;

publicMemberRoutes.get("/m/:siteId/login", async (c) => {
  const site = await publicSite(c.var.services.db, c.req.param("siteId"));
  const siteKey = c.var.services.pub.config.turnstile.siteKey;
  const ret = c.req.query("return") ?? "";
  // Silent re-sign-in: the site's short session ran out (or the tier changed) and this browser
  // already signed in here — hand back a fresh token with the member's current tier.
  const remembered = await rememberedMember(
    c.var.services,
    site.id,
    getCookie(c, HUB_MEMBER_COOKIE),
  );
  if (remembered) {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    return c.redirect(await memberCallbackUrl(c.var.services, site, remembered, ret), 303);
  }
  if (getCookie(c, HUB_MEMBER_COOKIE)) c.header("Set-Cookie", hubMemberCookie(c, site.id, "", 0));
  if (!emailDeliverable(c.var.services))
    return c.html(
      publicPage({
        title: "Sign-in isn't available yet",
        heading: "Sign-in isn't available yet",
        body: NO_EMAIL,
        link: { href: siteBaseUrl(site, c.var.config.hubUrl), label: `Back to ${site.name}` },
      }),
      503,
      PAGE_HEADERS,
    );
  const form = `<form method="post" action="/m/${esc(site.id)}/login">
<p><label for="email">Email address</label><br><input id="email" name="email" type="email" required autocomplete="email" inputmode="email" style="width:100%;padding:10px;font:inherit;border:1px solid var(--line);border-radius:8px"></p>
<input type="hidden" name="return_to" value="${esc(ret)}"><input type="hidden" name="_hub" value="1">
<div style="position:absolute;left:-9999px" aria-hidden="true"><input name="_hp" tabindex="-1" autocomplete="off"></div>
${siteKey ? `<div class="cf-turnstile" data-sitekey="${esc(siteKey)}"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>` : ""}
<p><button type="submit">Email me a sign-in link</button></p></form>`;
  return c.html(
    publicPage({
      title: `Sign in to ${site.name}`,
      heading: `Sign in to ${site.name}`,
      body: "Enter your email and we'll send you a link to sign in. No password needed.",
      extraHtml: form,
      link: { href: siteBaseUrl(site, c.var.config.hubUrl), label: `Back to ${site.name}` },
    }),
    200,
    loginPageHeaders(siteKey),
  );
});

publicMemberRoutes.post("/m/:siteId/login", async (c) => {
  const { services } = c.var;
  const site = await publicSite(services.db, c.req.param("siteId"));
  const hubOrigin = new URL(c.var.config.hubUrl).origin;
  const origin = c.req.header("origin");
  if (origin !== hubOrigin && !originAllowed(origin, site, c.var.config))
    throw new HttpError(403, "forbidden_origin", "Sign-in from this website isn't allowed.");
  const json = wantsJson(c);
  const fields = await parseFields(c);
  const fromHub = single(fields._hub) === "1";
  const source = single(fields._source) ?? single(fields.return_to);
  rememberReturn(c, source, single(fields._anchor));
  const base = siteBaseUrl(site, services.config.hubUrl);
  const back = (status: string) =>
    returnUrl(
      base,
      allowedOrigins(site, c.var.config),
      source,
      c.req.header("referer") ?? null,
      "os_member",
      status,
      single(fields._anchor),
    );
  const sentPage = () =>
    c.html(
      publicPage({
        title: "Check your inbox",
        heading: "Check your inbox",
        body: `If that address can sign in to ${site.name}, a link is on its way. It works for 15 minutes.`,
        link: { href: base, label: `Back to ${site.name}` },
      }),
      200,
      PAGE_HEADERS,
    );
  const done = () =>
    json
      ? c.json({ ok: true, message: SENT })
      : fromHub
        ? sentPage()
        : c.redirect(back("sent"), 303);
  if (single(fields._hp)) return done();
  // No email provider: a sign-in link can't be sent, so say so instead of "check your inbox".
  if (!emailDeliverable(services)) {
    if (json)
      return c.json(
        failureBody({ status: 503, code: "email_unavailable", message: NO_EMAIL }),
        503,
      );
    return c.html(
      publicPage({
        title: "Sign-in isn't available yet",
        heading: "Sign-in isn't available yet",
        body: NO_EMAIL,
        link: { href: base, label: `Back to ${site.name}` },
      }),
      503,
      PAGE_HEADERS,
    );
  }

  const blocked = await gate(
    c,
    site,
    "login",
    single(fields["cf-turnstile-response"]) ?? single(fields._turnstile),
  );
  if (blocked) {
    if (json) return c.json(failureBody(blocked), blocked.status);
    throw new HttpError(blocked.status, blocked.code, blocked.message);
  }
  try {
    const outcome = await requestMagicLink(services, site, {
      email: single(fields.email) ?? "",
      returnTo: single(fields.return_to) ?? source,
    });
    if (outcome !== "sent") c.var.log.info("magic link not sent", { siteId: site.id, outcome });
  } catch (err) {
    if (err instanceof HttpError && err.code === "bad_request")
      throw new HttpError(422, "invalid_fields", err.message, { email: err.message });
    throw err;
  }
  // Same answer for members, non-members and throttled requests (no enumeration).
  return done();
});

const expired = () =>
  publicPage({
    title: "Link expired",
    heading: "This sign-in link has expired",
    body: "Sign-in links work once, for 15 minutes. Please request a new one.",
  });

publicMemberRoutes.get("/m/:siteId/verify/:token", async (c) => {
  const { services } = c.var;
  const site = await publicSite(services.db, c.req.param("siteId"));
  const token = c.req.param("token");
  if (!(await peekMagicLink(services, site.id, token))) return c.html(expired(), 404, PAGE_HEADERS);
  return c.html(
    publicPage({
      title: `Sign in to ${site.name}`,
      heading: `Sign in to ${site.name}`,
      body: "Continue to finish signing in.",
      extraHtml: `<form method="post" action="/m/${esc(site.id)}/verify/${esc(encodeURIComponent(token))}"><button type="submit">Continue</button></form>`,
    }),
    200,
    PAGE_HEADERS_REDIRECTING,
  );
});

publicMemberRoutes.post("/m/:siteId/verify/:token", async (c) => {
  const { services } = c.var;
  const site = await publicSite(services.db, c.req.param("siteId"));
  const result = await consumeMagicLink(services, site, c.req.param("token"));
  if (!result) return c.html(expired(), 404, PAGE_HEADERS);
  c.header(
    "Set-Cookie",
    hubMemberCookie(
      c,
      site.id,
      await hubMemberCookieValue(services, site.id, result.member.id),
      HUB_MEMBER_TTL_SEC,
    ),
  );
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  return c.redirect(result.redirect, 303);
});
