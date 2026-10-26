import { expect, test } from "@playwright/test";
import { STUDIO_URL } from "../support/env";
import { Hub, homePage, unique } from "../support/hub";
import { canvas, closeChecklist, openEditor, signIn } from "../support/studio";

// PRD §4.3 roles (FR-24/25): invite an Editor from Studio; the invitation link works; the Editor
// cannot change Site Styles or arrange the grid — controls are disabled and the Hub refuses too.
test("invite an editor; editors can't change styles or the grid (UI + Hub)", async ({
  page,
  context,
  browser,
}) => {
  const owner = await Hub.login(unique("Maya Okafor"));
  const site = await owner.createSite({ name: unique("Fernwood Team"), template: "meadow" });
  const editor = await Hub.login(unique("Eli Cho"));

  // Owner: switch the hero to a grid, then invite the editor from Settings → People.
  await signIn(context, owner.user.name);
  await openEditor(page, site.id);
  await closeChecklist(page);
  await canvas(page).locator("h1").first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("radio", { name: "Grid layout" }).click();
  await expect
    .poll(async () => homePage((await owner.draft(site.id)).document).sections[0]?.layout.mode)
    .toBe("grid");

  await page.goto(`/sites/${site.id}/settings/collaborators`);
  await page.getByRole("textbox", { name: "Email or GitHub username" }).fill(editor.user.login);
  await page.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: "Editor" }).click();
  await page.getByRole("button", { name: "Invite" }).click();
  const link = (await page.getByRole("status").locator("code").textContent())?.trim() ?? "";
  expect(link).toMatch(new RegExp(`^${STUDIO_URL}/invite/`));

  // Editor: opens the invitation link, accepts, lands in the editor.
  const ed = await browser.newContext({
    baseURL: STUDIO_URL,
    viewport: { width: 1440, height: 900 },
  });
  await signIn(ed, editor.user.name);
  const ep = await ed.newPage();
  await ep.goto(link);
  await expect(ep.getByRole("heading", { name: `Join ${site.name}` })).toBeVisible();
  await expect(ep.getByText(/as Editor/)).toBeVisible();
  await ep.getByRole("button", { name: "Accept invitation" }).click();
  await ep.waitForURL(new RegExp(`/sites/${site.id}`));
  await expect(canvas(ep).locator("[data-os-section]").first()).toBeVisible();
  await closeChecklist(ep);

  // UI: Site Styles controls are disabled for editors.
  await ep
    .getByRole("navigation", { name: "Panels" })
    .getByRole("button", { name: "Site styles" })
    .click();
  const palettes = ep.getByRole("group", { name: "Curated palettes" });
  await expect(palettes.getByRole("button").first()).toBeDisabled();
  await expect(
    ep.getByRole("group", { name: "Font pairings" }).getByRole("button").first(),
  ).toBeDisabled();

  // UI: the grid can't be arranged — no handles, the bar says why, layout switch disabled.
  const img = canvas(ep)
    .locator("[data-os-section]")
    .first()
    .locator('[data-os-block="image"]')
    .first();
  await img.click();
  await expect(ep.locator(".st-grid__handle")).toHaveCount(0);
  await expect(ep.getByRole("toolbar", { name: "Grid" })).toContainText(
    /designer|owner|can’t|can't/i,
  );

  // Hub: the room refuses the same changes from an editor.
  const doc = (await editor.draft(site.id)).document;
  const hero = homePage(doc).sections[0];
  const imgId = (await img.getAttribute("data-os-id")) as string;
  const styles = await editor.submitOps(site.id, [
    { op: "styles.patch", patch: { set: { "choices.pairing": "modern-grotesk" } } },
  ]);
  expect(styles.body.results?.[0]).toMatchObject({ status: "rejected", code: "forbidden" });
  const grid = await editor.submitOps(site.id, [
    {
      op: "grid.place",
      page: homePage(doc).id,
      section: hero?.id,
      block: imgId,
      bp: "d",
      rect: { x: 2, y: 2, w: 6, h: 6 },
    },
  ]);
  expect(grid.body.results?.[0]).toMatchObject({ status: "rejected", code: "forbidden" });
  // …but text edits are fine for editors.
  const heading = hero?.blocks.find((b) => b.type === "heading");
  const ok = await editor.submitOps(site.id, [
    {
      op: "block.update",
      page: homePage(doc).id,
      block: heading?.id,
      set: { text: "Edited by our editor" },
    },
  ]);
  expect(ok.body.results?.[0]?.status).toBe("accepted");

  await ed.close();
  await owner.dispose();
  await editor.dispose();
});
