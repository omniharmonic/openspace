/**
 * "Start with Claude" inside Claude: permissions that can't get out of sequence (all my sites,
 * grant-on-create, the one-click "Allow" link), tools during setup, and the guided flow.
 */
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { insertSite } from "../src/db/sites";
import { getUserRow, toUser } from "../src/db/users";
import { readConfig } from "../src/env";
import { grantSiteStatement } from "../src/mcp/db";
import { createServices } from "../src/services";
import { createSite } from "../src/services/sites";
import { call, cookieFrom, STUDIO } from "./helpers";
import { HUB, McpTestClient, oauthConnect, REDIRECT, toolText } from "./mcp-helpers";

type App = ReturnType<typeof createApp>;

async function login(app: App, name: string, installApp?: boolean) {
  const res = await call(app, "/auth/dev/login", {
    method: "POST",
    json: { name, ...(installApp === undefined ? {} : { installApp }) },
  });
  const me = (await res.clone().json()) as { user: { id: string } };
  return { cookie: cookieFrom(res), id: me.user.id };
}

async function studioSite(app: App, cookie: string, name: string) {
  const res = await call(app, "/api/sites", {
    method: "POST",
    cookie,
    json: { template: "basic", name },
  });
  if (res.status !== 201 && res.status !== 200)
    throw new Error(`create ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; name: string };
}

/** OAuth connect with "All my sites, including ones I make later". */
async function connectAll(app: App, cookie: string) {
  const reg = await call(app, `${HUB}/register`, {
    method: "POST",
    json: {
      client_name: "Claude",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
  });
  const { client_id } = (await reg.json()) as { client_id: string };
  const verifier = "v".repeat(50);
  const challenge = btoa(
    String.fromCharCode(
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))),
    ),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const q = new URLSearchParams({
    response_type: "code",
    client_id,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: "s",
    scope: "mcp",
    resource: `${HUB}/mcp`,
  });
  const page = await (await call(app, `${HUB}/authorize?${q}`, { cookie })).text();
  const handle = /name="handle" value="([^"]+)"/.exec(page)?.[1] as string;
  const decided = await call(app, `${HUB}/authorize`, {
    method: "POST",
    cookie,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: HUB },
    body: new URLSearchParams({ handle, action: "allow", create: "1", all: "1" }).toString(),
  });
  const code = new URL(decided.headers.get("location") as string).searchParams.get("code");
  const tok = await call(app, `${HUB}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code as string,
      redirect_uri: REDIRECT,
      client_id,
      code_verifier: verifier,
      resource: `${HUB}/mcp`,
    }).toString(),
  });
  const { access_token } = (await tok.json()) as { access_token: string };
  const conn = await env.HUB_DB.prepare(
    "SELECT id, all_sites FROM mcp_connections WHERE client_id = ? AND revoked_at IS NULL",
  )
    .bind(client_id)
    .first<{ id: string; all_sites: number }>();
  return { accessToken: access_token, connectionId: conn?.id as string, conn };
}

async function mcpFor(app: App, token: string) {
  const mcp = new McpTestClient(app, `${HUB}/mcp`, token);
  await mcp.initialize();
  return mcp;
}

const siteIds = (r: Awaited<ReturnType<McpTestClient["tool"]>>) =>
  ((r.result?.structuredContent?.sites ?? []) as Array<{ id: string }>).map((s) => s.id);

const PAGE = `<!doctype html><html><head><title>Kiln &amp; Co</title><style>
:root{--clay:#a0522d;--paper:#fbf6ef}body{margin:0;font-family:Georgia,serif;background:var(--paper)}
.hero{padding:64px 24px;text-align:center}.hero h1{font-size:44px;color:var(--clay)}
</style></head><body>
<section class="hero"><h1>Handmade pottery from our kiln</h1><p>Classes, commissions and a small shop in Leith.</p><a href="#classes">Book a class</a></section>
<section id="classes"><h2>Classes</h2><p>Six people per class, all materials included.</p></section>
</body></html>`;

describe("consent: permissions that can't get out of sequence", () => {
  it("defaults to creating sites (even with sites) and offers all my sites", async () => {
    const app = createApp();
    const { cookie } = await login(app, "Consent Cass");
    await studioSite(app, cookie, "Cass Ceramics");
    const reg = await call(app, `${HUB}/register`, {
      method: "POST",
      json: {
        client_name: "Claude",
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
      },
    });
    const { client_id } = (await reg.json()) as { client_id: string };
    const q = new URLSearchParams({
      response_type: "code",
      client_id,
      redirect_uri: REDIRECT,
      code_challenge: "x".repeat(43),
      code_challenge_method: "S256",
      state: "s",
      scope: "mcp",
    });
    const html = await (await call(app, `${HUB}/authorize?${q}`, { cookie })).text();
    expect(html).toContain("Create new sites and edit the sites it creates");
    expect(html).toMatch(/name="create" value="1" checked/);
    expect(html).toContain("All my sites, including ones I make later");
    expect(html).toMatch(/name="all" value="1">/);
    expect(html).toContain("Cass Ceramics");
  });
});

describe("all my sites, including ones I make later", () => {
  it("reaches a site made later in Studio, and can be turned off from Studio", async () => {
    const app = createApp();
    const { cookie } = await login(app, "All Sites Ari");
    const { accessToken, connectionId, conn } = await connectAll(app, cookie);
    expect(conn?.all_sites).toBe(1);
    const mcp = await mcpFor(app, accessToken);

    // Made in Studio AFTER connecting.
    const later = await studioSite(app, cookie, "Ari Later");
    expect(siteIds(await mcp.tool("list_sites"))).toContain(later.id);
    const got = await mcp.tool("get_site", { site: later.id });
    expect(got.result?.isError, toolText(got)).toBeFalsy();

    // Studio shows it and can turn it off (publishing stays a separate opt-in).
    const grants = (await (await call(app, "/api/mcp/grants", { cookie })).json()) as {
      grants: Array<{ id: string; allSites: boolean; publish: boolean; create: boolean }>;
    };
    expect(grants.grants[0]).toMatchObject({
      id: connectionId,
      allSites: true,
      publish: false,
      create: true,
    });
    const off = await call(app, `/api/mcp/grants/${connectionId}`, {
      method: "PATCH",
      cookie,
      json: { allSites: false },
    });
    expect(off.status).toBe(200);
    expect(siteIds(await mcp.tool("list_sites"))).not.toContain(later.id);
    const refused = await mcp.tool("get_site", { site: later.id });
    expect(refused.result?.isError).toBe(true);
    expect(refused.result?.structuredContent?.error).toMatchObject({ code: "not_shared" });
  });
});

describe("a site an AI app creates is always its own", () => {
  it("start_site grants the new site atomically and answers with the edit link, live address and status", async () => {
    const app = createApp();
    const { cookie } = await login(app, "Kiln Kit");
    const { accessToken, connectionId } = await oauthConnect(app, cookie, {
      sites: [],
      create: true,
    });
    const mcp = await mcpFor(app, accessToken);
    const made = await mcp.tool("start_site", {
      name: "Kiln & Co",
      about: "A pottery studio in Leith with classes and commissions",
      audience: "Beginners who want to book a class",
      feeling: ["warm", "handmade"],
      html: PAGE,
    });
    expect(made.result?.isError, toolText(made)).toBeFalsy();
    const data = made.result?.structuredContent as {
      site: { id: string; url: string; studioUrl: string };
      status: string;
      editorReady: boolean;
    };
    expect(data.site.studioUrl).toBe(`${STUDIO}/sites/${data.site.id}?welcome=1`);
    expect(["publishing", "live"]).toContain(data.status);
    expect(data.editorReady).toBe(true);
    expect(toolText(made)).toContain("Edit it in OpenSpace (works now)");
    const grant = await env.HUB_DB.prepare(
      "SELECT role FROM mcp_grants WHERE connection_id = ? AND site_id = ? AND revoked_at IS NULL",
    )
      .bind(connectionId, data.site.id)
      .all<{ role: string }>();
    expect(grant.results).toEqual([{ role: "owner" }]);
    // Editing works at once (the draft), whatever the publish is doing.
    const site = await mcp.tool("get_site", { site: data.site.id });
    expect(site.result?.isError, toolText(site)).toBeFalsy();
    const status = await mcp.tool("site_status", { site: "Kiln & Co", wait: 0 });
    expect(status.result?.isError, toolText(status)).toBeFalsy();
    expect(status.result?.structuredContent).toMatchObject({
      site: { id: data.site.id },
      editorReady: true,
    });
  });

  it("the grant and the site land together or not at all", async () => {
    const app = createApp();
    const { id } = await login(app, "Atomic Al");
    const services = createServices(env as never, readConfig(env as never));
    const user = toUser(
      (await getUserRow(env.HUB_DB, id)) as NonNullable<Awaited<ReturnType<typeof getUserRow>>>,
    );
    const before = await env.HUB_DB.prepare("SELECT COUNT(*) AS n FROM sites").first<{
      n: number;
    }>();
    // A grant that can't be written (no such connection) must take the site down with it.
    await expect(
      createSite(
        services,
        user,
        { template: "basic", name: "Never Half Made" },
        {
          alsoInsert: (siteId) => [
            grantSiteStatement(
              env.HUB_DB,
              {
                id: "mcpc_missing",
                user_id: "u_missing",
                client_id: "c",
                kind: "oauth",
                client_name: "Claude",
                can_publish: 0,
              },
              { id: siteId, role: "owner" },
              Date.now(),
            ),
          ],
        },
      ),
    ).rejects.toThrow();
    const after = await env.HUB_DB.prepare("SELECT COUNT(*) AS n FROM sites").first<{
      n: number;
    }>();
    expect(after?.n).toBe(before?.n);
  });
});

describe("a site the connection can't reach: a one-click Allow link, never a dead end", () => {
  it("names the site, links to Studio, and only its person can allow it", async () => {
    const app = createApp();
    const { cookie } = await login(app, "Share Sky");
    const first = await studioSite(app, cookie, "Sky One");
    const { accessToken, connectionId } = await oauthConnect(app, cookie, { sites: [first.id] });
    const mcp = await mcpFor(app, accessToken);
    const later = await studioSite(app, cookie, "Sky Later");

    const allowUrl = `${STUDIO}/connect/allow?app=${connectionId}&site=${later.id}`;
    const list = await mcp.tool("list_sites");
    expect(siteIds(list)).toEqual([first.id]);
    expect(toolText(list)).toContain('"Sky Later"');
    expect(list.result?.structuredContent?.notShared).toEqual([
      { id: later.id, name: "Sky Later", allowUrl },
    ]);
    for (const ref of [later.id, "Sky Later"]) {
      const r = await mcp.tool("get_site", { site: ref });
      expect(r.result?.isError).toBe(true);
      expect(r.result?.structuredContent?.error).toMatchObject({ code: "not_shared" });
      expect(toolText(r)).toContain(allowUrl);
      expect(toolText(r)).not.toMatch(/not found/i);
    }

    // CSRF: another origin, or a non-JSON body, is refused.
    const evil = await call(app, `/api/mcp/grants/${connectionId}/sites`, {
      method: "POST",
      cookie,
      headers: { Origin: "https://evil.example" },
      json: { site: later.id },
    });
    expect(evil.status).toBe(403);
    const form = await call(app, `/api/mcp/grants/${connectionId}/sites`, {
      method: "POST",
      cookie,
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ site: later.id }),
    });
    expect(form.status).toBe(415);
    // Someone else (even signed in) can't use this connection.
    const other = await login(app, "Other Otto");
    const notMine = await call(app, `/api/mcp/grants/${connectionId}/sites`, {
      method: "POST",
      cookie: other.cookie,
      json: { site: later.id },
    });
    expect(notMine.status).toBe(404);
    // The AI app's own token can't reach Studio's API.
    const asAgent = await call(app, `/api/mcp/grants/${connectionId}/sites`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      json: { site: later.id },
    });
    expect(asAgent.status).toBe(401);

    const ok = await call(app, `/api/mcp/grants/${connectionId}/sites`, {
      method: "POST",
      cookie,
      headers: { Origin: STUDIO },
      json: { site: later.id },
    });
    expect(ok.status).toBe(201);
    const after = await mcp.tool("get_site", { site: later.id });
    expect(after.result?.isError, toolText(after)).toBeFalsy();

    // Removing one site from the connection.
    const removed = await call(app, `/api/mcp/grants/${connectionId}/sites/${later.id}`, {
      method: "DELETE",
      cookie,
    });
    expect(removed.status).toBe(200);
    expect(siteIds(await mcp.tool("list_sites"))).toEqual([first.id]);
  });

  it("refuses to allow a site where the person is only a contributor", async () => {
    const app = createApp();
    const owner = await login(app, "Owner Oona");
    const site = await studioSite(app, owner.cookie, "Oona Site");
    const helper = await login(app, "Contributor Cy");
    await env.HUB_DB.prepare(
      "INSERT INTO site_roles (site_id, user_id, role, created_at) VALUES (?, ?, 'contributor', ?)",
    )
      .bind(site.id, helper.id, Date.now())
      .run();
    const own = await studioSite(app, helper.cookie, "Cy Own");
    const { connectionId, accessToken } = await oauthConnect(app, helper.cookie, {
      sites: [own.id],
    });
    const res = await call(app, `/api/mcp/grants/${connectionId}/sites`, {
      method: "POST",
      cookie: helper.cookie,
      json: { site: site.id },
    });
    expect(res.status).toBe(403);
    const mcp = await mcpFor(app, accessToken);
    const r = await mcp.tool("get_site", { site: site.id });
    expect(toolText(r)).toContain("contributor");
  });
});

describe("tools while a site is being set up", () => {
  it("say 'still setting up, try again' (never 'not found'); site_status says setting_up", async () => {
    const app = createApp();
    const { cookie, id } = await login(app, "Setup Sam");
    const { accessToken, connectionId } = await oauthConnect(app, cookie, {
      sites: [],
      create: true,
    });
    const conn = await env.HUB_DB.prepare("SELECT * FROM mcp_connections WHERE id = ?")
      .bind(connectionId)
      .first<{
        id: string;
        user_id: string;
        client_id: string;
        kind: "oauth";
        client_name: string;
        can_publish: number;
      }>();
    // A site whose setup is still running: the row (and its grant) exist, the repository not yet.
    const now = Date.now();
    await insertSite(
      env.HUB_DB,
      {
        id: "st_settingup1",
        owner_id: id,
        name: "Half Way",
        tagline: null,
        repo: "setup-sam/half-way",
        installation_id: null,
        deploy_target: "github-pages",
        domain: null,
        url: `${HUB}/p/st_settingup1/`,
        template_id: "basic",
        template_version: "1.0.0",
        look: null,
        status: "building",
        created_at: now,
        updated_at: now,
      },
      [
        grantSiteStatement(
          env.HUB_DB,
          conn as NonNullable<typeof conn>,
          { id: "st_settingup1", role: "owner" },
          now,
        ),
      ],
    );
    const mcp = await mcpFor(app, accessToken);
    const r = await mcp.tool("get_site", { site: "st_settingup1" });
    expect(r.result?.isError).toBe(true);
    expect(r.result?.structuredContent?.error).toMatchObject({ code: "still_setting_up" });
    expect(toolText(r)).toMatch(/Try again in about \d+ seconds/);
    expect(toolText(r)).not.toMatch(/not found|couldn't find/i);
    const status = await mcp.tool("site_status", { site: "st_settingup1", wait: 0 });
    expect(status.result?.structuredContent).toMatchObject({
      phase: "setting_up",
      editorReady: false,
      retryAfterSeconds: 15,
    });
  });

  it("a site waiting for the GitHub step says so, with the Studio link", async () => {
    const app = createApp();
    const { cookie } = await login(app, "Install Ines", false);
    const { accessToken } = await oauthConnect(app, cookie, { sites: [], create: true });
    const mcp = await mcpFor(app, accessToken);
    const made = await mcp.tool("start_site", { name: "Ines Studio", html: PAGE });
    const data = made.result?.structuredContent as {
      site: { id: string };
      status: string;
      actionUrl: string;
    };
    expect(data.status).toBe("needs_github");
    expect(data.actionUrl).toBe(`${STUDIO}/sites/${data.site.id}`);
    const r = await mcp.tool("get_site", { site: data.site.id });
    expect(r.result?.structuredContent?.error).toMatchObject({ code: "needs_github" });
    expect(toolText(r)).toContain("Connect GitHub");
  });
});

describe("Claude leads the conversation", () => {
  it("sends the start flow as server instructions and offers the start-a-site prompt", async () => {
    const app = createApp();
    const { cookie } = await login(app, "Guide Gil");
    const { accessToken } = await oauthConnect(app, cookie, { sites: [], create: true });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, accessToken);
    const init = (await mcp.initialize()) as { instructions?: string };
    expect(init.instructions).toContain("one or two questions at a time");
    expect(init.instructions).toContain("start_site");
    expect(init.instructions).toContain("site_status");
    const prompts = await mcp.request("prompts/list");
    const names = ((prompts.result?.prompts ?? []) as Array<{ name: string }>).map((p) => p.name);
    expect(names).toContain("start-a-site");
    const tools = await mcp.request("tools/list");
    const start = (
      (tools.result?.tools ?? []) as Array<{ name: string; description: string }>
    ).find((t) => t.name === "start_site");
    expect(start?.description).toContain("LAST step");
    expect(start?.description).toContain("phone_check");
    const empty = await mcp.tool("list_sites");
    expect(toolText(empty)).toContain("start_site");
  });

  it("knows how to finish a move: instructions and the finish-a-move prompt", async () => {
    const app = createApp();
    const { cookie } = await login(app, "Mover Mo");
    const { accessToken } = await oauthConnect(app, cookie, { sites: [], create: true });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, accessToken);
    const init = (await mcp.initialize()) as { instructions?: string };
    expect(init.instructions).toContain("Finishing a move");
    expect(init.instructions).toContain("import_status");
    expect(init.instructions).toContain("create_component");
    expect(init.instructions).toContain("never grant yourself access");
    const prompts = await mcp.request("prompts/list");
    const names = ((prompts.result?.prompts ?? []) as Array<{ name: string }>).map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["start-a-site", "finish-a-move"]));
    const got = await mcp.request("prompts/get", {
      name: "finish-a-move",
      arguments: { site: "st_maya", from: "https://www.maya-yoga.com" },
    });
    const text = ((got.result?.messages ?? []) as Array<{ content: { text: string } }>)[0]?.content
      .text;
    expect(text).toContain(
      "finish moving my site https://www.maya-yoga.com to OpenSpace (site st_maya)",
    );
    expect(text).toContain("screenshot_url");
    expect(text).toContain("phone_check");
    expect(text).toContain("ask me before you publish");
  });
});
