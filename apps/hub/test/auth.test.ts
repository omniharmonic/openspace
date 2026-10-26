import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { bytesToBase64, decryptSecret } from "../src/lib/crypto";
import { devLoginFor } from "../src/routes/auth";
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
      devMode: true,
      github: { configured: false, emulated: true },
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
    const anon = await call(app, "/api/me");
    expect(anon.status).toBe(401);
    expect(await anon.json()).toEqual({
      error: { code: "unauthenticated", message: "Please sign in." },
    });
    expect((await call(app, "/api/me", { cookie: "os_session=bogus" })).status).toBe(401);

    const bad = await call(app, "/auth/dev/login", { method: "POST", json: { name: "" } });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe("invalid_request");
    const notJson = await call(app, "/auth/dev/login", { method: "POST", body: "{nope" });
    expect(notJson.status).toBe(400);

    const cookie = await devLogin(app);
    const out = await call(app, "/auth/logout", { method: "POST", cookie });
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toMatch(/os_session=;.*Max-Age=0/);
    expect((await call(app, "/api/me", { cookie })).status).toBe(401);
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
    expect((await call(app, "/api/me", { cookie })).status).toBe(401);
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

  it("start then callback creates the user, stores an encrypted refresh token and a session", async () => {
    let refreshCount = 0;
    const gh = mockFetch([
      [
        "POST",
        /^github\.com\/login\/oauth\/access_token$/,
        (c) => {
          const body = c.body as Record<string, string>;
          if (body.grant_type === "refresh_token") {
            refreshCount++;
            expect(body.refresh_token).toBe(
              refreshCount === 1 ? "ghr_first" : `ghr_rotated_${refreshCount - 1}`,
            );
            return {
              access_token: `ghu_refreshed_${refreshCount}`,
              expires_in: 28800,
              refresh_token: `ghr_rotated_${refreshCount}`,
              refresh_token_expires_in: 15811200,
            };
          }
          expect(body).toMatchObject({
            code: "the-code",
            client_id: "Iv1.client",
            client_secret: "client-secret",
          });
          return {
            access_token: "ghu_first",
            expires_in: 28800,
            refresh_token: "ghr_first",
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
    const app = createApp({ services: { fetch: gh.fetch } });

    const start = await call(app, "/auth/github/start?template=basic&name=Maya", {}, githubEnv);
    expect(start.status).toBe(302);
    const loc = new URL(start.headers.get("location") as string);
    expect(loc.origin + loc.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(loc.searchParams.get("client_id")).toBe("Iv1.client");
    expect(loc.searchParams.get("redirect_uri")).toBe(
      "https://hub.openspace.test/auth/github/callback",
    );
    const state = loc.searchParams.get("state") as string;
    // Intent without template so the callback only signs in (site creation is covered in sites tests).
    await env.HUB_DB.prepare("UPDATE oauth_states SET intent_json = '{}' WHERE state = ?")
      .bind(state)
      .run();

    const bad = await call(app, "/auth/github/callback?code=x&state=forged", {}, githubEnv);
    expect(bad.headers.get("location")).toBe(
      "https://studio.openspace.test/?signin=failed&reason=expired",
    );

    const cb = await call(app, `/auth/github/callback?code=the-code&state=${state}`, {}, githubEnv);
    expect(cb.status).toBe(302);
    expect(cb.headers.get("location")).toBe("https://studio.openspace.test/sites");
    const setCookie = cb.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("Secure");
    const cookie = cookieFrom(cb);

    const user = await env.HUB_DB.prepare("SELECT * FROM users WHERE github_id = 9001").first<
      Record<string, string>
    >();
    expect(user?.login).toBe("MayaLin");
    expect(user?.refresh_token_enc).toMatch(/^v1\./);
    expect(user?.refresh_token_enc).not.toContain("ghr_first");
    expect(await decryptSecret(encKey, user?.refresh_token_enc as string, user?.id)).toBe(
      "ghr_first",
    );

    // State is single-use.
    const replay = await call(
      app,
      `/auth/github/callback?code=the-code&state=${state}`,
      {},
      githubEnv,
    );
    expect(replay.headers.get("location")).toContain("reason=expired");

    // /auth/token refreshes (rotating the stored refresh token) and returns a short-lived token.
    const t1 = await call(app, "/auth/token", { method: "POST", cookie }, githubEnv);
    expect(await t1.json()).toMatchObject({ mode: "github", token: "ghu_refreshed_1" });
    const t2 = await call(app, "/auth/token", { method: "POST", cookie }, githubEnv);
    expect(await t2.json()).toMatchObject({ token: "ghu_refreshed_2" });
    const after = await env.HUB_DB.prepare(
      "SELECT refresh_token_enc, id FROM users WHERE github_id = 9001",
    ).first<Record<string, string>>();
    expect(await decryptSecret(encKey, after?.refresh_token_enc as string, after?.id)).toBe(
      "ghr_rotated_2",
    );

    const me = await call(app, "/api/me", { cookie }, githubEnv);
    expect(await me.json()).toMatchObject({
      devMode: false,
      github: { configured: true, emulated: false },
    });
  });
});
