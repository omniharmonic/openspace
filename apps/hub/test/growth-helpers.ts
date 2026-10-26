import { env } from "cloudflare:test";
import { createApp } from "../src/app";
import { DevGitHubAccess } from "../src/github/dev";
import { MAIN_BRANCH, parseRepo } from "../src/github/types";
import type { ServiceOverrides } from "../src/services";
import { NoRateLimiter } from "../src/services/rate-limit";
import { serializeMdoc } from "../src/services/site-files";
import { signStripePayload } from "../src/services/stripe";
import { call, type TestApp } from "./helpers";
import { type SiteFixture, siteWithForm } from "./public-helpers";

/** App without rate limits (concurrency tests hammer one endpoint). */
export function makeGrowthApp(overrides: ServiceOverrides = {}): TestApp {
  return createApp({
    services: {
      ...overrides,
      public: { rateLimit: new NoRateLimiter(), ...(overrides.public ?? {}) },
    },
  });
}

/** Built at runtime: secret-shaped literals must never appear in source (push protection). */
export const WEBHOOK_SECRET = ["whsec", "testsecret", "0123456789abcdef"].join("_");

export const SHOP_CONFIG = {
  kind: "products",
  label: "Shop",
  list: { layout: "grid", pageSize: 12, sort: "manual" },
};

const PRODUCTS: Record<string, Record<string, unknown>> = {
  candle: {
    title: "Juniper Candle",
    status: "published",
    sku: "CANDLE",
    price: { amount: 2400, currency: "USD" },
  },
  mat: {
    title: "Studio Mat",
    status: "published",
    sku: "MAT",
    price: { amount: 3600, currency: "USD" },
    options: [{ name: "Color", values: ["Blue", "Sage"] }],
    variants: [
      { sku: "MAT-BLUE", options: { Color: "Blue" }, price: { amount: 3800, currency: "USD" } },
      { options: { Color: "Sage" } },
    ],
  },
  guide: {
    title: "Morning Practice Guide",
    status: "published",
    sku: "GUIDE",
    digital: true,
    price: { amount: 1500, currency: "USD" },
  },
  secret: {
    title: "Unreleased Bowl",
    status: "draft",
    sku: "SECRET",
    price: { amount: 100, currency: "USD" },
  },
  kettle: {
    title: "Tea Kettle",
    status: "published",
    price: { amount: 5000, currency: "EUR" },
  },
};

/** A dev site whose published main has a `shop` products collection. */
export async function shopSite(app: TestApp, name = "Juniper Shop"): Promise<SiteFixture> {
  const f = await siteWithForm(app, { form: null, name });
  const gh = new DevGitHubAccess(env.HUB_DB);
  const repo = parseRepo(f.repo);
  const head = (await gh.getRef(repo, MAIN_BRANCH)) as string;
  await gh.commitFiles(repo, {
    branch: MAIN_BRANCH,
    expectedHead: head,
    message: "Add shop",
    files: [
      { path: "content/collections/shop/_collection.json", content: JSON.stringify(SHOP_CONFIG) },
      ...Object.entries(PRODUCTS).map(([slug, fm]) => ({
        path: `content/collections/shop/${slug}.mdoc`,
        content: serializeMdoc(fm, "Hand poured in small batches."),
      })),
    ],
  });
  return f;
}

export function postCheckout(
  f: SiteFixture,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return call(f.app, `/c/${f.siteId}/checkout`, {
    method: "POST",
    headers: { Accept: "application/json", ...headers },
    json: body,
  });
}

export function postForm(f: SiteFixture, path: string, fields: Record<string, string>) {
  return call(f.app, path, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
    redirect: "manual",
  });
}

export async function devSession(id: string) {
  const row = await env.HUB_DB.prepare(
    "SELECT data_json, status, account FROM dev_stripe_objects WHERE id = ?",
  )
    .bind(id)
    .first<{ data_json: string; status: string; account: string | null }>();
  if (!row) throw new Error(`no session ${id}`);
  return { ...JSON.parse(row.data_json), status: row.status, account: row.account } as {
    params: {
      mode: string;
      line_items: Array<{
        quantity: number;
        price_data: { unit_amount: number; currency: string; recurring?: { interval: string } };
      }>;
      success_url: string;
      cancel_url: string;
      metadata: Record<string, string>;
      shipping_options?: unknown[];
      allow_promotion_codes?: boolean;
    };
    url: string;
    status: string;
  };
}

/** Pay on the DevStripe page (fires the signed webhook through the real path). */
export function payDev(app: TestApp, checkoutUrl: string, extra: Record<string, string> = {}) {
  return call(app, new URL(checkoutUrl).pathname, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ action: "pay", email: "buyer@example.com", ...extra }).toString(),
    redirect: "manual",
  });
}

export async function orderRow(id: string) {
  return env.HUB_DB.prepare("SELECT * FROM orders WHERE id = ?").bind(id).first<{
    id: string;
    status: string;
    total: number;
    refunded: number;
    stock_applied: number;
    stripe_session: string;
    email: string | null;
    number: number;
    payment_intent: string | null;
    items_json: string;
  }>();
}

export async function stock(siteId: string, sku: string) {
  return (
    await env.HUB_DB.prepare("SELECT qty FROM inventory WHERE site_id = ? AND sku = ?")
      .bind(siteId, sku)
      .first<{ qty: number }>()
  )?.qty;
}

export async function setStockRow(siteId: string, sku: string, qty: number) {
  await env.HUB_DB.prepare(
    "INSERT INTO inventory (site_id, sku, qty) VALUES (?, ?, ?) ON CONFLICT (site_id, sku) DO UPDATE SET qty = excluded.qty, alerted_at = NULL",
  )
    .bind(siteId, sku, qty)
    .run();
}

/** A signed `checkout.session.completed` for an order (as Stripe would send it). */
export async function completedEvent(
  order: { id: string; stripe_session: string; total: number },
  siteId: string,
  opts: { secret?: string; account?: string; at?: number; id?: string; pi?: string } = {},
) {
  const at = opts.at ?? Math.floor(Date.now() / 1000);
  const event = {
    id: opts.id ?? `evt_${crypto.randomUUID().replace(/-/g, "")}`,
    type: "checkout.session.completed",
    created: at,
    ...(opts.account ? { account: opts.account } : {}),
    data: {
      object: {
        id: order.stripe_session,
        object: "checkout.session",
        payment_status: "paid",
        client_reference_id: order.id,
        metadata: { os_site: siteId, os_order: order.id, os_kind: "order" },
        amount_subtotal: order.total,
        amount_total: order.total,
        currency: "usd",
        customer_details: { email: "buyer@example.com", name: "Ana Ruiz" },
        payment_intent: opts.pi ?? `pi_${crypto.randomUUID().replace(/-/g, "")}`,
      },
    },
  };
  const body = JSON.stringify(event);
  return {
    event,
    body,
    signature: await signStripePayload(body, opts.secret ?? WEBHOOK_SECRET, at),
  };
}

export function stripeBindings(extra: Record<string, unknown> = {}) {
  return {
    ...(env as unknown as Record<string, unknown>),
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ...extra,
  };
}

export function postWebhook(
  app: TestApp,
  body: string,
  signature: string | null,
  path = "/c/stripe/webhook",
  bindings = stripeBindings(),
) {
  return call(
    app,
    path,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(signature ? { "Stripe-Signature": signature } : {}),
      },
      body,
    },
    bindings,
  );
}
