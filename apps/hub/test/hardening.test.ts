import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readConfig } from "../src/env";
import { rateKeyIp, readBodyLimited, returnUrl } from "../src/lib/public";
import { readPublicConfig, requireHmacKey } from "../src/public-env";
import { RATE_RULES } from "../src/services/rate-limit";
import { CloudflareTurnstile } from "../src/services/turnstile";
import { call } from "./helpers";
import { mockFetch } from "./mock-fetch";
import {
  CONTACT_FORM,
  makePublicApp,
  outbox,
  postForm,
  setQuota,
  setSettings,
  siteWithForm,
  VALID,
} from "./public-helpers";

afterEach(() => vi.restoreAllMocks());

describe("open redirects", () => {
  const allowed = ["https://mayayoga.example", "https://www.mayayoga.example"];
  const back = (base: string, source: string | null, referer: string | null = null) =>
    returnUrl(base, allowed, source, referer, "os_form", "success");

  it("never leaves the site, whatever _source contains (empty base path)", () => {
    const base = "https://mayayoga.example/";
    for (const evil of [
      "/\t/evil.com",
      "/\n/evil.com",
      "/\r\n/evil.com/x",
      "//evil.com",
      "/\\evil.com",
      "\\/evil.com",
      " //evil.com",
      "/%09/evil.com",
      "https://evil.com/",
      "javascript:alert(1)",
      "http://mayayoga.example@evil.com/",
    ]) {
      expect(new URL(back(base, evil, "https://evil.com/")).origin, JSON.stringify(evil)).toBe(
        "https://mayayoga.example",
      );
    }
    expect(back(base, "/about")).toBe("https://mayayoga.example/about?os_form=success");
    expect(back(base, "https://www.mayayoga.example/x")).toBe(
      "https://www.mayayoga.example/x?os_form=success",
    );
  });

  it("keeps project-site base paths and refuses tab tricks there too", () => {
    const base = "https://maya.github.io/maya-yoga/";
    expect(back(base, "/about")).toBe("https://maya.github.io/maya-yoga/about?os_form=success");
    expect(new URL(back(base, "/\t/evil.com")).origin).toBe("https://maya.github.io");
  });

  it("applies to live no-JS posts on a custom-domain site", async () => {
    const f = await siteWithForm(makePublicApp());
    await env.HUB_DB.prepare("UPDATE sites SET url = 'https://mayayoga.example/' WHERE id = ?")
      .bind(f.siteId)
      .run();
    const res = await postForm(f, { ...VALID, _source: "/\t/evil.com" });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location") ?? "").origin).toBe("https://mayayoga.example");
  });
});

describe("no-JS rejections redirect with ?os_form=error", () => {
  it("covers quota, origin and unreadable bodies", async () => {
    const f = await siteWithForm(makePublicApp());
    const source = { _source: "/contact", _anchor: "blk_f0rmb10ck0-sent" };
    const evil = await postForm(
      f,
      { ...VALID, ...source },
      { headers: { Origin: "https://evil.example" } },
    );
    expect(evil.status).toBe(303);
    expect(evil.headers.get("location")).toContain("os_form=error");
    await setQuota(f.siteId, { formSubmissions: 0 });
    const over = await postForm(f, { ...VALID, ...source });
    expect(over.status).toBe(303);
    expect(over.headers.get("location")).toBe(
      `http://localhost:8787/s/${f.siteId}/contact?os_form=error#blk_f0rmb10ck0-sent`,
    );
    const odd = await call(f.app, `/f/${f.siteId}/${CONTACT_FORM.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
        Referer: `http://localhost:8787/s/${f.siteId}/`,
      },
      body: "<x/>",
      redirect: "manual",
    });
    expect(odd.status).toBe(303);
    expect(odd.headers.get("location")).toContain("os_form=error");
    // JS clients still get JSON.
    const json = await postForm(f, VALID, { json: true });
    expect(json.status).toBe(429);
  });
});

describe("body size", () => {
  it("rejects bodies over 256 KB while streaming, without trusting Content-Length", async () => {
    const chunk = new Uint8Array(64 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        sent++;
        if (sent > 10) ctrl.close();
        else ctrl.enqueue(chunk);
      },
    });
    const req = new Request("http://x/", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(req.headers.get("content-length")).toBeNull();
    await expect(readBodyLimited(req)).rejects.toMatchObject({ status: 413 });
    expect(sent).toBeLessThan(10);
    const small = new Request("http://x/", { method: "POST", body: "a=1" });
    expect(new TextDecoder().decode(await readBodyLimited(small))).toBe("a=1");
  });
});

describe("rate-limit identity", () => {
  it("groups IPv6 by /64 and keeps IPv4 as is", () => {
    expect(rateKeyIp("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(rateKeyIp("2001:db8:1:2:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2::/64");
    expect(rateKeyIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateKeyIp("::1")).toBe("0:0:0:0::/64");
    expect(rateKeyIp("203.0.113.9")).toBe("203.0.113.9");
  });

  it("limits a whole IPv6 /64 together, and every site has a ceiling", async () => {
    const f = await siteWithForm(makePublicApp());
    for (let i = 1; i <= 10; i++)
      expect(
        (
          await postForm(f, VALID, {
            json: true,
            headers: { "cf-connecting-ip": `2001:db8:5:6::${i}` },
          })
        ).status,
      ).toBe(200);
    const rotated = await postForm(f, VALID, {
      json: true,
      headers: { "cf-connecting-ip": "2001:db8:5:6:dead::beef" },
    });
    expect(rotated.status).toBe(429);

    const g = await siteWithForm(makePublicApp(), { name: "Ceiling" });
    const before = RATE_RULES.formSite.limit;
    RATE_RULES.formSite.limit = 3;
    try {
      for (let i = 1; i <= 3; i++)
        expect(
          (
            await postForm(g, VALID, {
              json: true,
              headers: { "cf-connecting-ip": `198.51.100.${i}` },
            })
          ).status,
        ).toBe(200);
      const res = await postForm(g, VALID, {
        json: true,
        headers: { "cf-connecting-ip": "198.51.100.99" },
      });
      expect(res.status).toBe(429);
      expect(((await res.json()) as { message: string }).message).toContain(
        "This site is receiving too many",
      );
    } finally {
      RATE_RULES.formSite.limit = before;
    }
  });
});

describe("Turnstile hostname", () => {
  it("refuses tokens solved on another site", async () => {
    let hostname = "evil.example";
    const mock = mockFetch([
      [
        "POST",
        /challenges\.cloudflare\.com/,
        () => ({ success: true, hostname, "error-codes": [] }),
      ],
    ]);
    const ts = new CloudflareTurnstile(["0x4", "secret"].join(""), mock.fetch);
    expect(await ts.verify("t", null, ["mayayoga.example"])).toEqual({
      ok: false,
      codes: ["hostname-mismatch"],
    });
    hostname = "mayayoga.example";
    expect((await ts.verify("t", null, ["mayayoga.example"])).ok).toBe(true);
    // Wired into the form endpoint with the site's hosts (dev: the Hub's host).
    const app = makePublicApp({ public: { turnstile: ts } });
    const f = await siteWithForm(app);
    hostname = "evil.example";
    expect(
      (await postForm(f, { ...VALID, "cf-turnstile-response": "t" }, { json: true })).status,
    ).toBe(403);
    hostname = "localhost";
    expect(
      (await postForm(f, { ...VALID, "cf-turnstile-response": "t" }, { json: true })).status,
    ).toBe(200);
  });
});

describe("production configuration", () => {
  it("never signs with the public dev HMAC key outside DEV_MODE", () => {
    const prod = readConfig({ ...env, DEV_MODE: "false", HUB_URL: "https://hub.example" } as never);
    const pc = readPublicConfig({}, prod);
    expect(pc.hmacKey).toBeNull();
    expect(() => requireHmacKey(pc)).toThrow(
      expect.objectContaining({ status: 503, code: "not_configured" }),
    );
    expect(readPublicConfig({ HUB_SECRET: "s3cret" }, prod).hmacKey).toBe("s3cret");
    expect(readPublicConfig({}, readConfig(env as never)).hmacKey).toBe("openspace-dev-hmac-key");
  });

  it("refuses public posts without a secret, and warns once when Turnstile isn't configured", async () => {
    const f = await siteWithForm(makePublicApp());
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const prodEnv = { ...(env as object), DEV_MODE: "false", LOG_LEVEL: "warn" };
    const send = (bindings: Record<string, unknown>) =>
      call(
        f.app,
        `/f/${f.siteId}/${CONTACT_FORM.id}`,
        { method: "POST", headers: { Accept: "application/json" }, json: VALID },
        bindings,
      );
    const refused = await send(prodEnv);
    expect(refused.status).toBe(503);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
      "not_configured",
    );
    expect(warn.mock.calls.some((c) => String(c[0]).includes("TURNSTILE_SECRET is not set"))).toBe(
      true,
    );
    const ok = await send({ ...prodEnv, HUB_SECRET: "a-long-random-secret" });
    expect(ok.status).toBe(200);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("TURNSTILE_SECRET")).length).toBe(1);
  });
});

describe("notification retries and claims", () => {
  it("retries instant notifications that failed in the next daily run", async () => {
    const f = await siteWithForm(makePublicApp());
    await setSettings(f, { notifyEmail: "maya@example.com" });
    await setQuota(f.siteId, { transactionalEmails: 0 });
    expect((await postForm(f, VALID, { json: true })).status).toBe(200);
    expect(await outbox(f.app, "?kind=form-notification")).toHaveLength(0);
    await setQuota(f.siteId, { transactionalEmails: 10 });
    const { runPublicServicesCron } = await import("../src/cron/public-services");
    // Too recent: left to the in-flight instant email.
    expect((await runPublicServicesCron("0 3 * * *", env as never)).formDigests).toEqual({
      sent: 0,
      failed: 0,
    });
    const later = { now: () => Date.now() + 11 * 60_000 };
    expect((await runPublicServicesCron("0 3 * * *", env as never, later)).formDigests).toEqual({
      sent: 1,
      failed: 0,
    });
    expect(await outbox(f.app, "?kind=form-digest")).toHaveLength(1);
  });

  it("counts and logs failed digests with the site id and error kind", async () => {
    const f = await siteWithForm(makePublicApp());
    await setSettings(f, { notifyEmail: "maya@example.com", notifications: "daily" });
    await postForm(f, VALID, { json: true });
    await setQuota(f.siteId, { transactionalEmails: 0 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { runPublicServicesCron } = await import("../src/cron/public-services");
    const out = await runPublicServicesCron("0 3 * * *", {
      ...(env as object),
      LOG_LEVEL: "warn",
    } as never);
    expect(out.formDigests).toEqual({ sent: 0, failed: 1 });
    const line = warn.mock.calls
      .map((c) => String(c[0]))
      .find((l) => l.includes("form digest failed"));
    expect(JSON.parse(line ?? "{}")).toMatchObject({ siteId: f.siteId, kind: "quota_exceeded" });
  });

  it("releases unverified domain claims after 7 days", async () => {
    const mock = mockFetch([["GET", /rdap\.org/, () => new Response("", { status: 404 })]]);
    const app = makePublicApp({ fetch: mock.fetch });
    const a = await siteWithForm(app, { form: null, name: "Squatter" });
    const b = await siteWithForm(app, { form: null, name: "Real Owner" });
    await call(app, `/api/sites/${a.siteId}/domain`, {
      method: "POST",
      cookie: a.cookie,
      json: { domain: "squat.test" },
    });
    expect(
      (
        await call(app, `/api/sites/${b.siteId}/domain`, {
          method: "POST",
          cookie: b.cookie,
          json: { domain: "squat.test" },
        })
      ).status,
    ).toBe(409);
    await env.HUB_DB.prepare("UPDATE domains SET created_at = ? WHERE hostname = 'squat.test'")
      .bind(Date.now() - 8 * 86_400_000)
      .run();
    // Taking over a stale claim works directly…
    expect(
      (
        await call(app, `/api/sites/${b.siteId}/domain`, {
          method: "POST",
          cookie: b.cookie,
          json: { domain: "squat.test" },
        })
      ).status,
    ).toBe(201);
    const squatter = await env.HUB_DB.prepare("SELECT domain FROM sites WHERE id = ?")
      .bind(a.siteId)
      .first<{ domain: string | null }>();
    expect(squatter?.domain).toBeNull();
    // …and the daily cron releases the rest.
    await env.HUB_DB.prepare("UPDATE domains SET created_at = ? WHERE hostname = 'squat.test'")
      .bind(Date.now() - 8 * 86_400_000)
      .run();
    const { runPublicServicesCron } = await import("../src/cron/public-services");
    const out = (await runPublicServicesCron("0 3 * * *", env as never)) as {
      purged: { expiredDomainClaims: number };
    };
    expect(out.purged.expiredDomainClaims).toBe(1);
  });
});

describe("dev outbox on a public https Hub", () => {
  it("requires a signed-in session when ALLOW_DEV_MODE runs DEV_MODE on https", async () => {
    const app = makePublicApp();
    const bindings = {
      ...(env as object),
      HUB_URL: "https://demo.example",
      ALLOW_DEV_MODE: "true",
    };
    expect((await call(app, "/dev/outbox.json", {}, bindings)).status).toBe(401);
    const login = await call(
      app,
      "/auth/dev/login",
      { method: "POST", json: { name: "Demo" } },
      bindings,
    );
    const cookie = (login.headers.getSetCookie()[0] ?? "").split(";")[0] ?? "";
    expect((await call(app, "/dev/outbox.json", { cookie }, bindings)).status).toBe(200);
  });
});

describe("Task 15 invitation emails", () => {
  it("go through the Hub EmailSender and count against the email quota", async () => {
    const f = await siteWithForm(makePublicApp(), { form: null });
    const res = await call(f.app, `/api/sites/${f.siteId}/collaborators`, {
      method: "POST",
      cookie: f.cookie,
      json: { email: "helper@example.com", role: "editor" },
    });
    expect(res.status).toBeLessThan(300);
    const [mail] = await outbox(f.app, "?kind=invitation");
    expect(mail).toMatchObject({ to: "helper@example.com", siteId: f.siteId });
    expect(mail?.links.some((l) => l.includes("/invite/"))).toBe(true);
    const quotas = (await (
      await call(f.app, `/api/sites/${f.siteId}/quotas`, { cookie: f.cookie })
    ).json()) as { quotas: Array<{ resource: string; used: number }> };
    expect(quotas.quotas.find((q) => q.resource === "transactionalEmails")?.used).toBe(1);
  });
});
