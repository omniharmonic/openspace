/**
 * `POST /c/:siteId/checkout` (arch §9.5): turn a cart, a donation or a membership sign-up into a
 * Stripe Checkout Session. Prices are ALWAYS re-read from the published catalog (or the tier /
 * donation rules) — nothing about price in the request is trusted. Stock is checked here and
 * decremented atomically when the payment completes (webhook, `orders.ts`).
 */
import { currencyExponent } from "@openspace/email-render";
import type { SiteRow } from "../db/sites";
import { randomId } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import { type Catalog, type CatalogEntry, loadCatalog } from "./catalog";
import { growthSettings, inventoryFor, shippingRatesFor, stripeForSite } from "./commerce";
import type { Services } from "./index";
import type { CheckoutSessionParams } from "./stripe";

export const MAX_LINES = 50;
export const MAX_QTY = 99;
/** Stripe requires 30 min – 24 h; unpaid sessions expire and their pending order with them. */
export const SESSION_TTL_MS = 60 * 60 * 1000;

export type CheckoutInput =
  | { kind: "cart"; items: Array<{ sku: string; qty: number }>; email?: string | null }
  | {
      kind: "donation";
      /** Minor units, already resolved from `amount` / `custom_amount`. */
      amount: number;
      currency: string;
      interval: "once" | "month";
      email?: string | null;
    }
  | { kind: "membership"; tierId: string; email?: string | null };

export interface OrderItem {
  sku: string;
  title: string;
  qty: number;
  unitAmount: number;
  digital: boolean;
  /** Shipping weight per unit in grams (from the catalog). */
  weight?: number;
  /** Subscription products: billed every month or year. */
  interval?: "month" | "year";
}

const fail = (status: 409 | 422, code: string, message: string, errors?: Record<string, string>) =>
  new HttpError(status, code, message, errors);

/** Validate the cart body: SKU strings and integer quantities only; extra fields are ignored. */
export function parseCartItems(raw: unknown): Array<{ sku: string; qty: number }> {
  if (!Array.isArray(raw) || raw.length === 0)
    throw fail(422, "invalid_cart", "Your cart is empty.");
  if (raw.length > MAX_LINES) throw fail(422, "invalid_cart", "That cart has too many items.");
  const merged = new Map<string, number>();
  for (const line of raw) {
    const l = line as { sku?: unknown; qty?: unknown };
    const qty = typeof l?.qty === "string" ? Number(l.qty) : l?.qty;
    if (typeof l?.sku !== "string" || !/^[^\s]{1,64}$/.test(l.sku))
      throw fail(422, "invalid_cart", "Your cart has an item we don't recognise.");
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY)
      throw fail(422, "invalid_cart", `Quantities must be between 1 and ${MAX_QTY}.`);
    merged.set(l.sku, Math.min(MAX_QTY, (merged.get(l.sku) ?? 0) + qty));
  }
  return [...merged].map(([sku, qty]) => ({ sku, qty }));
}

/**
 * The donation amount in minor units. `custom_amount` (major units, e.g. "12.50") replaces the
 * chosen preset `amount` (minor units) when filled; "Other" without a custom amount is refused.
 */
export function donationAmount(
  fields: { amount?: string | null; custom_amount?: string | null; custom?: string | null },
  currency: string,
  limits: { min: number; max: number },
): number {
  const exp = currencyExponent(currency);
  const custom = (fields.custom_amount ?? "").trim();
  let minor: number;
  if (custom) {
    const m = custom.match(/^(\d{1,9})(?:[.,](\d+))?$/);
    if (!m || (m[2] ?? "").length > exp)
      throw fail(422, "invalid_amount", "Please enter the amount as a number, like 25 or 25.50.", {
        custom_amount: "Enter a number like 25 or 25.50.",
      });
    minor = Number(m[1]) * 10 ** exp + Number((m[2] ?? "").padEnd(exp, "0") || 0);
  } else {
    const preset = (fields.amount ?? "").trim();
    if (!preset || preset === "other" || preset === "custom" || fields.custom)
      throw fail(422, "invalid_amount", "Please enter the amount you'd like to give.", {
        custom_amount: "Enter an amount.",
      });
    if (!/^\d{1,12}$/.test(preset))
      throw fail(422, "invalid_amount", "Please choose an amount.", {
        amount: "Choose an amount.",
      });
    minor = Number(preset);
  }
  const min = Math.round(limits.min * 10 ** exp);
  const max = Math.round(limits.max * 10 ** exp);
  if (minor < min || minor > max) {
    const fmt = (n: number) => (n / 10 ** exp).toFixed(exp);
    throw fail(
      422,
      "invalid_amount",
      `Donations can be between ${fmt(min)} and ${fmt(max)} ${currency}.`,
      { custom_amount: `Between ${fmt(min)} and ${fmt(max)}.` },
    );
  }
  return minor;
}

export function validCurrency(raw: string | null | undefined): string {
  const c = (raw ?? "").trim().toUpperCase();
  let ok = /^[A-Z]{3}$/.test(c);
  if (ok)
    try {
      new Intl.NumberFormat("en", { style: "currency", currency: c });
    } catch {
      ok = false;
    }
  if (!ok) throw fail(422, "invalid_currency", "That currency isn't supported.");
  return c;
}

/** Price the cart from the catalog and check stock (no decrement here). */
export async function priceCart(
  services: Services,
  site: SiteRow,
  items: Array<{ sku: string; qty: number }>,
  catalog?: Catalog,
): Promise<{ lines: OrderItem[]; currency: string; subtotal: number }> {
  const cat = catalog ?? (await loadCatalog(services, site));
  const errors: Record<string, string> = {};
  const entries: Array<[CatalogEntry, number]> = [];
  for (const { sku, qty } of items) {
    const entry = cat.skus.get(sku);
    if (!entry) errors[sku] = "This item is no longer available.";
    else if (!entry.available) errors[sku] = `${entry.title} is sold out.`;
    else entries.push([entry, qty]);
  }
  if (Object.keys(errors).length)
    throw fail(409, "unavailable", "Some items in your cart are no longer available.", errors);
  const currencies = new Set(entries.map(([e]) => e.price.currency));
  if (currencies.size !== 1)
    throw fail(422, "invalid_cart", "Items in one order must share a currency.");
  const stock = await inventoryFor(
    services.db,
    site.id,
    entries.map(([e]) => e.sku),
  );
  for (const [e, qty] of entries) {
    const row = stock.get(e.sku);
    if (row && row.qty < qty)
      errors[e.sku] =
        row.qty <= 0 ? `${e.title} is sold out.` : `Only ${row.qty} of ${e.title} left.`;
  }
  if (Object.keys(errors).length)
    throw fail(409, "out_of_stock", "Some items don't have enough stock.", errors);
  const lines: OrderItem[] = entries.map(([e, qty]) => ({
    sku: e.sku,
    title: e.title,
    qty,
    unitAmount: e.price.amount,
    digital: e.digital,
    ...(e.weight ? { weight: e.weight } : {}),
    ...(e.interval ? { interval: e.interval } : {}),
  }));
  const intervals = new Set(lines.map((l) => l.interval).filter(Boolean));
  if (intervals.size > 1)
    throw fail(422, "mixed_intervals", "Monthly and yearly subscriptions need separate checkouts.");
  return {
    lines,
    currency: [...currencies][0] as string,
    subtotal: lines.reduce((n, l) => n + l.unitAmount * l.qty, 0),
  };
}

export interface TierRow {
  id: string;
  site_id: string;
  name: string;
  description: string | null;
  price_amount: number | null;
  currency: string | null;
  interval: "month" | "year" | null;
  active: number;
  position: number;
  created_at: number;
  updated_at: number;
}

/** Insert a pending order with the next per-site order number (atomic INSERT … SELECT). */
async function insertOrder(
  services: Services,
  o: {
    id: string;
    siteId: string;
    kind: "order" | "donation" | "membership";
    total: number;
    currency: string;
    items: OrderItem[];
    mode: string;
    account: string | null;
    email: string | null;
    meta: Record<string, unknown>;
  },
) {
  const now = services.now();
  await services.db
    .prepare(
      `INSERT INTO orders (id, site_id, status, total, currency, items_json, created_at, number, kind,
         mode, stripe_account, email, amounts_json, meta_json, updated_at)
       SELECT ?, ?, 'pending', ?, ?, ?, ?, COALESCE(MAX(number), 1000) + 1, ?, ?, ?, ?, ?, ?, ?
       FROM orders WHERE site_id = ?`,
    )
    .bind(
      o.id,
      o.siteId,
      o.total,
      o.currency,
      JSON.stringify(o.items),
      now,
      o.kind,
      o.mode,
      o.account,
      o.email,
      JSON.stringify({ subtotal: o.total }),
      JSON.stringify(o.meta),
      now,
      o.siteId,
    )
    .run();
}

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]+$/;

/** Create the order and the Checkout Session; returns the Stripe (or DevStripe) URL. */
export async function createCheckout(
  services: Services,
  site: SiteRow,
  input: CheckoutInput,
  urls: { success: string; cancel: string },
): Promise<{ url: string; orderId: string }> {
  const settings = await growthSettings(services.db, site.id);
  const stripe = await stripeForSite(services, site.id);
  const orderId = randomId("ord");
  const email =
    input.email && EMAIL_RE.test(input.email.trim()) ? input.email.trim().toLowerCase() : null;
  const metadata: Record<string, string> = {
    os_site: site.id,
    os_order: orderId,
    os_kind: input.kind === "cart" ? "order" : input.kind,
  };
  let params: CheckoutSessionParams;
  let items: OrderItem[];
  let currency: string;
  let total: number;
  const meta: Record<string, unknown> = {};

  if (input.kind === "cart") {
    const priced = await priceCart(services, site, input.items);
    items = priced.lines;
    currency = priced.currency;
    total = priced.subtotal;
    const physical = items.some((l) => !l.digital);
    // Parcel weight from the catalog (grams); the browser's cart carries SKUs and quantities only.
    const weightGrams = items.reduce((n, l) => n + (l.digital ? 0 : (l.weight ?? 0) * l.qty), 0);
    const rates = physical
      ? shippingRatesFor(settings.shippingOptions, { subtotal: total, weightGrams })
      : [];
    if (physical && settings.shippingOptions.length > 0 && rates.length === 0)
      throw fail(
        422,
        "too_heavy",
        "This order is heavier than the shop ships. Please contact the shop, or order fewer items.",
      );
    const interval = items.find((l) => l.interval)?.interval;
    meta.weightGrams = weightGrams;
    if (interval) {
      // Subscription products (Stripe Billing): recurring prices for them, one-time prices for
      // anything else in the cart. Checkout can't offer shipping choices in subscription mode,
      // so the cheapest rate for the parcel is added as a recurring shipping line (each
      // renewal ships again).
      meta.subscription = interval;
      const shipping = rates.reduce<(typeof rates)[number] | null>(
        (best, r) => (!best || r.amount < best.amount ? r : best),
        null,
      );
      params = {
        mode: "subscription",
        line_items: [
          ...items.map((l) => ({
            quantity: l.qty,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: l.unitAmount,
              product_data: { name: l.title, metadata: { sku: l.sku } },
              ...(l.interval ? { recurring: { interval: l.interval } } : {}),
            },
          })),
          ...(shipping && shipping.amount > 0
            ? [
                {
                  quantity: 1,
                  price_data: {
                    currency: currency.toLowerCase(),
                    unit_amount: shipping.amount,
                    product_data: { name: `Shipping: ${shipping.label}` },
                    // Shipped every period, so shipping is charged every period too.
                    recurring: { interval },
                  },
                },
              ]
            : []),
        ],
        success_url: urls.success,
        cancel_url: urls.cancel,
        client_reference_id: orderId,
        metadata,
        allow_promotion_codes: settings.allowPromotionCodes,
        automatic_tax: { enabled: settings.taxEnabled },
        subscription_data: { metadata },
      };
      if (shipping) meta.shipping = { label: shipping.label, amount: shipping.amount };
      if (physical)
        params.shipping_address_collection = { allowed_countries: settings.shippingCountries };
    } else {
      params = {
        mode: "payment",
        line_items: items.map((l) => ({
          quantity: l.qty,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: l.unitAmount,
            product_data: { name: l.title, metadata: { sku: l.sku } },
          },
        })),
        success_url: urls.success,
        cancel_url: urls.cancel,
        client_reference_id: orderId,
        metadata,
        submit_type: "pay",
        allow_promotion_codes: settings.allowPromotionCodes,
        automatic_tax: { enabled: settings.taxEnabled },
        payment_intent_data: { metadata },
      };
      if (physical) {
        params.shipping_address_collection = { allowed_countries: settings.shippingCountries };
        const opts = rates.map((s) => ({
          shipping_rate_data: {
            type: "fixed_amount" as const,
            display_name: s.label,
            fixed_amount: {
              amount: s.amount,
              currency: currency.toLowerCase(),
            },
            ...(s.minDays !== undefined || s.maxDays !== undefined
              ? {
                  delivery_estimate: {
                    ...(s.minDays !== undefined
                      ? { minimum: { unit: "business_day" as const, value: s.minDays } }
                      : {}),
                    ...(s.maxDays !== undefined
                      ? { maximum: { unit: "business_day" as const, value: s.maxDays } }
                      : {}),
                  },
                }
              : {}),
          },
        }));
        if (opts.length) params.shipping_options = opts;
      }
    }
  } else if (input.kind === "donation") {
    currency = input.currency;
    total = input.amount;
    const name =
      input.interval === "month" ? `Monthly gift to ${site.name}` : `Donation to ${site.name}`;
    items = [{ sku: "donation", title: name, qty: 1, unitAmount: input.amount, digital: true }];
    meta.interval = input.interval;
    params = {
      mode: input.interval === "month" ? "subscription" : "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: input.amount,
            product_data: { name },
            ...(input.interval === "month" ? { recurring: { interval: "month" as const } } : {}),
          },
        },
      ],
      success_url: urls.success,
      cancel_url: urls.cancel,
      client_reference_id: orderId,
      metadata,
      ...(input.interval === "month"
        ? { subscription_data: { metadata } }
        : { submit_type: "donate" as const, payment_intent_data: { metadata } }),
    };
  } else {
    const tier = await services.db
      .prepare("SELECT * FROM member_tiers WHERE id = ? AND site_id = ? AND active = 1")
      .bind(input.tierId, site.id)
      .first<TierRow>();
    if (!tier) throw fail(422, "invalid_tier", "That membership isn't available.");
    if (!tier.price_amount || !tier.currency || !tier.interval)
      throw fail(422, "free_tier", "That membership is free — just sign in with your email.");
    currency = tier.currency;
    total = tier.price_amount;
    items = [
      { sku: `tier:${tier.id}`, title: tier.name, qty: 1, unitAmount: total, digital: true },
    ];
    metadata.os_tier = tier.id;
    meta.tier = tier.id;
    params = {
      mode: "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: total,
            product_data: { name: `${site.name} — ${tier.name}` },
            recurring: { interval: tier.interval },
          },
        },
      ],
      success_url: urls.success,
      cancel_url: urls.cancel,
      client_reference_id: orderId,
      metadata,
      subscription_data: { metadata },
    };
  }
  if (email) params.customer_email = email;
  params.expires_at = Math.floor((services.now() + SESSION_TTL_MS) / 1000);

  await insertOrder(services, {
    id: orderId,
    siteId: site.id,
    kind: metadata.os_kind as "order" | "donation" | "membership",
    total,
    currency,
    items,
    mode: stripe.mode,
    account: stripe.account,
    email,
    meta,
  });
  try {
    const session = await stripe.api.createCheckoutSession(params, `checkout-${orderId}`);
    await services.db
      .prepare("UPDATE orders SET stripe_session = ?, updated_at = ? WHERE id = ?")
      .bind(session.id, services.now(), orderId)
      .run();
    return { url: session.url, orderId };
  } catch (err) {
    await services.db
      .prepare("UPDATE orders SET status = 'failed', note = ?, updated_at = ? WHERE id = ?")
      .bind(
        err instanceof Error ? err.message.slice(0, 300) : "checkout failed",
        services.now(),
        orderId,
      )
      .run();
    throw err;
  }
}
