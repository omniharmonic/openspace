import { expect, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { allBlocks, Hub, unique } from "../support/hub";
import { McpClient } from "../support/mcp";
import { canvas, closeChecklist, livePage, openEditor, signIn } from "../support/studio";

// Custom components (ADR custom-components): Claude creates a designer section over MCP and places
// it; an editor changes its words in Studio's inspector (fields, never code) and can't touch its
// code; the owner publishes; the live page renders it with its scoped CSS and behaviour script.
let owner: Hub;
let editor: Hub;
let siteId: string;

test.beforeEach(async () => {
  owner = await Hub.login(unique("Maya Lin"));
  editor = await Hub.login(unique("Eli Park"));
  siteId = (await owner.createSite({ name: unique("Juniper Studio"), template: "meadow" })).id;
  await owner.addCollaborator(siteId, editor, "editor");
});
test.afterEach(async () => {
  await owner?.dispose();
  await editor?.dispose();
});

test("Claude creates and places a component; an editor edits its fields; publish renders it live", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);

  // 1. Claude (MCP over a personal token URL): a library design adapted, created, placed, previewed.
  const created = await owner.post<{ token: { url: string } }>(`/api/sites/${siteId}/mcp/tokens`, {
    label: "Claude",
  });
  const mcp = new McpClient(created.token.url, null);
  await mcp.initialize();
  const { tools } = await mcp.request<{ tools: Array<{ name: string }> }>("tools/list");
  const names = tools.map((t) => t.name);
  for (const n of [
    "list_components",
    "create_component",
    "update_component",
    "preview_component",
    "insert_component",
  ])
    expect(names).toContain(n);
  const library = (await mcp.ok("list_components", { site: siteId })) as {
    library: Array<{ name: string }>;
  };
  expect(library.library.map((c) => c.name)).toContain("scroll-story");
  await mcp.ok("create_component", { site: siteId, from: "scroll-story", name: "studio-story" });
  await mcp.ok("update_component", {
    site: siteId,
    name: "studio-story",
    changes: { label: "Studio story" },
  });
  const placed = (await mcp.ok("insert_component", {
    site: siteId,
    page: "/",
    name: "studio-story",
    at: 1,
    fields: { headline: "How a class comes together" },
  })) as { block: string; section: string; findings: Array<{ severity: string }> };
  expect(placed.findings.filter((f) => f.severity === "error")).toEqual([]);
  const preview = await mcp.tool("preview_component", { site: siteId, name: "studio-story" });
  expect(preview.isError).toBeFalsy();
  await mcp.end();

  let draft = (await owner.draft(siteId)).document as unknown as {
    components?: Record<string, { label: string }>;
  };
  expect(draft.components?.["studio-story"]?.label).toBe("Studio story");

  // 2. The editor opens Studio: the instance renders on the canvas (no component script runs
  //    there) and its fields are normal controls; the code is not offered.
  await signIn(context, editor.user.name);
  await openEditor(page, siteId);
  await closeChecklist(page);
  const frame = canvas(page);
  const instance = frame.locator('[data-os-component="studio-story"]');
  await expect(instance).toBeVisible();
  await expect(instance.getByRole("heading", { name: "How a class comes together" })).toBeVisible();
  expect(await frame.locator("script[data-os-component-js]").count()).toBe(0);
  await instance.getByRole("heading", { name: "How a class comes together" }).click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const headline = inspector.getByLabel("Headline", { exact: true });
  await expect(headline).toHaveValue("How a class comes together");
  await headline.fill("Every class, step by step");
  await headline.blur();
  await expect(inspector.getByText("Component code")).toHaveCount(0);
  await expect
    .poll(async () => {
      const doc = (await owner.draft(siteId)).document;
      return allBlocks(doc).find((b) => b.block.id === placed.block)?.block.fields.headline;
    })
    .toBe("Every class, step by step");
  await expect(frame.getByRole("heading", { name: "Every class, step by step" })).toBeVisible();

  // Editors can't change component code (the Hub refuses it).
  draft = (await owner.draft(siteId)).document as unknown as typeof draft;
  const refused = await editor.submitOps(siteId, [
    {
      op: "component.upsert",
      component: { ...(draft.components?.["studio-story"] as object), label: "Mine now" },
    },
  ]);
  expect(refused.body.results?.[0]).toMatchObject({ status: "rejected", code: "forbidden" });

  // 3. The owner publishes; the live page has the instance, its CSS once in <head> and its script.
  const published = await owner.publish(siteId);
  expect(published.publish?.status).toBe("published");
  await expect
    .poll(async () => (await livePage(page, siteId)).html, { timeout: 30_000 })
    .toContain("Every class, step by step");
  const { html } = await livePage(page, siteId);
  expect(html).toContain('data-os-component="studio-story"');
  const head = html.slice(0, html.indexOf("</head>"));
  expect(head).toContain('<style data-os="components">');
  expect(head).toContain(".os-c--studio-story");
  expect(html).toContain('<script type="module" data-os-component-js="studio-story">');
  // The published page runs the behaviour: the arrow buttons appear (they are hidden without JS).
  await page.goto(`${HUB_URL}/s/${siteId}/`);
  const live = page.locator('[data-os-component="studio-story"]');
  await expect(live.getByRole("heading", { name: "Every class, step by step" })).toBeVisible();
  await expect(live.locator("[data-ss-nav]")).toBeVisible();
});

test("an owner adds a Designer component from the gallery and edits its code with a sandboxed preview", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await signIn(context, owner.user.name);
  await openEditor(page, siteId);
  await closeChecklist(page);
  // Add section → Designer components → Bento feature grid (the design is added to the site).
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Add section" })
    .click();
  const gallery = page.getByRole("region", { name: "Designer components" }).first();
  await gallery.getByRole("button", { name: /^Bento feature grid/ }).click();
  const frame = canvas(page);
  await expect(frame.locator('[data-os-component="bento-grid"]')).toBeVisible();
  await expect
    .poll(async () => {
      const doc = (await owner.draft(siteId)).document as { components?: Record<string, unknown> };
      return Object.keys(doc.components ?? {});
    })
    .toContain("bento-grid");

  // Select it and open Component code: problems are explained; the preview is sandboxed.
  await frame.locator('[data-os-component="bento-grid"] h2').first().click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await inspector.getByRole("button", { name: /Component code/ }).click();
  await inspector.getByRole("button", { name: "Edit component code" }).click();
  const dialog = page.getByRole("dialog");
  const preview = dialog.getByTestId("component-preview");
  await expect(preview).toBeVisible();
  expect(await preview.getAttribute("sandbox")).toBe("allow-scripts");
  await expect(
    page
      .frameLocator('[data-testid="component-preview"]')
      .locator('[data-os-component="bento-grid"]'),
  ).toBeVisible();
  await dialog.getByRole("textbox", { name: "Name in the gallery" }).fill("Amenities grid");
  await dialog.getByRole("button", { name: "Save design" }).click();
  await expect
    .poll(async () => {
      const doc = (await owner.draft(siteId)).document as {
        components?: Record<string, { label: string }>;
      };
      return doc.components?.["bento-grid"]?.label;
    })
    .toBe("Amenities grid");
});
