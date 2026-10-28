import { expect, test } from "@playwright/test";
import { Hub, homePage, unique } from "../support/hub";
import { McpClient } from "../support/mcp";
import { canvas, closeChecklist, openEditor, signIn } from "../support/studio";

// Mobile excellence: the Phone check measures pages as a phone and "Fix for phones" fixes them
// without touching desktop — in Studio's phone preview, in the Design check and through MCP.

type Issue = { id: string; rule: string; severity: string; autofix: string | null };

/** A Meadow site whose first stack section keeps two squeezed text columns on phones. */
async function setup() {
  const owner = await Hub.login(unique("Rosa Diaz"));
  const site = await owner.createSite({ name: unique("Diaz Studio"), template: "meadow" });
  const { document: doc } = await owner.draft(site.id);
  const home = homePage(doc);
  const section = home.sections.find((s) => s.layout.mode === "stack");
  if (!section) throw new Error("no stack section");
  const abc = "0123456789abcdefghjkmnpqrstvwxyz";
  const blockId = `blk_${Array.from({ length: 10 }, () => abc[Math.floor(Math.random() * 32)]).join("")}`;
  const long =
    "We keep classes small so every teacher knows every name, and we start every class slowly enough that nobody is left behind on the first cold morning of the week.";
  const meta = () => ({
    id: `e2e-${Date.now()}-${Math.random()}`,
    actor: `user:${owner.user.id}`,
    ts: Date.now(),
  });
  await owner.ops(site.id, [
    {
      ...meta(),
      op: "section.update",
      page: home.id,
      section: section.id,
      set: { "layout.columns": { d: [6, 6], m: [4, 8] } },
    },
    {
      ...meta(),
      op: "block.insert",
      page: home.id,
      section: section.id,
      at: "end",
      block: {
        id: blockId,
        type: "text",
        v: 1,
        column: 0,
        fields: {
          content: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: long }] }],
          },
        },
      },
    },
  ]);
  return { owner, site, homeId: home.id, sectionId: section.id };
}

test("phone_check finds phone problems and fix_for_phones fixes them (Hub / MCP)", async () => {
  const { owner, site } = await setup();
  const { token } = await owner.post<{ token: { url: string } }>(
    `/api/sites/${site.id}/mcp/tokens`,
    {
      label: "e2e phone check",
    },
  );
  const mcp = new McpClient(token.url, null);
  await mcp.initialize();
  const before = (await mcp.ok("phone_check", { site: site.id, page: "Home" })) as {
    issues: Issue[];
  };
  expect(before.issues.map((i) => i.rule)).toContain("phone-columns");
  const fixed = (await mcp.ok("fix_for_phones", { site: site.id, page: "Home" })) as {
    fixed: string[];
  };
  expect(fixed.fixed).toContain("Stack the columns on phones");
  const after = (await mcp.ok("phone_check", { site: site.id, page: "Home" })) as {
    issues: Issue[];
  };
  expect(after.issues.map((i) => i.rule)).not.toContain("phone-columns");
  await mcp.end();
  await owner.dispose();
});

test("Studio's phone preview measures the page and Fix for phones keeps desktop as designed", async ({
  page,
  context,
}) => {
  const { owner, site, sectionId } = await setup();
  await signIn(context, owner.user.name);
  await openEditor(page, site.id);
  await closeChecklist(page);
  await page.getByRole("radio", { name: /Mobile|Phone/ }).click();
  const bar = page.getByTestId("phone-check");
  await expect(bar).toBeVisible();
  await expect(bar).toContainText(/work well on phones/);
  // The probe ran inside the canvas (served same-origin under Studio's CSP).
  await expect
    .poll(() =>
      page.evaluate(() => {
        const f = document.querySelector<HTMLIFrameElement>('iframe[title="Page canvas"]');
        return typeof (f?.contentWindow as { __osPhoneProbe?: unknown } | null)?.__osPhoneProbe;
      }),
    )
    .toBe("function");
  await expect(canvas(page).locator(`[data-os-id="${sectionId}"]`)).toBeVisible();
  await bar.getByRole("button", { name: "Fix for phones" }).click();
  await expect(bar).toContainText("Looks great on phones");
  await expect
    .poll(async () => {
      const s = homePage((await owner.draft(site.id)).document).sections.find(
        (x) => x.id === sectionId,
      );
      return JSON.stringify(s?.layout.mode === "stack" ? s.layout.columns : null);
    })
    .toBe(JSON.stringify({ d: [6, 6], m: [12] }));
  await owner.dispose();
});
