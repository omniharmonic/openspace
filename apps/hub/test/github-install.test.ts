import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { installUrl } from "../src/github/oauth";
import { bytesToBase64, toHex } from "../src/lib/crypto";
import { GITHUB_ACCESS_DETAIL, GITHUB_RECONNECT_DETAIL } from "../src/services/github-install";
import { call, cookieFrom } from "./helpers";
import { generateAppKey, pem } from "./keys";
import { mockFetch, status } from "./mock-fetch";

const STUDIO = "http://localhost:5173";
const HUB = "http://localhost:8787";

interface SiteJson {
  id: string;
  status: string;
  statusDetail: string | null;
  repo: string;
  github: { access: string; connectUrl: string | null };
}

async function devLogin(app: ReturnType<typeof createApp>, name: string, installApp?: boolean) {
  const res = await call(app, "/auth/dev/login", {
    method: "POST",
    json: { name, ...(installApp === undefined ? {} : { installApp }) },
  });
  expect(res.status).toBe(200);
  return cookieFrom(res);
}

async function site(app: ReturnType<typeof createApp>, cookie: string, id: string) {
  return (await (await call(app, `/api/sites/${id}`, { cookie })).json()) as SiteJson;
}

/** Follow Hub-internal redirects (the dev install page → Setup URL) until Studio is reached. */
async function follow(app: ReturnType<typeof createApp>, cookie: string, url: string) {
  let next = url;
  for (let i = 0; i < 6; i++) {
    if (!next.startsWith(HUB) && !next.startsWith("/")) return next;
    const res = await call(app, next.replace(HUB, ""), { cookie });
    expect([301, 302, 303]).toContain(res.status);
    next = res.headers.get("location") as string;
  }
  throw new Error("too many redirects");
}

describe("GitHub App install step (dev emulation)", () => {
  it("a new account without the App: the site waits, the install page returns to the Setup URL and setup resumes", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Sophia Install", false);
    const created = await call(app, "/api/sites", {
      method: "POST",
      cookie,
      json: { template: "basic", name: "Power With" },
    });
    expect(created.status).toBe(201);
    const view = (await created.json()) as SiteJson;
    expect(view).toMatchObject({
      status: "failed",
      statusDetail: GITHUB_ACCESS_DETAIL.install,
      github: { access: "install", connectUrl: `${HUB}/auth/github/install?site=${view.id}` },
    });
    // Nothing was created on "GitHub" yet.
    const repo = await env.HUB_DB.prepare("SELECT 1 FROM dev_repos WHERE full_name = ?")
      .bind("sophia-install/power-with")
      .first();
    expect(repo).toBeNull();
    // Never the generic failure.
    expect(view.statusDetail).not.toMatch(/couldn.t finish/i);

    // Connect GitHub → the (dev) install page, preselecting the account, with a single-use state.
    const go = await call(app, `/auth/github/install?site=${view.id}`, { cookie });
    expect(go.status).toBe(302);
    const page = new URL(go.headers.get("location") as string);
    expect(page.pathname).toBe("/auth/github/dev-install");
    expect(page.searchParams.get("suggested_target_id")).toMatch(/^\d+$/);
    const state = page.searchParams.get("state") as string;
    expect(state).toMatch(/^inst_/);
    const html = await call(app, `${page.pathname}${page.search}`, { cookie });
    expect(await html.text()).toContain("Only select repositories");

    // "Install for all repositories" → Setup URL → site set up → Studio.
    const back = await follow(
      app,
      cookie,
      `/auth/github/dev-install/confirm?state=${state}&selection=all`,
    );
    expect(back).toBe(`${STUDIO}/sites/${view.id}?github=connected&welcome=1`);
    const after = await site(app, cookie, view.id);
    expect(after).toMatchObject({
      status: "live",
      statusDetail: null,
      github: { access: "ok", connectUrl: null },
    });
    // The state was single use.
    const replay = await call(
      app,
      `/auth/github/installed?installation_id=1&setup_action=install&state=${state}`,
      { cookie },
    );
    expect(replay.headers.get("location")).not.toContain(view.id);
  });

  it("Only-select-repositories asks for all repositories; updating the install resumes setup", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Selective Sam", false);
    const view = (await (
      await call(app, "/api/sites", {
        method: "POST",
        cookie,
        json: { template: "basic", name: "Picky" },
      })
    ).json()) as SiteJson;
    const go = await call(app, `/auth/github/install?site=${view.id}`, { cookie });
    const state = new URL(go.headers.get("location") as string).searchParams.get("state");
    const back = await follow(
      app,
      cookie,
      `/auth/github/dev-install/confirm?state=${state}&selection=selected`,
    );
    expect(back).toBe(`${STUDIO}/sites/${view.id}?github=repo_access`);
    expect(await site(app, cookie, view.id)).toMatchObject({
      status: "failed",
      statusDetail: GITHUB_ACCESS_DETAIL.repo_access,
      github: { access: "repo_access" },
    });

    // Connect GitHub again opens the installation's settings (not a second install).
    const again = await call(app, `/auth/github/install?site=${view.id}`, { cookie });
    const settings = new URL(again.headers.get("location") as string);
    expect(settings.searchParams.get("installation_id")).toMatch(/^\d+$/);
    const done = await follow(
      app,
      cookie,
      `/auth/github/dev-install/confirm?${new URLSearchParams({
        state: settings.searchParams.get("state") as string,
        selection: "all",
        installation_id: settings.searchParams.get("installation_id") as string,
      })}`,
    );
    expect(done).toBe(`${STUDIO}/sites/${view.id}?github=connected&welcome=1`);
    expect((await site(app, cookie, view.id)).status).toBe("live");
  });

  it("a cancelled install leaves the site waiting; Try again re-reads installations instead of the stored none", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Cancel Carla", false);
    const view = (await (
      await call(app, "/api/sites", {
        method: "POST",
        cookie,
        json: { template: "basic", name: "Later" },
      })
    ).json()) as SiteJson;
    const go = await call(app, `/auth/github/install?site=${view.id}`, { cookie });
    const state = new URL(go.headers.get("location") as string).searchParams.get("state");
    const cancel = await call(
      app,
      `/auth/github/dev-install/confirm?state=${state}&action=cancel`,
      {
        cookie,
      },
    );
    expect(cancel.headers.get("location")).toBe(`${STUDIO}/sites/${view.id}`);
    // Setup URL without an installation (GitHub's own cancel path) is "cancelled".
    const none = await call(app, `/auth/github/installed?state=${state}`, { cookie });
    expect(none.headers.get("location")).toBe(`${STUDIO}/sites/${view.id}?github=cancelled`);

    // Try again while still not installed: a clear answer, not a generic failure.
    const retry = await call(app, `/api/sites/${view.id}/publish`, { method: "POST", cookie });
    expect(await retry.json()).toMatchObject({
      status: "failed",
      github: { access: "install" },
      statusDetail: GITHUB_ACCESS_DETAIL.install,
    });

    // Installed elsewhere (e.g. from GitHub directly) → Try again finds it and finishes setup.
    await call(app, "/auth/github/dev-install/confirm?selection=all", { cookie });
    const ok = await call(app, `/api/sites/${view.id}/publish`, { method: "POST", cookie });
    expect(await ok.json()).toMatchObject({ status: "live", github: { access: "ok" } });
  });

  it("refuses another person's installation id on the Setup URL", async () => {
    const app = createApp();
    const owner = await devLogin(app, "Owner Olga");
    const ownerInstall = await env.HUB_DB.prepare(
      "SELECT id FROM dev_installations WHERE account_login = 'owner-olga'",
    ).first<{ id: number }>();
    const mallory = await devLogin(app, "Mallory Install", false);
    const view = (await (
      await call(app, "/api/sites", {
        method: "POST",
        cookie: mallory,
        json: { template: "basic", name: "Steal" },
      })
    ).json()) as SiteJson;
    const go = await call(app, `/auth/github/install?site=${view.id}`, { cookie: mallory });
    const state = new URL(go.headers.get("location") as string).searchParams.get("state");
    const res = await call(
      app,
      `/auth/github/installed?installation_id=${ownerInstall?.id}&setup_action=install&state=${state}`,
      { cookie: mallory },
    );
    expect(res.headers.get("location")).toBe(`${STUDIO}/sites/${view.id}?github=not_yours`);
    expect((await site(app, mallory, view.id)).github.access).toBe("install");
    // Someone else's state is ignored too.
    expect(owner).toBeTruthy();
  });

  it("uninstalling later shows Reconnect GitHub; publishing says so; reconnecting restores it", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Uninstall Uma");
    const view = (await (
      await call(app, "/api/sites", {
        method: "POST",
        cookie,
        json: { template: "basic", name: "Was Fine" },
      })
    ).json()) as SiteJson;
    expect(view.status).toBe("live");
    const un = await call(app, "/dev/github/uninstall", { method: "POST", cookie });
    expect(un.status).toBe(200);
    expect(await site(app, cookie, view.id)).toMatchObject({
      status: "live",
      statusDetail: GITHUB_RECONNECT_DETAIL,
      github: { access: "install" },
    });
    const pub = await call(app, `/api/sites/${view.id}/publish`, { method: "POST", cookie });
    expect(pub.status).toBe(409);
    expect(await pub.json()).toMatchObject({ error: { code: "github_access_needed" } });

    const go = await call(app, `/auth/github/install?site=${view.id}`, { cookie });
    const state = new URL(go.headers.get("location") as string).searchParams.get("state");
    const back = await follow(
      app,
      cookie,
      `/auth/github/dev-install/confirm?state=${state}&selection=all`,
    );
    expect(back).toContain("github=connected");
    expect(await site(app, cookie, view.id)).toMatchObject({
      status: "live",
      statusDetail: null,
      github: { access: "ok" },
    });
  });

  it("an organization install request marks the site as waiting for approval", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Org Member", false);
    const view = (await (
      await call(app, "/api/sites", {
        method: "POST",
        cookie,
        json: { template: "basic", name: "Team Site" },
      })
    ).json()) as SiteJson;
    const go = await call(app, `/auth/github/install?site=${view.id}`, { cookie });
    const state = new URL(go.headers.get("location") as string).searchParams.get("state");
    const res = await call(app, `/auth/github/installed?setup_action=request&state=${state}`, {
      cookie,
    });
    expect(res.headers.get("location")).toBe(`${STUDIO}/sites/${view.id}?github=requested`);
    expect(await site(app, cookie, view.id)).toMatchObject({
      statusDetail: GITHUB_ACCESS_DETAIL.requested,
      github: { access: "requested" },
    });
    // Try again while still waiting keeps the "requested" explanation.
    const retry = await call(app, `/api/sites/${view.id}/publish`, { method: "POST", cookie });
    expect(await retry.json()).toMatchObject({ github: { access: "requested" } });
  });

  it("only the owner can connect GitHub for a site; signed-out visitors go to sign-in", async () => {
    const app = createApp();
    const signedOut = await call(app, "/auth/github/install?site=st_x");
    expect(signedOut.headers.get("location")).toBe(`${STUDIO}/signin?next=%2Fsites%2Fst_x`);
    const cookie = await devLogin(app, "Nobody Here");
    const missing = await call(app, "/auth/github/install?site=st_nope", { cookie });
    expect(missing.headers.get("location")).toBe(`${STUDIO}/sites?github=not_found`);
  });
});

describe("GitHub App install step (real App, mocked GitHub)", () => {
  async function realEnv() {
    const { pkcs8 } = await generateAppKey();
    return {
      ...env,
      DEV_MODE: "false",
      HUB_URL: "https://hub.openspace.test",
      STUDIO_ORIGIN: "https://studio.openspace.test",
      GITHUB_APP_ID: "4242",
      GITHUB_APP_SLUG: "openspace-host",
      GITHUB_APP_PRIVATE_KEY: pem("PRIVATE KEY", pkcs8),
      GITHUB_CLIENT_ID: "Iv1.client",
      GITHUB_CLIENT_SECRET: "client-secret",
      TOKEN_ENC_KEY: bytesToBase64(crypto.getRandomValues(new Uint8Array(32))),
    };
  }

  it("builds GitHub's install URL with the account preselected and the state", () => {
    const u = new URL(installUrl({ slug: "openspace-host" }, { state: "inst_x", targetId: 42 }));
    expect(`${u.origin}${u.pathname}`).toBe(
      "https://github.com/apps/openspace-host/installations/new",
    );
    expect(u.searchParams.get("suggested_target_id")).toBe("42");
    expect(u.searchParams.get("state")).toBe("inst_x");
  });

  it("sign-in without the App: the site waits for the install instead of failing; the Setup URL resumes it", async () => {
    const githubEnv = await realEnv();
    let installations: unknown[] = [];
    let repoCreated = false;
    const HEAD = "a".repeat(40);
    const gh = mockFetch([
      [
        "POST",
        /^github\.com\/login\/oauth\/access_token$/,
        () => ({
          access_token: "ghu_user",
          expires_in: 28800,
          refresh_token: "ghr_1",
          refresh_token_expires_in: 999999,
        }),
      ],
      [
        "GET",
        /^\/user$/,
        () => ({ id: 5150, login: "life-culture", name: "Sophia", email: null, avatar_url: null }),
      ],
      ["GET", /^\/user\/installations/, () => ({ installations })],
      [
        "POST",
        /^\/app\/installations\/88\/access_tokens$/,
        () => ({ token: "ghs_install", expires_at: "2099-01-01T00:00:00Z" }),
      ],
      [
        "GET",
        /^\/repos\/life-culture\/sophia-s-test-site$/,
        () =>
          repoCreated
            ? {
                name: "sophia-s-test-site",
                full_name: "life-culture/sophia-s-test-site",
                owner: { login: "life-culture" },
                default_branch: "main",
                html_url: "x",
                private: false,
                archived: false,
              }
            : status(404, { message: "Not Found" }),
      ],
      [
        "POST",
        /^\/user\/repos$/,
        () => {
          repoCreated = true;
          return status(201, {
            name: "sophia-s-test-site",
            full_name: "life-culture/sophia-s-test-site",
            owner: { login: "life-culture" },
            default_branch: "main",
            html_url: "x",
            private: false,
            archived: false,
          });
        },
      ],
      ["GET", /\/git\/ref\/heads\/main$/, () => ({ object: { sha: HEAD } })],
      ["GET", /\/git\/ref\/heads\/os\/draft$/, () => status(404, { message: "Not Found" })],
      [
        "POST",
        /^\/graphql$/,
        () => ({
          data: {
            createCommitOnBranch: { commit: { oid: HEAD, committedDate: "2026-10-26T00:00:00Z" } },
          },
        }),
      ],
      ["GET", /\/actions\/variables\//, () => status(404, { message: "Not Found" })],
      ["POST", /\/actions\/variables$/, () => status(201, {})],
      ["POST", /\/git\/refs$/, () => status(201, {})],
      ["POST", /\/pages$/, () => status(201, { html_url: "https://life-culture.github.io/x/" })],
      ["POST", /\/dispatches$/, () => new Response(null, { status: 204 })],
      ["GET", /\/runs\?/, () => ({ workflow_runs: [] })],
    ]);
    const app = createApp({ services: { fetch: gh.fetch } });
    const start = await call(
      app,
      "/auth/github/start?template=basic&name=Sophia%27s%20test%20site",
      {},
      githubEnv,
    );
    const state = new URL(start.headers.get("location") as string).searchParams.get("state");
    const cb = await call(
      app,
      `/auth/github/callback?code=c&state=${state}`,
      { cookie: cookieFrom(start, "os_oauth_state") },
      githubEnv,
    );
    const loc = cb.headers.get("location") as string;
    expect(loc).toMatch(/^https:\/\/studio\.openspace\.test\/sites\/st_\w+\?github=connect$/);
    const siteId = loc.split("/sites/")[1]?.split("?")[0] as string;
    const cookie = cookieFrom(cb);
    expect(gh.calls.some((c) => c.path === "/user/repos")).toBe(false);
    const waiting = (await (
      await call(app, `/api/sites/${siteId}`, { cookie }, githubEnv)
    ).json()) as SiteJson;
    expect(waiting).toMatchObject({
      status: "failed",
      repo: "life-culture/sophia-s-test-site",
      github: {
        access: "install",
        connectUrl: `https://hub.openspace.test/auth/github/install?site=${siteId}`,
      },
    });

    // Connect GitHub → GitHub's install page for her account (her GitHub id), with a state.
    const go = await call(app, `/auth/github/install?site=${siteId}`, { cookie }, githubEnv);
    const install = new URL(go.headers.get("location") as string);
    expect(`${install.origin}${install.pathname}`).toBe(
      "https://github.com/apps/openspace-host/installations/new",
    );
    expect(install.searchParams.get("suggested_target_id")).toBe("5150");
    const installState = install.searchParams.get("state") as string;

    // A forged Setup URL call (installation not visible to her token) is refused.
    const forged = await call(
      app,
      `/auth/github/installed?installation_id=88&setup_action=install&state=${installState}`,
      { cookie },
      githubEnv,
    );
    expect(forged.headers.get("location")).toContain("github=not_yours");

    // She installs the App on GitHub; GitHub redirects to the Setup URL.
    installations = [
      {
        id: 88,
        account: { login: "life-culture", id: 5150, type: "User" },
        repository_selection: "all",
      },
    ];
    const go2 = await call(app, `/auth/github/install?site=${siteId}`, { cookie }, githubEnv);
    // Already installed now: straight to the Setup URL handler.
    const setupUrl = go2.headers.get("location") as string;
    expect(setupUrl).toMatch(
      /^https:\/\/hub\.openspace\.test\/auth\/github\/installed\?installation_id=88&setup_action=install&state=inst_/,
    );
    const done = await call(
      app,
      setupUrl.replace("https://hub.openspace.test", ""),
      { cookie },
      githubEnv,
    );
    expect(done.headers.get("location")).toBe(
      `https://studio.openspace.test/sites/${siteId}?github=connected&welcome=1`,
    );
    const createRepo = gh.calls.find((c) => c.path === "/user/repos");
    expect(createRepo?.headers.get("authorization")).toBe("Bearer ghu_user");
    const row = await env.HUB_DB.prepare(
      "SELECT installation_id, github_access, status FROM sites WHERE id = ?",
    )
      .bind(siteId)
      .first<{ installation_id: number; github_access: string | null; status: string }>();
    expect(row).toMatchObject({ installation_id: 88, github_access: null, status: "building" });
  });

  it("Only-select-repositories installs are sent to the installation's settings", async () => {
    const githubEnv = await realEnv();
    const gh = mockFetch([
      [
        "POST",
        /^github\.com\/login\/oauth\/access_token$/,
        () => ({ access_token: "ghu_user", expires_in: 28800, refresh_token: "ghr_1" }),
      ],
      [
        "GET",
        /^\/user$/,
        () => ({ id: 7, login: "picky", name: null, email: null, avatar_url: null }),
      ],
      [
        "GET",
        /^\/user\/installations/,
        () => ({
          installations: [
            {
              id: 99,
              account: { login: "picky", id: 7, type: "User" },
              repository_selection: "selected",
            },
          ],
        }),
      ],
      ["GET", /^\/repos\/picky\//, () => status(404, { message: "Not Found" })],
    ]);
    const app = createApp({ services: { fetch: gh.fetch } });
    const start = await call(app, "/auth/github/start?template=basic&name=Picky", {}, githubEnv);
    const state = new URL(start.headers.get("location") as string).searchParams.get("state");
    const cb = await call(
      app,
      `/auth/github/callback?code=c&state=${state}`,
      { cookie: cookieFrom(start, "os_oauth_state") },
      githubEnv,
    );
    const siteId = (cb.headers.get("location") as string).split("/sites/")[1]?.split("?")[0];
    const cookie = cookieFrom(cb);
    const view = (await (
      await call(app, `/api/sites/${siteId}`, { cookie }, githubEnv)
    ).json()) as SiteJson;
    expect(view.github.access).toBe("repo_access");
    const go = await call(app, `/auth/github/install?site=${siteId}`, { cookie }, githubEnv);
    expect(go.headers.get("location")).toBe("https://github.com/settings/installations/99");
  });
});

describe("installation webhooks", () => {
  const SECRET = ["whsec", "install", "value"].join("_");
  async function sign(body: string) {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return `sha256=${toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))}`;
  }

  it("installation.deleted and removed repositories put sites into Reconnect GitHub", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Hook Hana");
    const a = (await (
      await call(app, "/api/sites", {
        method: "POST",
        cookie,
        json: { template: "basic", name: "A" },
      })
    ).json()) as SiteJson;
    const b = (await (
      await call(app, "/api/sites", {
        method: "POST",
        cookie,
        json: { template: "basic", name: "B" },
      })
    ).json()) as SiteJson;
    const send = async (event: string, payload: unknown) => {
      const body = JSON.stringify(payload);
      return call(
        app,
        "/webhooks/github",
        {
          method: "POST",
          body,
          headers: {
            "content-type": "application/json",
            "x-github-event": event,
            "x-hub-signature-256": await sign(body),
          },
        },
        { ...env, GITHUB_WEBHOOK_SECRET: SECRET },
      );
    };
    const inst = await env.HUB_DB.prepare("SELECT installation_id AS id FROM sites WHERE id = ?")
      .bind(a.id)
      .first<{ id: number }>();
    expect(
      (
        await send("installation_repositories", {
          action: "removed",
          installation: { id: inst?.id },
          repositories_removed: [{ full_name: a.repo }],
        })
      ).status,
    ).toBe(202);
    expect((await site(app, cookie, a.id)).github.access).toBe("repo_access");
    expect((await site(app, cookie, b.id)).github.access).toBe("ok");
    await send("installation", {
      action: "deleted",
      installation: { id: inst?.id, account: { login: "hook-hana" } },
    });
    expect(await site(app, cookie, b.id)).toMatchObject({
      status: "live",
      statusDetail: GITHUB_RECONNECT_DETAIL,
      github: { access: "install" },
    });
  });
});

describe("install redirects that land on the OAuth callback", () => {
  it("are handed to the Setup URL handler", async () => {
    const { pkcs8 } = await generateAppKey();
    const githubEnv = {
      ...env,
      DEV_MODE: "false",
      HUB_URL: "https://hub.openspace.test",
      STUDIO_ORIGIN: "https://studio.openspace.test",
      GITHUB_APP_ID: "4242",
      GITHUB_APP_PRIVATE_KEY: pem("PRIVATE KEY", pkcs8),
      GITHUB_CLIENT_ID: "Iv1.client",
      GITHUB_CLIENT_SECRET: "client-secret",
      TOKEN_ENC_KEY: bytesToBase64(crypto.getRandomValues(new Uint8Array(32))),
    };
    const app = createApp();
    const res = await call(
      app,
      "/auth/github/callback?code=c&installation_id=5&setup_action=install&state=inst_abc",
      {},
      githubEnv,
    );
    expect(res.headers.get("location")).toBe(
      "https://hub.openspace.test/auth/github/installed?setup_action=install&installation_id=5&state=inst_abc",
    );
  });
});
