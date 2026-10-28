import { env } from "cloudflare:test";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { redactSecrets } from "../src/lib/log";
import { isPrivateAddress } from "../src/mcp/ssrf";
import { MCP_BURST, MCP_DAILY_OPS, MCP_INIT_RATE, MCP_MAX_SESSIONS } from "../src/mcp/transport";
import { runScheduled } from "../src/scheduled";
import { MemoryRateLimiter } from "../src/services/rate-limit";
import { call, devLogin } from "./helpers";
import { HUB, McpTestClient, oauthConnect, REDIRECT, STUDIO_ORIGIN, toolText } from "./mcp-helpers";
import { addMember, createSite, RoomClient, room, T, userId } from "./room-helpers";

function textOf(doc: SiteDocument, blockId: string): string {
  for (const page of Object.values(doc.pages))
    for (const s of page.sections)
      for (const b of s.blocks) if (b.id === blockId) return JSON.stringify(b.fields);
  return "";
}

async function setupMcp(options: Parameters<typeof createApp>[0] = {}) {
  const limiter = new MemoryRateLimiter();
  const app = createApp({
    ...options,
    services: { ...options.services, public: { rateLimit: limiter, ...options.services?.public } },
  });
  const owner = await devLogin(app, "Maya Lin");
  const site = await createSite(app, owner, "Maya Yoga");
  return { app, owner, site, limiter };
}

describe("OAuth authorization server", () => {
  it("publishes discovery metadata and challenges unauthenticated MCP calls", async () => {
    const { app } = await setupMcp();
    const prm = await call(app, `${HUB}/.well-known/oauth-protected-resource`);
    expect(prm.status).toBe(200);
    expect(await prm.json()).toMatchObject({
      resource: `${HUB}/mcp`,
      authorization_servers: [HUB],
    });
    const asm = await call(app, `${HUB}/.well-known/oauth-authorization-server`);
    expect(asm.status).toBe(200);
    const meta = (await asm.json()) as Record<string, unknown>;
    expect(meta).toMatchObject({
      issuer: HUB,
      authorization_endpoint: `${HUB}/authorize`,
      token_endpoint: `${HUB}/token`,
      registration_endpoint: `${HUB}/register`,
    });
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);

    const res = await call(app, `${HUB}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(
      `resource_metadata="${HUB}/.well-known/oauth-protected-resource/mcp"`,
    );
    const bad = await call(app, `${HUB}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer nope" },
      body: "{}",
    });
    expect(bad.status).toBe(401);
    expect(bad.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("asks a signed-out person to sign in, then shows per-site consent", async () => {
    const { app, owner, site } = await setupMcp();
    const other = await createSite(app, owner, "Riverbend Collective");
    const reg = await call(app, `${HUB}/register`, {
      method: "POST",
      json: {
        client_name: "Claude",
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: "none",
      },
    });
    const { client_id } = (await reg.json()) as { client_id: string };
    const q = new URLSearchParams({
      response_type: "code",
      client_id,
      redirect_uri: REDIRECT,
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      code_challenge_method: "S256",
      state: "s1",
    });
    const signedOut = await call(app, `${HUB}/authorize?${q}`);
    expect(signedOut.status).toBe(200);
    const signIn = await signedOut.text();
    expect(signIn).toContain("Sign in to connect Claude");
    expect(signIn).toContain('action="/authorize/dev-login"');
    expect(signedOut.headers.get("x-frame-options")).toBe("DENY");
    // "no-referrer" would make browsers post these forms with `Origin: null` (refused below).
    expect(signedOut.headers.get("referrer-policy")).toBe("same-origin");

    // Dev sign-in on the flow sends the person back to the same authorize URL.
    const login = await call(app, `${HUB}/authorize/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: HUB },
      body: new URLSearchParams({ name: "Maya Lin", return: `${HUB}/authorize?${q}` }).toString(),
    });
    expect(login.status).toBe(303);
    expect(login.headers.get("location")).toBe(`${HUB}/authorize?${q}`);
    const evil = await call(app, `${HUB}/authorize/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: HUB },
      body: new URLSearchParams({ name: "Maya Lin", return: "https://evil.example/" }).toString(),
    });
    expect(evil.status).toBe(400);

    const consent = await (await call(app, `${HUB}/authorize?${q}`, { cookie: owner })).text();
    expect(consent).toContain("Allow Claude to work on your sites?");
    expect(consent).toContain("Maya Yoga");
    expect(consent).toContain("Riverbend Collective");
    expect(consent).toContain(`value="${site.id}"`);
    expect(consent).toContain(`value="${other.id}"`);
    expect(consent).toContain("Allow publishing");
    expect(consent).not.toMatch(/name="publish" value="1" checked/);

    // Cancel → access_denied back to the client, with its state.
    const handle = /name="handle" value="([^"]+)"/.exec(consent)?.[1] as string;
    const denied = await call(app, `${HUB}/authorize`, {
      method: "POST",
      cookie: owner,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: HUB },
      body: new URLSearchParams({ handle, action: "deny" }).toString(),
    });
    expect(denied.status).toBe(302);
    const to = new URL(denied.headers.get("location") as string);
    expect(to.searchParams.get("error")).toBe("access_denied");
    expect(to.searchParams.get("state")).toBe("s1");
    // The handle was single-use.
    const again = await call(app, `${HUB}/authorize`, {
      method: "POST",
      cookie: owner,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: HUB },
      body: new URLSearchParams({ handle, action: "allow", site: site.id }).toString(),
    });
    expect(again.status).toBe(400);
    // Another origin can't post the consent form.
    const forged = await call(app, `${HUB}/authorize`, {
      method: "POST",
      cookie: owner,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://evil.example",
      },
      body: new URLSearchParams({ handle, action: "allow", site: site.id }).toString(),
    });
    expect(forged.status).toBe(403);
  });

  it("runs the full PKCE dance and grants only the chosen sites", async () => {
    const { app, owner, site } = await setupMcp();
    const other = await createSite(app, owner, "Riverbend Collective");
    const conn = await oauthConnect(app, owner, { sites: [site.id] });
    expect(conn.back.searchParams.get("state")).toBe("st-123");
    expect(conn.back.searchParams.get("iss")).toBe(HUB);
    expect(conn.accessToken).toBeTruthy();
    expect(conn.refreshToken).toBeTruthy();

    const grants = await call(app, "/api/mcp/grants", { cookie: owner });
    const { grants: list } = (await grants.json()) as {
      grants: Array<{
        id: string;
        clientName: string;
        sites: Array<{ id: string }>;
        publish: boolean;
      }>;
    };
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      clientName: "Claude",
      publish: false,
      sites: [{ id: site.id }],
    });

    // Refresh tokens rotate and keep the same connection.
    const refreshed = await call(app, `${HUB}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refreshToken as string,
        client_id: conn.clientId,
      }).toString(),
    });
    expect(refreshed.status).toBe(200);
    const next = (await refreshed.json()) as { access_token: string };
    expect(next.access_token).not.toBe(conn.accessToken);

    const mcp = new McpTestClient(app, `${HUB}/mcp`, next.access_token);
    await mcp.initialize();
    const sites = await mcp.tool("list_sites");
    expect(toolText(sites)).toContain(site.id);
    const reachable = (sites.result?.structuredContent?.sites ?? []) as Array<{ id: string }>;
    expect(reachable.map((s) => s.id)).not.toContain(other.id);
    // The other site is named with a one-click way to share it — not silently hidden.
    expect(sites.result?.structuredContent?.notShared).toMatchObject([{ id: other.id }]);
    const denied = await mcp.tool("get_site", { site: other.id });
    expect(denied.result?.isError).toBe(true);

    // A wrong PKCE verifier can't redeem the code.
    const tampered = await oauthConnect(app, owner, {
      sites: [site.id],
      wrongVerifier: true,
    }).catch((e: Error) => e);
    expect(tampered).toBeInstanceOf(Error);
    expect((tampered as Error).cause).toBe(400);

    const row = await env.HUB_DB.prepare("SELECT role FROM mcp_grants WHERE connection_id = ?")
      .bind(conn.connectionId)
      .first<{ role: string }>();
    expect(row?.role).toBe("owner");
  });
});

describe("MCP over Streamable HTTP", () => {
  it("keeps one session, edits reach the DraftRoom as the agent, publish needs grant + confirm", async () => {
    const { app, owner, site } = await setupMcp();
    const conn = await oauthConnect(app, owner, { sites: [site.id] });
    const studio = await RoomClient.connect(app, site.id, owner);

    const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    const init = await mcp.initialize();
    expect(init.protocolVersion).toBe("2025-06-18");
    expect(mcp.sessionId).toMatch(/^mcps_/);

    // Requests without the session id are refused; unknown ids are 404.
    const noSession = await call(app, `${HUB}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${conn.accessToken}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }),
    });
    expect(noSession.status).toBe(400);
    const unknown = await call(app, `${HUB}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${conn.accessToken}`,
        "Mcp-Session-Id": "mcps_unknown",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }),
    });
    expect(unknown.status).toBe(404);
    expect(
      (await call(app, `${HUB}/mcp`, { headers: { Authorization: `Bearer ${conn.accessToken}` } }))
        .status,
    ).toBe(405);

    const tools = await mcp.request("tools/list");
    const names = ((tools.result?.tools ?? []) as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(["get_site", "update_block", "publish", "upload_image"]),
    );

    // Two edits in two requests: one agent session, one snapshot.
    const e1 = await mcp.tool("update_block", {
      page: T.home,
      block: T.heroTitle,
      set: { content: "# Breathe in the morning" },
    });
    expect(e1.result?.isError, toolText(e1)).toBeFalsy();
    const e2 = await mcp.tool("update_block", {
      page: T.home,
      block: T.heroLead,
      set: { content: "Classes by the river, every weekday." },
    });
    expect(e2.result?.isError, toolText(e2)).toBeFalsy();
    const opMsgs = await studio.waitFor((m) => studio.of("op").length >= 2 && m.type === "op");
    expect(opMsgs).toBeTruthy();
    const ops = studio.of("op");
    expect(ops.every((o) => o.kind === "agent")).toBe(true);
    expect(new Set(ops.map((o) => o.actor)).size).toBe(1);
    expect(ops[0]?.actor).toMatch(/^agent:/);
    const presence = studio.of("presence").at(-1);
    expect(
      presence?.members.some(
        (m) => m.kind === "agent" && m.activity?.includes("Claude is editing"),
      ),
    ).toBe(true);

    const doc = (await room(site.id).getDocument(site.id)) as {
      ok: true;
      value: { doc: SiteDocument };
    };
    expect(textOf(doc.value.doc, T.heroTitle)).toContain("Breathe in the morning");
    const sessions = await env.HUB_DB.prepare(
      "SELECT agent_sessions FROM mcp_sessions WHERE id = ?",
    )
      .bind(mcp.sessionId)
      .first<{ agent_sessions: string }>();
    const refs = JSON.parse(sessions?.agent_sessions ?? "{}") as Record<
      string,
      { snapshot: string }
    >;
    expect(Object.keys(refs)).toEqual([site.id]);
    expect(refs[site.id]?.snapshot).toMatch(/^os\/snap\/agent-/);
    const snaps = await env.HUB_DB.prepare(
      "SELECT COUNT(*) AS n FROM dev_refs WHERE ref LIKE 'refs/tags/os/snap/agent-%' AND repo = ?",
    )
      .bind(site.repo)
      .first<{ n: number }>();
    expect(snaps?.n).toBe(1);

    // A rejected edit changes nothing and says why.
    const bad = await mcp.tool("update_block", { page: T.home, block: "blk_nope000000", set: {} });
    expect(bad.result?.isError).toBe(true);

    // Publish: refused without confirm, then without the grant's publish permission.
    const noConfirm = await mcp.tool("publish", {});
    expect(noConfirm.result?.isError).toBe(true);
    const noGrant = await mcp.tool("publish", { confirm: true });
    expect(noGrant.result?.isError).toBe(true);
    expect(toolText(noGrant)).toContain("isn't allowed to publish");

    // The owner allows publishing in Studio; the same session can now publish (with confirm).
    const patched = await call(app, `/api/mcp/grants/${conn.connectionId}`, {
      method: "PATCH",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
      json: { publish: true },
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { grant: { publish: boolean } }).grant.publish).toBe(true);
    const published = await mcp.tool("publish", { confirm: true });
    expect(published.result?.isError, toolText(published)).toBeFalsy();
    const frame = await studio.waitFor((m) => m.type === "published");
    expect(frame).toMatchObject({ actor: { kind: "agent", name: "Claude" } });

    // Ending the MCP session ends the agent session → Studio's Accept/Undo banner.
    const del = await mcp.close();
    expect(del.status).toBe(204);
    const ended = await studio.waitFor((m) => m.type === "agent_session_ended");
    expect(ended).toMatchObject({ ops: 2, reason: "ended", label: "Claude" });
    const after = await mcp.request("tools/list").catch((e: Error) => e.message);
    expect(String(after)).toContain("404");
    studio.close();
  });

  it("revoking a connection cuts it off immediately", async () => {
    const { app, owner, site } = await setupMcp();
    const conn = await oauthConnect(app, owner, { sites: [site.id] });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    await mcp.initialize();
    const del = await call(app, `/api/mcp/grants/${conn.connectionId}`, {
      method: "DELETE",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
    });
    expect(del.status).toBe(200);
    const res = await mcp.post({ jsonrpc: "2.0", id: 5, method: "tools/list" });
    expect(res.status).toBe(401);
    const list = (await (await call(app, "/api/mcp/grants", { cookie: owner })).json()) as {
      grants: unknown[];
    };
    expect(list.grants).toHaveLength(0);
    // Its OAuth grant is gone too: the refresh token no longer works.
    const refreshed = await call(app, `${HUB}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refreshToken as string,
        client_id: conn.clientId,
      }).toString(),
    });
    expect(refreshed.status).toBe(400);
  });

  it("follows the person's role per site (editor can't restyle; contributor sites are not offered)", async () => {
    const { app, owner, site } = await setupMcp();
    const ana = await devLogin(app, "Ana Ruiz");
    const anaId = await userId(app, ana);
    await addMember(site.id, anaId, "editor");
    const own = await createSite(app, ana, "Ana Studio");
    const third = await createSite(app, owner, "Third");
    await addMember(third.id, anaId, "contributor");
    const conn = await oauthConnect(app, ana, { sites: [site.id, own.id, third.id] });
    const granted = await env.HUB_DB.prepare(
      "SELECT site_id, role FROM mcp_grants WHERE connection_id = ? ORDER BY role",
    )
      .bind(conn.connectionId)
      .all<{ site_id: string; role: string }>();
    expect(granted.results.map((r) => r.site_id).sort()).toEqual([site.id, own.id].sort());
    const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    await mcp.initialize();
    const styled = await mcp.tool("set_styles", { site: site.id, choices: { shape: "round" } });
    expect(styled.result?.isError).toBe(true);
    const ownStyled = await mcp.tool("discard_draft", { site: own.id, confirm: true });
    expect(ownStyled.result?.isError, toolText(ownStyled)).toBeFalsy();
    const discard = await mcp.tool("discard_draft", { site: site.id, confirm: true });
    expect(discard.result?.isError).toBe(true);
  });

  it("answers with SSE when the client only accepts event streams", async () => {
    const { app, owner, site } = await setupMcp();
    const conn = await oauthConnect(app, owner, { sites: [site.id] });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    await mcp.initialize();
    const res = await mcp.post(
      { jsonrpc: "2.0", id: 77, method: "ping" },
      { Accept: "text/event-stream" },
    );
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text).toMatch(/^event: message\ndata: \{"jsonrpc":"2.0","id":77,"result":\{\}\}\n\n$/);
  });
});

describe("personal access tokens", () => {
  it("creates a link shown once, works as /mcp/t/<token>, records use, and can be revoked", async () => {
    const { app, owner, site } = await setupMcp();
    const created = await call(app, `/api/sites/${site.id}/mcp/tokens`, {
      method: "POST",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
      json: { label: "Claude Desktop" },
    });
    expect(created.status).toBe(201);
    const { token } = (await created.json()) as {
      token: { id: string; label: string; url: string; createdAt: string; lastUsedAt: null };
    };
    expect(token).toMatchObject({ label: "Claude Desktop", lastUsedAt: null });
    expect(token.url).toMatch(new RegExp(`^${HUB}/mcp/t/osmcp_`));
    const secret = token.url.split("/mcp/t/")[1] as string;
    const stored = await env.HUB_DB.prepare("SELECT token_hash FROM mcp_connections WHERE id = ?")
      .bind(token.id)
      .first<{ token_hash: string }>();
    expect(stored?.token_hash).not.toContain(secret);

    const mcp = new McpTestClient(app, new URL(token.url).pathname, null);
    await mcp.initialize();
    const got = await mcp.tool("get_site", {});
    expect(got.result?.isError, toolText(got)).toBeFalsy();
    expect(toolText(got)).toContain("Maya Yoga");

    const list = (await (
      await call(app, `/api/sites/${site.id}/mcp/tokens`, { cookie: owner })
    ).json()) as { tokens: Array<{ id: string; url: string; lastUsedAt: string | null }> };
    expect(list.tokens).toHaveLength(1);
    expect(list.tokens[0]?.url).not.toContain(secret);
    expect(list.tokens[0]?.lastUsedAt).toBeTruthy();

    const revoked = await call(app, `/api/sites/${site.id}/mcp/tokens/${token.id}`, {
      method: "DELETE",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
    });
    expect(revoked.status).toBe(200);
    const res = await mcp.post({ jsonrpc: "2.0", id: 3, method: "tools/list" });
    expect(res.status).toBe(401);
  });

  it("a link is draft-only until the owner explicitly allows it to publish (and can take it back)", async () => {
    const { app, owner, site } = await setupMcp();
    const made = await call(app, `/api/sites/${site.id}/mcp/tokens`, {
      method: "POST",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
      json: { label: "Laptop" },
    });
    const { token } = (await made.json()) as {
      token: { id: string; url: string; publish: boolean };
    };
    expect(token.publish).toBe(false);
    const mcp = new McpTestClient(app, new URL(token.url).pathname, null);
    await mcp.initialize();
    await mcp.tool("update_block", { page: T.home, block: T.heroTitle, set: { content: "# Hi" } });
    const refused = await mcp.tool("publish", { confirm: true });
    expect(toolText(refused)).toContain("isn't allowed to publish");
    expect(toolText(await mcp.tool("get_site", {}))).toContain('"canPublish": false');

    // An editor can't flip it — only the owner.
    const ana = await devLogin(app, "Ana Ruiz");
    await addMember(site.id, await userId(app, ana), "editor");
    const anaLink = await call(app, `/api/sites/${site.id}/mcp/tokens`, {
      method: "POST",
      cookie: ana,
      headers: { Origin: STUDIO_ORIGIN },
      json: { label: "Ana", publish: true },
    });
    expect(anaLink.status).toBe(403);

    const allow = await call(app, `/api/sites/${site.id}/mcp/tokens/${token.id}`, {
      method: "PATCH",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
      json: { publish: true },
    });
    expect(allow.status).toBe(200);
    expect(((await allow.json()) as { token: { publish: boolean } }).token.publish).toBe(true);
    const published = await mcp.tool("publish", { confirm: true });
    expect(published.result?.isError, toolText(published)).toBeFalsy();

    const revoke = await call(app, `/api/sites/${site.id}/mcp/tokens/${token.id}`, {
      method: "PATCH",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
      json: { publish: false },
    });
    expect(revoke.status).toBe(200);
    await mcp.tool("update_block", { page: T.home, block: T.heroTitle, set: { content: "# Yo" } });
    expect(toolText(await mcp.tool("publish", { confirm: true }))).toContain(
      "isn't allowed to publish",
    );
  });

  it("contributors can't make one", async () => {
    const { app, site } = await setupMcp();
    const ana = await devLogin(app, "Ana Ruiz");
    await addMember(site.id, await userId(app, ana), "contributor");
    const res = await call(app, `/api/sites/${site.id}/mcp/tokens`, {
      method: "POST",
      cookie: ana,
      headers: { Origin: STUDIO_ORIGIN },
      json: { label: "x" },
    });
    expect(res.status).toBe(403);
  });
});

describe("limits", () => {
  it("surfaces the daily limit and bursts as tool errors", async () => {
    const { app, owner, site, limiter } = await setupMcp();
    const conn = await oauthConnect(app, owner, { sites: [site.id] });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    await mcp.initialize();
    expect((await mcp.tool("get_site", {})).result?.isError).toBeFalsy();

    const day = new Date().toISOString().slice(0, 10);
    await env.HUB_DB.prepare(
      "UPDATE mcp_usage SET count = ? WHERE connection_id = ? AND period = ?",
    )
      .bind(MCP_DAILY_OPS, conn.connectionId, day)
      .run();
    const limited = await mcp.tool("get_site", {});
    expect(limited.result?.isError).toBe(true);
    expect(limited.result?.structuredContent).toMatchObject({ error: { code: "quota_exceeded" } });
    // Non-tool requests still work.
    expect((await mcp.request("ping")).result).toEqual({});

    await env.HUB_DB.prepare("DELETE FROM mcp_usage").run();
    for (let i = 0; i < MCP_BURST.limit; i++)
      await limiter.hit(`mcp|${conn.connectionId}`, MCP_BURST);
    const burst = await mcp.tool("get_site", {});
    expect(burst.result?.isError).toBe(true);
    expect(burst.result?.structuredContent).toMatchObject({ error: { code: "rate_limited" } });
  });

  it("ends idle sessions from the minute cron", async () => {
    const { app, owner, site } = await setupMcp();
    const conn = await oauthConnect(app, owner, { sites: [site.id] });
    const studio = await RoomClient.connect(app, site.id, owner);
    const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    await mcp.initialize();
    const e = await mcp.tool("update_block", {
      page: T.home,
      block: T.heroTitle,
      set: { content: "Idle test" },
    });
    expect(e.result?.isError, toolText(e)).toBeFalsy();
    await env.HUB_DB.prepare("UPDATE mcp_sessions SET last_seen_at = ? WHERE id = ?")
      .bind(Date.now() - 31 * 60 * 1000, mcp.sessionId)
      .run();
    await runScheduled(env as never, Date.now());
    const ended = await studio.waitFor((m) => m.type === "agent_session_ended");
    expect(ended).toMatchObject({ reason: "idle", ops: 1 });
    const res = await mcp.post({ jsonrpc: "2.0", id: 4, method: "tools/list" });
    expect(res.status).toBe(404);
    studio.close();
  });
});

describe("fix round 1", () => {
  it("MCP rollback needs designer+ even with publishing allowed", async () => {
    const { app, owner, site } = await setupMcp();
    const ana = await devLogin(app, "Ana Ruiz");
    const anaId = await userId(app, ana);
    await addMember(site.id, anaId, "editor");
    const conn = await oauthConnect(app, ana, { sites: [site.id], publish: true });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    await mcp.initialize();
    const versions = (await mcp.tool("list_versions", {})).result?.structuredContent as {
      versions: Array<{ version: string }>;
    };
    const target = versions.versions[0]?.version as string;
    const r = await mcp.tool("rollback", { version: target, confirm: true });
    expect(r.result?.isError).toBe(true);
    expect(r.result?.structuredContent).toMatchObject({ error: { code: "forbidden" } });
    // The room refuses it too (defense in depth).
    const direct = await room(site.id).rollback(site.id, { userId: anaId, sha: target });
    expect(direct).toMatchObject({ ok: false, error: { status: 403 } });
    void owner;
  });

  it("counts upload_image before fetching (no work once the quota is spent)", async () => {
    let fetched = 0;
    const { app, owner, site } = await setupMcp({
      services: {
        fetch: async () => {
          fetched++;
          return new Response("x", { status: 404 });
        },
      },
    });
    await env.HUB_DB.prepare("UPDATE sites SET plan_flags = ? WHERE id = ?")
      .bind(JSON.stringify({ quotas: { mcpOperations: 0 } }), site.id)
      .run();
    const conn = await oauthConnect(app, owner, { sites: [site.id] });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    await mcp.initialize();
    const r = await mcp.tool("upload_image", { url: "https://images.example.com/a.png", alt: "x" });
    expect(r.result?.isError).toBe(true);
    expect(r.result?.structuredContent).toMatchObject({ error: { code: "quota_exceeded" } });
    expect(fetched).toBe(0);
  });

  it("never logs a personal token in full", async () => {
    const { app, owner, site } = await setupMcp();
    const created = await call(app, `/api/sites/${site.id}/mcp/tokens`, {
      method: "POST",
      cookie: owner,
      headers: { Origin: STUDIO_ORIGIN },
      json: { label: "Claude" },
    });
    const { token } = (await created.json()) as { token: { url: string } };
    const secret = token.url.split("/mcp/t/")[1] as string;
    const lines: string[] = [];
    const spies = (["log", "warn", "error"] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation((...a: unknown[]) => {
        lines.push(a.map(String).join(" "));
      }),
    );
    try {
      const bindings = { ...(env as unknown as Record<string, unknown>), LOG_LEVEL: "debug" };
      await call(app, new URL(token.url).pathname, { method: "POST", json: {} }, bindings);
      await call(app, `${new URL(token.url).pathname}x`, { method: "GET" }, bindings);
    } finally {
      for (const s of spies) s.mockRestore();
    }
    const all = lines.join("\n");
    expect(all).toContain("/mcp/t/osmcp_…");
    expect(all).not.toContain(secret.slice(6, 20));
    expect(redactSecrets("GET /mcp/t/abcdefghij123456 x")).toBe("GET /mcp/t/…3456 x");
    expect(redactSecrets(`GET /mcp/t/${secret}?x=1`)).toBe(
      `GET /mcp/t/osmcp_…${secret.slice(-4)}?x=1`,
    );
  });
});

describe("fix round 1 minors", () => {
  it("validates Origin, keeps the negotiated version, caps sessions and limits initialize", async () => {
    const { app, owner, site, limiter } = await setupMcp();
    const conn = await oauthConnect(app, owner, { sites: [site.id] });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    await mcp.initialize();
    expect(
      (
        await mcp.post(
          { jsonrpc: "2.0", id: 1, method: "ping" },
          { Origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    expect(
      (await mcp.post({ jsonrpc: "2.0", id: 2, method: "ping" }, { Origin: "https://claude.ai" }))
        .status,
    ).toBe(200);
    expect(
      (
        await mcp.post(
          { jsonrpc: "2.0", id: 3, method: "ping" },
          { Origin: "http://localhost:6274" },
        )
      ).status,
    ).toBe(200);
    const mismatch = await mcp.post(
      { jsonrpc: "2.0", id: 4, method: "ping" },
      { "MCP-Protocol-Version": "2025-03-26" },
    );
    expect(mismatch.status).toBe(400);
    expect(
      (
        await mcp.post(
          { jsonrpc: "2.0", id: 5, method: "ping" },
          { "MCP-Protocol-Version": "2025-06-18" },
        )
      ).status,
    ).toBe(200);

    // A body without Content-Length is still capped.
    const big = new ReadableStream<Uint8Array>({
      start(ctrl) {
        const chunk = new Uint8Array(1024 * 1024).fill(32);
        for (let i = 0; i < 26; i++) ctrl.enqueue(chunk);
        ctrl.close();
      },
    });
    const huge = await app.request(
      `${HUB}/mcp`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${conn.accessToken}`,
          "Mcp-Session-Id": mcp.sessionId as string,
        },
        body: big,
        // @ts-expect-error workerd needs half-duplex for streamed bodies
        duplex: "half",
      },
      env,
    );
    expect(huge.status).toBe(413);

    // At most MCP_MAX_SESSIONS live sessions: the least recently used one ends.
    const first = mcp.sessionId;
    for (let i = 0; i < MCP_MAX_SESSIONS; i++) {
      const extra = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
      await extra.initialize();
    }
    const live = await env.HUB_DB.prepare(
      "SELECT COUNT(*) AS n FROM mcp_sessions WHERE connection_id = ? AND ended_at IS NULL",
    )
      .bind(conn.connectionId)
      .first<{ n: number }>();
    expect(live?.n).toBe(MCP_MAX_SESSIONS);
    const ended = await env.HUB_DB.prepare("SELECT ended_at FROM mcp_sessions WHERE id = ?")
      .bind(first)
      .first<{ ended_at: number | null }>();
    expect(ended?.ended_at).not.toBeNull();

    for (let i = 0; i < MCP_INIT_RATE.limit; i++)
      await limiter.hit(`mcp-init|${conn.connectionId}`, MCP_INIT_RATE);
    const limited = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    expect(await limited.initialize().catch((e: Error) => e.message)).toContain("429");
  });

  it("pre-checks a site only when there is one, and allows the client's redirect in form-action", async () => {
    const { app, owner, site } = await setupMcp();
    const reg = await call(app, `${HUB}/register`, {
      method: "POST",
      json: {
        client_name: "Claude",
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: "none",
      },
    });
    const { client_id } = (await reg.json()) as { client_id: string };
    const q = new URLSearchParams({
      response_type: "code",
      client_id,
      redirect_uri: REDIRECT,
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      code_challenge_method: "S256",
      state: "s",
    });
    const one = await call(app, `${HUB}/authorize?${q}`, { cookie: owner });
    expect(await one.text()).toContain(`value="${site.id}" checked`);
    expect(one.headers.get("content-security-policy")).toContain("http://localhost:6274");
    await createSite(app, owner, "Second");
    const two = await (await call(app, `${HUB}/authorize?${q}`, { cookie: owner })).text();
    expect(two).not.toMatch(/name="site" value="[^"]+" checked/);
  });

  it("applies an MCP discard as the agent session, with a keyed session id", async () => {
    const { app, owner, site } = await setupMcp();
    const conn = await oauthConnect(app, owner, { sites: [site.id] });
    const studio = await RoomClient.connect(app, site.id, owner);
    const mcp = new McpTestClient(app, `${HUB}/mcp`, conn.accessToken);
    await mcp.initialize();
    await mcp.tool("update_block", {
      page: T.home,
      block: T.heroTitle,
      set: { content: "Gone soon" },
    });
    const r = await mcp.tool("discard_draft", { confirm: true });
    expect(r.result?.isError, toolText(r)).toBeFalsy();
    await studio.waitFor((m) => studio.of("op").length >= 2 && m.type === "op");
    const ops = studio.of("op");
    expect(ops.every((o) => o.kind === "agent")).toBe(true);
    expect(ops[0]?.actor).not.toContain(String(mcp.sessionId).slice(-12));
    studio.close();
  });

  it("classifies 6to4, Teredo, discard-only and local NAT64 as private", () => {
    for (const a of [
      "2002:7f00:1::1",
      "2002:c0a8:101::1",
      "2001:0:4136:e378::1",
      "100::1",
      "64:ff9b:1::a00:1",
    ])
      expect(isPrivateAddress(a), a).toBe(true);
    expect(isPrivateAddress("2002:5db8:d822::1")).toBe(false);
    expect(isPrivateAddress("64:ff9b::5db8:d822")).toBe(false);
  });
});
