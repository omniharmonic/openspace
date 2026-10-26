import { type BrowserContext, expect, type Page } from "@playwright/test";
import { HUB_URL } from "./env";
import { devLogin } from "./hub";

/** Sign a browser context in as a dev user (shares the context's cookie jar). */
export async function signIn(context: BrowserContext, name: string) {
  return devLogin(context.request, name);
}

/** The site id from a Studio editor URL (`/sites/:id/...`). */
export function siteIdFrom(page: Page): string {
  const m = /\/sites\/(st_[0-9a-z]+)/.exec(page.url());
  if (!m?.[1]) throw new Error(`not an editor URL: ${page.url()}`);
  return m[1];
}

/** Open a site in the editor and wait for the canvas to show the real page. */
export async function openEditor(page: Page, siteId: string, path = "") {
  await page.goto(`/sites/${siteId}${path}`);
  await canvasReady(page);
}

/** The canvas iframe (same-origin, built by Studio). */
export function canvas(page: Page) {
  return page.frameLocator('iframe[title="Page canvas"]');
}

export async function canvasReady(page: Page) {
  await expect(canvas(page).locator("[data-os-section]").first()).toBeVisible({ timeout: 30_000 });
}

/** Wait until Studio says every change reached the Hub. */
export async function waitSaved(page: Page) {
  await expect(
    page
      .getByTestId("sync-status")
      .or(page.getByRole("status", { name: /saved|all changes/i }))
      .first(),
  ).toBeVisible();
}

/** Fetch a published page from the Hub's dev preview. */
export async function livePage(page: Page, siteId: string, path = "") {
  const res = await page.request.get(`${HUB_URL}/s/${siteId}/${path}`);
  return { status: res.status(), html: await res.text() };
}

/** Hide the first-run checklist so it doesn't cover the canvas. */
export async function closeChecklist(page: Page) {
  const hide = page.getByRole("button", { name: "Hide checklist" });
  if (await hide.isVisible().catch(() => false)) await hide.click();
}

/** The editor is up: the desktop canvas shows the page, or (phones) the phone Studio is shown. */
export async function editorReady(page: Page) {
  const desktop = canvas(page).locator("[data-os-section]").first();
  const phone = page.getByTestId("mobile-studio");
  await expect
    .poll(async () => (await phone.isVisible()) || (await desktop.isVisible().catch(() => false)), {
      timeout: 30_000,
    })
    .toBe(true);
}
