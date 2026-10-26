import { expect, type Page, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { Hub, homePage, runCron, type SiteDoc, textOf, token, unique } from "../support/hub";
import { hasExif, jpegWithGps } from "../support/images";
import { canvas, canvasReady, closeChecklist, openEditor, signIn } from "../support/studio";

// PRD §4.2 editing + §4.4 publishing: FR-10..FR-16 (inline text, images, sections from presets,
// blocks, Site Styles), FR-21/22 (publish, history, rollback, scheduled publish), FR-23 media
// pipeline (metadata stripped).
test.describe.configure({ mode: "serial" });

let siteId: string;
let owner: Hub;
const headline = "Stillness, strength and good tea";

async function draft(): Promise<SiteDoc> {
  return (await owner.draft(siteId)).document;
}

async function published(page: Page): Promise<string> {
  const res = await page.request.get(`${HUB_URL}/s/${siteId}/`);
  expect(res.status()).toBe(200);
  return res.text();
}

test.beforeAll(async () => {
  owner = await Hub.login(unique("Maya Okafor"));
  const site = await owner.createSite({ name: unique("Fernwood Yoga"), template: "meadow" });
  siteId = site.id;
});

test.afterAll(async () => {
  await owner?.dispose();
});

test.beforeEach(async ({ context }) => {
  // Same person in the browser as the API client.
  await signIn(context, owner.user.name);
});

test("edit headline inline, replace an image (EXIF stripped), add a preset section and a block, change Site Styles", async ({
  page,
}) => {
  await openEditor(page, siteId);
  await closeChecklist(page);
  const frame = canvas(page);

  // 1. Headline: double-click the hero heading, replace its words, Enter commits (FR-11).
  const h1 = frame.locator("h1").first();
  const original = ((await h1.textContent()) ?? "").trim();
  await h1.dblclick();
  await expect(h1).toHaveAttribute("contenteditable", /plaintext-only|true/);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(headline);
  await page.keyboard.press("Enter");
  await expect(h1).toHaveText(headline);
  await expect.poll(async () => textOf(homePage(await draft()).sections[0])).toContain(headline);
  expect(original).not.toBe(headline);

  // 2. Replace the hero photo with a JPEG carrying GPS EXIF (FR-23: location data removed).
  await page.keyboard.press("Escape");
  await frame.locator("[data-os-section]").first().locator("img").first().click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  await inspector
    .getByRole("button", { name: /^Replace/ })
    .first()
    .click();
  const picker = page.getByRole("dialog");
  await picker.getByTestId("media-file-input").setInputFiles({
    name: "studio-portrait.jpg",
    mimeType: "image/jpeg",
    buffer: jpegWithGps(),
  });
  let mediaPath = "";
  await expect
    .poll(
      async () => {
        const doc = await draft();
        const hit = JSON.stringify(homePage(doc).sections[0]).match(
          /"(media\/[^"]+\.(?:jpe?g|webp|avif))"/,
        );
        mediaPath = hit?.[1] ?? "";
        return mediaPath;
      },
      { timeout: 30_000 },
    )
    .toMatch(/studio-portrait/);
  // The upload finishes in the background (the canvas shows the local copy meanwhile).
  const proxied = `${HUB_URL}/api/sites/${siteId}/${mediaPath}`;
  await expect
    .poll(async () => (await page.request.get(proxied)).status(), { timeout: 30_000 })
    .toBe(200);
  const bytes = Buffer.from(await (await page.request.get(proxied)).body());
  expect(bytes.length).toBeGreaterThan(1000);
  expect(hasExif(bytes)).toBe(false);
  // After a reload (no session blob any more) the canvas still shows the new photo.
  await page.reload();
  await canvasReady(page);
  await closeChecklist(page);
  const heroImg = frame
    .locator("[data-os-section]")
    .first()
    .locator(`img[src*="${mediaPath}"]`)
    .first();
  await heroImg.scrollIntoViewIfNeeded();
  await expect
    .poll(() => heroImg.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0);

  // 3. Add a section from the preset gallery (FR-12).
  const sectionsBefore = homePage(await draft()).sections.length;
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Add section" })
    .click();
  await page
    .getByRole("searchbox", { name: "Search sections" })
    .or(page.getByLabel("Search sections"))
    .first()
    .fill("pricing");
  await page
    .locator('[aria-label*=":"]')
    .filter({ has: page.locator("iframe") })
    .first()
    .click();
  await expect.poll(async () => homePage(await draft()).sections.length).toBe(sectionsBefore + 1);
  const added = homePage(await draft()).sections.find((s) => s.preset?.startsWith("pricing/"));
  expect(added, "a pricing preset section on Home").toBeTruthy();

  // 4. Add a block with the block menu ("/") into the selected section (FR-13).
  const blocksBefore = homePage(await draft()).sections.reduce((n, s) => n + s.blocks.length, 0);
  // The inserted section is selected; its inspector offers "Add block".
  await page
    .getByRole("complementary", { name: "Inspector" })
    .getByRole("button", { name: "Add block" })
    .click();
  const menu = page.getByPlaceholder("Add a block…");
  await expect(menu).toBeVisible();
  await menu.fill("Quote");
  await page.keyboard.press("Enter");
  await expect
    .poll(async () => homePage(await draft()).sections.reduce((n, s) => n + s.blocks.length, 0))
    .toBe(blocksBefore + 1);
  expect(JSON.stringify(homePage(await draft()))).toContain('"type":"quote"');

  // 5. Site Styles: a curated palette and a font pairing (FR-16), live on the canvas.
  const stylesBefore = JSON.stringify((await draft()).styles);
  await page
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Site styles" })
    .click();
  const palettes = page.getByRole("group", { name: "Curated palettes" });
  await palettes.locator('button[aria-pressed="false"]').nth(2).click();
  const pairings = page.getByRole("group", { name: "Font pairings" });
  const pairing = pairings.locator('button[aria-pressed="false"]').nth(3);
  const pairingName = await pairing.getAttribute("aria-label");
  await pairing.click();
  await expect(pairings.getByRole("button", { name: pairingName ?? "" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect.poll(async () => JSON.stringify((await draft()).styles)).not.toBe(stylesBefore);
});

test("publish → live site reflects the edits; history lists the version", async ({ page }) => {
  await openEditor(page, siteId);
  await closeChecklist(page);
  const doc = await draft();
  const before = await published(page);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publish changes" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Publish now" }).click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(async () => (await published(page)).includes(headline), { timeout: 30_000 })
    .toBe(true);
  const html = await published(page);
  expect(html).toContain("studio-portrait");
  // Site Styles reached the rendered page: new brand color (palette) and heading font (pairing).
  for (const t of ["color-brand", "font-heading"]) {
    expect(token(html, t), t).toBeTruthy();
    expect(token(html, t), t).not.toBe(token(before, t));
  }
  const pub = await owner.get<{ document: SiteDoc }>(`/api/sites/${siteId}/document?ref=published`);
  expect(JSON.stringify(pub.document.styles)).toBe(JSON.stringify(doc.styles));
  expect(homePage(pub.document).sections.some((s) => s.preset?.startsWith("pricing/"))).toBe(true);

  await page.getByRole("button", { name: "History" }).click();
  const history = page.getByRole("dialog", { name: "History" });
  const versions = history.getByRole("list", { name: "Published versions" });
  await expect(versions.getByRole("listitem")).toHaveCount(2);
  await expect(versions.getByRole("listitem").first()).toContainText(/Live now/);
});

test("rollback restores the previous version (as a new version)", async ({ page }) => {
  await openEditor(page, siteId);
  await closeChecklist(page);
  await page.getByRole("button", { name: "History" }).click();
  const history = page.getByRole("dialog", { name: "History" });
  const versions = history.getByRole("list", { name: "Published versions" });
  await versions
    .getByRole("listitem")
    .last()
    .getByRole("button", { name: /Roll back to the version/ })
    .click();
  const confirm = page.getByRole("dialog", { name: "Roll back to this version?" });
  await confirm.getByRole("button", { name: "Roll back" }).click();

  await expect
    .poll(async () => (await published(page)).includes(headline), { timeout: 30_000 })
    .toBe(false);
  await expect(versions.getByRole("listitem")).toHaveCount(3);
  const list = await owner.get<{ versions: Array<{ kind: string; current: boolean }> }>(
    `/api/sites/${siteId}/versions`,
  );
  expect(list.versions[0]).toMatchObject({ kind: "rollback", current: true });
  // The draft follows the live site after a rollback.
  await expect
    .poll(async () => textOf(homePage(await draft()).sections[0]))
    .not.toContain(headline);
});

test("schedule publish runs when due (cron)", async ({ page }) => {
  test.setTimeout(240_000);
  // An unpublished change, made through Studio.
  await openEditor(page, siteId);
  await closeChecklist(page);
  const frame = canvas(page);
  const h1 = frame.locator("h1").first();
  const scheduled = "Scheduled headline for spring";
  await h1.dblclick();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(scheduled);
  await page.keyboard.press("Enter");
  await expect.poll(async () => textOf(homePage(await draft()).sections[0])).toContain(scheduled);

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Publish changes" });
  await dialog.getByRole("radio", { name: "Schedule" }).click();
  // The next whole minute at least 90 s ahead (Studio needs ≥ 60 s; margin for slow runs).
  const at = new Date(Math.ceil((Date.now() + 90_000) / 60_000) * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  await dialog
    .getByLabel("Date")
    .fill(`${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`);
  await dialog.getByLabel("Time").fill(`${pad(at.getHours())}:${pad(at.getMinutes())}`);
  await dialog.getByRole("button", { name: "Schedule" }).click();
  await expect(dialog).toBeHidden();
  // Reopening the dialog lists the pending schedule.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    dialog.getByRole("list", { name: "Scheduled publishes" }).getByRole("listitem"),
  ).toHaveCount(1);
  await page.keyboard.press("Escape");
  const { schedules } = await owner.get<{ schedules: Array<{ status: string }> }>(
    `/api/sites/${siteId}/schedule`,
  );
  expect(schedules[0]?.status).toBe("pending");
  expect(await published(page)).not.toContain(scheduled);

  // Not due yet: the cron leaves it alone.
  await runCron();
  expect(await published(page)).not.toContain(scheduled);

  // Wait for the due time, then run the minute cron (wrangler dev doesn't fire crons by itself).
  await page.waitForTimeout(Math.max(0, at.getTime() - Date.now() + 1_000));
  await runCron();
  await expect
    .poll(async () => (await published(page)).includes(scheduled), { timeout: 30_000 })
    .toBe(true);
  const after = await owner.get<{ schedules: Array<{ status: string }> }>(
    `/api/sites/${siteId}/schedule`,
  );
  expect(after.schedules[0]?.status).toBe("done");
});
