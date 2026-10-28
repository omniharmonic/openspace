import { expect, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { devLogin, unique } from "../support/hub";
import { editorReady, siteIdFrom } from "../support/studio";

// "Move my site" with nothing installed: paste an address in Studio, the Hub creates the site
// and runs the import workflow (emulated in DEV_MODE), and the person lands on a live site with
// what needs their attention — then edits it in Studio.
test("Move my site: address → progress → live site with what needs attention → editor", async ({
  page,
}) => {
  await devLogin(page.context().request, unique("Maya Mover"));
  const host = `${unique("maya-yoga")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")}.com`;

  await page.goto("/templates");
  await page.getByRole("link", { name: /Already have a site\? Move it to OpenSpace/ }).click();
  await expect(page.getByRole("heading", { name: "Move your site to OpenSpace" })).toBeVisible();
  await page.getByLabel("Your site’s address").fill(`https://www.${host}`);
  await page.getByLabel("This is my site, or I’m moving it for its owner.").check();
  await page.getByRole("button", { name: "Move my site" }).click();

  await page.waitForURL(/\/move\/imp_[0-9a-z]+/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Your site is live!" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("list", { name: "Progress" })).toContainText("2 pages, 0 images");
  await expect(page.getByRole("heading", { name: "What needs your attention" })).toBeVisible();
  await expect(page.getByText("Forms and newsletter")).toBeVisible();
  // How close it looks: the run's comparison, before → after tuning, with a side-by-side.
  await expect(page.getByRole("heading", { name: "How close it looks: 93/100" })).toBeVisible();
  const thumb = page.getByRole("img", { name: "/ on a desktop: old site left, new site right" });
  await expect(thumb).toBeVisible();
  const src = (await thumb.getAttribute("src")) as string;
  expect((await page.request.get(src)).headers()["content-type"]).toBe("image/jpeg");
  await expect(page.getByRole("heading", { name: /Finish setting up/ })).toBeVisible();

  // Not a near-perfect match (the phone still differs): an honest invitation to finish with
  // Claude — connect once, then open Claude with a message naming the old address and the site.
  const invite = page.getByRole("region", { name: "Want it closer? Claude can finish the job" });
  await expect(invite).toBeVisible();
  await invite.getByRole("button", { name: "Improve it with Claude" }).click();
  await expect(
    invite.getByRole("heading", { name: /Connect OpenSpace to Claude \(once\)/ }),
  ).toBeVisible();
  const href =
    (await invite
      .getByRole("link", { name: /Open Claude with this message/ })
      .getAttribute("href")) ?? "";
  const message = decodeURIComponent(href.split("?q=")[1] ?? "");
  expect(message).toContain(`https://www.${host}`);
  expect(message).toMatch(/id st_[0-9a-z]+/);
  // Fits a phone: no sideways scrolling at 390px.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(invite.getByRole("button", { name: "Copy the message" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.getByRole("button", { name: "Open it in Studio" }).click();
  await page.waitForURL(/\/sites\/st_[0-9a-z]+/);
  await editorReady(page);
  const siteId = siteIdFrom(page);

  // The imported pages are the live site.
  const about = await page.request.get(`${HUB_URL}/s/${siteId}/about/`);
  expect(about.status()).toBe(200);
  expect(await about.text()).toContain("About us");
  const imp = await page.request.get(`${HUB_URL}/api/sites/${siteId}/import`);
  expect(((await imp.json()) as { import: { state: string } }).import.state).toBe("ready");
});

test("a move that can't read the site explains why and offers Try again", async ({ page }) => {
  await devLogin(page.context().request, unique("Fail Fiona"));
  await page.goto("/move");
  await page.getByLabel("Your site’s address").fill("https://fail.example.com");
  await page.getByLabel("This is my site, or I’m moving it for its owner.").check();
  await page.getByRole("button", { name: "Move my site" }).click();
  await expect(page.getByRole("heading", { name: "The move didn’t finish" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(/Couldn't read https:\/\/fail\.example\.com/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});
