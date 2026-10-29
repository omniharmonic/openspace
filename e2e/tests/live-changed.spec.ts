import { expect, type Page, test } from "@playwright/test";
import { editPlainText, heroHeading } from "../support/edit";
import { Hub, homePage, type SiteDoc, textOf, unique } from "../support/hub";
import { canvas, closeChecklist, editorReady, openEditor, signIn } from "../support/studio";

// Owner report: a draft saved in the editor hid the work Claude had published, and there was no
// easy way to get rid of the draft and see the live version. Claude Code (or the CLI) can publish
// straight to the site's repository without going through the editor's draft; the editor must
// show that work, and never quietly publish an older draft over it.
let owner: Hub;
let siteId: string;
const CLAUDE = "Claude's sharper headline";

test.beforeEach(async () => {
  owner = await Hub.login(unique("Rosa Diaz"));
  siteId = (await owner.createSite({ name: unique("Tidewater Bakery"), template: "meadow" })).id;
});
test.afterEach(async () => owner?.dispose());

async function live(): Promise<SiteDoc> {
  return (await owner.get<{ document: SiteDoc }>(`/api/sites/${siteId}/document?ref=published`))
    .document;
}
const heroText = async () => textOf(homePage((await owner.draft(siteId)).document).sections[0]);

/** Claude Code replaces the live hero headline and pushes, without touching the draft. */
async function claudePushes(): Promise<void> {
  const hero = homePage(await live()).sections[0] as {
    blocks: Array<{ type: string; fields: { text?: string } }>;
  };
  const headline = hero.blocks.find((b) => b.type === "heading")?.fields.text ?? "";
  expect(headline).toBeTruthy();
  await owner.post("/dev/github/commit", {
    siteId,
    message: "Sharpen the home page",
    edits: [
      {
        path: "content/pages/home.json",
        find: `"text": "${headline}"`,
        replace: `"text": "${CLAUDE}"`,
      },
    ],
  });
  expect(textOf(homePage(await live()).sections[0])).toContain(CLAUDE);
}

async function draftWithOwnEdit(page: Page) {
  await openEditor(page, siteId);
  await closeChecklist(page);
  await editPlainText(page, heroHeading(canvas(page)), "Rosa's draft headline");
  await page.keyboard.press("Escape");
  await expect.poll(heroText).toContain("Rosa's draft headline");
  await owner.post(`/api/sites/${siteId}/room/flush`);
}

test("a draft with nothing of its own shows what Claude published", async ({ page, context }) => {
  await signIn(context, owner.user.name);
  await claudePushes();
  await openEditor(page, siteId);
  await closeChecklist(page);
  await expect(heroHeading(canvas(page))).toHaveText(CLAUDE);
  await expect.poll(heroText).toContain(CLAUDE);
  await expect(page.getByRole("alert", { name: "Your live site changed" })).toHaveCount(0);
});

test("an older draft asks first; going back to the live version is easy and undoable", async ({
  page,
  context,
}) => {
  await signIn(context, owner.user.name);
  await draftWithOwnEdit(page);
  await claudePushes();
  // The owner comes back to the editor later.
  await page.reload();
  await editorReady(page);

  const alert = page.getByRole("alert", { name: "Your live site changed" });
  await expect(alert).toContainText("Your live site has newer changes.");
  await expect(heroHeading(canvas(page))).toHaveText("Rosa's draft headline");

  // Publishing would replace Claude's work: the dialog says so, and the Hub refuses without it.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publish changes" });
  await expect(dialog.getByRole("alert")).toContainText("Publishing replaces them");
  await expect(dialog.getByRole("button", { name: "Publish anyway" })).toBeVisible();
  const refused = await owner.api.post(`/api/sites/${siteId}/publish`, { data: {} });
  expect(refused.status()).toBe(409);
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await alert.getByRole("button", { name: "Use the live version" }).click();
  const confirm = page.getByRole("dialog", { name: "Go back to the live version?" });
  await confirm.getByRole("button", { name: "Use the live version" }).click();
  await expect(heroHeading(canvas(page))).toHaveText(CLAUDE);
  await expect.poll(heroText).toContain(CLAUDE);
  await expect(alert).toHaveCount(0);
  expect(textOf(homePage(await live()).sections[0])).toContain(CLAUDE);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the notice and the way back to the live version fit and work at 390px", async ({
    page,
    context,
  }) => {
    await signIn(context, owner.user.name);
    // The owner's own draft change, made earlier on another device.
    const doc = (await owner.draft(siteId)).document;
    const hero = homePage(doc).sections[0] as {
      blocks: Array<{ id: string; type: string; fields: Record<string, unknown> }>;
    };
    const button = hero.blocks.find((b) => typeof b.fields.label === "string");
    expect(button).toBeTruthy();
    await owner.ops(siteId, [
      {
        id: `e2e-${Date.now().toString(36)}`,
        actor: `user:${owner.user.id}`,
        ts: Date.now(),
        op: "block.update",
        page: homePage(doc).id,
        block: button?.id,
        set: { label: "Rosa's draft button" },
      },
    ]);
    await owner.post(`/api/sites/${siteId}/room/flush`);
    await claudePushes();

    await page.goto(`/sites/${siteId}`);
    await expect(page.getByTestId("mobile-studio")).toBeVisible({ timeout: 30_000 });
    const alert = page.getByRole("alert", { name: "Your live site changed" });
    await expect(alert).toBeVisible();
    await expect(
      page.locator(".st-mob__top").getByRole("button", { name: "Unpublished changes" }),
    ).toBeVisible();
    // Nothing spills sideways on a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const box = await alert.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);

    await alert.getByRole("button", { name: "Use the live version" }).click();
    await page
      .getByRole("dialog", { name: "Go back to the live version?" })
      .getByRole("button", { name: "Use the live version" })
      .click();
    await expect.poll(heroText).toContain(CLAUDE);
    await expect
      .poll(async () => JSON.stringify((await owner.draft(siteId)).document))
      .not.toContain("Rosa's draft button");
    await expect(alert).toHaveCount(0);
  });
});
