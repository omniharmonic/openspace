import { expect, test } from "@playwright/test";
import { Hub, homePage, unique } from "../support/hub";
import { McpClient } from "../support/mcp";
import { closeChecklist, openEditor, signIn } from "../support/studio";

// PRD §4.2 Design check (FR-18): issues are found and autofix works. The Hub side (the same lint
// rules through MCP design_check / apply_fix) and Studio's Design check panel (Task 26).
type Issue = { id: string; rule: string; severity: string; autofix: string | null };

async function setup() {
  const owner = await Hub.login(unique("Dana Reyes"));
  const site = await owner.createSite({ name: unique("Reyes Bakery"), template: "meadow" });
  // Introduce a problem: the second section's heading becomes a second Heading 1.
  const { document: doc } = await owner.draft(site.id);
  const home = homePage(doc);
  const heading = home.sections[1]?.blocks.find((b) => b.type === "heading");
  await owner.ops(site.id, [
    {
      id: `e2e-${Date.now()}`,
      actor: `user:${owner.user.id}`,
      ts: Date.now(),
      op: "block.update",
      page: home.id,
      block: heading?.id,
      set: { level: "h1" },
    },
  ]);
  return { owner, site };
}

test("design check finds issues and autofix resolves them (Hub / MCP)", async () => {
  const { owner, site } = await setup();
  const { token } = await owner.post<{ token: { url: string } }>(
    `/api/sites/${site.id}/mcp/tokens`,
    {
      label: "e2e design check",
    },
  );
  const mcp = new McpClient(token.url, null);
  await mcp.initialize();
  const before = (await mcp.ok("design_check", { site: site.id, page: "Home" })) as {
    issues: Issue[];
  };
  const fixable = before.issues.filter((i) => i.autofix);
  expect(before.issues.map((i) => i.rule)).toContain("heading-multiple-h1");
  expect(before.issues.length).toBeGreaterThan(0);
  expect(fixable.length, JSON.stringify(before.issues.map((i) => i.rule))).toBeGreaterThan(0);

  const fixed = (await mcp.ok("apply_fix", { site: site.id, issues: "all", page: "Home" })) as {
    applied: unknown[];
  };
  expect(fixed.applied.length).toBeGreaterThan(0);
  const after = (await mcp.ok("design_check", { site: site.id, page: "Home" })) as {
    issues: Issue[];
  };
  expect(after.issues.map((i) => i.rule)).not.toContain("heading-multiple-h1");
  expect(after.issues.filter((i) => i.autofix)).toHaveLength(0);
  await mcp.end();
  await owner.dispose();
});

test("Studio design check panel shows the issue and its autofix works", async ({
  page,
  context,
}) => {
  const { owner, site } = await setup();
  await signIn(context, owner.user.name);
  await openEditor(page, site.id);
  await closeChecklist(page);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Design check" })
    .click();
  const panel = page.getByTestId("design-check");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("second Heading 1");
  const fix = panel.getByRole("button", { name: "Change to Heading 2" });
  await fix.click();
  await expect(fix).toHaveCount(0);
  await expect(panel).not.toContainText("second Heading 1");
  // The fix is an ordinary edit: it reached the draft (and can be undone).
  const levels = async () =>
    homePage((await owner.draft(site.id)).document)
      .sections.flatMap((s) => s.blocks)
      .filter((b) => b.type === "heading")
      .map((b) => b.fields.level);
  await expect.poll(async () => (await levels()).filter((l) => l === "h1").length).toBe(1);
  await page.getByRole("banner").getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(async () => (await levels()).filter((l) => l === "h1").length).toBe(2);
  await owner.dispose();
});
