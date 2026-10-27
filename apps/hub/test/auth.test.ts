import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { bytesToBase64, decryptSecret } from "../src/lib/crypto";
import { devLoginFor, safeReturnTo } from "../src/routes/auth";
import { call, cookieFrom, devLogin, STUDIO } from "./helpers";
import { generateAppKey, pem } from "./keys";
import { mockFetch } from "./mock-fetch";

describe("dev sign-in and sessions", () => {
  it("signs in with a name, sets a 30-day HttpOnly cookie and serves /api/me", async () => {
    const app = createApp();
    const res = await call(app, "/auth/dev/login", { method: "POST", json: { name: "Maya Lin" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      user: { login: "maya-lin", name: "Maya Lin", isDev: true },
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^os_session=[\w-]{43};/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
    expect(setCookie).not.toContain("Secure"); // http://localhost Hub

    const cookie = cookieFrom(res);
    const me = await call(app, "/api/me", { cookie });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { user: { id: string } };
    expect(meBody).toEqual({
      user: expect.objectContaining({ login: "maya-lin", name: "Maya Lin" }),
      auth: { github: false, dev: true },
      devMode: true,
      github: { configured: false, emulated: true },
      // A dev Hub: mail goes to the outbox, DevStripe takes payments, no Turnstile secret.
      capabilities: {
        email: { configured: false, devOutbox: true },
        payments: { configured: true, dev: true },
        turnstile: { configured: false },
        hosting: { githubPages: true, cloudflare: true },
      },
    });

    // Only the hash of the session token is stored.
    const token = cookie.split("=")[1] as string;
    const rows = await env.HUB_DB.prepare("SELECT id_hash FROM sessions").all<{
      id_hash: string;
    }>();
    expect(rows.results.map((r) => r.id_hash)).not.toContain(token);

    // Same name → same account.
    const again = await call(app, "/auth/dev/login", {
      method: "POST",
      json: { name: "maya lin" },
    });
    expect(((await again.json()) as { user: { id: string } }).user.id).toBe(meBody.user.id);
  });

  it("rejects missing sessions, bad bodies and logs out", async () => {
    const app = createApp();
    // Signed out is not an error for /api/me: it still reports the sign-in methods.
    const me = await call(app, "/api/me");
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: null, auth: { github: false, dev: true } });
    const anon = await call(app, "/api/sites");
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({
      error: { code: "unauthenticated", message: "Please sign in." },
    });
    expect((await call(app, "/api/sites", { cookie: "os_session=bogus" })).status).toBe(401);

    const bad = await call(app, "/auth/dev/login", { method: "POST", json: { name: "" } });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("invalid_request");
    const notJson = await call(app, "/auth/dev/login", { method: "POST", body: "{nope" });
    expect(notJson.status).toBe(400);

    const cookie = await devLogin(app);
    const out = await call(app, "/auth/logout", { method: "POST", cookie });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/os_session=;.*Max-Age=0/);
    expect((await call(app, "/api/sites", { cookie })).status).toBe(401);
  });

  it("expires sessions after 30 days and slides active ones", async () => {
    let now = Date.UTC(2026, 9, 1);
    const app = createApp({ services: { now: () => now } });
    const cookie = await devLogin(app);
    now += 2 * 24 * 60 * 60 * 1000; // two days later: renewed
    const renewed = await call(app, "/api/me", { cookie });
    expect(renewed.status).toBe(200);
    expect(renewed.headers.get("set-cookie")).toContain("os_session=");
    now += 31 * 24 * 60 * 60 * 1000;
    expect((await call(app, "/api/sites", { cookie })).status).toBe(401);
  });

  it("disables dev sign-in outside DEV_MODE; /auth/token reports dev mode", async () => {
    const app = createApp();
    const prod = { ...env, DEV_MODE: "false" };
    expect(
      (await call(app, "/auth/dev/login", { method: "POST", json: { name: "x" } }, prod)).status,
    ).toBe(404);
    const cookie = await devLogin(app);
    const tok = await call(app, "/auth/token", { method: "POST", cookie });
    expect(await tok.json()).toEqual({ mode: "dev", token: null, expiresAt: null });
    expect((await call(app, "/auth/token", { method: "POST" })).status).toBe(401);
    const start = await call(app, "/auth/github/start?template=basic&name=Maya");
    expect(start.status).toBe(409);
    expect(((await start.json()) as { error: { code: string } }).error.code).toBe(
      "github_not_configured",
    );
  });

  it("allowlists post-sign-in destinations to Studio", () => {
    const studio = "https://studio.openspace.test";
    expect(safeReturnTo("/sites/st_1?x=1", studio)).toBe(`${studio}/sites/st_1?x=1`);
    expect(safeReturnTo(`${studio}/new/basic`, studio)).toBe(`${studio}/new/basic`);
    for (const bad of [
      "https://evil.example/sites",
      "//evil.example/x",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "https://studio.openspace.test.evil.example/",
      "sites",
      "/x\n",
      undefined,
    ])
      expect(safeReturnTo(bad, studio)).toBeNull();
  });

  it("derives GitHub-shaped logins from names", () => {
    expect(devLoginFor("Maya Lin")).toBe("maya-lin");
    expect(devLoginFor("  Zoë   Ørsted!! ")).toBe("zoe-rsted");
    expect(devLoginFor("!!!")).toBe("dev-user");
    expect(devLoginFor("a".repeat(80))).toHaveLength(39);
  });
});

describe("CORS and origin checks", () => {
  it("allows Studio with credentials and blocks foreign origins on writes", async () => {
    const app = createApp();
    const pre = await call(app, "/api/sites", {
      method: "OPTIONS",
      headers: { Origin: STUDIO, "Access-Control-Request-Method": "POST" },
    });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(STUDIO);
    expect(pre.headers.get("access-control-allow-credentials")).toBe("true");

    const evil = await call(app, "/api/me", { headers: { Origin: "https://evil.example" } });
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
    const forged = await call(app, "/auth/dev/login", {
      method: "POST",
      json: { name: "x" },
      headers: { Origin: "https://evil.example" },
    });
    expect(forged.status).toBe(403);
    // The Hub's own origin serves owner content, so it is not a trusted Studio origin.
    const fromHub = await call(app, "/auth/dev/login", {
      method: "POST",
      json: { name: "x" },
      headers: { Origin: "http://localhost:8787" },
    });
    expect(fromHub.status).toBe(403);
    const ok = await call(app, "/auth/dev/login", {
      method: "POST",
      json: { name: "x" },
      headers: { Origin: STUDIO },
    });
    expect(ok.status).toBe(200);
  });
});

describe("GitHub sign-in (real flow, mocked GitHub)", () => {
  let githubEnv: Record<string, unknown>;
  const encKey = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
  const HOUR = 60 * 60 * 1000;

  beforeAll(async () => {
    const { pkcs8 } = await generateAppKey();
    githubEnv = {
      ...env,
      DEV_MODE: "false",
      HUB_URL: "https://hub.openspace.test",
      STUDIO_ORIGIN: "https://studio.openspace.test",
      GITHUB_APP_ID: "4242",
      GITHUB_APP_PRIVATE_KEY: pem("PRIVATE KEY", pkcs8),
      GITHUB_CLIENT_ID: "Iv1.client",
      GITHUB_CLIENT_SECRET: "client-secret",
      TOKEN_ENC_KEY: encKey,
    };
  });

  /** A fake GitHub OAuth server with real refresh-token rotation semantics. */
  function fakeGitHub(opts: { revoked?: boolean; delayMs?: number } = {}) {
    let current = "ghr_0";
    let n = 0;
    const refreshes: string[] = [];
    const mock = mockFetch([
      [
        "POST",
        /^github\.com\/login\/oauth\/access_token$/,
        (c) => {
          const body = c.body as Record<string, string>;
          if (body.grant_type === "refresh_token") {
            refreshes.push(body.refresh_token as string);
            if (opts.revoked || body.refresh_token !== current)
              return {
                error: "bad_refresh_token",
                error_description: "The refresh token passed is incorrect or expired.",
              };
            n++;
            current = `ghr_${n}`;
            const issued = {
              access_token: `ghu_${n}`,
              expires_in: 28800,
              refresh_token: current,
              refresh_token_expires_in: 15811200,
            };
            // GitHub has rotated the token already; the answer is just slow to arrive.
            if (opts.delayMs)
              return new Promise((resolve) => setTimeout(() => resolve(issued), opts.delayMs));
            return issued;
          }
          expect(body).toMatchObject({
            code: "the-code",
            client_id: "Iv1.client",
            client_secret: "client-secret",
          });
          return {
            access_token: "ghu_0",
            expires_in: 28800,
            refresh_token: current,
            refresh_token_expires_in: 15811200,
          };
        },
      ],
      [
        "GET",
        /^\/user$/,
        () => ({
          id: 9001,
          login: "MayaLin",
          name: "Maya Lin",
          email: "maya@example.com",
          avatar_url: "https://avatars/x",
        }),
      ],
    ]);
    return { mock, refreshes, current: () => current };
  }

  async function start(app: ReturnType<typeof createApp>) {
    const res = await call(
      app,
      "/auth/github/start?template=basic&name=Maya&return_to=/sites",
      {},
      githubEnv,
    );
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") as string);
    const state = loc.searchParams.get("state") as string;
    const setCookie = res.headers.get("set-cookie") ?? "";
    return { res, loc, state, setCookie, browser: cookieFrom(res, "os_oauth_state") };
  }

  async function signIn(app: ReturnType<typeof createApp>) {
    const s = await start(app);
    // Only sign in here (site creation is covered in the sites tests).
    await env.HUB_DB.prepare("UPDATE oauth_states SET intent_json = '{}' WHERE state = ?")
      .bind(s.state)
      .run();
    const cb = await call(
      app,
      `/auth/github/callback?code=the-code&state=${s.state}`,
      { cookie: s.browser },
      githubEnv,
    );
    expect(cb.headers.get("location")).toBe("https://studio.openspace.test/sites");
    return cookieFrom(cb);
  }

  it("binds the OAuth state to the browser (login CSRF) and stores encrypted tokens", async () => {
    const gh = fakeGitHub();
    const app = createApp({ services: { fetch: gh.mock.fetch } });
    const s = await start(app);
    expect(s.loc.origin + s.loc.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(s.loc.searchParams.get("client_id")).toBe("Iv1.client");
    expect(s.loc.searchParams.get("redirect_uri")).toBe(
      "https://hub.openspace.test/auth/github/callback",
    );
    expect(s.setCookie).toMatch(/^os_oauth_state=[\w-]+;/);
    expect(s.setCookie).toContain("HttpOnly");
    expect(s.setCookie).toContain("SameSite=Lax");
    expect(s.setCookie).toContain("Path=/auth/github");
    expect(s.setCookie).toContain("Max-Age=600");

    // An attacker's callback URL opened in the victim's browser (no state cookie) is refused…
    const noCookie = await call(
      app,
      `/auth/github/callback?code=the-code&state=${s.state}`,
      {},
      githubEnv,
    );
    expect(noCookie.headers.get("location")).toBe(
      "https://studio.openspace.test/?signin=failed&reason=state_mismatch",
    );
    // …as is a cookie for a different sign-in attempt.
    const other = await start(app);
    const swapped = await call(
      app,
      `/auth/github/callback?code=the-code&state=${s.state}`,
      { cookie: other.browser },
      githubEnv,
    );
    expect(swapped.headers.get("location")).toContain("reason=state_mismatch");
    expect(gh.mock.calls.filter((c) => c.path.includes("access_token"))).toHaveLength(0);

    const forged = await call(
      app,
      "/auth/github/callback?code=x&state=forged",
      { cookie: "os_oauth_state=forged" },
      githubEnv,
    );
    expect(forged.headers.get("location")).toContain("reason=expired");

    const cb = await call(
      app,
      `/auth/github/callback?code=the-code&state=${other.state}`,
      { cookie: other.browser },
      githubEnv,
    );
    expect(cb.status).toBe(302);
    // The site intent (template=basic) was carried; return_to was resolved against Studio.
    const setCookies = cb.headers.getSetCookie();
    expect(setCookies.some((c) => /^os_oauth_state=;.*Max-Age=0/.test(c))).toBe(true);
    const session = setCookies.find((c) => c.startsWith("os_session="));
    expect(session).toContain("Secure");

    const user = await env.HUB_DB.prepare("SELECT * FROM users WHERE github_id = 9001").first<
      Record<string, string>
    >();
    expect(user?.login).toBe("MayaLin");
    expect(user?.refresh_token_enc).toMatch(/^v1\./);
    expect(JSON.stringify(user)).not.toContain("ghr_0");
    expect(JSON.stringify(user)).not.toContain("ghu_0");
    expect(await decryptSecret(encKey, user?.refresh_token_enc as string, user?.id)).toBe("ghr_0");
    expect(
      await decryptSecret(encKey, user?.access_token_enc as string, `${user?.id}:access`),
    ).toBe("ghu_0");

    // State is single-use.
    const replay = await call(
      app,
      `/auth/github/callback?code=the-code&state=${other.state}`,
      { cookie: other.browser },
      githubEnv,
    );
    expect(replay.headers.get("location")).toContain("reason=expired");
  });

  it("reuses the cached access token, then refreshes (rotating) near expiry", async () => {
    const gh = fakeGitHub();
    let now = Date.UTC(2026, 9, 26, 9);
    const app = createApp({ services: { fetch: gh.mock.fetch, now: () => now } });
    const cookie = await signIn(app);
    const t0 = await call(app, "/auth/token", { method: "POST", cookie }, githubEnv);
    expect(await t0.json()).toEqual({
      mode: "github",
      token: "ghu_0",
      expiresAt: new Date(now + 8 * HOUR).toISOString(),
    });
    expect(gh.refreshes).toEqual([]);
    now += 8 * HOUR - 4 * 60 * 1000; // within 5 minutes of expiry
    const t1 = await call(app, "/auth/token", { method: "POST", cookie }, githubEnv);
    expect(await t1.json()).toMatchObject({ token: "ghu_1" });
    const t2 = await call(app, "/auth/token", { method: "POST", cookie }, githubEnv);
    expect(await t2.json()).toMatchObject({ token: "ghu_1" });
    expect(gh.refreshes).toEqual(["ghr_0"]);
    const row = await env.HUB_DB.prepare(
      "SELECT id, refresh_token_enc FROM users WHERE github_id = 9001",
    ).first<Record<string, string>>();
    expect(await decryptSecret(encKey, row?.refresh_token_enc as string, row?.id)).toBe("ghr_1");
    const me = await call(app, "/api/me", { cookie }, githubEnv);
    expect(await me.json()).toMatchObject({ auth: { github: true, dev: false }, devMode: false });
  });

  it("serializes concurrent refreshes: one rotation, everyone gets a token", async () => {
    const gh = fakeGitHub();
    let now = Date.UTC(2026, 9, 26, 9);
    const app = createApp({ services: { fetch: gh.mock.fetch, now: () => now } });
    const cookie = await signIn(app);
    now += 9 * HOUR; // cached token expired
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        call(app, "/auth/token", { method: "POST", cookie }, githubEnv),
      ),
    );
    const bodies = (await Promise.all(results.map((r) => r.json()))) as Array<{ token: string }>;
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(new Set(bodies.map((b) => b.token))).toEqual(new Set(["ghu_1"]));
    expect(gh.current()).toBe("ghr_1"); // rotated exactly once
    expect(gh.refreshes).toEqual(["ghr_0"]); // only the claim holder spent the refresh token
    const row = await env.HUB_DB.prepare(
      "SELECT id, refresh_token_enc FROM users WHERE github_id = 9001",
    ).first<Record<string, string>>();
    expect(await decryptSecret(encKey, row?.refresh_token_enc as string, row?.id)).toBe("ghr_1");
  });

  it("never lets a request that lost the refresh race clear the winner's rotated token", async () => {
    // The winner's refresh is slow; before the claim, a concurrent request spent the same
    // (already rotated) refresh token, got it rejected and wiped the stored tokens.
    const gh = fakeGitHub({ delayMs: 800 });
    let now = Date.UTC(2026, 9, 26, 9);
    const app = createApp({ services: { fetch: gh.mock.fetch, now: () => now } });
    const cookie = await signIn(app);
    now += 9 * HOUR;
    const [a, b] = await Promise.all([
      call(app, "/auth/token", { method: "POST", cookie }, githubEnv),
      call(app, "/auth/token", { method: "POST", cookie }, githubEnv),
    ]);
    expect([a?.status, b?.status]).toEqual([200, 200]);
    expect(gh.refreshes).toEqual(["ghr_0"]);
    const row = await env.HUB_DB.prepare(
      "SELECT id, refresh_token_enc, refresh_claim FROM users WHERE github_id = 9001",
    ).first<Record<string, string | null>>();
    expect(row?.refresh_claim).toBeNull();
    expect(await decryptSecret(encKey, row?.refresh_token_enc as string, row?.id as string)).toBe(
      "ghr_1",
    );
  });

  it("maps a revoked refresh token to 401 github_reauth_required and forgets the tokens", async () => {
    const gh = fakeGitHub({ revoked: true });
    let now = Date.UTC(2026, 9, 26, 9);
    const app = createApp({ services: { fetch: gh.mock.fetch, now: () => now } });
    const cookie = await signIn(app);
    now += 9 * HOUR;
    const res = await call(app, "/auth/token", { method: "POST", cookie }, githubEnv);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "github_reauth_required",
    );
    const row = await env.HUB_DB.prepare(
      "SELECT refresh_token_enc, access_token_enc FROM users WHERE github_id = 9001",
    ).first();
    expect(row).toEqual({ refresh_token_enc: null, access_token_enc: null });
    const again = await call(app, "/auth/token", { method: "POST", cookie }, githubEnv);
    expect(again.status).toBe(401);
    expect(gh.refreshes).toHaveLength(1);
  });
});
