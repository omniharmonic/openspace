import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { readConfig } from "../src/env";
import { DevGitHubAccess } from "../src/github/dev";
import { MAIN_BRANCH, parseRepo } from "../src/github/types";
import { createServices } from "../src/services";
import { catalogFromDocument } from "../src/services/catalog";
import { shippingRatesFor } from "../src/services/commerce";
import { retryOrderFollowups } from "../src/services/orders";
import { serializeMdoc } from "../src/services/site-files";
import {
  devSession,
  makeGrowthApp,
  orderRow,
  payDev,
  postCheckout,
  postWebhook,
  setStockRow,
  shopSite,
  WEBHOOK_SECRET,
} from "./growth-helpers";
import { call } from "./helpers";
import type { SiteFixture } from "./public-helpers";

const sessionId = (url: string) => new URL(url).pathname.split("/").pop() as string;

async function addProducts(f: SiteFixture, products: Record<string, Record<string, unknown>>) {
  const gh = new DevGitHubAccess(env.HUB_DB);
  const repo = parseRepo(f.repo);
  const head = (await gh.getRef(repo, MAIN_BRANCH)) as string;
  await gh.commitFiles(repo, {
    branch: MAIN_BRANCH,
    expectedHead: head,
    message: "More products",
    files: Object.entries(products).map(([slug, fm]) => ({
      path: `content/collections/shop/${slug}.mdoc`,
      content: serializeMdoc(fm, "Made to order."),
    })),
  });
}

const PRODUCTS = {
  teapot: {
    title: "Stoneware Teapot",
    status: "published",
    sku: "TEAPOT",
    price: { amount: 4800, currency: "USD" },
    weight: 1400,
  },
  tea: {
    title: "Tea of the Month",
    status: "published",
    sku: "TEA-CLUB",
    price: { amount: 1500, currency: "USD" },
    weight: 250,
    subscription: { interval: "month" },
  },
  journal: {
    title: "Practice Journal Club",
    status: "published",
    sku: "JOURNAL-YEAR",
    price: { amount: 6000, currency: "USD" },
    digital: true,
    subscription: { interval: "year" },
  },
};

const SHIPPING = [
  {
    label: "Standard",
    amount: 0,
    byWeight: [
      { upToGrams: 500, amount: 500 },
      { upToGrams: 2000, amount: 900 },
      { upToGrams: 5000, amount: 1500 },
    ],
  },
  { label: "Local pickup", amount: 0 },
];

async function setup() {
  const app = makeGrowthApp();
  const f = await shopSite(app);
  await addProducts(f, PRODUCTS);
  const r = await call(app, `/api/sites/${f.siteId}/commerce/settings`, {
    method: "PATCH",
    cookie: f.cookie,
    json: { shippingOptions: SHIPPING },
  });
  expect(r.status).toBe(200);
  return { app, f };
}

describe("weight-based shipping (PRD 5.6)", () => {
  it("prices weight tiers, free thresholds and refuses options a parcel is too heavy for", () => {
    const opts = [
      ...SHIPPING,
      {
        label: "Express",
        amount: 2500,
        freeOver: 10_000,
        byWeight: [{ upToGrams: 1000, amount: 2000 }],
      },
    ];
    expect(shippingRatesFor(opts, { subtotal: 4800, weightGrams: 1400 })).toEqual([
      { label: "Standard", amount: 900 },
      { label: "Local pickup", amount: 0 },
    ]);
    expect(shippingRatesFor(opts, { subtotal: 20_000, weightGrams: 800 })).toEqual([
      { label: "Standard", amount: 900 },
      { label: "Local pickup", amount: 0 },
      { label: "Express", amount: 0 },
    ]);
    expect(shippingRatesFor(opts, { subtotal: 100, weightGrams: 300 })[0]).toEqual({
      label: "Standard",
      amount: 500,
    });
  });

  it("computes the parcel weight from the catalog, never from the browser", async () => {
    const { f } = await setup();
    const res = await postCheckout(f, {
      items: [{ sku: "TEAPOT", qty: 2, weight: 1, grams: 1 }],
      weight: 1,
      shipping: 0,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; orderId: string };
    const s = await devSession(sessionId(body.url));
    const options = s.params.shipping_options as Array<{
      shipping_rate_data: { display_name: string; fixed_amount: { amount: number } };
    }>;
    // 2 × 1400 g = 2800 g → the 5 kg tier.
    expect(
      options.map((o) => [
        o.shipping_rate_data.display_name,
        o.shipping_rate_data.fixed_amount.amount,
      ]),
    ).toEqual([
      ["Standard", 1500],
      ["Local pickup", 0],
    ]);
    expect(s.params.mode).toBe("payment");
    expect(await orderRow(body.orderId)).toMatchObject({ total: 9600 });
  });

  it("refuses a parcel heavier than every weight tier when nothing else fits", async () => {
    const { app, f } = await setup();
    await call(app, `/api/sites/${f.siteId}/commerce/settings`, {
      method: "PATCH",
      cookie: f.cookie,
      json: { shippingOptions: [SHIPPING[0]] },
    });
    const res = await postCheckout(f, { items: [{ sku: "TEAPOT", qty: 4 }] });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: "too_heavy" } });
  });
});

describe("subscription products (PRD 5.6, Stripe Billing)", () => {
  it("checks out subscription products in subscription mode with server prices and intervals", async () => {
    const { app, f } = await setup();
    const res = await postCheckout(f, {
      items: [
        { sku: "TEA-CLUB", qty: 1, interval: "day", price: 1 },
        { sku: "TEAPOT", qty: 1 },
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; orderId: string };
    const s = await devSession(sessionId(body.url));
    expect(s.params.mode).toBe("subscription");
    expect(
      s.params.line_items.map((l) => [
        l.price_data.unit_amount,
        l.quantity,
        l.price_data.recurring?.interval ?? null,
      ]),
    ).toEqual([
      [1500, 1, "month"],
      [4800, 1, null],
      // 250 g + 1400 g = 1650 g → Standard 2 kg tier vs local pickup (free): cheapest is free,
      // so no shipping line is added.
    ]);
    expect(s.params.shipping_options).toBeUndefined();
    const order = await orderRow(body.orderId);
    expect(order).toMatchObject({ total: 6300 });
    const row = async () =>
      (await env.HUB_DB.prepare(
        "SELECT status, meta_json, subscription_id FROM orders WHERE id = ?",
      )
        .bind(body.orderId)
        .first<{ status: string; meta_json: string; subscription_id: string | null }>()) as {
        status: string;
        meta_json: string;
        subscription_id: string | null;
      };
    expect(JSON.parse((await row()).meta_json)).toMatchObject({
      subscription: "month",
      weightGrams: 1650,
    });
    // Paying records the subscription on the order; Studio's orders list shows it.
    const paid = await payDev(app, body.url);
    expect([200, 302, 303]).toContain(paid.status);
    expect((await row()).status).toBe("paid");
    expect((await row()).subscription_id).toBeTruthy();
    const list = (await (
      await call(app, `/api/sites/${f.siteId}/orders?limit=10`, { cookie: f.cookie })
    ).json()) as { orders: Array<{ id: string; subscription: unknown }> };
    expect(list.orders.find((o) => o.id === body.orderId)?.subscription).toMatchObject({
      interval: "month",
      ended: false,
    });
  });

  it("adds the cheapest shipping as a recurring line when pickup isn't offered", async () => {
    const { app, f } = await setup();
    await call(app, `/api/sites/${f.siteId}/commerce/settings`, {
      method: "PATCH",
      cookie: f.cookie,
      json: { shippingOptions: [SHIPPING[0]] },
    });
    const res = await postCheckout(f, { items: [{ sku: "TEA-CLUB", qty: 1 }] });
    const s = await devSession(sessionId(((await res.json()) as { url: string }).url));
    expect(
      s.params.line_items.map((l) => [
        l.price_data.unit_amount,
        l.price_data.recurring?.interval ?? null,
      ]),
    ).toEqual([
      [1500, "month"],
      [500, "month"],
    ]);
  });

  it("refuses mixing monthly and yearly subscriptions in one checkout", async () => {
    const { f } = await setup();
    const res = await postCheckout(f, {
      items: [
        { sku: "TEA-CLUB", qty: 1 },
        { sku: "JOURNAL-YEAR", qty: 1 },
      ],
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: "mixed_intervals" } });
  });

  it("derives weight and interval for the catalog the same way site-kit publishes them", () => {
    const doc = {
      collections: {
        shop: {
          tea: { kind: "products", slug: "tea", frontmatter: PRODUCTS.tea, body: "" },
          teapot: {
            kind: "products",
            slug: "teapot",
            frontmatter: {
              ...PRODUCTS.teapot,
              options: [{ name: "Glaze", values: ["Blue", "Ash"] }],
              variants: [
                { sku: "TEAPOT-BLUE", options: { Glaze: "Blue" }, weight: 1600 },
                { options: { Glaze: "Ash" } },
              ],
            },
            body: "",
          },
        },
      },
    } as never;
    const c = catalogFromDocument(doc, Date.now());
    expect(c.skus.get("TEA-CLUB")).toMatchObject({ weight: 250, interval: "month" });
    expect(c.skus.get("TEAPOT-BLUE")).toMatchObject({ weight: 1600, interval: null });
    expect(c.skus.get("TEAPOT#2")).toMatchObject({ weight: 1400 });
  });

  const subscriptionCanceled = async (id: string | null) =>
    (
      await env.HUB_DB.prepare(
        "SELECT status FROM dev_stripe_objects WHERE id = ? AND kind = 'subscription'",
      )
        .bind(id)
        .first<{ status: string }>()
    )?.status === "canceled";
  const orderOf = async (id: string) =>
    (await env.HUB_DB.prepare(
      "SELECT status, payment_intent, subscription_id, meta_json, refunded, total FROM orders WHERE id = ?",
    )
      .bind(id)
      .first()) as {
      status: string;
      payment_intent: string | null;
      subscription_id: string | null;
      meta_json: string;
      refunded: number;
      total: number;
    };

  it("refunds a subscription order through its invoice's payment and cancels the subscription", async () => {
    const { app, f } = await setup();
    const { url, orderId } = (await (
      await postCheckout(f, { items: [{ sku: "JOURNAL-YEAR", qty: 1 }] })
    ).json()) as { url: string; orderId: string };
    await payDev(app, url);
    const paid = await orderOf(orderId);
    expect(paid.status).toBe("paid");
    expect(paid.payment_intent).toMatch(/^pi_dev/);
    expect(JSON.parse(paid.meta_json).invoice).toMatch(/^in_dev/);
    const r = await call(app, `/api/sites/${f.siteId}/orders/${orderId}/refund`, {
      method: "POST",
      cookie: f.cookie,
      json: {},
    });
    expect(r.status).toBe(200);
    const after = await orderOf(orderId);
    expect(after.status).toBe("refunded");
    expect(JSON.parse(after.meta_json).subscriptionEnded).toBe(true);
    expect(await subscriptionCanceled(after.subscription_id)).toBe(true);
  });

  it("auto-refunds a sold-out subscription order and cancels it", async () => {
    const { app, f } = await setup();
    await setStockRow(f.siteId, "TEA-CLUB", 1);
    const first = (await (
      await postCheckout(f, { items: [{ sku: "TEA-CLUB", qty: 1 }] })
    ).json()) as { url: string; orderId: string };
    const second = (await (
      await postCheckout(f, { items: [{ sku: "TEA-CLUB", qty: 1 }] })
    ).json()) as { url: string; orderId: string };
    await payDev(app, first.url);
    await payDev(app, second.url);
    const soldOut = await orderOf(second.orderId);
    expect(soldOut.status).toBe("refunded");
    expect(await subscriptionCanceled(soldOut.subscription_id)).toBe(true);
    expect((await orderOf(first.orderId)).status).toBe("paid");
  });

  it("matches charge.refunded by invoice and resolves missing payment intents in the cron", async () => {
    const { app, f } = await setup();
    const { url, orderId } = (await (
      await postCheckout(f, { items: [{ sku: "JOURNAL-YEAR", qty: 1 }] })
    ).json()) as { url: string; orderId: string };
    await payDev(app, url);
    const paid = await orderOf(orderId);
    const invoice = JSON.parse(paid.meta_json).invoice as string;
    // As if the invoice couldn't be read at payment time: the daily cron finds it.
    await env.HUB_DB.prepare("UPDATE orders SET payment_intent = NULL WHERE id = ?")
      .bind(orderId)
      .run();
    const services = createServices(env as never, readConfig(env as never));
    const out = await retryOrderFollowups(services);
    expect(out.subscriptions).toBeGreaterThanOrEqual(1);
    expect((await orderOf(orderId)).payment_intent).toBe(paid.payment_intent);
    // A refund made in Stripe's dashboard, named by the invoice.
    await env.HUB_DB.prepare("UPDATE orders SET payment_intent = NULL WHERE id = ?")
      .bind(orderId)
      .run();
    const body = JSON.stringify({
      id: "evt_sub_refund",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_sub",
          invoice,
          amount_refunded: paid.total,
          refunds: { data: [{ id: "re_sub_ext", amount: paid.total }] },
          metadata: { os_site: f.siteId },
        },
      },
    });
    const { signStripePayload } = await import("../src/services/stripe");
    const res = await postWebhook(
      app,
      body,
      await signStripePayload(body, WEBHOOK_SECRET, Math.floor(Date.now() / 1000)),
    );
    expect(res.status).toBe(200);
    const after = await orderOf(orderId);
    expect(after.status).toBe("refunded");
    expect(await subscriptionCanceled(after.subscription_id)).toBe(true);
  });
});
