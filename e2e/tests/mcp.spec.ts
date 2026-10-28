import { expect, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { Hub, unique } from "../support/hub";
import {
  authorizeUrl,
  exchangeCode,
  MCP_REDIRECT,
  McpClient,
  pkce,
  registerClient,
  text,
} from "../support/mcp";
import { closeChecklist, openEditor, signIn } from "../support/studio";

// PRD §4.6 Claude / MCP (FR-40..FR-46): OAuth 2.1 + PKCE with dev sign-in and per-site consent,
// tools build a page, Studio shows "Claude is editing" and the Accept / Undo all banner; Undo all
// reverts. Personal token URLs work too.
let owner: Hub;
let siteId: string;

test.beforeEach(async () => {
  owner = await Hub.login(unique("Maya Lin"));
  siteId = (await owner.createSite({ name: unique("Maya Yoga"), template: "meadow" })).id;
});
test.afterEach(async () => owner?.dispose());

test("OAuth PKCE dance → tools build a five-section page → Studio banner → Undo all", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(150_000);
  // A second site the person does NOT grant.
  const other = await owner.createSite({
    name: unique("Riverbend Collective"),
    template: "meadow",
  });

  // 1. Register a public client and run authorize in a fresh browser (signed out of the Hub).
  const client = await registerClient("Claude");
  const { verifier, challenge } = pkce();
  const auth = await browser.newContext();
  const authPage = await auth.newPage();
  // Playwright routes don't see redirect hops, so watch for the request to the client's
  // callback (nothing listens there).
  let callback: URL | null = null;
  auth.on("request", (r) => {
    if (r.url().startsWith(MCP_REDIRECT)) callback = new URL(r.url());
  });
  await authPage.goto(authorizeUrl(client.client_id, challenge, "st-e2e"));
  await authPage.getByLabel(/Your name/).fill(owner.user.name);
  await authPage.getByRole("button", { name: "Continue" }).click();

  // Consent: one checkbox per site, publishing off by default.
  await expect(
    authPage.getByRole("heading", { name: "Allow Claude to work on your sites?" }),
  ).toBeVisible();
  const siteBox = authPage.locator(`input[name="site"][value="${siteId}"]`);
  const otherBox = authPage.locator(`input[name="site"][value="${other.id}"]`);
  await expect(siteBox).toBeVisible();
  await expect(otherBox).toBeVisible();
  const publish = authPage.locator('input[name="publish"]');
  await expect(publish).not.toBeChecked();
  await siteBox.check();
  await otherBox.uncheck();
  await authPage.getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => callback?.searchParams.get("state") ?? null).toBe("st-e2e");
  const got = callback as unknown as URL;
  expect(got.searchParams.get("iss")).toBe(HUB_URL);
  const tokens = await exchangeCode(
    client.client_id,
    got.searchParams.get("code") as string,
    verifier,
  );
  await auth.close();

  // 2. MCP over Streamable HTTP.
  const mcp = new McpClient(`${HUB_URL}/mcp`, tokens.access_token);
  await mcp.initialize();
  const { tools } = await mcp.request<{ tools: Array<{ name: string }> }>("tools/list");
  const names = tools.map((t) => t.name);
  for (const n of [
    "list_sites",
    "get_site",
    "create_page",
    "insert_section",
    "update_block",
    "publish",
  ])
    expect(names).toContain(n);
  const listed = await mcp.tool("list_sites");
  expect(text(listed)).toContain(siteId);
  const reachable = (listed.structuredContent?.sites ?? []) as Array<{ id: string }>;
  expect(reachable.map((s) => s.id)).not.toContain(other.id);
  expect((await mcp.tool("get_site", { site: other.id })).isError).toBe(true);

  // 3. Studio is open on the site while Claude works.
  await signIn(context, owner.user.name);
  await openEditor(page, siteId);
  await closeChecklist(page);
  const before = Object.keys((await owner.draft(siteId)).document.pages).length;

  const presets = (await mcp.ok("list_section_presets")) as {
    presets: Array<{ id: string; target: string }>;
  };
  const pick = (cat: string) =>
    presets.presets.find((p) => p.id.startsWith(`${cat}/`) && p.target === "page")?.id;
  const chosen = ["hero", "about", "testimonials", "faq", "contact"].map(pick);
  for (const c of chosen) expect(c).toBeTruthy();
  const created = await mcp.ok("create_page", {
    site: siteId,
    title: "Autumn Retreat",
    presets: [chosen[0]],
  });
  const pageRef =
    (created.page as { id?: string } | undefined)?.id ??
    (created.pageId as string) ??
    "Autumn Retreat";
  for (const preset of chosen.slice(1))
    await mcp.ok("insert_section", { site: siteId, page: pageRef, preset });
  // "Claude is editing …" while the agent is present.
  await expect(page.locator("output.st-agent-live")).toContainText(/is editing/);

  const draft = (await owner.draft(siteId)).document;
  const retreat = Object.values(draft.pages).find((p) => p.title === "Autumn Retreat");
  expect(retreat?.sections).toHaveLength(5);

  // 4. The session ends → banner with Accept / Undo all → Undo all reverts everything.
  await mcp.end();
  const banner = page.getByRole("region", { name: "Changes by Claude" });
  await expect(banner).toBeVisible({ timeout: 60_000 });
  await expect(banner).toContainText(/Claude made \d+ changes/);
  await banner.getByRole("button", { name: "Undo all" }).click();
  await expect(banner).toBeHidden();
  await expect
    .poll(async () => Object.keys((await owner.draft(siteId)).document.pages).length)
    .toBe(before);
  const after = (await owner.draft(siteId)).document;
  expect(Object.values(after.pages).some((p) => p.title === "Autumn Retreat")).toBe(false);
});

test("a personal token URL works as an MCP endpoint", async () => {
  const created = await owner.post<{ token: { id: string; url: string } }>(
    `/api/sites/${siteId}/mcp/tokens`,
    { label: "Claude Desktop" },
  );
  expect(created.token.url).toMatch(new RegExp(`^${HUB_URL}/mcp/t/`));
  const mcp = new McpClient(created.token.url, null);
  await mcp.initialize();
  expect(text(await mcp.tool("list_sites"))).toContain(siteId);
  const site = await mcp.ok("get_site", { site: siteId });
  expect(JSON.stringify(site)).toContain("Home");
  await mcp.end();

  // Listed masked in Studio's API, and revocable.
  const list = await owner.get<{ tokens: Array<{ id: string; url: string }> }>(
    `/api/sites/${siteId}/mcp/tokens`,
  );
  expect(list.tokens[0]?.url).not.toBe(created.token.url);
  await owner.del(`/api/sites/${siteId}/mcp/tokens/${created.token.id}`);
  const res = await fetch(created.token.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  expect(res.status).toBe(401);
});

test("screenshots work over the remote connector with no local browser (dev placeholder)", async () => {
  const created = await owner.post<{ token: { url: string } }>(`/api/sites/${siteId}/mcp/tokens`, {
    label: "Claude app",
  });
  const mcp = new McpClient(created.token.url, null);
  await mcp.initialize();
  const shot = await mcp.tool("screenshot", { site: siteId, page: "/", device: "all" });
  expect(shot.isError, text(shot)).toBeFalsy();
  const images = (shot.content ?? []).filter((c) => c.type === "image");
  expect(images).toHaveLength(3);
  expect(text(shot)).toMatch(/placeholder/);
  // The original site during a migration: private addresses are refused (SSRF guard).
  const blocked = await mcp.tool("screenshot_url", { url: "http://169.254.169.254/latest/" });
  expect(blocked.isError).toBe(true);
  // The site's own live page (on the dev Hub, its /s/ stand-in for GitHub Pages).
  const live = await mcp.tool("screenshot_url", { site: siteId, device: "mobile" });
  expect(live.isError, text(live)).toBeFalsy();
  await mcp.end();
});
