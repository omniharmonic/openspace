/**
 * DevStripe pages (Global Constraint 8; only while the Hub uses DevStripe — 404 otherwise):
 *
 * - `GET  /dev/stripe/checkout/:id` — a fake Stripe Checkout page (amounts from the session the
 *   Hub created, never from the browser) with a test email, optional promotion code, Pay/Cancel.
 * - `POST /dev/stripe/checkout/:id` — `action=pay` completes the session exactly once and fires a
 *   signed `checkout.session.completed` event through the SAME webhook path real Stripe uses
 *   (`handleStripeWebhook`), then 303s to the success URL. `action=cancel` → the cancel URL.
 * - `GET|POST /dev/stripe/connect/:account` — fake Connect onboarding ("Finish setup").
 */
import { esc } from "@openspace/email-render";
import { type Context, Hono } from "hono";
import { DEV_STRIPE_WEBHOOK_SECRET } from "../../growth-env";
import { randomId } from "../../lib/crypto";
import { PAGE_HEADERS, PAGE_HEADERS_REDIRECTING, publicPage } from "../../lib/page";
import { parseFields, single } from "../../lib/public";
import { handleStripeWebhook } from "../../services/orders";
import {
  claimDevSession,
  type DevSession,
  devPromotion,
  enableDevAccount,
  getDevSession,
  signStripePayload,
} from "../../services/stripe";
import type { AppEnv } from "../../types";

export const devStripeRoutes = new Hono<AppEnv>();

devStripeRoutes.use("/dev/stripe/*", async (c, next) => {
  if (!c.var.services.growth.config.stripeDev) return c.notFound();
  await next();
});

function money(minor: number, currency: string): string {
  try {
    const f = new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() });
    const exp = f.resolvedOptions().maximumFractionDigits as number;
    return f.format(minor / 10 ** exp);
  } catch {
    return `${minor} ${currency}`;
  }
}

function totals(s: DevSession, discount: { percentOff?: number; amountOff?: number } | null) {
  const subtotal = s.params.line_items.reduce(
    (n, l) => n + l.price_data.unit_amount * l.quantity,
    0,
  );
  const shipping = s.params.shipping_options?.[0]?.shipping_rate_data.fixed_amount.amount ?? 0;
  let off = 0;
  if (discount?.percentOff) off = Math.round((subtotal * discount.percentOff) / 100);
  else if (discount?.amountOff) off = Math.min(subtotal, discount.amountOff);
  return { subtotal, shipping, discount: off, total: subtotal - off + shipping };
}

const notFoundPage = (c: Context<AppEnv>) =>
  c.html(
    publicPage({
      title: "Checkout not found",
      heading: "This checkout has ended",
      body: "It was completed, cancelled or expired. Go back to the shop to try again.",
    }),
    404,
    PAGE_HEADERS,
  );

devStripeRoutes.get("/dev/stripe/checkout/:id", async (c) => {
  const s = await getDevSession(c.var.services.db, c.req.param("id"));
  if (s?.status !== "open") return notFoundPage(c);
  const cur = s.params.line_items[0]?.price_data.currency ?? "usd";
  const t = totals(s, null);
  const rows = s.params.line_items
    .map(
      (l) =>
        `<li>${esc(l.price_data.product_data.name)} × ${l.quantity} — ${esc(money(l.price_data.unit_amount * l.quantity, cur))}${l.price_data.recurring ? ` / ${esc(l.price_data.recurring.interval)}` : ""}</li>`,
    )
    .join("");
  const ship = s.params.shipping_options?.[0]?.shipping_rate_data;
  const extra = `<ul>${rows}</ul>${ship ? `<p>Shipping (${esc(ship.display_name)}): ${esc(money(ship.fixed_amount.amount, cur))}</p>` : ""}
<p><strong>Total: ${esc(money(t.total, cur))}</strong></p>
<form method="post">
<p><label>Email<br><input name="email" type="email" required value="${esc(s.params.customer_email ?? "buyer@example.com")}"></label></p>
<p><label>Name<br><input name="name" value="Test Buyer"></label></p>
${s.params.allow_promotion_codes ? '<p><label>Promotion code<br><input name="promo" autocomplete="off"></label></p>' : ""}
<p><button name="action" value="pay" type="submit">Pay (test)</button> <button name="action" value="cancel" type="submit" formnovalidate>Cancel</button></p>
</form>`;
  return c.html(
    publicPage({
      title: "Test checkout",
      heading: "Test checkout",
      body: "This is the OpenSpace development payment page. No real money moves.",
      extraHtml: extra,
    }),
    200,
    PAGE_HEADERS_REDIRECTING,
  );
});

devStripeRoutes.post("/dev/stripe/checkout/:id", async (c) => {
  const { services } = c.var;
  const s = await getDevSession(services.db, c.req.param("id"));
  if (s?.status !== "open") return notFoundPage(c);
  const f = await parseFields(c);
  if (single(f.action) === "cancel") return c.redirect(s.params.cancel_url, 303);
  if (!(await claimDevSession(services.db, s.id, "complete"))) return notFoundPage(c);
  const promo = single(f.promo)?.trim().toUpperCase();
  const discount = promo ? await devPromotion(services.db, s.account, promo) : null;
  const t = totals(s, discount);
  const subscription = s.params.mode === "subscription";
  const physical = !!s.params.shipping_address_collection;
  const session = {
    id: s.id,
    object: "checkout.session",
    mode: s.params.mode,
    status: "complete",
    payment_status: "paid",
    client_reference_id: s.params.client_reference_id,
    metadata: s.params.metadata,
    currency: s.params.line_items[0]?.price_data.currency ?? "usd",
    amount_subtotal: t.subtotal,
    amount_total: t.total,
    total_details: { amount_discount: t.discount, amount_shipping: t.shipping, amount_tax: 0 },
    customer: randomId("cus_dev"),
    customer_details: {
      email: (single(f.email) ?? "buyer@example.com").trim().toLowerCase(),
      name: single(f.name) ?? null,
    },
    payment_intent: subscription ? null : randomId("pi_dev"),
    subscription: subscription ? randomId("sub_dev") : null,
    shipping_details: physical
      ? {
          name: single(f.name) ?? "Test Buyer",
          address: {
            line1: "1 Test Street",
            city: "Springfield",
            postal_code: "12345",
            country: "US",
          },
        }
      : null,
  };
  const now = Math.floor(services.now() / 1000);
  const event = {
    id: randomId("evt_dev"),
    object: "event",
    type: "checkout.session.completed",
    created: now,
    livemode: false,
    ...(s.account ? { account: s.account } : {}),
    data: { object: session },
  };
  const payload = JSON.stringify(event);
  const signature = await signStripePayload(payload, DEV_STRIPE_WEBHOOK_SECRET, now);
  const siteId = s.params.metadata.os_site ?? "";
  // The same verification + processing path as POST /c/stripe/webhook[/:siteId].
  const mode = await services.db
    .prepare("SELECT mode FROM commerce_settings WHERE site_id = ?")
    .bind(siteId)
    .first<{ mode: string }>();
  const result = await handleStripeWebhook(
    services,
    payload,
    signature,
    mode?.mode === "sovereign" ? { kind: "sovereign", siteId } : { kind: "connect" },
    c.var.log,
  );
  if (result.status !== 200) c.var.log.warn("dev stripe webhook rejected", { result });
  return c.redirect(s.params.success_url, 303);
});

/** Only send people back to Studio (or the Hub) after fake onboarding. */
function safeStudioReturn(c: Context<AppEnv>, raw: string | undefined): string {
  const fallback = c.var.config.studioOrigin;
  if (!raw) return fallback;
  try {
    const u = new URL(raw);
    return u.origin === c.var.config.studioOrigin ||
      u.origin === new URL(c.var.config.hubUrl).origin
      ? u.toString()
      : fallback;
  } catch {
    return fallback;
  }
}

devStripeRoutes.get("/dev/stripe/connect/:account", async (c) => {
  const account = c.req.param("account");
  return c.html(
    publicPage({
      title: "Connect Stripe (test)",
      heading: "Set up payments (test)",
      body: `This stands in for Stripe's onboarding for ${account}. Finishing marks the test account ready to take payments.`,
      extraHtml: `<form method="post"><input type="hidden" name="return" value="${esc(c.req.query("return") ?? "")}"><button type="submit">Finish setup</button></form>`,
    }),
    200,
    PAGE_HEADERS_REDIRECTING,
  );
});

devStripeRoutes.post("/dev/stripe/connect/:account", async (c) => {
  const f = await parseFields(c);
  await enableDevAccount(c.var.services.db, c.req.param("account"));
  return c.redirect(safeStudioReturn(c, single(f.return) ?? undefined), 303);
});
