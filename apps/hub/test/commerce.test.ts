import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { donationAmount, parseCartItems } from "../src/services/checkout";
import { HttpStripe, stripeForm, verifyStripeSignature } from "../src/services/stripe";
import {
  completedEvent,
  devSession,
  makeGrowthApp,
  orderRow,
  payDev,
  postCheckout,
  postForm,
  postWebhook,
  setStockRow,
  shopSite,
  stock,
  WEBHOOK_SECRET,
} from "./growth-helpers";
import { call } from "./helpers";
import { mockFetch } from "./mock-fetch";
import { makePublicApp, outbox, setSettings } from "./public-helpers";

const sessionId = (url: string) => new URL(url).pathname.split("/").pop() as string;

describe("checkout pricing (prices never trusted from the browser)", () => {
  it("re-reads every price from the published catalog and ignores tampered fields", async () => {
    const f = await shopSite(makeGrowthApp());
    const res = await postCheckout(f, {
      items: [
        { sku: "CANDLE", qty: 2, price: 1, unit_amount: 1, name: "Free candle" },
        { sku: "MAT-BLUE", qty: 1, price: 0 },
        { sku: "MAT#2", qty: 1 },
      ],
      amount: 1,
      total: 1,
      currency: "JPY",
      successUrl: "https://evil.example/steal",
      cancelUrl: "//evil.example",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; url: string; orderId: string };
    expect(body.url).toMatch(/\/dev\/stripe\/checkout\/cs_dev_/);
    const s = await devSession(sessionId(body.url));
    expect(
      s.params.line_items.map((l) => [l.price_data.unit_amount, l.quantity, l.price_data.currency]),
    ).toEqual([
      [2400, 2, "usd"],
      [3800, 1, "usd"],
      [3600, 1, "usd"], // the Sage variant has no own price: the product price applies
    ]);
    // Return URLs never leave the site.
    expect(new URL(s.params.success_url).origin).toBe("http://localhost:8787");
    expect(s.params.success_url).toContain(`/s/${f.siteId}/`);
    expect(s.params.success_url).toContain("os_checkout=success");
    expect(s.params.cancel_url).not.toContain("evil");
    const order = await orderRow(body.orderId);
    expect(order).toMatchObject({ status: "pending", total: 2400 * 2 + 3800 + 3600 });
  });

  it("refuses unknown, draft, unavailable and mixed-currency items and bad quantities", async () => {
    const f = await shopSite(makeGrowthApp());
    const unknown = await postCheckout(f, { items: [{ sku: "NOPE", qty: 1 }] });
    expect(unknown.status).toBe(409);
    expect(((await unknown.json()) as { errors: Record<string, string> }).errors.NOPE).toBeTruthy();
    expect((await postCheckout(f, { items: [{ sku: "SECRET", qty: 1 }] })).status).toBe(409);
    const mixed = await postCheckout(f, {
      items: [
        { sku: "CANDLE", qty: 1 },
        { sku: "shop/kettle", qty: 1 },
      ],
    });
    expect(mixed.status).toBe(422);
    for (const qty of [0, 100, 1.5, -1, "2x"])
      expect((await postCheckout(f, { items: [{ sku: "CANDLE", qty }] })).status).toBe(422);
    expect((await postCheckout(f, { items: [] })).status).toBe(422);
    expect((await postCheckout(f, { items: "CANDLE" })).status).toBe(422);
    expect(() => parseCartItems([{ sku: "a b", qty: 1 }])).toThrow();
    // Duplicate lines merge (capped at 99).
    expect(
      parseCartItems([
        { sku: "A", qty: 60 },
        { sku: "A", qty: 60 },
      ]),
    ).toEqual([{ sku: "A", qty: 99 }]);
  });

  it("checks stock before creating a session", async () => {
    const f = await shopSite(makeGrowthApp());
    await setStockRow(f.siteId, "CANDLE", 1);
    const res = await postCheckout(f, { items: [{ sku: "CANDLE", qty: 2 }] });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("out_of_stock");
    await setStockRow(f.siteId, "CANDLE", 0);
    expect((await postCheckout(f, { items: [{ sku: "CANDLE", qty: 1 }] })).status).toBe(409);
  });

  it("rejects foreign origins", async () => {
    const f = await shopSite(makeGrowthApp());
    const res = await postCheckout(
      f,
      { items: [{ sku: "CANDLE", qty: 1 }] },
      { Origin: "https://evil.example" },
    );
    expect(res.status).toBe(403);
  });
});

describe("DevStripe checkout, webhook, order", () => {
  it("completes an order through the same webhook path, decrements stock, is idempotent", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    await setStockRow(f.siteId, "CANDLE", 5);
    await setSettings(f, { notifyEmail: "owner@example.com" });
    const { url, orderId } = (await (
      await postCheckout(f, { items: [{ sku: "CANDLE", qty: 3 }] })
    ).json()) as { url: string; orderId: string };
    const page = await call(app, new URL(url).pathname);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("$72.00");
    const paid = await payDev(app, url);
    expect(paid.status).toBe(303);
    expect(paid.headers.get("location")).toContain("os_checkout=success");
    const order = await orderRow(orderId);
    expect(order).toMatchObject({
      status: "paid",
      stock_applied: 1,
      email: "buyer@example.com",
      number: 1001,
    });
    expect(await stock(f.siteId, "CANDLE")).toBe(2);
    // Low stock (≤ 3 by default) alerts the owner once.
    const alerts = await outbox(app, "?kind=low-stock");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.to).toBe("owner@example.com");
    // The session can't be paid twice.
    expect((await payDev(app, url)).status).toBe(404);
    // Replaying the same Stripe event (or a new event id for the same session) changes nothing.
    const replay = await completedEvent(order as never, f.siteId);
    const r1 = await postWebhook(app, replay.body, replay.signature);
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ received: true, duplicate: true });
    const r2 = await postWebhook(app, replay.body, replay.signature);
    expect(await r2.json()).toMatchObject({ received: true, duplicate: true });
    expect(await stock(f.siteId, "CANDLE")).toBe(2);
    // Order numbers increase per site.
    const second = (await (
      await postCheckout(f, { items: [{ sku: "CANDLE", qty: 1 }] })
    ).json()) as {
      orderId: string;
    };
    expect((await orderRow(second.orderId))?.number).toBe(1002);
  });

  it("last unit: 50 parallel checkouts and payments sell it exactly once, the rest are refunded", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    await setStockRow(f.siteId, "CANDLE", 1);
    const created = await Promise.all(
      Array.from({ length: 50 }, () => postCheckout(f, { items: [{ sku: "CANDLE", qty: 1 }] })),
    );
    // Stock isn't reserved at checkout: every attempt gets a session.
    expect(created.map((r) => r.status)).toEqual(Array(50).fill(200));
    const orders = await Promise.all(
      created.map(async (r) => orderRow(((await r.json()) as { orderId: string }).orderId)),
    );
    const events = await Promise.all(orders.map((o) => completedEvent(o as never, f.siteId)));
    const results = await Promise.all(events.map((e) => postWebhook(app, e.body, e.signature)));
    expect(results.map((r) => r.status)).toEqual(Array(50).fill(200));
    const statuses = await env.HUB_DB.prepare(
      "SELECT status, COUNT(*) AS n FROM orders WHERE site_id = ? GROUP BY status",
    )
      .bind(f.siteId)
      .all<{ status: string; n: number }>();
    const by = Object.fromEntries(statuses.results.map((r) => [r.status, r.n]));
    expect(by.paid).toBe(1);
    expect(by.refunded).toBe(49);
    expect(await stock(f.siteId, "CANDLE")).toBe(0);
    const refunds = await env.HUB_DB.prepare(
      "SELECT COUNT(*) AS n FROM dev_stripe_objects WHERE kind = 'refund'",
    ).first<{ n: number }>();
    expect(refunds?.n).toBeGreaterThanOrEqual(49);
    const sorry = await outbox(app, "?kind=order-sold-out");
    expect(sorry.length).toBe(49);
  });

  it("multi-item orders decrement all-or-nothing", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    await setStockRow(f.siteId, "CANDLE", 3);
    await setStockRow(f.siteId, "MAT-BLUE", 1);
    const a = (await (await postCheckout(f, { items: [{ sku: "MAT-BLUE", qty: 1 }] })).json()) as {
      orderId: string;
    };
    const b = (await (
      await postCheckout(f, {
        items: [
          { sku: "CANDLE", qty: 2 },
          { sku: "MAT-BLUE", qty: 1 },
        ],
      })
    ).json()) as { orderId: string };
    for (const id of [a.orderId, b.orderId]) {
      const e = await completedEvent((await orderRow(id)) as never, f.siteId);
      await postWebhook(app, e.body, e.signature);
    }
    expect((await orderRow(a.orderId))?.status).toBe("paid");
    expect((await orderRow(b.orderId))?.status).toBe("refunded");
    // The candles of the failed order were not taken.
    expect(await stock(f.siteId, "CANDLE")).toBe(3);
    expect(await stock(f.siteId, "MAT-BLUE")).toBe(0);
  });
});

describe("Stripe webhook signatures", () => {
  it("rejects missing, forged, stale and tampered signatures", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    const { orderId } = (await (
      await postCheckout(f, { items: [{ sku: "CANDLE", qty: 1 }] })
    ).json()) as {
      orderId: string;
    };
    const order = (await orderRow(orderId)) as never;
    const good = await completedEvent(order, f.siteId);
    expect((await postWebhook(app, good.body, null)).status).toBe(400);
    const forged = await completedEvent(order, f.siteId, {
      secret: ["whsec", "attacker", "key"].join("_"),
    });
    expect((await postWebhook(app, forged.body, forged.signature)).status).toBe(400);
    const stale = await completedEvent(order, f.siteId, {
      at: Math.floor(Date.now() / 1000) - 600,
    });
    expect((await postWebhook(app, stale.body, stale.signature)).status).toBe(400);
    const tampered = good.body.replace('"amount_total":2400', '"amount_total":1');
    expect((await postWebhook(app, tampered, good.signature)).status).toBe(400);
    expect((await postWebhook(app, good.body, "t=abc,v1=zz")).status).toBe(400);
    expect((await orderRow(orderId))?.status).toBe("pending");
    const ok = await postWebhook(app, good.body, good.signature);
    expect(ok.status).toBe(200);
    expect((await orderRow(orderId))?.status).toBe("paid");
  });

  it("verifies multiple v1 signatures and the tolerance window", async () => {
    const payload = '{"id":"evt_1"}';
    const t = 1_800_000_000;
    const { hmacHex } = await import("../src/lib/seal");
    const v1 = await hmacHex(WEBHOOK_SECRET, `${t}.${payload}`);
    const header = `t=${t},v1=${"0".repeat(64)},v1=${v1}`;
    expect(await verifyStripeSignature(payload, header, [WEBHOOK_SECRET], t + 299)).toBe(true);
    expect(await verifyStripeSignature(payload, header, [WEBHOOK_SECRET], t + 301)).toBe(false);
    expect(await verifyStripeSignature(payload, header, ["other", WEBHOOK_SECRET], t)).toBe(true);
    expect(await verifyStripeSignature(payload, header, [], t)).toBe(false);
  });

  it("ties events to the connected account's site, never to metadata alone", async () => {
    const app = makeGrowthApp();
    const a = await shopSite(app, "Shop A");
    const b = await shopSite(app, "Shop B");
    await env.HUB_DB.prepare(
      "INSERT INTO commerce_settings (site_id, stripe_account, charges_enabled, updated_at) VALUES (?, 'acct_bbb', 1, 0)",
    )
      .bind(b.siteId)
      .run();
    const { orderId } = (await (
      await postCheckout(a, { items: [{ sku: "CANDLE", qty: 1 }] })
    ).json()) as {
      orderId: string;
    };
    // An event from B's connected account that names A's order is ignored.
    const e = await completedEvent((await orderRow(orderId)) as never, a.siteId, {
      account: "acct_bbb",
    });
    const res = await postWebhook(app, e.body, e.signature);
    expect(await res.json()).toMatchObject({ received: true, ignored: true });
    expect((await orderRow(orderId))?.status).toBe("pending");
  });

  it("sovereign endpoint uses the site's own webhook secret", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    const ownerSecret = ["whsec", "ownerabcdefghijklmnop"].join("_");
    const put = await call(app, `/api/sites/${f.siteId}/commerce/sovereign`, {
      method: "PUT",
      cookie: f.cookie,
      json: { secretKey: ["rk", "test", "abcdefghijklmnop"].join("_"), webhookSecret: ownerSecret },
    });
    expect(put.status).toBe(200);
    const pv = (await put.json()) as { payments: { mode: string; hasSovereignKey: boolean } };
    expect(pv.payments).toMatchObject({ mode: "sovereign", hasSovereignKey: true });
    expect(JSON.stringify(pv)).not.toContain("abcdefghijklmnop");
    const { orderId } = (await (
      await postCheckout(f, { items: [{ sku: "CANDLE", qty: 1 }] })
    ).json()) as {
      orderId: string;
    };
    const order = (await orderRow(orderId)) as never;
    const platform = await completedEvent(order, f.siteId); // signed with the platform secret
    expect(
      (await postWebhook(app, platform.body, platform.signature, `/c/stripe/webhook/${f.siteId}`))
        .status,
    ).toBe(400);
    const own = await completedEvent(order, f.siteId, { secret: ownerSecret });
    const res = await postWebhook(app, own.body, own.signature, `/c/stripe/webhook/${f.siteId}`);
    expect(res.status).toBe(200);
    expect((await orderRow(orderId))?.status).toBe("paid");
    // Rejects keys that aren't Stripe keys.
    const bad = await call(app, `/api/sites/${f.siteId}/commerce/sovereign`, {
      method: "PUT",
      cookie: f.cookie,
      json: { secretKey: "hello", webhookSecret: ownerSecret },
    });
    expect(bad.status).toBe(422);
  });
});

describe("donations", () => {
  it("accepts the donation block's no-JS form and enforces min/max on the effective amount", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    const post = (fields: Record<string, string>) =>
      postForm(f, `/c/${f.siteId}/checkout`, {
        kind: "donation",
        currency: "USD",
        interval: "once",
        _source: "/give",
        ...fields,
      });
    const preset = await post({ amount: "2500" });
    expect(preset.status).toBe(303);
    const loc = preset.headers.get("location") as string;
    expect(loc).toContain("/dev/stripe/checkout/");
    let s = await devSession(sessionId(loc));
    expect(s.params.mode).toBe("payment");
    expect(s.params.line_items[0]?.price_data.unit_amount).toBe(2500);
    // custom_amount (major units) overrides the preset.
    s = await devSession(
      sessionId(
        (await post({ amount: "2500", custom_amount: "12.50" })).headers.get("location") as string,
      ),
    );
    expect(s.params.line_items[0]?.price_data.unit_amount).toBe(1250);
    // Monthly → subscription.
    s = await devSession(
      sessionId(
        (await post({ amount: "1000", interval: "month" })).headers.get("location") as string,
      ),
    );
    expect(s.params.mode).toBe("subscription");
    expect(s.params.line_items[0]?.price_data.recurring).toEqual({ interval: "month" });
    // Too small, too large, "Other" without an amount, nonsense: back to the page with an error.
    for (const bad of [
      { custom_amount: "0.10" },
      { custom_amount: "10001" },
      { amount: "other" },
      { amount: "" },
      { custom_amount: "12.505" },
      { custom_amount: "-5" },
      { amount: "99999999" },
    ]) {
      const r = await post(bad);
      expect(r.status).toBe(303);
      const back = r.headers.get("location") as string;
      expect(back).toContain("os_checkout=error");
      expect(back).toContain(`/s/${f.siteId}/give`);
    }
    // JSON callers get the field error.
    const json = await postCheckout(f, {
      kind: "donation",
      currency: "USD",
      custom_amount: "0.10",
    });
    expect(json.status).toBe(422);
    expect(
      ((await json.json()) as { errors: Record<string, string> }).errors.custom_amount,
    ).toBeTruthy();
    // Currency exponents: JPY has none.
    expect(donationAmount({ custom_amount: "500" }, "JPY", { min: 1, max: 10000 })).toBe(500);
    expect(() => donationAmount({ custom_amount: "5.5" }, "JPY", { min: 1, max: 10000 })).toThrow();
    // Owner limits apply.
    await call(app, `/api/sites/${f.siteId}/commerce/settings`, {
      method: "PATCH",
      cookie: f.cookie,
      json: { donationMin: 5, donationMax: 50 },
    });
    expect((await post({ amount: "400" })).headers.get("location")).toContain("os_checkout=error");
    expect((await post({ custom_amount: "50" })).headers.get("location")).toContain("/dev/stripe/");
    expect((await post({ custom_amount: "50.01" })).headers.get("location")).toContain(
      "os_checkout=error",
    );
  });
});

describe("orders dashboard, refunds, discounts, stock API", () => {
  it("lists, fulfils, prints, refunds with restock; discount codes apply at checkout", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    await setStockRow(f.siteId, "CANDLE", 10);
    const disc = await call(app, `/api/sites/${f.siteId}/discounts`, {
      method: "POST",
      cookie: f.cookie,
      json: { code: "spring10", percentOff: 10 },
    });
    expect(disc.status).toBe(201);
    expect(((await disc.json()) as { discount: { code: string } }).discount.code).toBe("SPRING10");
    const { url, orderId } = (await (
      await postCheckout(f, { items: [{ sku: "CANDLE", qty: 2 }] })
    ).json()) as { url: string; orderId: string };
    await payDev(app, url, { promo: "SPRING10", name: "Ana <script>" });
    const view = await call(app, `/api/sites/${f.siteId}/orders/${orderId}`, { cookie: f.cookie });
    const { order } = (await view.json()) as {
      order: { total: number; amounts: Record<string, number>; status: string; number: number };
    };
    expect(order).toMatchObject({ status: "paid", total: 4320 });
    expect(order.amounts).toMatchObject({ subtotal: 4800, discount: 480 });
    const list = (await (
      await call(app, `/api/sites/${f.siteId}/orders`, { cookie: f.cookie })
    ).json()) as {
      orders: Array<{ id: string }>;
    };
    expect(list.orders.map((o) => o.id)).toEqual([orderId]);
    const byNumber = (await (
      await call(app, `/api/sites/${f.siteId}/orders?q=%23${order.number}`, { cookie: f.cookie })
    ).json()) as { orders: unknown[] };
    expect(byNumber.orders).toHaveLength(1);
    const slip = await call(app, `/api/sites/${f.siteId}/orders/${orderId}/packing-slip`, {
      cookie: f.cookie,
    });
    const html = await slip.text();
    expect(html).toContain("Juniper Candle");
    expect(html).toContain("Ana &lt;script&gt;");
    expect(html).not.toContain("<script>");
    const ful = await call(app, `/api/sites/${f.siteId}/orders/${orderId}/fulfill`, {
      method: "POST",
      cookie: f.cookie,
      json: { tracking: "1Z999", notify: true },
    });
    expect(((await ful.json()) as { order: { fulfillment: string } }).order.fulfillment).toBe(
      "fulfilled",
    );
    expect(await outbox(app, "?kind=order-shipped")).toHaveLength(1);
    expect(await stock(f.siteId, "CANDLE")).toBe(8);
    const over = await call(app, `/api/sites/${f.siteId}/orders/${orderId}/refund`, {
      method: "POST",
      cookie: f.cookie,
      json: { amount: 999_999 },
    });
    expect(over.status).toBe(422);
    const part = await call(app, `/api/sites/${f.siteId}/orders/${orderId}/refund`, {
      method: "POST",
      cookie: f.cookie,
      json: { amount: 1000 },
    });
    expect(
      ((await part.json()) as { order: { status: string; refunded: number } }).order,
    ).toMatchObject({
      status: "partially_refunded",
      refunded: 1000,
    });
    const full = await call(app, `/api/sites/${f.siteId}/orders/${orderId}/refund`, {
      method: "POST",
      cookie: f.cookie,
      json: { restock: true },
    });
    expect(
      ((await full.json()) as { order: { status: string; refunded: number } }).order,
    ).toMatchObject({
      status: "refunded",
      refunded: 4320,
    });
    expect(await stock(f.siteId, "CANDLE")).toBe(10);
  });

  it("manages inventory and serves availability to product pages", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    const put = await call(app, `/api/sites/${f.siteId}/inventory`, {
      method: "PUT",
      cookie: f.cookie,
      json: { sku: "MAT#2", qty: 2 },
    });
    expect(put.status).toBe(200);
    const adj = await call(app, `/api/sites/${f.siteId}/inventory/adjust`, {
      method: "POST",
      cookie: f.cookie,
      json: { sku: "MAT#2", delta: -5 },
    });
    expect(adj.status).toBe(409);
    const products = (await (
      await call(app, `/api/sites/${f.siteId}/products`, { cookie: f.cookie })
    ).json()) as {
      products: Array<{ sku: string; tracked: boolean; qty: number | null; low: boolean }>;
    };
    expect(products.products.find((p) => p.sku === "MAT#2")).toMatchObject({
      tracked: true,
      qty: 2,
      low: true,
    });
    expect(products.products.find((p) => p.sku === "CANDLE")).toMatchObject({ tracked: false });
    expect(products.products.some((p) => p.sku === "SECRET")).toBe(false);
    const avail = await call(app, `/c/${f.siteId}/stock?sku=MAT%232&sku=CANDLE`);
    expect(await avail.json()).toEqual({
      skus: {
        "MAT#2": { tracked: true, inStock: true, low: true, qty: 2 },
        CANDLE: { tracked: false, inStock: true, low: false, qty: null },
      },
    });
  });

  it("onboards Stripe Connect (dev) and refuses checkout until charges are enabled in production", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    const start = await call(app, `/api/sites/${f.siteId}/commerce/connect`, {
      method: "POST",
      cookie: f.cookie,
      json: {},
    });
    const { url, account } = (await start.json()) as { url: string; account: string };
    expect(account).toMatch(/^acct_dev_/);
    const done = await call(app, new URL(url).pathname, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `return=${encodeURIComponent("https://evil.example/")}`,
      redirect: "manual",
    });
    expect(done.headers.get("location")).toBe("http://localhost:5173");
    const status = (await (
      await call(app, `/api/sites/${f.siteId}/commerce/connect`, { cookie: f.cookie })
    ).json()) as {
      payments: { chargesEnabled: boolean; ready: boolean; account: string };
    };
    expect(status.payments).toMatchObject({ chargesEnabled: true, ready: true, account });
    // Production Hub (DEV_MODE off) without a platform key: Connect checkout is refused (503),
    // never silently faked.
    const prod = await call(
      app,
      `/c/${f.siteId}/checkout`,
      {
        method: "POST",
        headers: { Accept: "application/json" },
        json: { items: [{ sku: "CANDLE", qty: 1 }] },
      },
      { ...(env as unknown as Record<string, unknown>), DEV_MODE: "false" },
    );
    expect([409, 503]).toContain(prod.status);
  });
});

describe("HttpStripe (real API shape, mocked fetch)", () => {
  it("creates sessions on the connected account with form encoding and no application fee", async () => {
    const m = mockFetch([
      [
        "POST",
        /api\.stripe\.com\/v1\/checkout\/sessions/,
        () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/1" }),
      ],
      [
        "POST",
        /api\.stripe\.com\/v1\/refunds/,
        () => ({ id: "re_1", amount: 500, status: "succeeded" }),
      ],
      ["POST", /api\.stripe\.com\/v1\/accounts$/, () => ({ id: "acct_1" })],
    ]);
    const key = ["sk", "test", "platformkey123456"].join("_");
    const s = new HttpStripe(key, m.fetch, "acct_owner");
    const out = await s.createCheckoutSession(
      {
        mode: "payment",
        line_items: [
          {
            quantity: 2,
            price_data: {
              currency: "usd",
              unit_amount: 2400,
              product_data: { name: "Candle", metadata: { sku: "C" } },
            },
          },
        ],
        success_url: "https://shop.example/?ok",
        cancel_url: "https://shop.example/",
        client_reference_id: "ord_1",
        metadata: { os_site: "st_1" },
        allow_promotion_codes: true,
      },
      "checkout-ord_1",
    );
    expect(out).toEqual({ id: "cs_test_1", url: "https://checkout.stripe.com/c/1" });
    const call0 = m.calls[0];
    expect(call0?.headers.get("stripe-account")).toBe("acct_owner");
    expect(call0?.headers.get("idempotency-key")).toBe("checkout-ord_1");
    expect(call0?.headers.get("authorization")).toBe(`Bearer ${key}`);
    const form = new URLSearchParams(call0?.body as string);
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("2400");
    expect(form.get("line_items[0][price_data][product_data][metadata][sku]")).toBe("C");
    expect([...form.keys()].some((k) => k.includes("application_fee"))).toBe(false);
    await s.createRefund({ paymentIntent: "pi_1", amount: 500 });
    expect(new URLSearchParams(m.calls[1]?.body as string).get("payment_intent")).toBe("pi_1");
    // Account creation is a platform call (no Stripe-Account header).
    await s.createAccount({ email: "a@example.com" });
    expect(m.calls[2]?.headers.get("stripe-account")).toBeNull();
    expect(new URLSearchParams(m.calls[2]?.body as string).get("type")).toBe("standard");
    expect(stripeForm({ a: [{ b: 1 }], c: undefined })).toBe("a%5B0%5D%5Bb%5D=1");
  });
});

describe("membership checkout", () => {
  it("maps a paid subscription to a member tier and drops it when the subscription ends", async () => {
    const app = makePublicApp();
    const f = await shopSite(app);
    const tierRes = await call(app, `/api/sites/${f.siteId}/tiers`, {
      method: "POST",
      cookie: f.cookie,
      json: { name: "Studio Circle", price: { amount: 1200, currency: "USD", interval: "month" } },
    });
    const { tier } = (await tierRes.json()) as { tier: { id: string } };
    const res = await postCheckout(f, {
      kind: "membership",
      tier: tier.id,
      email: "ana@example.com",
    });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const s = await devSession(sessionId(url));
    expect(s.params.mode).toBe("subscription");
    expect(s.params.line_items[0]?.price_data.unit_amount).toBe(1200);
    await payDev(app, url, { email: "ana@example.com" });
    const member = await env.HUB_DB.prepare("SELECT * FROM members WHERE site_id = ? AND email = ?")
      .bind(f.siteId, "ana@example.com")
      .first<{ tier: string; subscription_id: string }>();
    expect(member?.tier).toBe(tier.id);
    const { signStripePayload } = await import("../src/services/stripe");
    const ev = JSON.stringify({
      id: "evt_sub_end",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: member?.subscription_id,
          status: "canceled",
          metadata: { os_site: f.siteId, os_tier: tier.id },
        },
      },
    });
    const sig = await signStripePayload(ev, WEBHOOK_SECRET, Math.floor(Date.now() / 1000));
    // DevStripe events have no account; in DEV_MODE the metadata names the site.
    const r = await postWebhook(app, ev, sig);
    expect(r.status).toBe(200);
    const after = await env.HUB_DB.prepare(
      "SELECT tier FROM members WHERE site_id = ? AND email = ?",
    )
      .bind(f.siteId, "ana@example.com")
      .first<{ tier: string | null }>();
    expect(after?.tier).toBeNull();
    // Free tiers aren't sold.
    const free = (await (
      await call(app, `/api/sites/${f.siteId}/tiers`, {
        method: "POST",
        cookie: f.cookie,
        json: { name: "Friends" },
      })
    ).json()) as { tier: { id: string } };
    expect((await postCheckout(f, { kind: "membership", tier: free.tier.id })).status).toBe(422);
  });
});
