import { expect, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { devLogin, unique } from "../support/hub";
import { editorReady, siteIdFrom } from "../support/studio";

// Sophia's failed site: signed in, but the GitHub App was never installed on her account.
// Studio must explain the one extra step, send her to (dev) GitHub's install page, and finish
// creating the site when GitHub redirects back to the Setup URL — and later, if the App is
// uninstalled, ask her to reconnect instead of failing.
test("new account without the GitHub App: one more step → install → site is created; uninstall → reconnect", async ({
  page,
}) => {
  const name = unique("Power With");
  await devLogin(page.context().request, unique("Sophia Life"), { installApp: false });

  await page.goto("/new/meadow");
  await page.getByLabel("Site name").fill(name);
  await page.getByRole("button", { name: "Create my site" }).click();

  await expect(
    page.getByRole("heading", { name: "One more step: let OpenSpace save your site" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/couldn.t finish setting up/i)).toHaveCount(0);
  await expect(page.getByText(/All repositories/).first()).toBeVisible();

  await page.getByRole("link", { name: /Continue to GitHub/ }).click();
  // The dev stand-in for GitHub's install page.
  await expect(page.getByRole("heading", { name: "Install OpenSpace" })).toBeVisible();
  await page.getByRole("link", { name: "Install for all repositories" }).click();

  // Back in Studio: the site is set up and opens in the editor.
  await page.waitForURL(/\/sites\/st_[0-9a-z]+/, { timeout: 60_000 });
  await editorReady(page);
  const siteId = siteIdFrom(page);
  await expect
    .poll(async () => {
      const res = await page.request.get(`${HUB_URL}/api/sites/${siteId}`);
      return ((await res.json()) as { status: string }).status;
    })
    .toBe("live");

  // Later the App is removed on GitHub: the site asks to reconnect (and is still online).
  const un = await page.request.post(`${HUB_URL}/dev/github/uninstall`);
  expect(un.ok()).toBe(true);
  await page.goto(`/sites/${siteId}`);
  await expect(page.getByRole("heading", { name: /Reconnect .* to GitHub/ })).toBeVisible();
  await page.getByRole("link", { name: /Reconnect GitHub/ }).click();
  await page.getByRole("link", { name: "Install for all repositories" }).click();
  await page.waitForURL(/github=connected/);
  await editorReady(page);
});

test("Connect your AI is reachable before having a site, Claude app first", async ({ page }) => {
  await devLogin(page.context().request, unique("No Site Nia"));
  await page.goto("/sites");
  await expect(page.getByRole("heading", { name: "Make your first site" })).toBeVisible();
  await page.getByRole("button", { name: "Connect your AI" }).click();
  await expect(page.getByRole("heading", { name: "Connect your AI", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Recommended: the Claude app/ })).toBeVisible();
  await expect(page.getByText(`${HUB_URL}/mcp`, { exact: true })).toBeVisible();
  await expect(page.getByText("/plugin install openspace@openspace")).toBeVisible();
});
