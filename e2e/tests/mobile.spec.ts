import { expect, type Page, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { Hub, homePage, textOf, unique } from "../support/hub";
import { signIn } from "../support/studio";

// PRD §4.2 / FR-22 phone editing at 390 px through the phone Studio (Task 26): page list →
// section list → bottom-sheet editing, reorder sections, publish from the phone. Runs on the `mobile` (Chromium) and `webkit-mobile` projects.
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

test("phone: page list → section list → edit in the bottom sheet, reorder, publish", async ({
  page,
  context,
}) => {
  await signIn(context, owner.user.name);
  await page.goto(`/sites/${siteId}`);
  await expect(page.getByTestId("mobile-studio")).toBeVisible();
  await noSidewaysScroll(page);
  const draft = async () => homePage((await owner.draft(siteId)).document);
  const order = (await draft()).sections.map((s) => s.id);

  // Pages → Home → its sections.
  await page
    .getByRole("navigation", { name: "Studio" })
    .getByRole("button", { name: "Pages" })
    .click();
  await page.getByRole("list", { name: "Pages" }).getByRole("button", { name: /^Home/ }).click();
  const sections = page.getByRole("list", { name: "Sections on Home" });
  await expect(sections.getByRole("listitem")).toHaveCount(order.length);

  // Tap the hero → bottom sheet → its heading → edit the Text field.
  const hero = sections
    .getByRole("listitem")
    .first()
    .getByRole("button")
    .filter({ hasNotText: /^$/ })
    .last();
  await hero.click();
  const sheet = page.getByRole("dialog");
  await sheet
    .getByRole("list", { name: "Blocks in this section" })
    .getByRole("button")
    .first()
    .click();
  await expect(sheet.getByTestId("inspector")).toBeVisible();
  const text = sheet.getByRole("textbox", { name: "Text", exact: true });
  await text.fill("Bread worth getting up for");
  await text.blur();
  await expect
    .poll(async () => textOf((await draft()).sections[0]))
    .toContain("Bread worth getting up for");

  // Close the sheet, reopen the hero section, move it down one place.
  if (await sheet.isVisible()) await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await sections.getByRole("listitem").first().getByRole("button").last().click();
  await sheet
    .getByRole("toolbar", { name: "Section" })
    .getByRole("button", { name: "Move down" })
    .click();
  await expect
    .poll(async () => (await draft()).sections.map((s) => s.id).slice(0, 2))
    .toEqual([order[1], order[0]]);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await noSidewaysScroll(page);

  // Publish from the phone.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publish changes" });
  await dialog.getByRole("button", { name: "Publish now" }).click();
  await expect(dialog).toBeHidden();
  const live = async () => (await page.request.get(`${HUB_URL}/s/${siteId}/`)).text();
  await expect
    .poll(async () => (await live()).includes("Bread worth getting up for"), { timeout: 30_000 })
    .toBe(true);
  const html = await live();
  const first = html.indexOf(`data-os-id="${order[1]}"`);
  expect(first).toBeGreaterThan(-1);
  expect(first).toBeLessThan(html.indexOf(`data-os-id="${order[0]}"`));
});
