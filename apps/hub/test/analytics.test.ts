import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  AnalyticsEngineStore,
  cleanPath,
  referrerHost,
  stripBasePath,
} from "../src/services/analytics";
import { call } from "./helpers";
import { mockFetch } from "./mock-fetch";
import {
  makePublicApp,
  postForm,
  setQuota,
  setSettings,
  siteWithForm,
  VALID,
} from "./public-helpers";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15";
const DAY = 86_400_000;

function clock(start: number) {
  const c = { t: start, now: () => c.t };
  return c;
}

const beacon = (
  app: ReturnType<typeof makePublicApp>,
  siteId: string,
  body: Record<string, unknown>,
  ip = "192.0.2.10",
  ua = UA,
) =>
  call(app, `/a/${siteId}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "User-Agent": ua,
      "cf-connecting-ip": ip,
    },
    body: JSON.stringify(body),
  });

describe("analytics beacon", () => {
  it("records pageviews with a daily-rotating visitor hash and never the raw IP", async () => {
    const c = clock(Date.parse("2026-10-20T10:00:00Z"));
    const app = makePublicApp({ now: c.now });
    const f = await siteWithForm(app);
    expect(
      (
        await beacon(app, f.siteId, {
          p: "/about?x=1",
          r: "https://news.example/item",
          s: "m",
          u: { source: "Newsletter" },
        })
      ).status,
    ).toBe(204);
    await beacon(app, f.siteId, { p: "/", r: `http://localhost:8787/s/${f.siteId}/`, s: "d" });
    c.t += DAY;
    await beacon(app, f.siteId, { p: "/" });
    const rows = (
      await env.HUB_DB.prepare("SELECT * FROM analytics_events WHERE site_id = ? ORDER BY at")
        .bind(f.siteId)
        .all<Record<string, unknown>>()
    ).results;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      path: "/about",
      referrer: "news.example",
      device: "mobile",
      utm_source: "newsletter",
      kind: "pageview",
      weight: 1,
    });
    expect(rows[1]).toMatchObject({ referrer: null, device: "desktop" });
    expect(rows[0]?.visitor).toBe(rows[1]?.visitor);
    expect(rows[2]?.visitor).not.toBe(rows[0]?.visitor); // new day, new salt
    expect(String(rows[0]?.visitor)).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(rows)).not.toContain("192.0.2.10");
  });

  it("drops bots, respects the analytics setting and rejects foreign origins", async () => {
    const f = await siteWithForm(makePublicApp());
    expect((await beacon(f.app, f.siteId, { p: "/" }, "192.0.2.1", "Googlebot/2.1")).status).toBe(
      204,
    );
    await setSettings(f, { analyticsEnabled: false });
    expect((await beacon(f.app, f.siteId, { p: "/" })).status).toBe(204);
    const n = await env.HUB_DB.prepare(
      "SELECT COUNT(*) AS n FROM analytics_events WHERE site_id = ?",
    )
      .bind(f.siteId)
      .first<{ n: number }>();
    expect(n?.n).toBe(0);
    const evil = await call(f.app, `/a/${f.siteId}`, {
      method: "POST",
      headers: { Origin: "https://evil.example", "User-Agent": UA },
      body: "{}",
    });
    expect(evil.status).toBe(403);
    expect((await beacon(f.app, "st_zzzzzzzzzz", { p: "/" })).status).toBe(404);
  });

  it("samples pageviews above the monthly quota", async () => {
    const f = await siteWithForm(makePublicApp());
    await setQuota(f.siteId, { analyticsPageviews: 2 });
    for (let i = 0; i < 40; i++) await beacon(f.app, f.siteId, { p: "/" }, `192.0.2.${i}`);
    const rows = (
      await env.HUB_DB.prepare("SELECT weight FROM analytics_events WHERE site_id = ?")
        .bind(f.siteId)
        .all<{ weight: number }>()
    ).results;
    expect(rows.filter((r) => r.weight === 1)).toHaveLength(2);
    expect(rows.filter((r) => r.weight !== 1).every((r) => r.weight === 10)).toBe(true);
    expect(rows.length).toBeLessThan(40);
    const report = (await (
      await call(f.app, `/api/sites/${f.siteId}/analytics?range=day`, { cookie: f.cookie })
    ).json()) as { sampled: boolean };
    expect(report.sampled).toBe(true);
  });
});

describe("analytics query API", () => {
  it("reports visits, uniques, top pages, referrers, devices and form conversions", async () => {
    const c = clock(Date.parse("2026-10-20T10:00:00Z"));
    const app = makePublicApp({ now: c.now });
    const f = await siteWithForm(app);
    await beacon(app, f.siteId, { p: "/", r: "https://search.example/", s: "d" }, "192.0.2.1");
    await beacon(app, f.siteId, { p: "/about", s: "d" }, "192.0.2.1");
    await beacon(app, f.siteId, { p: "/", s: "m" }, "192.0.2.2");
    await beacon(app, f.siteId, { p: "/", e: "cta_click" }, "192.0.2.2");
    await postForm(f, VALID, { json: true });
    c.t += 2 * DAY;
    await beacon(app, f.siteId, { p: "/", s: "t" }, "192.0.2.1");

    const week = (await (
      await call(app, `/api/sites/${f.siteId}/analytics?range=week`, { cookie: f.cookie })
    ).json()) as {
      totals: { pageviews: number; visits: number; uniques: number };
      series: Array<{ date: string; pageviews: number; visits: number }>;
      topPages: Array<{ key: string; pageviews: number }>;
      referrers: Array<{ key: string; pageviews: number }>;
      devices: Array<{ key: string; pageviews: number }>;
      events: Array<{ key: string; pageviews: number }>;
      forms: Array<{ formId: string; name: string; submissions: number; conversionRate: number }>;
      range: { name: string };
      store: string;
    };
    expect(week.totals).toEqual({ pageviews: 4, visits: 3, uniques: 3 });
    expect(week.series).toHaveLength(8);
    expect(week.series.find((d) => d.date === "2026-10-20")).toEqual({
      date: "2026-10-20",
      pageviews: 3,
      visits: 2,
    });
    expect(week.topPages[0]).toMatchObject({ key: "/", pageviews: 3 });
    expect(week.referrers).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "search.example", pageviews: 1 })]),
    );
    expect(week.devices.map((d) => d.key).sort()).toEqual(["desktop", "mobile", "tablet"]);
    expect(week.events[0]).toMatchObject({ key: "cta_click", pageviews: 1 });
    expect(week.forms).toEqual([
      { formId: "frm_c0ntact0ne", name: "Contact", submissions: 1, conversionRate: 0.3333 },
    ]);
    expect(week.store).toBe("d1");

    const day = (await (
      await call(app, `/api/sites/${f.siteId}/analytics?range=day`, { cookie: f.cookie })
    ).json()) as { totals: { pageviews: number } };
    expect(day.totals.pageviews).toBe(1);
    const custom = (await (
      await call(app, `/api/sites/${f.siteId}/analytics?from=2026-10-20&to=2026-10-20`, {
        cookie: f.cookie,
      })
    ).json()) as { totals: { pageviews: number }; range: { name: string } };
    expect(custom).toMatchObject({ totals: { pageviews: 3 }, range: { name: "custom" } });
    expect(
      (await call(app, `/api/sites/${f.siteId}/analytics?range=year`, { cookie: f.cookie })).status,
    ).toBe(400);
  });

  it("queries Analytics Engine through the SQL API", async () => {
    const mock = mockFetch([
      [
        "POST",
        /analytics_engine\/sql/,
        (callInfo) => {
          const sql = String(callInfo.body);
          if (sql.includes("COUNT(DISTINCT blob6) AS uniques"))
            return { data: [{ pageviews: 12, uniques: 5 }] };
          if (sql.includes("toStartOfInterval"))
            return { data: [{ d: "2026-10-20 00:00:00", pageviews: 12, visits: 5 }] };
          return { data: [{ key: "", pageviews: 12, visitors: 5 }] };
        },
      ],
    ]);
    const writes: unknown[] = [];
    const store = new AnalyticsEngineStore(
      { writeDataPoint: (p: unknown) => writes.push(p) } as unknown as AnalyticsEngineDataset,
      { accountId: "acct", token: "tok", dataset: "openspace_analytics" },
      mock.fetch,
    );
    await store.write({
      siteId: "st_abcdefghjk",
      kind: "pageview",
      path: "/",
      referrer: null,
      device: "mobile",
      country: "NZ",
      visitor: "abc",
      utmSource: null,
      name: null,
      weight: 1,
      at: 0,
    });
    expect(writes[0]).toEqual({
      indexes: ["st_abcdefghjk"],
      blobs: ["pageview", "/", "", "mobile", "NZ", "abc", "", ""],
      doubles: [1],
    });
    const from = Date.parse("2026-10-20T00:00:00Z");
    const r = await store.query("st_abcdefghjk", from, from + DAY);
    expect(r.totals).toEqual({ pageviews: 12, visits: 5, uniques: 5 });
    expect(r.topPages[0]).toEqual({ key: "/", pageviews: 12, visitors: 5 });
    expect(r.referrers[0]?.key).toBe("Direct");
    expect(String(mock.calls[0]?.body)).toContain("index1 = 'st_abcdefghjk'");
    expect(mock.calls[0]?.headers.get("authorization")).toBe("Bearer tok");
    await expect(store.query("st_x' OR 1=1 --", from, from + DAY)).rejects.toThrow();
  });

  it("strips a GitHub Pages project base path from page paths", () => {
    const url = "https://maya.github.io/maya-yoga/";
    expect(stripBasePath("/maya-yoga/join/", url)).toBe("/join/");
    expect(stripBasePath("/maya-yoga", url)).toBe("/");
    expect(stripBasePath("/maya-yoga/", url)).toBe("/");
    expect(stripBasePath("/maya-yogaextra/", url)).toBe("/maya-yogaextra/");
    expect(stripBasePath("/join/", "https://mayayoga.com/")).toBe("/join/");
  });

  it("never reports a form conversion over 100% and reports paths without the base path", async () => {
    const c = clock(Date.parse("2026-10-20T10:00:00Z"));
    const app = makePublicApp({ now: c.now });
    const f = await siteWithForm(app);
    await env.HUB_DB.prepare("UPDATE sites SET url = ? WHERE id = ?")
      .bind("https://maya.github.io/maya-yoga/", f.siteId)
      .run();
    await beacon(app, f.siteId, { p: "/maya-yoga/join/", s: "d" }, "192.0.2.1");
    // An older hit stored with the base path still reports as the same page.
    await env.HUB_DB.prepare(
      "INSERT INTO analytics_events (site_id, kind, path, referrer, country, device, name, props, at, visitor, weight) SELECT site_id, kind, '/maya-yoga/join/', referrer, country, device, name, props, at, 'v2', weight FROM analytics_events WHERE site_id = ? LIMIT 1",
    )
      .bind(f.siteId)
      .run()
      .catch(() => undefined);
    await postForm(f, VALID, { json: true });
    await postForm(f, { ...VALID, email: "second@example.com" }, { json: true });
    const week = (await (
      await call(app, `/api/sites/${f.siteId}/analytics?range=week`, { cookie: f.cookie })
    ).json()) as {
      topPages: Array<{ key: string }>;
      forms: Array<{ conversionRate: number }>;
    };
    expect(week.topPages.map((p) => p.key)).toEqual(["/join/"]);
    expect(week.forms[0]?.conversionRate).toBeLessThanOrEqual(1);
  });

  it("cleans paths and referrers", () => {
    expect(cleanPath("about#team")).toBe("/about");
    expect(cleanPath(42)).toBe("/");
    expect(referrerHost("https://www.maya.example/x", ["maya.example"])).toBeNull();
    expect(referrerHost("javascript:alert(1)", [])).toBeNull();
  });

  it("sends the weekly digest to owners who opted in", async () => {
    const f = await siteWithForm(makePublicApp());
    await setSettings(f, { weeklyDigest: true, notifyEmail: "maya@example.com" });
    await beacon(f.app, f.siteId, { p: "/" });
    const { runPublicServicesCron } = await import("../src/cron/public-services");
    const out = await runPublicServicesCron("0 8 * * 1", env as never);
    expect(out.weeklyDigests).toEqual({ sent: 1, failed: 0 });
    const res = await call(f.app, "/dev/outbox.json?kind=analytics-digest");
    const { messages } = (await res.json()) as { messages: Array<{ subject: string; to: string }> };
    expect(messages[0]).toMatchObject({
      to: "maya@example.com",
      subject: "Your week on Maya Yoga: 1 visit",
    });
  });
});
