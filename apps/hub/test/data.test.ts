import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { hitWindow, type LimiterStorage } from "../src/durable/rate-limiter";
import worker from "../src/index";
import { parseCsv, toCsv } from "../src/lib/csv";
import { consumeQuota, quotaLimits } from "../src/services/quotas";
import { DurableRateLimiter } from "../src/services/rate-limit";
import { call, devLogin } from "./helpers";
import { makePublicApp, postForm, setQuota, siteWithForm, VALID } from "./public-helpers";

describe("data export and deletion", () => {
  it("exports a ZIP with entries, per-form and subscriber CSVs (owner only)", async () => {
    const f = await siteWithForm(makePublicApp());
    await postForm(f, { ...VALID, message: '=HYPERLINK("http://x")' }, { json: true });
    await call(f.app, `/n/${f.siteId}/subscribe`, {
      method: "POST",
      headers: { Accept: "application/json" },
      json: { email: "sub@example.com" },
    });
    const res = await call(f.app, `/api/sites/${f.siteId}/export`, { cookie: f.cookie });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="maya-yoga-data.zip"',
    );
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([
      "README.txt",
      "forms/frm_c0ntact0ne.csv",
      "orders.csv",
      "submissions.csv",
      "subscribers.csv",
    ]);
    const subs = strFromU8(files["submissions.csv"] as Uint8Array);
    expect(subs).toContain("Ana Ruiz");
    expect(subs).toContain(`"'=HYPERLINK(""http://x"")"`); // CSV injection neutralised
    expect(strFromU8(files["subscribers.csv"] as Uint8Array)).toContain("sub@example.com,,pending");
    const audit = (await (
      await call(f.app, `/api/sites/${f.siteId}/audit`, { cookie: f.cookie })
    ).json()) as { entries: Array<{ action: string; actorLogin: string }> };
    expect(audit.entries[0]).toMatchObject({ action: "data.export", actorLogin: "maya-lin" });
  });

  it("deletes site data with a typed confirmation and erases one person", async () => {
    const f = await siteWithForm(makePublicApp());
    await postForm(f, VALID, { json: true });
    await postForm(f, { ...VALID, email: "other@example.com" }, { json: true });
    await call(f.app, `/n/${f.siteId}/subscribe`, {
      method: "POST",
      headers: { Accept: "application/json" },
      json: { email: "ANA@example.com" },
    });
    const erase = await call(f.app, `/api/sites/${f.siteId}/data/erase`, {
      method: "POST",
      cookie: f.cookie,
      json: { email: "ana@example.com" },
    });
    expect(((await erase.json()) as { deleted: unknown }).deleted).toEqual({
      subscribers: 1,
      submissions: 1,
      members: 0,
      emails: 1, // the confirmation email sent to them (dev outbox)
    });
    const wrong = await call(f.app, `/api/sites/${f.siteId}/data/delete`, {
      method: "POST",
      cookie: f.cookie,
      json: { confirmName: "nope", scopes: ["all"] },
    });
    expect(wrong.status).toBe(400);
    const del = await call(f.app, `/api/sites/${f.siteId}/data/delete`, {
      method: "POST",
      cookie: f.cookie,
      json: { confirmName: "Maya Yoga", scopes: ["submissions"] },
    });
    expect(((await del.json()) as { deleted: { submissions: number } }).deleted.submissions).toBe(
      1,
    );
  });

  it("limits export, deletion and the audit log to the owner", async () => {
    const f = await siteWithForm(makePublicApp());
    const other = await devLogin(f.app, "Dee Signer");
    const user = await env.HUB_DB.prepare("SELECT id FROM users WHERE login = 'dee-signer'").first<{
      id: string;
    }>();
    await env.HUB_DB.prepare(
      "INSERT INTO site_roles (site_id, user_id, role, created_at) VALUES (?, ?, 'designer', 0)",
    )
      .bind(f.siteId, user?.id)
      .run();
    expect((await call(f.app, `/api/sites/${f.siteId}/export`, { cookie: other })).status).toBe(
      403,
    );
    expect((await call(f.app, `/api/sites/${f.siteId}/audit`, { cookie: other })).status).toBe(403);
    expect(
      (await call(f.app, `/api/sites/${f.siteId}/submissions`, { cookie: other })).status,
    ).toBe(200);
  });
});

describe("quotas", () => {
  it("merges defaults, Hub overrides and per-site plan flags", () => {
    expect(quotaLimits(undefined, null).formSubmissions).toBe(1000);
    expect(quotaLimits('{"formSubmissions":5000}', null).formSubmissions).toBe(5000);
    expect(
      quotaLimits('{"formSubmissions":5000}', '{"quotas":{"formSubmissions":7}}').formSubmissions,
    ).toBe(7);
    expect(quotaLimits("not json", '{"quotas":{"subscribers":-1}}').subscribers).toBe(5000);
  });

  it("consumes atomically and reports usage", async () => {
    const now = Date.parse("2026-10-26T12:00:00Z");
    expect(await consumeQuota(env.HUB_DB, "st_quota0001", "mcpOperations", 2, now)).toBe(1);
    expect(await consumeQuota(env.HUB_DB, "st_quota0001", "mcpOperations", 2, now)).toBe(2);
    expect(await consumeQuota(env.HUB_DB, "st_quota0001", "mcpOperations", 2, now)).toBeNull();
    // A new day resets the daily counter.
    expect(
      await consumeQuota(env.HUB_DB, "st_quota0001", "mcpOperations", 2, now + 86_400_000),
    ).toBe(1);
    const f = await siteWithForm(makePublicApp());
    await setQuota(f.siteId, { formSubmissions: 3 });
    await postForm(f, VALID, { json: true });
    const report = (await (
      await call(f.app, `/api/sites/${f.siteId}/quotas`, { cookie: f.cookie })
    ).json()) as { quotas: Array<{ resource: string; used: number; limit: number }> };
    expect(report.quotas.find((q) => q.resource === "formSubmissions")).toMatchObject({
      used: 1,
      limit: 3,
    });
    expect(report.quotas.map((q) => q.resource)).toEqual(
      expect.arrayContaining([
        "transactionalEmails",
        "subscribers",
        "analyticsPageviews",
        "mcpOperations",
        "uploadBytes",
      ]),
    );
  });
});

describe("retention purge and scheduled handler", () => {
  it("purges expired entries, stale signups, old salts and archived sites", async () => {
    const f = await siteWithForm(makePublicApp());
    await postForm(f, VALID, { json: true });
    const old = Date.now() - 400 * 86_400_000;
    await env.HUB_DB.prepare("UPDATE submissions SET purge_at = ? WHERE site_id = ?")
      .bind(old, f.siteId)
      .run();
    await env.HUB_DB.prepare(
      "INSERT INTO analytics_salts (day, salt) VALUES ('2020-01-01', 'x')",
    ).run();
    await env.HUB_DB.prepare(
      "INSERT INTO subscribers (id, site_id, email, status, created_at, confirm_expires_at) VALUES ('sub_stale', ?, 'old@example.com', 'pending', 0, ?)",
    )
      .bind(f.siteId, old)
      .run();
    const g = await siteWithForm(makePublicApp(), { name: "Gone Site" });
    await postForm(g, VALID, { json: true });
    await env.HUB_DB.prepare("UPDATE sites SET archived_at = ?, purge_at = ? WHERE id = ?")
      .bind(old, old, g.siteId)
      .run();

    const ctx = createExecutionContext();
    await worker.scheduled(
      { cron: "0 3 * * *", scheduledTime: Date.now(), noRetry() {} } as ScheduledController,
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    const n = async (sql: string, ...args: unknown[]) =>
      (
        await env.HUB_DB.prepare(sql)
          .bind(...args)
          .first<{ n: number }>()
      )?.n;
    expect(await n("SELECT COUNT(*) AS n FROM submissions WHERE site_id = ?", f.siteId)).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM subscribers WHERE id = 'sub_stale'")).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM analytics_salts WHERE day = '2020-01-01'")).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM sites WHERE id = ?", g.siteId)).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM submissions WHERE site_id = ?", g.siteId)).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM sites WHERE id = ?", f.siteId)).toBe(1);
    // Other crons (e.g. Task 15's every-minute publish scheduler) are not handled here.
    const ctx2 = createExecutionContext();
    await worker.scheduled(
      { cron: "* * * * *", scheduledTime: Date.now(), noRetry() {} } as ScheduledController,
      env,
      ctx2,
    );
    await waitOnExecutionContext(ctx2);
  });
});

describe("RateLimiter Durable Object", () => {
  // Exercised against an in-memory storage: the Workers test pool's isolated storage can't
  // snapshot SQLite-backed Durable Objects between tests.
  function fakeStorage() {
    const map = new Map<string, unknown>();
    let alarm: number | null = null;
    const storage = {
      get: async (k: string) => map.get(k),
      put: async (k: string, v: unknown) => void map.set(k, v),
      setAlarm: async (t: number) => {
        alarm = t;
      },
    } as LimiterStorage;
    return { storage, map, alarm: () => alarm };
  }

  it("allows `limit` hits per window, then resets", async () => {
    const { storage, map, alarm } = fakeStorage();
    const t0 = 1_000_000;
    const hit = (t: number) => hitWindow(storage, "form", 2, 60, t);
    expect(await hit(t0)).toEqual({ ok: true, remaining: 1, retryAfter: 0 });
    expect((await hit(t0 + 1000)).remaining).toBe(0);
    expect(await hit(t0 + 2000)).toEqual({ ok: false, remaining: 0, retryAfter: 58 });
    expect(alarm()).toBe(t0 + 120_000);
    expect((await hit(t0 + 61_000)).ok).toBe(true);
    expect(map.size).toBe(1);
  });

  it("is reached through the namespace by key", async () => {
    const calls: unknown[] = [];
    const ns = {
      idFromName: (n: string) => n,
      get: (id: string) => ({
        hit: async (...args: unknown[]) => {
          calls.push([id, ...args]);
          return { ok: true, remaining: 1, retryAfter: 0 };
        },
      }),
    } as unknown as DurableObjectNamespace;
    await new DurableRateLimiter(ns, () => 5).hit("st_x|ip", {
      name: "form",
      limit: 10,
      windowSec: 600,
    });
    expect(calls).toEqual([["st_x|ip", "form", 10, 600, 5]]);
  });
});

describe("csv", () => {
  it("round-trips quoted cells", () => {
    const text = toCsv(
      ["a", "b"],
      [
        ["x,y", 'say "hi"'],
        ["line\nbreak", ""],
      ],
    );
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["x,y", 'say "hi"'],
      ["line\nbreak", ""],
    ]);
  });
});
