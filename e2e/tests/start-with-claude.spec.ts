import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { devLogin, unique } from "../support/hub";
import { BASE_JPEG } from "../support/images";
import { canvas, closeChecklist, openEditor } from "../support/studio";

const here = dirname(fileURLToPath(import.meta.url));
const BAKERY = resolve(here, "../../packages/import/src/__fixtures__/claude-html/bakery.html");

interface DocBody {
  document: {
    styles: { choices: { palette: { brand: string } } };
    designSystem?: { brief?: { about?: string }; sources?: Array<{ kind: string }> };
    components?: Record<string, unknown>;
  };
}

// Start with Claude: an idea and a design-token file (plus a photo) → a live default site in
// that brand, carrying the design-system record → the hand-off to Claude → the editor.
test("Start with Claude: idea + design tokens → live site in their brand → hand-off → editor", async ({
  page,
}) => {
  await devLogin(page.context().request, unique("Mairi Baker"));
  await page.goto("/templates");
  await page.getByRole("link", { name: /Start with Claude/ }).click();
  await expect(page.getByRole("heading", { name: "Start with Claude" })).toBeVisible();
  // Start with Claude happens in Claude now; the quick form is one link away.
  await page.getByRole("link", { name: "Prefer a quick form instead?" }).click();
  await page.waitForURL(/\/start\/form/);
  const name = unique("Crumb and Kettle");
  await page.getByLabel("Site name").fill(name);
  await page.getByLabel("What is it for?").fill("A neighbourhood bakery and tea room in Leith.");
  await page
    .getByLabel("Who is it for?")
    .fill("Locals on their way to work, families at the weekend");
  await page.getByRole("button", { name: "warm", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Bring anything you already have" }),
  ).toBeVisible();
  const tokens = {
    color: {
      cream: { $value: "#fbf3e6", $type: "color" },
      cocoa: { $value: "#3b2416", $type: "color" },
      primary: { $value: "#b5532a", $type: "color" },
    },
    font: { heading: { $value: "Fraunces", $type: "fontFamily" } },
  };
  await page.locator('input[type="file"]').setInputFiles([
    {
      name: "crumb-design-tokens.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(tokens)),
    },
    { name: "loaves.jpg", mimeType: "image/jpeg", buffer: readFileSync(BASE_JPEG) },
  ]);
  await expect(page.getByText("crumb-design-tokens.json")).toBeVisible();
  await expect(page.getByText("loaves.jpg")).toBeVisible();
  await page.getByRole("button", { name: "Make my site" }).click();

  await page.waitForURL(/\/start\/st_[0-9a-z]+/, { timeout: 60_000 });
  const siteId = /\/start\/(st_[0-9a-z]+)/.exec(page.url())?.[1] as string;
  await expect(page.getByRole("heading", { name: `${name} is live` })).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    page.getByRole("heading", { name: /Now let Claude design it with you/ }),
  ).toBeVisible();
  await expect(page.getByText(/What it's for: A neighbourhood bakery/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Design-from-scratch skill/ })).toBeVisible();

  // The live site wears the brand; the draft carries the brief and tokens.
  const doc = (await (
    await page.request.get(`${HUB_URL}/api/sites/${siteId}/document`)
  ).json()) as DocBody;
  expect(doc.document.styles.choices.palette.brand).toBe("#b5532a");
  expect(doc.document.designSystem?.brief?.about).toContain("bakery");
  expect(doc.document.designSystem?.sources?.map((s) => s.kind)).toEqual(
    expect.arrayContaining(["template", "tokens", "photos"]),
  );
  const live = await page.request.get(`${HUB_URL}/s/${siteId}/`);
  expect(live.status()).toBe(200);
  expect((await live.text()).toLowerCase()).toContain("#b5532a");

  await page.getByRole("button", { name: "Open it in the editor" }).click();
  await page.waitForURL(/\/sites\/st_[0-9a-z]+/);
  await expect(canvas(page).locator("[data-os-section]").first()).toBeVisible({ timeout: 30_000 });
});

// A page Claude made, uploaded through Move my site → an editable site, live at once: every
// section is a designer component whose words are fields in Studio's inspector.
test("Upload a page Claude made → a live site whose sections are editable", async ({ page }) => {
  await devLogin(page.context().request, unique("Page Owner"));
  await page.goto("/move");
  await page.getByLabel("This is my site, or I’m moving it for its owner.").check();
  await page.getByLabel("Name for your new site").fill(unique("Crumb Page"));
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "bakery.html", mimeType: "text/html", buffer: readFileSync(BAKERY) });

  await page.waitForURL(/\/start\/st_[0-9a-z]+/, { timeout: 60_000 });
  const siteId = /\/start\/(st_[0-9a-z]+)/.exec(page.url())?.[1] as string;
  await expect(page.getByText(/Your page is now a real site/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /is live$/ })).toBeVisible({ timeout: 60_000 });

  const doc = (await (
    await page.request.get(`${HUB_URL}/api/sites/${siteId}/document`)
  ).json()) as DocBody;
  expect(Object.keys(doc.document.components ?? {}).length).toBeGreaterThanOrEqual(5);
  expect(doc.document.designSystem?.sources?.[0]?.kind).toBe("html");
  const live = await (await page.request.get(`${HUB_URL}/s/${siteId}/`)).text();
  expect(live).toContain("Bread worth");
  expect(live).toContain("data-os-component=");

  // Its words are fields: click the hero headline and change it in the inspector.
  await openEditor(page, siteId);
  await closeChecklist(page);
  const frame = canvas(page);
  await frame.getByText("Made slowly, by hand").click();
  const inspector = page.getByRole("complementary", { name: "Inspector" });
  const heading = inspector.getByLabel("Heading", { exact: true });
  await expect(heading).toHaveValue("Made slowly, by hand");
  await heading.fill("Baked slowly, by hand");
  await heading.blur();
  await expect(frame.getByText("Baked slowly, by hand")).toBeVisible();
});
