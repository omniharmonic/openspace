/** Task 18 review fix round 1: follow-up retries, refunds, restock races, domain claims, minors. */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { GROWTH_DAILY_CRON, runGrowthCron } from "../src/cron/growth";
import { DevGitHubAccess } from "../src/github/dev";
import { DRAFT_BRANCH, MAIN_BRANCH, parseRepo } from "../src/github/types";
import { randomId } from "../src/lib/crypto";
import type { StripeTarget } from "../src/services/growth";
import { MemoryRateLimiter } from "../src/services/rate-limit";
import { DevStripe } from "../src/services/stripe";
import { kitVersion } from "../src/services/updates";
import {
  completedEvent,
  makeGrowthApp,
  orderRow,
  payDev,
  postCheckout,
  postWebhook,
  setStockRow,
  shopSite,
  stock,
} from "./growth-helpers";
import { call, type TestApp } from "./helpers";
import { makePublicApp, outbox, setQuota, siteWithForm } from "./public-helpers";

/** DevStripe whose refunds fail while `state.failRefunds` is set. */
function flakyStripe(state: { failRefunds: boolean }) {
  return (t: StripeTarget) => {
    const s = new DevStripe(env.HUB_DB, "http://localhost:8787", Date.now, t.account ?? null);
    const real = s.createRefund.bind(s);
    s.createRefund = async (input) => {
      if (state.failRefunds) throw new Error("stripe is down");
      return real(input);
    };
    return s;
  };
}

async function uploadDigital(app: TestApp, f: { siteId: string; cookie: string }, sku: string) {
  const res = await call(
    app,
    `/api/sites/${f.siteId}/products/file?sku=${encodeURIComponent(sku)}`,
    {
      method: "PUT",
      cookie: f.cookie,
      headers: {
        "Content-Type": "application/pdf",
        "X-Filename": "guide.pdf",
        "Content-Length": "9",
      },
      body: "%PDF-test",
    },
  );
  expect(res.status).toBe(200);
}

describe("post-payment follow-ups are retried until they succeed", () => {
  it("a failed digital delivery is redone on Stripe's redelivery (webhook answers 500 first)", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    await uploadDigital(app, f, "GUIDE");
    const { orderId } = (await (
      await postCheckout(f, { items: [{ sku: "GUIDE", qty: 1 }] })
    ).json()) as { orderId: string };
    await setQuota(f.siteId, { transactionalEmails: 0 }); // the delivery email will fail
    const e = await completedEvent((await orderRow(orderId)) as never, f.siteId);
    const first = await postWebhook(app, e.body, e.signature);
    expect(first.status).toBe(500);
    expect((await orderRow(orderId))?.status).toBe("paid");
    expect(await outbox(app, "?kind=order-download")).toHaveLength(0);
    await setQuota(f.siteId, {});
    const again = await postWebhook(app, e.body, e.signature);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ status: "paid", resumed: true, delivered: true });
    expect(await outbox(app, "?kind=order-download")).toHaveLength(1);
    // Done: a further redelivery is a plain duplicate (no second email).
    const third = await postWebhook(app, e.body, e.signature);
    expect(await third.json()).toMatchObject({ duplicate: true });
    expect(await outbox(app, "?kind=order-download")).toHaveLength(1);
  });

  it("the daily cron finishes follow-ups Stripe gave up on", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    await uploadDigital(app, f, "GUIDE");
    const { orderId } = (await (
      await postCheckout(f, { items: [{ sku: "GUIDE", qty: 1 }] })
    ).json()) as { orderId: string };
    await setQuota(f.siteId, { transactionalEmails: 0 });
    const e = await completedEvent((await orderRow(orderId)) as never, f.siteId);
    expect((await postWebhook(app, e.body, e.signature)).status).toBe(500);
    await setQuota(f.siteId, {});
    const out = await runGrowthCron(GROWTH_DAILY_CRON, env, {
      now: () => Date.now() + 30 * 60_000,
    });
    expect(out.orders).toMatchObject({ followups: 1 });
    expect(await outbox(app, "?kind=order-download")).toHaveLength(1);
  });

  it("membership tiers are applied on redelivery too", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    const { tier } = (await (
      await call(app, `/api/sites/${f.siteId}/tiers`, {
        method: "POST",
        cookie: f.cookie,
        json: { name: "Circle", price: { amount: 900, currency: "USD", interval: "month" } },
      })
    ).json()) as { tier: { id: string } };
    const { orderId } = (await (
      await postCheckout(f, { kind: "membership", tier: tier.id })
    ).json()) as { orderId: string };
    // Simulate a crash after the claim: the order is paid but no follow-up ran.
    await env.HUB_DB.prepare(
      "UPDATE orders SET status = 'paid', paid_at = ?, email = 'kai@example.com', subscription_id = 'sub_1' WHERE id = ?",
    )
      .bind(Date.now(), orderId)
      .run();
    const o = (await orderRow(orderId)) as never;
    const e = await completedEvent(o, f.siteId);
    const r = await postWebhook(app, e.body, e.signature);
    expect(await r.json()).toMatchObject({ resumed: true });
    const m = await env.HUB_DB.prepare("SELECT tier FROM members WHERE site_id = ? AND email = ?")
      .bind(f.siteId, "kai@example.com")
      .first<{ tier: string }>();
    expect(m?.tier).toBe(tier.id);
  });
});

describe("sold-out refunds never dead-end", () => {
  it("a failed automatic refund can be retried from the dashboard and by the cron", async () => {
    const state = { failRefunds: true };
    const app = makeGrowthApp({ growth: { stripe: flakyStripe(state) } });
    const f = await shopSite(app);
    await setStockRow(f.siteId, "CANDLE", 0);
    const mk = async () => {
      // Stock was available at checkout time; it's gone by the time payment completes.
      await setStockRow(f.siteId, "CANDLE", 1);
      const { orderId } = (await (
        await postCheckout(f, { items: [{ sku: "CANDLE", qty: 1 }] })
      ).json()) as { orderId: string };
      await setStockRow(f.siteId, "CANDLE", 0);
      const e = await completedEvent((await orderRow(orderId)) as never, f.siteId);
      expect((await postWebhook(app, e.body, e.signature)).status).toBe(200);
      return orderId;
    };
    const a = await mk();
    const b = await mk();
    expect((await orderRow(a))?.status).toBe("out_of_stock");
    state.failRefunds = false;
    // Dashboard: full refund only, whatever amount is asked for.
    const res = await call(app, `/api/sites/${f.siteId}/orders/${a}/refund`, {
      method: "POST",
      cookie: f.cookie,
      json: { amount: 1 },
    });
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as { order: { status: string; refunded: number } }).order,
    ).toMatchObject({
      status: "refunded",
      refunded: 2400,
    });
    // Cron.
    const out = await runGrowthCron(GROWTH_DAILY_CRON, env, {
      growth: { stripe: flakyStripe(state) },
    });
    expect(out.orders).toMatchObject({ refunds: 1 });
    expect(await orderRow(b)).toMatchObject({ status: "refunded", refunded: 2400 });
    expect(await stock(f.siteId, "CANDLE")).toBe(0);
  });
});

describe("refund restock races", () => {
  it("parallel full refunds with restock add stock back once", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    await setStockRow(f.siteId, "CANDLE", 5);
    const { url, orderId } = (await (
      await postCheckout(f, { items: [{ sku: "CANDLE", qty: 2 }] })
    ).json()) as { url: string; orderId: string };
    await payDev(app, url);
    expect(await stock(f.siteId, "CANDLE")).toBe(3);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        call(app, `/api/sites/${f.siteId}/orders/${orderId}/refund`, {
          method: "POST",
          cookie: f.cookie,
          json: { restock: true },
        }),
      ),
    );
    expect(results.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);
    expect(await stock(f.siteId, "CANDLE")).toBe(5);
    expect(await orderRow(orderId)).toMatchObject({ status: "refunded", refunded: 4800 });
    const refunds = await env.HUB_DB.prepare(
      "SELECT COUNT(*) AS n FROM order_refunds WHERE order_id = ?",
    )
      .bind(orderId)
      .first<{ n: number }>();
    expect(refunds?.n).toBe(1);
  });

  it("parallel partial refunds are all recorded; restock happens once at full", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    await setStockRow(f.siteId, "CANDLE", 5);
    const { url, orderId } = (await (
      await postCheckout(f, { items: [{ sku: "CANDLE", qty: 2 }] })
    ).json()) as { url: string; orderId: string };
    await payDev(app, url);
    await Promise.all(
      [1000, 1500].map((amount) =>
        call(app, `/api/sites/${f.siteId}/orders/${orderId}/refund`, {
          method: "POST",
          cookie: f.cookie,
          json: { amount, restock: true },
        }),
      ),
    );
    expect(await orderRow(orderId)).toMatchObject({ status: "partially_refunded", refunded: 2500 });
    expect(await stock(f.siteId, "CANDLE")).toBe(3);
    await Promise.all(
      [1, 2].map(() =>
        call(app, `/api/sites/${f.siteId}/orders/${orderId}/refund`, {
          method: "POST",
          cookie: f.cookie,
          json: { restock: true },
        }),
      ),
    );
    expect(await orderRow(orderId)).toMatchObject({ status: "refunded", refunded: 4800 });
    expect(await stock(f.siteId, "CANDLE")).toBe(5);
  });
});

describe("custom-domain claims", () => {
  const DAY = 86_400_000;

  it("re-submitting an unverified claim doesn't extend it; another site takes it after 7 days", async () => {
    let now = Date.now();
    const app = makePublicApp({ now: () => now, public: { rdap: { lookup: async () => null } } });
    const a = await siteWithForm(app, { form: null, name: "Squatter" });
    const b = await siteWithForm(app, { form: null, name: "Rightful Owner", user: "Ana Ruiz" });
    // `real.example.org` doesn't resolve in the dev resolver, so it never verifies.
    const claim = (f: typeof a) =>
      call(app, `/api/sites/${f.siteId}/domain`, {
        method: "POST",
        cookie: f.cookie,
        json: { domain: "shop.juniper-real.org" },
      });
    expect((await claim(a)).status).toBe(201);
    const created = (
      await env.HUB_DB.prepare(
        "SELECT created_at FROM domains WHERE hostname = 'shop.juniper-real.org'",
      ).first<{
        created_at: number;
      }>()
    )?.created_at;
    now += 6 * DAY;
    expect((await claim(a)).status).toBe(201); // re-submit
    const after = (
      await env.HUB_DB.prepare(
        "SELECT created_at FROM domains WHERE hostname = 'shop.juniper-real.org'",
      ).first<{
        created_at: number;
      }>()
    )?.created_at;
    expect(after).toBe(created);
    expect((await claim(b)).status).toBe(409);
    now += 2 * DAY;
    expect((await claim(b)).status).toBe(201);
    const owner = await env.HUB_DB.prepare(
      "SELECT site_id FROM domains WHERE hostname = 'shop.juniper-real.org'",
    ).first<{
      site_id: string;
    }>();
    expect(owner?.site_id).toBe(b.siteId);
  });

  it("verified claims are never released or taken, whatever their status says", async () => {
    let now = Date.now();
    const app = makePublicApp({ now: () => now, public: { rdap: { lookup: async () => null } } });
    const a = await siteWithForm(app, { form: null, name: "Verified One" });
    const b = await siteWithForm(app, { form: null, name: "Late Comer", user: "Ana Ruiz" });
    await env.HUB_DB.prepare(
      "INSERT INTO domains (site_id, hostname, status, https, created_at, verified_at) VALUES (?, 'old.juniper-real.org', 'verifying', 1, 0, 1)",
    )
      .bind(a.siteId)
      .run();
    now += 8 * DAY;
    const res = await call(app, `/api/sites/${b.siteId}/domain`, {
      method: "POST",
      cookie: b.cookie,
      json: { domain: "old.juniper-real.org" },
    });
    expect(res.status).toBe(409);
    // The owner re-submitting keeps the verified status.
    await call(app, `/api/sites/${a.siteId}/domain`, {
      method: "POST",
      cookie: a.cookie,
      json: { domain: "old.juniper-real.org" },
    });
    const row = await env.HUB_DB.prepare(
      "SELECT status FROM domains WHERE hostname = 'old.juniper-real.org'",
    ).first<{
      status: string;
    }>();
    expect(row?.status).toBe("verifying");
  });
});

describe("review minors", () => {
  it("creates the member when the link is used, not when it is requested", async () => {
    const app = makePublicApp();
    const f = await shopSite(app);
    await call(app, `/m/${f.siteId}/login`, {
      method: "POST",
      headers: { Accept: "application/json" },
      json: { email: "new@example.com" },
    });
    const count = async () =>
      (
        await env.HUB_DB.prepare("SELECT COUNT(*) AS n FROM members WHERE site_id = ?")
          .bind(f.siteId)
          .first<{ n: number }>()
      )?.n;
    expect(await count()).toBe(0);
    const [mail] = await outbox(app, "?kind=member-magic-link");
    const path = new URL(mail?.links.find((l) => l.includes("/verify/")) as string).pathname;
    expect((await call(app, path, { method: "POST", redirect: "manual" })).status).toBe(303);
    expect(await count()).toBe(1);
  });

  it("never pays an order without a stored session id", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    const { orderId } = (await (
      await postCheckout(f, { items: [{ sku: "CANDLE", qty: 1 }] })
    ).json()) as { orderId: string };
    const o = (await orderRow(orderId)) as { id: string; stripe_session: string; total: number };
    await env.HUB_DB.prepare("UPDATE orders SET stripe_session = NULL WHERE id = ?")
      .bind(orderId)
      .run();
    const e = await completedEvent(o as never, f.siteId);
    await postWebhook(app, e.body, e.signature);
    expect((await orderRow(orderId))?.status).toBe("pending");
  });

  it("audits update checks, failed applies and sender verification", async () => {
    const app = makePublicApp();
    const f = await siteWithForm(app, { form: null, name: "Juniper Audit" });
    await call(app, `/api/sites/${f.siteId}/updates/check`, { method: "POST", cookie: f.cookie });
    await call(app, `/api/sites/${f.siteId}/updates/upd_nope/apply`, {
      method: "POST",
      cookie: f.cookie,
    });
    const s = (await (
      await call(app, `/api/sites/${f.siteId}/senders`, {
        method: "POST",
        cookie: f.cookie,
        json: { provider: "dev", fromEmail: "hi@juniper.test" },
      })
    ).json()) as { sender: { id: string } };
    await call(app, `/api/sites/${f.siteId}/senders/${s.sender.id}/verify`, {
      method: "POST",
      cookie: f.cookie,
    });
    const actions = (
      await env.HUB_DB.prepare("SELECT action FROM audit_log WHERE site_id = ?")
        .bind(f.siteId)
        .all<{ action: string }>()
    ).results.map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining(["update.check", "update.apply_failed", "sender.verify"]),
    );
  });

  it("an apply retried after the merge carries the bump to the draft", async () => {
    const app = makePublicApp();
    const f = await siteWithForm(app, { form: null, name: "Juniper Retry" });
    const { update } = (await (
      await call(app, `/api/sites/${f.siteId}/updates/check`, { method: "POST", cookie: f.cookie })
    ).json()) as { update: { id: string } };
    // Simulate: main already has the bump (merge happened) but the draft step failed.
    const gh = new DevGitHubAccess(env.HUB_DB);
    const repo = parseRepo(f.repo);
    const head = (await gh.getRef(repo, MAIN_BRANCH)) as string;
    const pkg = JSON.parse((await gh.readFile(repo, "package.json", head)) as string);
    pkg.dependencies["@openspace/site-kit"] = "^0.2.0";
    await gh.commitFiles(repo, {
      branch: MAIN_BRANCH,
      expectedHead: head,
      message: "merged",
      files: [{ path: "package.json", content: JSON.stringify(pkg) }],
    });
    await env.HUB_DB.prepare("UPDATE site_updates SET status = 'failed' WHERE id = ?")
      .bind(update.id)
      .run();
    const res = await call(app, `/api/sites/${f.siteId}/updates/${update.id}/apply`, {
      method: "POST",
      cookie: f.cookie,
    });
    expect(res.status).toBe(200);
    const draft = (await gh.getRef(repo, DRAFT_BRANCH)) as string;
    expect(kitVersion(await gh.readFile(repo, "package.json", draft))).toBe("0.2.0");
  });

  it("creates a discount code once under concurrency", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        call(app, `/api/sites/${f.siteId}/discounts`, {
          method: "POST",
          cookie: f.cookie,
          json: { code: "SUMMER", percentOff: 15 },
        }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const promos = await env.HUB_DB.prepare(
      "SELECT COUNT(*) AS n FROM dev_stripe_objects WHERE kind = 'promotion_code'",
    ).first<{ n: number }>();
    expect(promos?.n).toBe(1);
  });

  it("rate-limits page password guesses and campaign test sends", async () => {
    const app = makeGrowthApp({ public: { rateLimit: new MemoryRateLimiter() } });
    const f = await siteWithForm(app, { form: null, name: "Juniper Limits" });
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const r = await call(app, `/s/${f.siteId}/_os/auth/password`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ page: "pg_retreat000", password: `guess${i}` }).toString(),
        redirect: "manual",
      });
      last = r.status;
    }
    expect(last).toBe(429);
    const c = (await (
      await call(app, `/api/sites/${f.siteId}/campaigns`, {
        method: "POST",
        cookie: f.cookie,
        json: {
          subject: "Hello",
          body: {
            blocks: [
              {
                id: "blk_test000001",
                type: "text",
                v: 1,
                fields: {
                  content: {
                    type: "doc",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
                  },
                },
              },
            ],
          },
        },
      })
    ).json()) as { campaign: { id: string } };
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++)
      statuses.push(
        (
          await call(app, `/api/sites/${f.siteId}/campaigns/${c.campaign.id}/test`, {
            method: "POST",
            cookie: f.cookie,
            json: { to: "me@example.com" },
          })
        ).status,
      );
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(statuses[10]).toBe(429);
  });

  it("the minute cron finishes sending campaigns with nothing left, Queue or not", async () => {
    const app = makeGrowthApp({ growth: { queue: { send: async () => undefined } } });
    const f = await siteWithForm(app, { form: null, name: "Juniper Finish" });
    const id = randomId("cmp", 10);
    await env.HUB_DB.prepare(
      "INSERT INTO campaigns (id, site_id, subject, body_json, status, created_at, recipients, started_at) VALUES (?, ?, 's', '{}', 'sending', 0, 1, 0)",
    )
      .bind(id, f.siteId)
      .run();
    await env.HUB_DB.prepare(
      "INSERT INTO campaign_recipients (id, campaign_id, site_id, subscriber_id, email, status) VALUES ('rcp_1', ?, ?, 'sub_1', 'a@example.com', 'failed')",
    )
      .bind(id, f.siteId)
      .run();
    const { runDueCampaigns } = await import("../src/services/campaigns");
    const { createServices } = await import("../src/services");
    const { readConfig } = await import("../src/env");
    const services = createServices(env, readConfig(env), {
      growth: { queue: { send: async () => undefined } },
    });
    const r = await runDueCampaigns(services, Date.now());
    expect(r.finished).toBe(1);
    const row = await env.HUB_DB.prepare("SELECT status FROM campaigns WHERE id = ?")
      .bind(id)
      .first<{ status: string }>();
    expect(row?.status).toBe("sent");
  });
});

describe("fix round 2", () => {
  async function services(overrides: Record<string, unknown> = {}) {
    const { createServices } = await import("../src/services");
    const { readConfig } = await import("../src/env");
    return createServices(env, readConfig(env), overrides);
  }

  it("a campaign is claimed together with its recipients; the cron never finishes it early", async () => {
    const app = makeGrowthApp({ growth: { queue: { send: async () => undefined } } });
    const f = await siteWithForm(app, { form: null, name: "Juniper Race" });
    await env.HUB_DB.prepare(
      "INSERT INTO subscribers (id, site_id, email, status, tags, created_at) VALUES ('sub_race1', ?, 'a@example.com', 'confirmed', '[]', 0)",
    )
      .bind(f.siteId)
      .run();
    const mk = async () =>
      (
        (await (
          await call(app, `/api/sites/${f.siteId}/campaigns`, {
            method: "POST",
            cookie: f.cookie,
            json: {
              subject: "Hi",
              body: {
                blocks: [
                  {
                    id: "blk_race000001",
                    type: "text",
                    v: 1,
                    fields: {
                      content: {
                        type: "doc",
                        content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
                      },
                    },
                  },
                ],
              },
            },
          })
        ).json()) as { campaign: { id: string } }
      ).campaign.id;
    // (a) A `sending` campaign seen without recipients (the old window) isn't finished while fresh.
    const fresh = await mk();
    await env.HUB_DB.prepare("UPDATE campaigns SET status = 'sending', started_at = ? WHERE id = ?")
      .bind(Date.now(), fresh)
      .run();
    const { runDueCampaigns, startCampaign } = await import("../src/services/campaigns");
    const svc = await services({ growth: { queue: { send: async () => undefined } } });
    expect((await runDueCampaigns(svc, Date.now())).finished).toBe(0);
    // (b) Starting is one transaction: claim + recipients + count.
    const id = await mk();
    const res = await call(app, `/api/sites/${f.siteId}/campaigns/${id}/send`, {
      method: "POST",
      cookie: f.cookie,
    });
    expect(
      ((await res.json()) as { campaign: { status: string; recipients: number } }).campaign,
    ).toMatchObject({
      status: "sending",
      recipients: 1,
    });
    // (c) If that transaction fails, the campaign stays a draft (visible, re-sendable).
    const failing = await mk();
    const broken = await services();
    const db = broken.db;
    broken.db = new Proxy(db, {
      get(target, prop) {
        if (prop === "batch")
          return async () => {
            throw new Error("D1 unavailable");
          };
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    }) as D1Database;
    const { getSite } = await import("../src/db/sites");
    await expect(
      startCampaign(broken, (await getSite(env.HUB_DB, f.siteId)) as never, failing),
    ).rejects.toThrow();
    const row = await env.HUB_DB.prepare("SELECT status, recipients FROM campaigns WHERE id = ?")
      .bind(failing)
      .first<{ status: string; recipients: number }>();
    expect(row).toEqual({ status: "draft", recipients: 0 });
  });

  it("external refunds are recorded once and shift later idempotency keys", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    const { url, orderId } = (await (
      await postCheckout(f, { items: [{ sku: "CANDLE", qty: 2 }] })
    ).json()) as { url: string; orderId: string };
    await payDev(app, url);
    const o = (await orderRow(orderId)) as { payment_intent: string };
    const { signStripePayload } = await import("../src/services/stripe");
    const { WEBHOOK_SECRET } = await import("./growth-helpers");
    const send = async (id: string, charge: Record<string, unknown>) => {
      const body = JSON.stringify({
        id,
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_1",
            payment_intent: o.payment_intent,
            metadata: { os_site: f.siteId },
            ...charge,
          },
        },
      });
      return postWebhook(
        app,
        body,
        await signStripePayload(body, WEBHOOK_SECRET, Math.floor(Date.now() / 1000)),
      );
    };
    await send("evt_r1", {
      amount_refunded: 1000,
      refunds: { data: [{ id: "re_ext_1", amount: 1000 }] },
    });
    await send("evt_r1b", {
      amount_refunded: 1000,
      refunds: { data: [{ id: "re_ext_1", amount: 1000 }] },
    });
    expect(await orderRow(orderId)).toMatchObject({ status: "partially_refunded", refunded: 1000 });
    // Without a refund list: the not-yet-recorded difference under a synthetic id.
    await send("evt_r2", { amount_refunded: 1500 });
    await send("evt_r2b", { amount_refunded: 1500 });
    expect(await orderRow(orderId)).toMatchObject({ refunded: 1500 });
    const rows = await env.HUB_DB.prepare(
      "SELECT id, amount FROM order_refunds WHERE order_id = ? ORDER BY id",
    )
      .bind(orderId)
      .all<{ id: string; amount: number }>();
    expect(rows.results).toEqual([
      { id: "ext:ch_1:1500", amount: 500 },
      { id: "re_ext_1", amount: 1000 },
    ]);
    // The dashboard refunds what's left (a new key, since `refunded` moved).
    const rest = await call(app, `/api/sites/${f.siteId}/orders/${orderId}/refund`, {
      method: "POST",
      cookie: f.cookie,
      json: {},
    });
    expect(
      ((await rest.json()) as { order: { status: string; refunded: number } }).order,
    ).toMatchObject({
      status: "refunded",
      refunded: 4800,
    });
  });

  it("a sold-out order partially refunded outside stays pending its full refund", async () => {
    const state = { failRefunds: true };
    const app = makeGrowthApp({ growth: { stripe: flakyStripe(state) } });
    const f = await shopSite(app);
    await setStockRow(f.siteId, "CANDLE", 1);
    const { orderId } = (await (
      await postCheckout(f, { items: [{ sku: "CANDLE", qty: 1 }] })
    ).json()) as { orderId: string };
    await setStockRow(f.siteId, "CANDLE", 0);
    const e = await completedEvent((await orderRow(orderId)) as never, f.siteId);
    await postWebhook(app, e.body, e.signature);
    const o = (await orderRow(orderId)) as { payment_intent: string; status: string };
    expect(o.status).toBe("out_of_stock");
    const { signStripePayload } = await import("../src/services/stripe");
    const { WEBHOOK_SECRET } = await import("./growth-helpers");
    const body = JSON.stringify({
      id: "evt_oos_partial",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_2",
          payment_intent: o.payment_intent,
          amount_refunded: 400,
          metadata: { os_site: f.siteId },
        },
      },
    });
    await postWebhook(
      app,
      body,
      await signStripePayload(body, WEBHOOK_SECRET, Math.floor(Date.now() / 1000)),
    );
    expect(await orderRow(orderId)).toMatchObject({ status: "out_of_stock", refunded: 400 });
    state.failRefunds = false;
    const out = await runGrowthCron(GROWTH_DAILY_CRON, env, {
      growth: { stripe: flakyStripe(state) },
    });
    expect(out.orders).toMatchObject({ refunds: 1 });
    expect(await orderRow(orderId)).toMatchObject({ status: "refunded", refunded: 2400 });
  });

  it("follow-ups: one worker at a time, capped retries shown to the owner, no tier after cancellation", async () => {
    const app = makeGrowthApp();
    const f = await shopSite(app);
    await uploadDigital(app, f, "GUIDE");
    const { orderId } = (await (
      await postCheckout(f, { items: [{ sku: "GUIDE", qty: 1 }] })
    ).json()) as { orderId: string };
    await setQuota(f.siteId, { transactionalEmails: 0 });
    const e = await completedEvent((await orderRow(orderId)) as never, f.siteId);
    expect((await postWebhook(app, e.body, e.signature)).status).toBe(500);
    // Another worker holds the lease: a redelivery doesn't run them concurrently.
    await env.HUB_DB.prepare("UPDATE orders SET followups_claim = ? WHERE id = ?")
      .bind(Date.now(), orderId)
      .run();
    const busy = await postWebhook(app, e.body, e.signature);
    expect(await busy.json()).toMatchObject({ inProgress: true });
    await env.HUB_DB.prepare(
      "UPDATE orders SET followups_claim = NULL, followup_attempts = 7 WHERE id = ?",
    )
      .bind(orderId)
      .run();
    // Capped: the cron leaves it; the dashboard shows the problem.
    const out = await runGrowthCron(GROWTH_DAILY_CRON, env, {
      now: () => Date.now() + 30 * 60_000,
    });
    expect(out.orders).toMatchObject({ followups: 0 });
    const view = (await (
      await call(app, `/api/sites/${f.siteId}/orders/${orderId}`, { cookie: f.cookie })
    ).json()) as {
      order: { problem: { message: string; attempts: number; gaveUp: boolean } | null };
    };
    expect(view.order.problem).toMatchObject({ attempts: 7, gaveUp: true });
    expect(view.order.problem?.message).toContain("Delivery after payment failed");
    const problems = (await (
      await call(app, `/api/sites/${f.siteId}/orders?problem=1`, { cookie: f.cookie })
    ).json()) as {
      orders: Array<{ id: string }>;
    };
    expect(problems.orders.map((o) => o.id)).toEqual([orderId]);

    // Membership: the subscription ended before the follow-ups ran → no tier.
    const { tier } = (await (
      await call(app, `/api/sites/${f.siteId}/tiers`, {
        method: "POST",
        cookie: f.cookie,
        json: { name: "Circle", price: { amount: 900, currency: "USD", interval: "month" } },
      })
    ).json()) as { tier: { id: string } };
    const m = (await (await postCheckout(f, { kind: "membership", tier: tier.id })).json()) as {
      orderId: string;
    };
    const { signStripePayload } = await import("../src/services/stripe");
    const { WEBHOOK_SECRET } = await import("./growth-helpers");
    const cancel = JSON.stringify({
      id: "evt_cancel_first",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_early",
          status: "canceled",
          metadata: { os_site: f.siteId, os_order: m.orderId, os_tier: tier.id },
        },
      },
    });
    await postWebhook(
      app,
      cancel,
      await signStripePayload(cancel, WEBHOOK_SECRET, Math.floor(Date.now() / 1000)),
    );
    await setQuota(f.siteId, {});
    const paid = await completedEvent((await orderRow(m.orderId)) as never, f.siteId);
    const r = await postWebhook(app, paid.body, paid.signature);
    expect(await r.json()).toMatchObject({ member: "subscription_ended" });
    const members = await env.HUB_DB.prepare(
      "SELECT COUNT(*) AS n FROM members WHERE site_id = ? AND tier = ?",
    )
      .bind(f.siteId, tier.id)
      .first<{ n: number }>();
    expect(members?.n).toBe(0);
  });
});
