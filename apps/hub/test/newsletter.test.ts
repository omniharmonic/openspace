import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { createApp } from "../src/app";
import {
  listUnsubscribeHeaders,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from "../src/services/newsletter";
import { call } from "./helpers";
import { makePublicApp, outbox, setQuota, siteWithForm } from "./public-helpers";

const subscribe = (
  app: ReturnType<typeof createApp>,
  siteId: string,
  body: Record<string, string>,
  json = true,
  headers: Record<string, string> = {},
) =>
  json
    ? call(app, `/n/${siteId}/subscribe`, {
        method: "POST",
        headers: { Accept: "application/json", ...headers },
        json: body,
      })
    : call(app, `/n/${siteId}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
        body: new URLSearchParams(body).toString(),
        redirect: "manual",
      });

const status = async (siteId: string, email: string) =>
  (
    await env.HUB_DB.prepare("SELECT status FROM subscribers WHERE site_id = ? AND email = ?")
      .bind(siteId, email)
      .first<{ status: string }>()
  )?.status ?? null;

describe("newsletter double opt-in", () => {
  it("subscribes, emails a confirmation link, confirms on the page", async () => {
    const f = await siteWithForm(makePublicApp(), { form: null });
    const res = await subscribe(f.app, f.siteId, {
      email: "Ana@Example.com",
      first_name: "Ana",
      source: "/",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      message: "Almost there — check your inbox to confirm your subscription.",
    });
    expect(await status(f.siteId, "ana@example.com")).toBe("pending");
    const [mail] = await outbox(f.app, "?kind=newsletter-confirm");
    expect(mail).toMatchObject({
      to: "ana@example.com",
      subject: "Confirm your subscription to Maya Yoga",
      siteId: f.siteId,
    });
    const link = mail?.links.find((l) => l.includes("/n/confirm/")) as string;
    expect(link).toMatch(/^http:\/\/localhost:8787\/n\/confirm\/[A-Za-z0-9_-]+$/);
    // GET only shows a button: mail scanners that prefetch links don't confirm anyone.
    const page = await call(f.app, new URL(link).pathname);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await page.text()).toContain('<form method="post"');
    expect(await status(f.siteId, "ana@example.com")).toBe("pending");
    const done = await call(f.app, new URL(link).pathname, { method: "POST" });
    expect(done.status).toBe(200);
    expect(await done.text()).toContain("You&#39;re subscribed");
    expect(await status(f.siteId, "ana@example.com")).toBe("confirmed");
    // Single use.
    expect((await call(f.app, new URL(link).pathname, { method: "POST" })).status).toBe(404);
    expect((await call(f.app, new URL(link).pathname)).status).toBe(404);
    // Signing up again while confirmed: same answer, no new email (no list probing).
    const again = await subscribe(f.app, f.siteId, { email: "ana@example.com" });
    expect(((await again.json()) as { message: string }).message).toContain("check your inbox");
    expect(await outbox(f.app, "?kind=newsletter-confirm")).toHaveLength(1);
  });

  it("redirects no-JS signups with os_newsletter=pending and rejects bad emails", async () => {
    const f = await siteWithForm(makePublicApp(), { form: null });
    const res = await subscribe(
      f.app,
      f.siteId,
      { email: "ben@example.com", source: "/journal" },
      false,
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      `http://localhost:8787/s/${f.siteId}/journal?os_newsletter=pending`,
    );
    const bad = await subscribe(f.app, f.siteId, { email: "not-an-email" });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { errors: { email: string } }).errors.email).toBe(
      "Please enter a valid email address.",
    );
    const badHtml = await subscribe(f.app, f.siteId, { email: "nope", source: "/" }, false);
    expect(badHtml.headers.get("location")).toContain("os_newsletter=error");
  });

  it("one-click unsubscribe (RFC 8058) and the confirm-first unsubscribe page", async () => {
    const f = await siteWithForm(makePublicApp(), { form: null });
    await subscribe(f.app, f.siteId, { email: "chloe@example.com" });
    const row = await env.HUB_DB.prepare("SELECT id FROM subscribers WHERE email = ?")
      .bind("chloe@example.com")
      .first<{ id: string }>();
    const key = "openspace-dev-hmac-key";
    const token = await unsubscribeToken(key, row?.id as string);
    expect(await verifyUnsubscribeToken(key, token)).toBe(row?.id);
    expect(await verifyUnsubscribeToken(key, `${row?.id}.forged`)).toBeNull();
    // GET never unsubscribes (link scanners); it shows a button.
    const page = await call(f.app, `/n/unsubscribe/${token}`);
    expect(await page.text()).toContain('<form method="post"');
    expect(await status(f.siteId, "chloe@example.com")).toBe("pending");
    const oneClick = await call(f.app, `/n/unsubscribe/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
    });
    expect(oneClick.status).toBe(200);
    expect(await status(f.siteId, "chloe@example.com")).toBe("unsubscribed");
    expect((await call(f.app, `/n/unsubscribe/${row?.id}.nope`, { method: "POST" })).status).toBe(
      404,
    );
    // Re-subscribing goes through double opt-in again.
    await subscribe(f.app, f.siteId, { email: "chloe@example.com" });
    expect(await status(f.siteId, "chloe@example.com")).toBe("pending");
  });

  it("enforces the subscriber cap, the email quota and the rate limit", async () => {
    const f = await siteWithForm(makePublicApp(), { form: null });
    await setQuota(f.siteId, { subscribers: 1, transactionalEmails: 100 });
    expect((await subscribe(f.app, f.siteId, { email: "one@example.com" })).status).toBe(200);
    // Pending signups don't count towards the cap…
    expect((await subscribe(f.app, f.siteId, { email: "two@example.com" })).status).toBe(200);
    await env.HUB_DB.prepare(
      "UPDATE subscribers SET status = 'confirmed' WHERE email = 'one@example.com'",
    ).run();
    // …confirmed ones do, and confirming past the cap is refused too.
    const [twoMail] = await outbox(f.app, "?kind=newsletter-confirm&to=two@example.com");
    const twoLink = new URL(twoMail?.links.find((l) => l.includes("/n/confirm/")) as string)
      .pathname;
    expect((await call(f.app, twoLink, { method: "POST" })).status).toBe(409);
    const full = await subscribe(f.app, f.siteId, { email: "three@example.com" });
    expect(full.status).toBe(429);
    expect(((await full.json()) as { error: { code: string } }).error.code).toBe("quota_exceeded");

    const g = await siteWithForm(makePublicApp(), { form: null, name: "Mail Limit" });
    await setQuota(g.siteId, { transactionalEmails: 1 });
    expect((await subscribe(g.app, g.siteId, { email: "a@example.com" })).status).toBe(200);
    expect((await subscribe(g.app, g.siteId, { email: "b@example.com" })).status).toBe(429);

    const h = await siteWithForm(makePublicApp(), { form: null, name: "Rate Limit" });
    const ip = { "cf-connecting-ip": "198.51.100.7" };
    for (let i = 0; i < 5; i++)
      expect(
        (await subscribe(h.app, h.siteId, { email: `p${i}@example.com` }, true, ip)).status,
      ).toBe(200);
    expect((await subscribe(h.app, h.siteId, { email: "p9@example.com" }, true, ip)).status).toBe(
      429,
    );
  });

  it("throttles confirmation emails: 1-hour cooldown, per-site and per-address daily caps", async () => {
    const c = { t: Date.parse("2026-10-20T08:00:00Z") };
    const app = makePublicApp({ now: () => c.t });
    const f = await siteWithForm(app, { form: null });
    let n = 0;
    const sub = (siteId: string) =>
      subscribe(app, siteId, { email: "vic@example.com" }, true, {
        "cf-connecting-ip": `192.0.2.${++n}`,
      });
    const count = async (to: string) =>
      (await outbox(app, `?kind=newsletter-confirm&to=${to}`)).length;
    for (let i = 0; i < 3; i++) await sub(f.siteId);
    expect(await count("vic@example.com")).toBe(1);
    c.t += 61 * 60_000;
    await sub(f.siteId);
    expect(await count("vic@example.com")).toBe(2);
    c.t += 61 * 60_000;
    await sub(f.siteId);
    c.t += 61 * 60_000;
    const res = await sub(f.siteId);
    expect(res.status).toBe(200); // same answer…
    expect(await count("vic@example.com")).toBe(3); // …but at most 3 per site per day
    // Across sites: at most 5 confirmation emails per address per day.
    for (const name of ["Two", "Three", "Four"]) {
      const g = await siteWithForm(app, { form: null, name: `Site ${name}` });
      await sub(g.siteId);
    }
    expect(await count("vic@example.com")).toBe(5);
    c.t += 24 * 60 * 60_000;
    await sub(f.siteId);
    expect(await count("vic@example.com")).toBe(6);
  });

  it("ignores honeypot signups", async () => {
    const f = await siteWithForm(makePublicApp(), { form: null });
    const res = await subscribe(f.app, f.siteId, { email: "bot@example.com", _hp: "x" });
    expect(res.status).toBe(200);
    expect(await status(f.siteId, "bot@example.com")).toBeNull();
  });
});

describe("subscribers API", () => {
  it("lists, tags, imports, exports, updates and deletes subscribers", async () => {
    const f = await siteWithForm(makePublicApp(), { form: null });
    await subscribe(f.app, f.siteId, { email: "pending@example.com" });
    const csv =
      "Email,First Name,Tags\nana@example.com,Ana,yoga;retreat\nbad,,\nANA@example.com,,\npending@example.com,,vip\n";
    const noConsent = await call(f.app, `/api/sites/${f.siteId}/subscribers/import`, {
      method: "POST",
      cookie: f.cookie,
      json: { csv },
    });
    expect(noConsent.status).toBe(400);
    const imp = await call(f.app, `/api/sites/${f.siteId}/subscribers/import`, {
      method: "POST",
      cookie: f.cookie,
      json: { csv, consent: true, tags: ["imported"] },
    });
    expect(imp.status).toBe(200);
    const result = (await imp.json()) as {
      added: number;
      updated: number;
      skipped: Array<{ reason: string }>;
    };
    expect(result.added).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.skipped.map((s) => s.reason)).toEqual(["invalid email", "duplicate in file"]);

    const list = (await (
      await call(f.app, `/api/sites/${f.siteId}/subscribers`, { cookie: f.cookie })
    ).json()) as {
      subscribers: Array<{
        id: string;
        email: string;
        status: string;
        tags: string[];
        firstName: string | null;
      }>;
      counts: Record<string, number>;
    };
    expect(list.counts).toEqual({ total: 2, confirmed: 1, pending: 1, unsubscribed: 0 });
    const ana = list.subscribers.find((s) => s.email === "ana@example.com");
    expect(ana).toMatchObject({
      status: "confirmed",
      firstName: "Ana",
      tags: ["imported", "yoga", "retreat"],
    });

    const byTag = (await (
      await call(f.app, `/api/sites/${f.siteId}/subscribers?tag=vip`, { cookie: f.cookie })
    ).json()) as { subscribers: Array<{ email: string }> };
    expect(byTag.subscribers.map((s) => s.email)).toEqual(["pending@example.com"]);

    const tags = await call(f.app, `/api/sites/${f.siteId}/subscribers/tags`, {
      method: "POST",
      cookie: f.cookie,
      json: { ids: [ana?.id], add: ["teachers"], remove: ["retreat"] },
    });
    expect(((await tags.json()) as { changed: number }).changed).toBe(1);

    const exp = await call(f.app, `/api/sites/${f.siteId}/subscribers.csv`, { cookie: f.cookie });
    const text = await exp.text();
    expect(text.split("\r\n")[0]).toBe(
      "email,first_name,status,tags,source,created_at,confirmed_at,unsubscribed_at",
    );
    expect(text).toContain("ana@example.com,Ana,confirmed,imported; yoga; teachers,import");

    const unsub = await call(f.app, `/api/sites/${f.siteId}/subscribers/${ana?.id}`, {
      method: "PATCH",
      cookie: f.cookie,
      json: { status: "unsubscribed" },
    });
    expect(((await unsub.json()) as { subscriber: { status: string } }).subscriber.status).toBe(
      "unsubscribed",
    );
    expect(
      (
        await call(f.app, `/api/sites/${f.siteId}/subscribers/${ana?.id}`, {
          method: "DELETE",
          cookie: f.cookie,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(f.app, `/api/sites/${f.siteId}/subscribers/${ana?.id}`, {
          method: "DELETE",
          cookie: f.cookie,
        })
      ).status,
    ).toBe(404);
  });
});

describe("listUnsubscribeHeaders", () => {
  it("adds one-click on https and the plain link header on an http (dev) Hub", () => {
    expect(listUnsubscribeHeaders("https://hub.example/n/unsubscribe/x")).toEqual({
      "List-Unsubscribe": "<https://hub.example/n/unsubscribe/x>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(listUnsubscribeHeaders("http://localhost:8787/n/unsubscribe/x")).toEqual({
      "List-Unsubscribe": "<http://localhost:8787/n/unsubscribe/x>",
    });
    expect(listUnsubscribeHeaders("http://localhost/a b")).toBeUndefined();
    expect(listUnsubscribeHeaders("javascript:alert(1)")).toBeUndefined();
  });
});
