import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { call, cookieFrom } from "./helpers";
import { HUB, McpTestClient, oauthConnect, REDIRECT, toolText } from "./mcp-helpers";

async function devLogin(app: ReturnType<typeof createApp>, name: string, installApp?: boolean) {
  const res = await call(app, "/auth/dev/login", {
    method: "POST",
    json: { name, ...(installApp === undefined ? {} : { installApp }) },
  });
  return cookieFrom(res);
}

async function consentHtml(app: ReturnType<typeof createApp>, cookie: string) {
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
  return (await call(app, `${HUB}/authorize?${q}`, { cookie })).text();
}

describe("remote MCP first run (no sites yet)", () => {
  it("consent works with zero sites and offers creating sites (checked)", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "First Run Fay");
    const html = await consentHtml(app, cookie);
    expect(html).toContain("Allow Claude to make your website?");
    expect(html).toMatch(/name="create" value="1" checked/);
    expect(html).not.toContain("No sites to connect");
  });

  it("list_sites is friendly when empty; create_site makes a site the connection can then edit", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Maker Mo");
    const { accessToken } = await oauthConnect(app, cookie, { sites: [], create: true });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, accessToken);
    await mcp.initialize();

    const empty = await mcp.tool("list_sites");
    expect(toolText(empty)).toContain("You don't have a site yet");
    expect(empty.result?.structuredContent).toMatchObject({ sites: [], canCreateSites: true });

    const templates = await mcp.tool("list_templates");
    const list = (templates.result?.structuredContent?.templates ?? []) as Array<{ id: string }>;
    expect(list.map((t) => t.id)).toContain("meadow");

    const made = await mcp.tool("create_site", {
      template: "basic",
      name: "Mo's Bakery",
      tagline: "Bread with care",
    });
    expect(made.result?.isError).toBeFalsy();
    const data = made.result?.structuredContent as {
      site: { id: string; status: string; studioUrl: string };
      needsGitHub: boolean;
    };
    expect(data.needsGitHub).toBe(false);
    // The editor link opens the first-run tour; it works straight away.
    expect(data.site.studioUrl).toBe(`http://localhost:5173/sites/${data.site.id}?welcome=1`);

    // The new site is now part of this connection.
    const after = await mcp.tool("list_sites");
    expect(
      ((after.result?.structuredContent?.sites ?? []) as Array<{ id: string }>).map((s) => s.id),
    ).toEqual([data.site.id]);
    const got = await mcp.tool("get_site", { site: data.site.id });
    expect(got.result?.isError).toBeFalsy();
  });

  it("create_site returns a Studio link when the GitHub install is still needed", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Install Ivy", false);
    const { accessToken } = await oauthConnect(app, cookie, { sites: [], create: true });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, accessToken);
    await mcp.initialize();
    const made = await mcp.tool("create_site", { template: "basic", name: "Ivy Studio" });
    const data = made.result?.structuredContent as {
      site: { id: string };
      needsGitHub: boolean;
      actionUrl: string;
    };
    expect(data.needsGitHub).toBe(true);
    expect(data.actionUrl).toBe(`http://localhost:5173/sites/${data.site.id}`);
    expect(toolText(made)).toContain("Connect GitHub");
  });

  it("a connection without the create permission can't create sites", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "No Create Ned");
    const site = (await (
      await call(app, "/api/sites", {
        method: "POST",
        cookie,
        json: { template: "basic", name: "Ned" },
      })
    ).json()) as { id: string };
    const { accessToken } = await oauthConnect(app, cookie, { sites: [site.id] });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, accessToken);
    await mcp.initialize();
    const res = await mcp.tool("create_site", { template: "basic", name: "Another" });
    expect(res.result?.isError).toBe(true);
    expect(toolText(res)).toContain("Create new sites");
  });

  it("refuses a consent with neither sites nor creating", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Nothing Nora");
    await expect(oauthConnect(app, cookie, { sites: [] })).rejects.toThrow(/consent 400/);
  });
});
