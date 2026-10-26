import { expect, type Page, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { Hub, homePage, textOf, unique } from "../support/hub";
import { canvas, closeChecklist, openEditor, signIn } from "../support/studio";

// PRD §4.2 / FR-22 phone editing at 390 px: inspector as a bottom sheet, reorder sections,
// publish from the phone. Runs on the `mobile` (Chromium) and `webkit-mobile` projects.
let owner: Hub;
let siteId: string;

test.beforeEach(async () => {
  owner = await Hub.login(unique("Rosa Diaz"));
  siteId = (await owner.createSite({ name: unique("Pan and Crumb"), template: "meadow" })).id;
});
test.afterEach(async () => owner?.dispose());

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("body *")].some((e) => {
      const r = e.getBoundingClientRect();
      return (
        r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1) && !e.closest("iframe")
      );
    }),
  );
  expect(overflow, "nothing in Studio's chrome sticks out sideways").toBe(false);
}

test("phone: edit text in the bottom sheet, reorder sections, publish", async ({
  page,
  context,
}) => {
  await signIn(context, owner.user.name);
  await openEditor(page, siteId);
  await closeChecklist(page);
  await noSidewaysScroll(page);
  const frame = canvas(page);
  const draft = async () => homePage((await owner.draft(siteId)).document);
  const order = (await draft()).sections.map((s) => s.id);

  // 1. Tap the headline, open the inspector sheet, edit the Text field.
  await frame.locator("h1").first().tap();
  await page.getByRole("button", { name: /inspector/i }).click();
  const sheet = page.getByRole("dialog", { name: "Inspector" });
  await expect(sheet).toBeVisible();
  const text = sheet.getByRole("textbox", { name: "Text", exact: true });
  await text.fill("Bread worth getting up for");
  await text.blur();
  await expect(frame.locator("h1").first()).toHaveText("Bread worth getting up for");
  await expect
    .poll(async () => textOf((await draft()).sections[0]))
    .toContain("Bread worth getting up for");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();

  // 2. Layers sheet: pick the hero section and move it down one place (⌥↓ on the tree row).
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Layers" })
    .click();
  const heroRow = page.getByRole("tree").locator('[role="treeitem"][aria-level="1"]').first();
  // The section's treeitem contains its block rows: click its own row (top edge), not a child.
  await heroRow.click({ position: { x: 60, y: 12 } });
  await page.keyboard.press("Alt+ArrowDown");
  await expect
    .poll(async () => (await draft()).sections.map((s) => s.id).slice(0, 2))
    .toEqual([order[1], order[0]]);
  await noSidewaysScroll(page);

  await page.getByRole("dialog", { name: "Layers" }).getByRole("button", { name: "Close" }).click();

  // 3. Publish from the phone.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publish changes" });
  await dialog.getByRole("button", { name: "Publish now" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`${HUB_URL}/s/${siteId}/`)).text()).includes(
          "Bread worth getting up for",
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
  const html = await (await page.request.get(`${HUB_URL}/s/${siteId}/`)).text();
  const first = html.indexOf(`data-os-id="${order[1]}"`);
  const second = html.indexOf(`data-os-id="${order[0]}"`);
  expect(first).toBeGreaterThan(-1);
  expect(first).toBeLessThan(second);
});
