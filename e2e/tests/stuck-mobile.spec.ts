import { expect, type Page, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { Hub, unique } from "../support/hub";
import { signIn } from "../support/studio";

// The phone editor must never sit on a spinner it can't explain (owner report, 2026-10-28):
// after "Move your site" on an iPhone, the editor said "still being set up" for minutes although
// the site was live, and every other site opened onto a blank page with a spinner. Requests to
// the Hub that never answer (a dead connection after the phone was locked) and a device copy
// that remembered the site as "building" kept it there. Runs on `mobile` and `webkit-mobile`.
let owner: Hub;
let siteId: string;

test.beforeEach(async () => {
  owner = await Hub.login(unique("Ana Ruiz"));
  siteId = (await owner.createSite({ name: unique("Ana Moved Site"), template: "meadow" })).id;
});
test.afterEach(async () => owner?.dispose());

const siteUrl = (id: string) => new RegExp(`${HUB_URL}/api/sites/${id}$`);
const editorReady = (page: Page) =>
  expect(page.getByTestId("mobile-studio").getByRole("button", { name: "Publish" })).toBeEnabled({
    timeout: 60_000,
  });

test("a status check that never answers is asked again: the editor opens, with a way out meanwhile", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await signIn(context, owner.user.name);
  // The first status check hangs forever (the phone was locked mid-request); later ones answer.
  let hung = false;
  await page.route(siteUrl(siteId), async (route) => {
    if (!hung && route.request().method() === "GET") {
      hung = true;
      return; // never fulfilled
    }
    await route.continue();
  });
  await page.goto(`/sites/${siteId}`);
  // While it waits, there's always a way out instead of a bare spinner…
  await expect(page.getByRole("heading", { name: "This is taking longer than usual" })).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(page.getByRole("button", { name: "Back to your sites" })).toBeVisible();
  // …and the stalled request is dropped and asked again, so the editor opens by itself.
  await editorReady(page);
  expect(hung).toBe(true);
});

test("a site remembered as 'being set up' isn't shown that way while OpenSpace can't be reached", async ({
  page,
  context,
}) => {
  await signIn(context, owner.user.name);
  // The sites list this phone saved was taken mid-move: the site was still "building".
  await page.route(`${HUB_URL}/api/sites`, async (route) => {
    const res = await route.fetch();
    const body = (await res.json()) as { sites: Array<{ id: string; status: string }> };
    for (const s of body.sites) if (s.id === siteId) s.status = "building";
    await route.fulfill({ response: res, json: body });
  });
  await page.goto("/sites");
  await expect(page.getByText(/Ana Moved Site/).first()).toBeVisible();
  await page.unroute(`${HUB_URL}/api/sites`);

  // Now the Hub can't be reached for this site's status.
  let down = true;
  await page.route(siteUrl(siteId), (route) => (down ? route.abort("failed") : route.continue()));
  await page.goto(`/sites/${siteId}`);
  await expect(
    page.getByText(/Reconnecting to OpenSpace|can’t reach OpenSpace/).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/still being set up/)).toHaveCount(0);
  // Back online: the live site opens without a reload.
  down = false;
  await editorReady(page);
  await expect(page.getByText(/still being set up/)).toHaveCount(0);
});
