import { expect, test } from "@playwright/test";
import { Hub, unique } from "../support/hub";
import { signIn } from "../support/studio";

// PRD §4.7 custom domains (FR-50..FR-52): the wizard's dev path — look up, DNS records with a
// registrar guide, connect, the DNS checklist, the dev resolver says it's correct, HTTPS → live.
test("domains wizard: records, connect, checklist, verified on the dev resolver", async ({
  page,
  context,
}) => {
  const owner = await Hub.login(unique("Tom Hale"));
  const site = await owner.createSite({ name: unique("Hale Ceramics"), template: "kiln" });
  const domain = `www.hale-${Date.now().toString(36)}.test`;
  await signIn(context, owner.user.name);

  await page.goto(`/sites/${site.id}/settings/domains`);
  await page.getByRole("textbox", { name: "Domain" }).fill(domain);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: /Add these records/ })).toBeVisible();
  await expect(page.getByRole("table").first()).toContainText("CNAME");
  await page.getByRole("button", { name: `I've added the records — connect ${domain}` }).click();

  // The checklist renders, then (dev resolver: *.test is correctly configured) goes green.
  const checklist = page.locator(".st-checklist-dns");
  await expect(checklist.getByRole("listitem").first()).toBeVisible();
  const checkNow = page.getByRole("button", { name: /Check now|Check again/ });
  if (await checkNow.isVisible().catch(() => false)) await checkNow.click();
  await expect(page.getByText("Secure and live.")).toBeVisible({ timeout: 30_000 });

  const { domain: view } = await owner.get<{
    domain: { hostname: string; status: string; https: boolean };
  }>(`/api/sites/${site.id}/domain`);
  expect(view).toMatchObject({ hostname: domain, status: "active", https: true });
  await owner.dispose();
});
