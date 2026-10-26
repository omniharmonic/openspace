import { expect, type FrameLocator, type Locator, type Page } from "@playwright/test";

/** Replace a plain-text field on the canvas: double-click, select all, type, Enter. */
export async function editPlainText(page: Page, target: Locator, text: string) {
  await target.dblclick();
  await expect(target).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await expect(target).toHaveText(text);
}

/** The hero headline and the second section's heading of a Meadow home page. */
export function heroHeading(frame: FrameLocator) {
  return frame.locator("[data-os-section]").first().locator("h1").first();
}
export function secondHeading(frame: FrameLocator) {
  return frame.locator("[data-os-section]").nth(1).locator("h2").first();
}
