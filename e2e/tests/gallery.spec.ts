import { expect, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { token, unique } from "../support/hub";
import { editorReady, siteIdFrom } from "../support/studio";

// PRD §4.1 onboarding (FR-1, FR-2, FR-3): browse without an account → template + look → name and
// tagline → dev sign-in → "Setting up your site…" → editor; the live site renders the real template.
test("gallery → new site → dev sign-in → setting up → editor → live site", async ({ page }) => {
  const name = unique("Juniper Bodywork");
  const tagline = "Massage and movement in Portland";

  await page.goto("/templates");
  await expect(page.getByRole("heading", { name: "Start from a finished site" })).toBeVisible();
  const meadow = page.getByRole("article", { name: "Meadow" });
  await expect(meadow).toBeVisible();
  // No account yet: the gallery is public.
  expect((await page.context().cookies(HUB_URL)).find((c) => c.name === "os_session")).toBeFalsy();

  await meadow.getByRole("radio", { name: /Clay/ }).click();
  await meadow.getByRole("button", { name: "Use Meadow" }).click();

  await expect(page.getByRole("heading", { name: "Make it yours" })).toBeVisible();
  await page.getByLabel("Site name").fill(name);
  await page.getByLabel(/One line about what you do/).fill(tagline);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: `Sign in to save ${name}` })).toBeVisible();
  await page.getByLabel("Your name").fill(unique("Sam Rivera"));
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Setting up your site…" })).toBeVisible();
  await page.waitForURL(/\/sites\/st_[0-9a-z]+/, { timeout: 60_000 });
  await editorReady(page);
  await expect(page.getByText("Your site is live", { exact: true })).toBeVisible();

  const siteId = siteIdFrom(page);
  const res = await page.request.get(`${HUB_URL}/s/${siteId}/`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain(name);
  expect(html).toContain(tagline);
  // The real renderer (site-kit), not a placeholder: tokens + blocks CSS + a Meadow section.
  expect(html).toMatch(/--os-/);
  // The chosen look (Clay), not the template's default one, is what's live.
  const look = async (id: string) =>
    token(await (await page.request.get(`${HUB_URL}/t/meadow/?look=${id}`)).text(), "color-brand");
  const clay = await look("clay-linen");
  expect(clay).toBeTruthy();
  expect(token(html, "color-brand")).toBe(clay);
  expect(clay).not.toBe(await look("oat-sage"));
  expect(html).toMatch(/data-os-section|class="os-section/);
});
