import { expect, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { Hub, unique } from "../support/hub";
import { signIn } from "../support/studio";

// PRD §4.9 commerce (FR-70..FR-74): add a product to the cart on the live dev site, pay on the
// dev Stripe checkout page, the order shows in Studio, refund it.
test("cart on /s → DevStripe checkout → order in Studio → refund", async ({ page, context }) => {
  const owner = await Hub.login(unique("Ada Kiln"));
  const site = await owner.createSite({ name: unique("Kiln Shop"), template: "kiln" });
  const buyer = `buyer-${Date.now().toString(36)}@e2e.test`;
  // Checkout needs the Cloudflare hosting option (on GitHub Pages the product block says
  // "Online ordering isn't open yet." instead of offering add-to-cart): switch to it.
  const { hosting } = await owner.get<{ hosting: { actionsPublicKey: { keyId: string } } }>(
    `/api/sites/${site.id}/hosting`,
  );
  const keyId = hosting.actionsPublicKey.keyId;
  await owner.put(`/api/sites/${site.id}/hosting/secrets`, {
    secrets: [
      { name: "CLOUDFLARE_API_TOKEN", encryptedValue: "c2VhbGVk", keyId },
      { name: "CLOUDFLARE_ACCOUNT_ID", encryptedValue: "c2VhbGVk", keyId },
    ],
  });
  await owner.post(`/api/sites/${site.id}/hosting`, { target: "cloudflare" });

  // Visitor: product page → Add to cart → cart → Check out.
  await page.goto(`${HUB_URL}/s/${site.id}/shop/harbor-planter/`);
  // Tamper with the price in the page: the cart may show it, but checkout charges the catalog.
  const add = page.locator('[data-os-add][data-os-sku="SMP-HARBORPLAN"]');
  await add.evaluate((el) => el.setAttribute("data-os-price", "100"));
  await add.click();
  const cart = page.locator("dialog.os-cart");
  await expect(cart).toBeVisible();
  await expect(cart).toContainText("Harbor planter");
  await expect(cart).toContainText("$1.00"); // the tampered display price
  await cart.getByRole("button", { name: "Check out" }).click();

  // The dev Stripe checkout page (prices come from the Hub's catalog, not the browser).
  await page.waitForURL(/\/dev\/stripe\/checkout\//);
  await expect(page.locator("body")).toContainText("48.00");
  await expect(page.locator("body")).not.toContainText(/\$?1\.00\b/);
  await page.getByLabel("Email").fill(buyer);
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await page.waitForURL(/os_checkout=success/);
  expect(page.url()).toContain(`/s/${site.id}/shop/harbor-planter/`);

  // Charged the catalog price, not the tampered one.
  const { orders: paid } = await owner.get<{ orders: Array<{ number: number; total: number }> }>(
    `/api/sites/${site.id}/orders`,
  );
  expect(paid.find((o) => o.number === 1001)?.total).toBe(4800);

  // Owner: the order is in Studio's Orders; refund it in full.
  await signIn(context, owner.user.name);
  await page.goto(`/sites/${site.id}/orders`);
  const order = page.getByRole("row", { name: "Order #1001" });
  await expect(order).toBeVisible();
  await order.click();
  await expect(page.getByText(buyer).first()).toBeVisible();
  await expect(page.getByText("Harbor planter").first()).toBeVisible();
  await page.getByRole("button", { name: "Refund", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Refund order #1001" });
  await dialog.getByRole("button", { name: /^Refund \$48\.00$/ }).click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(async () => {
      const { orders } = await owner.get<{
        orders: Array<{ number: number; status: string; refunded: number }>;
      }>(`/api/sites/${site.id}/orders?status=refunded`);
      return orders.find((o) => o.number === 1001)?.refunded ?? 0;
    })
    .toBe(4800);
  await owner.dispose();
});
