import { expect, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { Hub, homePage, unique } from "../support/hub";
import { closeChecklist, openEditor, signIn } from "../support/studio";

// The first live test: a hero preset added in Studio carried example links (/book, /retreats)
// to pages the site didn't have; the site's own check then failed the publish. Presets now point
// such links at existing pages, and the Hub refuses (with specifics) what would fail that check.
test.describe.configure({ mode: "serial" });

let siteId: string;
let owner: Hub;

test.beforeAll(async () => {
  owner = await Hub.login(unique("Iris Calder"));
  siteId = (await owner.createSite({ name: unique("Cliff House"), template: "meadow" })).id;
});

test.afterAll(async () => {
  await owner?.dispose();
});

test("a hero preset added in Studio links to real pages, and publishing it succeeds", async ({
  page,
  context,
}) => {
  await signIn(context, owner.user.name);
  await openEditor(page, siteId);
  await closeChecklist(page);
  const before = homePage((await owner.draft(siteId)).document).sections.length;
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Add section" })
    .click();
  await page
    .getByRole("searchbox", { name: "Search sections" })
    .or(page.getByLabel("Search sections"))
    .first()
    .fill("full-bleed");
  // The card by its name: thumbnails may be an iframe or a cached snapshot, and the header
  // presets that also match "full-bleed" change the header, not the page's sections.
  await page
    .getByRole("button", { name: /^Full-bleed photograph:/ })
    .first()
    .click();
  await expect
    .poll(async () => homePage((await owner.draft(siteId)).document).sections.length)
    .toBe(before + 1);
  const added = homePage((await owner.draft(siteId)).document).sections.find(
    (s) => s.preset === "hero/full-bleed-photo@1",
  );
  expect(added, "the full-bleed hero on Home").toBeTruthy();
  const json = JSON.stringify(added);
  expect(json).not.toContain('"/book"');
  expect(json).not.toContain('"/retreats"');

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publish changes" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Publish now" }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`${HUB_URL}/s/${siteId}/`)).text()).includes(
          "Five days of silence by the sea",
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
});

test("the Hub refuses a draft with a link to a missing page, naming page, block and link", async () => {
  const doc = (await owner.draft(siteId)).document;
  const home = homePage(doc);
  const button = home.sections.flatMap((s) => s.blocks).find((b) => b.type === "button");
  expect(button).toBeTruthy();
  await owner.ops(siteId, [
    {
      id: `e2e-link-${Date.now().toString(36)}`,
      actor: `user:${owner.user.id}`,
      ts: Date.now(),
      op: "block.update",
      page: home.id,
      block: button?.id,
      set: { link: { type: "url", url: "/book" } },
    },
  ]);
  const res = await owner.api.post(`/api/sites/${siteId}/publish`, { data: {} });
  expect(res.status()).toBe(422);
  const body = (await res.json()) as { error: { code: string; message: string } };
  expect(body.error.code).toBe("publish_blocked");
  expect(body.error.message).toMatch(
    /A button on .+ links to \/book, which isn't a page on your site\./,
  );
});
