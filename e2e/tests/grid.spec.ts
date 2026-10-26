import { expect, type Locator, type Page, test } from "@playwright/test";
import { heroHeading } from "../support/edit";
import { Hub, homePage, unique } from "../support/hub";
import { canvas, closeChecklist, openEditor, signIn } from "../support/studio";

// PRD §5.1 Grid (FR-14, FR-15): drag and resize blocks on a grid section; the phone layout is
// independent of the desktop one.
type Rect = { x: number; y: number; w: number; h: number };
type Item = { d: Rect; t?: Rect; m?: Rect };

let owner: Hub;
let siteId: string;

test.beforeEach(async () => {
  owner = await Hub.login(unique("Lena Brooks"));
  siteId = (await owner.createSite({ name: unique("Kiln Works"), template: "meadow" })).id;
});
test.afterEach(async () => owner?.dispose());

async function heroItems(): Promise<Record<string, Item>> {
  const hero = homePage((await owner.draft(siteId)).document).sections[0];
  if (hero?.layout.mode !== "grid") return {};
  return (hero.layout as unknown as { items: Record<string, Item> }).items;
}

/** Drag with real pointer events in small steps (the grid controller runs on rAF). */
async function drag(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (dx * i) / steps, from.y + (dy * i) / steps);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

async function center(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error("no box");
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

test("grid: switch to grid, drag and resize a block; phone layout stays independent", async ({
  page,
  context,
}) => {
  await signIn(context, owner.user.name);
  await openEditor(page, siteId);
  await closeChecklist(page);
  const frame = canvas(page);

  // Select the hero section and switch it to a grid.
  await heroHeading(frame).click();
  await page.keyboard.press("Escape");
  await page.getByRole("radio", { name: "Grid layout" }).click();
  await expect.poll(async () => Object.keys(await heroItems()).length).toBeGreaterThan(1);
  await expect(page.getByRole("toolbar", { name: "Grid" })).toBeVisible();

  const image = frame
    .locator("[data-os-section]")
    .first()
    .locator('[data-os-block="image"]')
    .first();
  const imageId = await image.getAttribute("data-os-id");
  expect(imageId).toBeTruthy();
  const before = (await heroItems())[imageId as string] as Item;

  // Phone preview first: a drag customizes the phone placement only (desktop untouched).
  await page
    .getByRole("radiogroup", { name: "Device preview" })
    .getByRole("radio", { name: /^Phone/ })
    .click();
  const phoneImage = frame.locator(`[data-os-id="${imageId}"]`);
  await phoneImage.scrollIntoViewIfNeeded();
  await phoneImage.click();
  await drag(page, await center(phoneImage), 0, 120);
  await expect
    .poll(async () => JSON.stringify((await heroItems())[imageId as string]?.m ?? null))
    .not.toBe(JSON.stringify(before.m ?? null));
  const custom = (await heroItems())[imageId as string] as Item;
  expect(custom.d).toEqual(before.d);

  // Desktop: drag the photo left and down.
  await page
    .getByRole("radiogroup", { name: "Device preview" })
    .getByRole("radio", { name: /^Desktop/ })
    .click();
  await image.scrollIntoViewIfNeeded();
  await image.click();
  await drag(page, await center(image), -160, 60);
  await expect
    .poll(async () => JSON.stringify((await heroItems())[imageId as string]?.d))
    .not.toBe(JSON.stringify(before.d));
  const moved = (await heroItems())[imageId as string] as Item;
  expect(moved.d.x).toBeLessThan(before.d.x);

  // Resize from the right edge handle: narrower, same left edge.
  await image.click();
  const handle = page.locator('.st-grid__handle[data-pos="e"]');
  await expect(handle).toBeVisible();
  await drag(page, await center(handle), -120, 0);
  await expect
    .poll(async () => (await heroItems())[imageId as string]?.d.w)
    .toBeLessThan(moved.d.w);
  const resized = (await heroItems())[imageId as string] as Item;
  expect(resized.d.x).toBe(moved.d.x);

  // The customized phone layout is independent of the desktop changes.
  expect(resized.m).toEqual(custom.m);
});
