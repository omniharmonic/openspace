/**
 * Newsletter (architecture §9.2, PRD FR-33):
 * - `POST /n/:siteId/subscribe` — signup → double opt-in email.
 * - `GET  /n/confirm/:token` — page with a "Confirm subscription" button; `POST` confirms.
 * - `GET  /n/unsubscribe/:token` — page with an "Unsubscribe" button (GET never mutates, so link
 *   scanners can't unsubscribe people).
 * - `POST /n/unsubscribe/:token` — RFC 8058 one-click (`List-Unsubscribe=One-Click`) or the button.
 */

import { esc } from "@omniharmonic/openspace-email-render";
import { Hono } from "hono";
import { HttpError } from "../../lib/errors";
import { PAGE_HEADERS, publicPage } from "../../lib/page";
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
import {
  confirmSubscription,
  peekConfirmation,
  subscribe,
  TagSchema,
  unsubscribeByToken,
} from "../../services/newsletter";
import type { AppEnv } from "../../types";
import { gate } from "./gate";

export const publicNewsletterRoutes = new Hono<AppEnv>();

publicNewsletterRoutes.use("/n/:siteId/subscribe", publicSiteCors(), publicErrors("os_newsletter"));

const PENDING_MESSAGE = "Almost there — check your inbox to confirm your subscription.";

publicNewsletterRoutes.post("/n/:siteId/subscribe", async (c) => {
  const { services } = c.var;
  const site = await publicSite(services.db, c.req.param("siteId"));
  if (!originAllowed(c.req.header("origin"), site, c.var.config))
    throw new HttpError(403, "forbidden_origin", "Signups from this website aren't accepted.");
  const json = wantsJson(c);
  const fields = await parseFields(c);
  const source = single(fields.source) ?? single(fields._source);
  rememberReturn(c, source, single(fields._anchor));
  const base = siteBaseUrl(site, services.config.hubUrl);
  const back = (status: string) =>
    returnUrl(
      base,
      allowedOrigins(site, c.var.config),
      source,
      c.req.header("referer") ?? null,
      "os_newsletter",
      status,
      single(fields._anchor),
    );
  const done = () =>
    json ? c.json({ ok: true, message: PENDING_MESSAGE }) : c.redirect(back("pending"), 303);
  if (single(fields._hp)) return done();

  const blocked = await gate(
    c,
    site,
    "subscribe",
    single(fields["cf-turnstile-response"]) ?? single(fields._turnstile),
  );
  if (blocked)
    return json ? c.json(failureBody(blocked), blocked.status) : c.redirect(back("error"), 303);

  const email = single(fields.email) ?? "";
  const tags = (Array.isArray(fields.tags) ? fields.tags : fields.tags ? [fields.tags] : [])
    .filter((t) => TagSchema.safeParse(t).success)
    .slice(0, 10);
  try {
    const outcome = await subscribe(services, site, {
      email,
      firstName: single(fields.first_name) ?? single(fields.name),
      source: source ?? "form",
      tags,
    });
    if (outcome === "throttled")
      c.var.log.info("confirmation email throttled", { siteId: site.id });
  } catch (err) {
    if (err instanceof HttpError && !json) return c.redirect(back("error"), 303);
    if (err instanceof HttpError && err.code === "bad_request")
      return c.json(
        failureBody({
          status: 422,
          code: "invalid_fields",
          message: err.message,
          errors: { email: err.message },
        }),
        422,
      );
    throw err;
  }
  // Same answer whether the address was new, pending, throttled or already confirmed.
  return done();
});

const expiredPage = () =>
  publicPage({
    title: "Link expired",
    heading: "This link has expired",
    body: "Confirmation links work for 7 days and only once. Please sign up again on the website.",
  });

/** GET only shows a button (mail scanners prefetch links); POST confirms. */
publicNewsletterRoutes.get("/n/confirm/:token", async (c) => {
  const token = c.req.param("token");
  const found = await peekConfirmation(c.var.services, token);
  if (!found) return c.html(expiredPage(), 404, PAGE_HEADERS);
  const { site, subscriber } = found;
  return c.html(
    publicPage({
      title: `Confirm your subscription to ${site.name}`,
      heading: `Confirm your subscription to ${site.name}`,
      body: `Click below to start receiving updates at ${subscriber.email}.`,
      extraHtml: `<form method="post" action="/n/confirm/${esc(encodeURIComponent(token))}"><button type="submit">Confirm subscription</button></form>`,
    }),
    200,
    PAGE_HEADERS,
  );
});

publicNewsletterRoutes.post("/n/confirm/:token", async (c) => {
  const result = await confirmSubscription(c.var.services, c.req.param("token"));
  if (!result) return c.html(expiredPage(), 404, PAGE_HEADERS);
  const { site } = result;
  if (result.status === "full")
    return c.html(
      publicPage({
        title: "List is full",
        heading: "This list is full right now",
        body: `${site.name} can't take new subscribers at the moment. Please try again later.`,
        link: { href: siteBaseUrl(site, c.var.config.hubUrl), label: `Back to ${site.name}` },
      }),
      409,
      PAGE_HEADERS,
    );
  return c.html(
    publicPage({
      title: `Subscribed to ${site.name}`,
      heading: "You're subscribed",
      body: `Thanks for confirming. You'll now receive updates from ${site.name}.`,
      link: { href: siteBaseUrl(site, c.var.config.hubUrl), label: `Back to ${site.name}` },
    }),
    200,
    PAGE_HEADERS,
  );
});

publicNewsletterRoutes.get("/n/unsubscribe/:token", async (c) => {
  const token = c.req.param("token");
  const result = await unsubscribeByToken(c.var.services, token, false);
  if (!result)
    return c.html(
      publicPage({
        title: "Link not valid",
        heading: "This link isn't valid",
        body: "Please use the link from your most recent email.",
      }),
      404,
      PAGE_HEADERS,
    );
  const name = result.site?.name ?? "this list";
  if (result.subscriber.status === "unsubscribed")
    return c.html(
      publicPage({
        title: "Unsubscribed",
        heading: "You're unsubscribed",
        body: `You won't receive more emails from ${name}.`,
      }),
      200,
      PAGE_HEADERS,
    );
  return c.html(
    publicPage({
      title: `Unsubscribe from ${name}`,
      heading: `Unsubscribe from ${name}?`,
      body: `${result.subscriber.email} will stop receiving emails from ${name}.`,
      extraHtml: `<form method="post" action="/n/unsubscribe/${esc(encodeURIComponent(token))}"><button type="submit">Unsubscribe</button></form>`,
    }),
    200,
    PAGE_HEADERS,
  );
});

publicNewsletterRoutes.post("/n/unsubscribe/:token", async (c) => {
  const result = await unsubscribeByToken(c.var.services, c.req.param("token"), true);
  if (!result) return c.text("This unsubscribe link isn't valid.", 404);
  // Mail clients' one-click POST (RFC 8058) only needs a 2xx; browsers get a page.
  const accept = c.req.header("accept") ?? "";
  if (!accept.includes("text/html")) return c.text("Unsubscribed.", 200);
  const name = result.site?.name ?? "this list";
  return c.html(
    publicPage({
      title: "Unsubscribed",
      heading: "You're unsubscribed",
      body: `You won't receive more emails from ${name}.`,
    }),
    200,
    PAGE_HEADERS,
  );
});
