import { expect, test } from "@playwright/test";
import { STUDIO_URL } from "../support/env";
import { editPlainText, heroHeading, secondHeading } from "../support/edit";
import { Hub, homePage, textOf, unique } from "../support/hub";
import { canvas, closeChecklist, openEditor, signIn } from "../support/studio";

// PRD §4.3 (FR-17 undo/redo, FR-19 real-time collaboration, FR-20 offline editing + sync).
let owner: Hub;
let siteId: string;

test.beforeEach(async () => {
  owner = await Hub.login(unique("Ana Ruiz"));
  siteId = (await owner.createSite({ name: unique("Harbor Studio"), template: "meadow" })).id;
});
test.afterEach(async () => owner?.dispose());

const heroText = async () => textOf(homePage((await owner.draft(siteId)).document).sections[0]);

test("undo and redo across edits (toolbar and keyboard), synced to the Hub", async ({
  page,
  context,
}) => {
  await signIn(context, owner.user.name);
  await openEditor(page, siteId);
  await closeChecklist(page);
  const frame = canvas(page);
  const h1 = heroHeading(frame);
  const original = ((await h1.textContent()) ?? "").trim();

  await editPlainText(page, h1, "First new headline");
  await page.keyboard.press("Escape");
  await editPlainText(page, h1, "Second new headline");
  await page.keyboard.press("Escape");
  await expect.poll(heroText).toContain("Second new headline");

  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  await undo.click();
  await expect(h1).toHaveText("First new headline");
  await expect.poll(heroText).toContain("First new headline");
  await undo.click();
  await expect(h1).toHaveText(original);
  await expect.poll(heroText).toContain(original);

  await redo.click();
  await expect(h1).toHaveText("First new headline");
  // Keyboard: ⇧⌘Z redoes, ⌘Z undoes (focus on the Studio page, not a text field). The desktop
  // project's user agent is Windows, so Studio's "mod" key is Control.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("Control+Shift+z");
  await expect(h1).toHaveText("Second new headline");
  await page.keyboard.press("Control+z");
  await expect(h1).toHaveText("First new headline");
  await expect.poll(heroText).toContain("First new headline");
});

test("offline edits are kept on the device and sync when back online", async ({
  page,
  context,
}) => {
  await signIn(context, owner.user.name);
  await openEditor(page, siteId);
  await closeChecklist(page);
  const h1 = heroHeading(canvas(page));

  await context.setOffline(true);
  const status = page.locator("output.st-sync");
  await expect(status).toHaveAttribute("data-state", "offline");
  await editPlainText(page, h1, "Written on the ferry");
  await page.keyboard.press("Escape");
  await expect(status).toHaveText("Saved on this device");
  // Not on the Hub yet.
  expect(await heroText()).not.toContain("Written on the ferry");

  await context.setOffline(false);
  await expect(status).toHaveText("Saved", { timeout: 20_000 });
  await expect.poll(heroText, { timeout: 20_000 }).toContain("Written on the ferry");
  await page.reload();
  await expect(heroHeading(canvas(page))).toHaveText("Written on the ferry");
});

test("two collaborators see each other's edits live, with presence", async ({ browser }) => {
  const designer = await Hub.login(unique("Kai Moana"));
  await owner.addCollaborator(siteId, designer, "designer");

  const a = await browser.newContext({
    baseURL: STUDIO_URL,
    viewport: { width: 1440, height: 900 },
  });
  const b = await browser.newContext({
    baseURL: STUDIO_URL,
    viewport: { width: 1440, height: 900 },
  });
  await signIn(a, owner.user.name);
  await signIn(b, designer.user.name);
  const pa = await a.newPage();
  const pb = await b.newPage();
  await openEditor(pa, siteId);
  await openEditor(pb, siteId);
  await closeChecklist(pa);
  await closeChecklist(pb);

  await expect(pa.getByRole("list", { name: /Editing now: you and 1 other/ })).toBeVisible();
  await expect(pb.getByRole("list", { name: /Editing now: you and 1 other/ })).toBeVisible();

  await editPlainText(pa, heroHeading(canvas(pa)), "Edited by the owner");
  await expect(heroHeading(canvas(pb))).toHaveText("Edited by the owner", { timeout: 10_000 });

  await editPlainText(pb, secondHeading(canvas(pb)), "Edited by the designer");
  await expect(secondHeading(canvas(pa))).toHaveText("Edited by the designer", { timeout: 10_000 });

  const doc = (await owner.draft(siteId)).document;
  const home = homePage(doc);
  expect(textOf(home.sections[0])).toContain("Edited by the owner");
  expect(textOf(home.sections[1])).toContain("Edited by the designer");

  await a.close();
  await b.close();
  await designer.dispose();
});
