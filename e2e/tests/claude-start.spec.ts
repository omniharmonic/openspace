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
import { canvasReady, signIn } from "../support/studio";

// "Start with Claude" happens inside Claude: Studio hands off (connect once + a ready message),
// the consent offers "All my sites, including ones I make later", Claude makes the site with
// start_site (its own HTML), follows site_status until live, and can edit a site the person
// makes later in Studio. Turning "all my sites" off gives Claude a one-click Allow link instead
// of a dead end.

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Kiln &amp; Co</title>
<style>
:root{--clay:#a0522d;--ink:#2b1d14;--paper:#fbf6ef;--font-display:Georgia,serif}
*{box-sizing:border-box}body{margin:0;font:18px/1.6 system-ui,sans-serif;color:var(--ink);background:var(--paper)}
.hero{padding:72px 24px;text-align:center}.hero h1{font-family:var(--font-display);font-size:clamp(32px,6vw,56px);color:var(--clay);margin:0 0 12px}
.hero a{display:inline-block;min-height:44px;padding:12px 22px;border-radius:999px;background:var(--clay);color:#fff;text-decoration:none}
.classes{max-width:720px;margin:0 auto;padding:48px 24px}img{max-width:100%}
</style></head><body>
<section class="hero"><h1>Handmade pottery from our kiln</h1><p>Classes, commissions and a small shop in Leith.</p><a href="#classes">Book a class</a></section>
<section class="classes" id="classes"><h2>Classes for beginners</h2><p>Six people per class, all clay and glazes included. Saturday mornings and Wednesday evenings.</p></section>
</body></html>`;

let owner: Hub;
test.beforeEach(async () => {
  owner = await Hub.login(unique("Kiln Keeper"));
});
test.afterEach(async () => owner?.dispose());

test("Start with Claude in Claude: all my sites → start_site (bespoke HTML) → site_status → edit a site made later", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(180_000);

  // 1. Studio's Start with Claude is a hand-off: connect once, then a ready first message.
  await signIn(context, owner.user.name);
  await page.goto("/start");
  await expect(page.getByRole("heading", { name: "Start with Claude" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Connect OpenSpace to Claude \(once\)/ }),
  ).toBeVisible();
  const openClaude = page.getByRole("link", { name: /Open Claude with this message/ });
  await expect(openClaude).toHaveAttribute("href", /^https:\/\/claude\.ai\/new\?q=/);
  await expect(page.getByRole("link", { name: "Prefer a quick form instead?" })).toBeVisible();

  // 2. Connect: consent with "All my sites, including ones I make later".
  const client = await registerClient("Claude");
  const { verifier, challenge } = pkce();
  const auth = await browser.newContext();
  const authPage = await auth.newPage();
  let callback: URL | null = null;
  auth.on("request", (r) => {
    if (r.url().startsWith(MCP_REDIRECT)) callback = new URL(r.url());
  });
  await authPage.goto(authorizeUrl(client.client_id, challenge, "claude-start"));
  await authPage.getByLabel(/Your name/).fill(owner.user.name);
  await authPage.getByRole("button", { name: "Continue" }).click();
  await expect(
    authPage.getByRole("heading", { name: "Allow Claude to make your website?" }),
  ).toBeVisible();
  await expect(authPage.locator('input[name="create"]')).toBeChecked();
  await expect(authPage.locator('input[name="publish"]')).not.toBeChecked();
  await authPage.getByLabel(/All my sites, including ones I make later/).check();
  await authPage.getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => callback?.searchParams.get("state") ?? null).toBe("claude-start");
  const tokens = await exchangeCode(
    client.client_id,
    (callback as unknown as URL).searchParams.get("code") as string,
    verifier,
  );
  await auth.close();

  // Studio now knows Claude is connected and can make the site.
  await page.reload();
  await expect(page.getByRole("heading", { name: /Claude is connected/ })).toBeVisible();

  // 3. Claude leads: the instructions carry the whole flow.
  const mcp = new McpClient(`${HUB_URL}/mcp`, tokens.access_token);
  await mcp.initialize();
  const prompts = await mcp.request<{ prompts: Array<{ name: string }> }>("prompts/list");
  expect(prompts.prompts.map((p) => p.name)).toContain("start-a-site");

  // 4. After the conversation, Claude designs the page itself and makes the site.
  const name = unique("Kiln and Co");
  const made = await mcp.ok("start_site", {
    name,
    about: "A pottery studio in Leith with classes and commissions",
    audience: "Beginners who want to book a class",
    feeling: ["warm", "handmade"],
    html: PAGE,
  });
  const site = made.site as { id: string; url: string; studioUrl: string };
  expect(site.studioUrl).toMatch(new RegExp(`/sites/${site.id}\\?welcome=1$`));
  expect(["publishing", "live"]).toContain(made.status);
  expect(made.editorReady).toBe(true);

  // The Studio editor link works straight away.
  await page.goto(new URL(site.studioUrl).pathname + new URL(site.studioUrl).search);
  await canvasReady(page);

  // 5. site_status until live.
  await expect
    .poll(
      async () =>
        (await mcp.ok("site_status", { site: site.id, wait: 5 })).phase as string | undefined,
      { timeout: 90_000, intervals: [1000] },
    )
    .toBe("live");
  const live = await page.request.get(`${HUB_URL}/s/${site.id}/`);
  expect(live.status()).toBe(200);
  expect(await live.text()).toContain("Handmade pottery from our kiln");

  // 6. A site the person makes later in Studio is reachable at once ("all my sites").
  const later = await owner.createSite({ name: unique("Kiln Journal"), template: "meadow" });
  const listed = await mcp.ok("list_sites");
  expect((listed.sites as Array<{ id: string }>).map((s) => s.id)).toEqual(
    expect.arrayContaining([site.id, later.id]),
  );
  await mcp.ok("update_site", {
    site: later.id,
    set: { title: "Kiln Journal — notes from the studio" },
  });
  await expect
    .poll(async () => (await owner.draft(later.id)).document.site.title)
    .toBe("Kiln Journal — notes from the studio");

  // 7. Turn "all my sites" off in Studio → Claude gets an Allow link → one click → editing again.
  await page.goto("/connect");
  const allSwitch = page.getByRole("switch", {
    name: "Claude can edit all my sites, including ones I make later",
  });
  await expect(allSwitch).toBeChecked();
  await allSwitch.click();
  await expect(allSwitch).not.toBeChecked();
  const refused = await mcp.tool("get_site", { site: later.id });
  expect(refused.isError).toBe(true);
  const allowLink = /(https?:\/\/\S+\/connect\/allow\?\S+?)(?=\s|$)/.exec(text(refused))?.[1];
  expect(allowLink, text(refused)).toBeTruthy();
  await page.goto(new URL(allowLink as string).pathname + new URL(allowLink as string).search);
  await expect(page.getByRole("heading", { name: /Allow Claude to edit/ })).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByRole("heading", { name: /Claude can edit/ })).toBeVisible();
  const again = await mcp.tool("get_site", { site: later.id });
  expect(again.isError, text(again)).toBeFalsy();
  await mcp.end();
});
