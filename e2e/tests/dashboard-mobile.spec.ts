import { expect, test } from "@playwright/test";
import { Hub, unique } from "../support/hub";
import { signIn } from "../support/studio";

// Wave 4: on a 390 px phone the dashboard's "Move a site · Start with Claude · New site" row ran
// off the right edge (the page grew to 450 px wide) and "New site" was cut off.
let owner: Hub;
test.beforeEach(async () => {
  owner = await Hub.login(unique("Tess Phone"));
  await owner.createSite({ name: unique("Phone Shop"), template: "meadow" });
});
test.afterEach(async () => owner?.dispose());

test("phone: the dashboard fits the screen and every button is reachable", async ({
  page,
  context,
}) => {
  await signIn(context, owner.user.name);
  await page.goto("/sites");
  await expect(page.getByRole("heading", { name: "Your sites" })).toBeVisible();
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: window.innerWidth,
  }));
  expect(width.scroll, "the page doesn't scroll sideways").toBeLessThanOrEqual(width.inner);
  for (const name of [/Move a site/, /Start with Claude/, /New site/]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect(box, `${name} is on screen`).toBeTruthy();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width.inner);
  }
});
