import { chromium, type FullConfig } from "@playwright/test";
import { STUDIO_URL } from "./support/env";
import { devLogin, Hub } from "./support/hub";

/**
 * Warm Vite up before the specs: on a cold dev server the first visits trigger dependency
 * pre-bundling (and a reload) for each lazy chunk — gallery, editor, workspace, settings — which
 * can take longer than a test's action timeout. Visit them once here.
 */
export default async function globalSetup(_config: FullConfig) {
  const owner = await Hub.login(`Warm Up ${Date.now().toString(36)}`);
  const site = await owner.createSite({ name: `Warm Up ${Date.now().toString(36)}` });
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL: STUDIO_URL });
  await devLogin(context.request, owner.user.name);
  const page = await context.newPage();
  for (const path of [
    "/templates",
    "/new/meadow",
    `/sites/${site.id}`,
    `/sites/${site.id}/campaigns/new`,
    `/sites/${site.id}/inbox`,
    `/sites/${site.id}/orders`,
    `/sites/${site.id}/settings/general`,
  ]) {
    // A cold Vite transforms each chunk on first visit; on a busy machine that alone can take
    // longer than the 30 s navigation default, so the warm-up gets the same 2 minutes as below.
    await page.goto(path, { timeout: 120_000 });
    await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => undefined);
  }
  await browser.close();
  await owner.dispose();
}
