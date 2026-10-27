import { expect, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { Hub, unique } from "../support/hub";
import { canvasReady, editorReady, signIn } from "../support/studio";

// "It has to just work" (docs/design/NON-TECHNICAL-ONBOARDING.md).

// Journey 1 — new from a template: gallery → name → sign in → setting up → the first-run tour
// ends on "Your site is live — and it's yours." → Finish setting up lists what's left, guided.
test("template journey: live first, a tour that ends on 'it's yours', then Finish setting up", async ({
  page,
}) => {
  const name = unique("Fernwood Yoga");
  await page.goto("/templates");
  const meadow = page.getByRole("article", { name: "Meadow" });
  await meadow.getByRole("button", { name: "Use Meadow" }).click();
  await page.getByLabel("Site name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Your name").fill(unique("Rae Okafor"));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Setting up your site…" })).toBeVisible();
  await page.waitForURL(/\/sites\/st_[0-9a-z]+/, { timeout: 60_000 });
  await editorReady(page);

  // The tour: three stops, then the celebration with the live link.
  const tour = page.getByRole("dialog", { name: "This is your site" });
  await expect(tour).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Next" }).click();
  const end = page.getByRole("dialog", { name: /Your site is live — and it's yours/ });
  await expect(end).toBeVisible();
  await expect(end).toContainText("No monthly fee. No lock-in.");
  await expect(end.getByRole("link")).toHaveAttribute("href", /\/s\/st_|github\.io/);
  await end.getByRole("button", { name: "Start editing" }).click();
  await expect(end).toBeHidden();

  // Finish setting up: nothing required, a domain suggested, each step explained and timed.
  await page.getByRole("button", { name: /Finish setting up/ }).click();
  await expect(page).toHaveURL(/\/settings\/setup$/);
  const domain = page.getByTestId("setup-domain");
  await expect(domain).toContainText("Use your own domain");
  await expect(domain).toContainText("About 15 minutes");
  await expect(page.getByText(/none of them is urgent/)).toBeVisible();
  await domain.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Open the domain helper" }).click();
  await expect(page).toHaveURL(/\/settings\/domains$/);
  await expect(page.getByText(/your site stays online at its current address/)).toBeVisible();

  // "Need a hand?" knows what's next.
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.getByRole("button", { name: "Need a hand?" }).click();
  await expect(page.getByRole("heading", { name: "Next: Use your own domain" })).toBeVisible();
});

// Journey 2 — a site with a shop on GitHub Pages: it publishes fine and looks finished (a designed
// "opening soon" note, no broken checkout); Finish setting up offers "Open your shop"; the
// Cloudflare helper moves it with one pasted key and the live page then sells.
test("store on GitHub Pages publishes fine, then Finish setting up opens the shop", async ({
  page,
  context,
}) => {
  const owner = await Hub.login(unique("Ada Kiln"));
  const site = await owner.createSite({ name: unique("Kiln Studio"), template: "kiln" });
  expect(site.status).toBe("live");
  const view = await owner.get<{ deployTarget: string }>(`/api/sites/${site.id}`);
  expect(view.deployTarget).toBe("github-pages");

  // The live product page: whole, with the opening-soon note and nothing to click that fails.
  const productUrl = `${HUB_URL}/s/${site.id}/shop/harbor-planter/`;
  const live = await page.request.get(productUrl);
  expect(live.status()).toBe(200);
  const html = await live.text();
  expect(html).toContain("Online ordering opens here soon.");
  expect(html).toContain("os-soon");
  expect(html).not.toContain("data-os-add");
  expect(html).not.toMatch(/Cloudflare|Settings → Hosting/);

  // Wow first, in the Hub: the move is refused with a plain reason until it would work.
  const refused = await owner.api.post(`/api/sites/${site.id}/hosting`, {
    data: { target: "cloudflare" },
  });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error.message).toMatch(/isn't connected yet/);

  // Owner: the checklist shows up and the shop helper does the rest.
  await signIn(context, owner.user.name);
  await page.goto(`/sites/${site.id}`);
  await canvasReady(page);
  await page.getByRole("button", { name: /Finish setting up/ }).click();
  const shop = page.getByTestId("setup-store");
  await expect(shop).toContainText("Open your shop");
  await expect(shop).toContainText(/pay you directly/);
  await shop.getByRole("button", { name: "Start" }).click();
  const helper = page.getByRole("dialog", { name: "Open your shop" });
  await expect(
    helper.getByRole("link", { name: /Open Cloudflare, ready to create/ }),
  ).toHaveAttribute("href", /dash\.cloudflare\.com\/profile\/api-tokens\?permissionGroupKeys=/);
  // A key Cloudflare doesn't know is explained, not accepted.
  const key = helper.getByLabel("Your Cloudflare key");
  await key.fill(`bad_${"Q".repeat(40)}`);
  await expect(helper.getByText(/didn't recognise that token/)).toBeVisible();
  await key.fill(`dev_${"K".repeat(40)}`);
  await expect(helper.getByText(/Found/)).toContainText("Your Cloudflare account");
  await helper.getByRole("button", { name: "Move my site to Cloudflare" }).click();
  await expect(helper.getByText("Your site runs on your own Cloudflare account.")).toBeVisible({
    timeout: 30_000,
  });

  // The move is confirmed; the address follows; the shop sells.
  await expect
    .poll(
      async () => (await owner.get<{ deployTarget: string }>(`/api/sites/${site.id}`)).deployTarget,
    )
    .toBe("cloudflare");
  const hosting = await owner.get<{ hosting: { switching: { status: string } } }>(
    `/api/sites/${site.id}/hosting`,
  );
  expect(hosting.hosting.switching.status).toBe("done");
  await expect
    .poll(async () => (await (await page.request.get(productUrl)).text()).includes("data-os-add"))
    .toBe(true);
  await owner.dispose();
});
