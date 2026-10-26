import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DevGitHubAccess } from "../src/github/dev";
import { MAIN_BRANCH, parseRepo } from "../src/github/types";
import { catalogFromDocument } from "../src/services/catalog";
import { shippingRatesFor } from "../src/services/commerce";
import { serializeMdoc } from "../src/services/site-files";
import {
  devSession,
  makeGrowthApp,
  orderRow,
  payDev,
  postCheckout,
  shopSite,
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

  it("adds the cheapest shipping as a one-time line when pickup isn't offered", async () => {
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
      [500, null],
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
});
