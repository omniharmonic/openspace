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

  // Visitor: product page → Add to cart → cart → Check out.
  await page.goto(`${HUB_URL}/s/${site.id}/shop/harbor-planter/`);
  await page.locator('[data-os-add][data-os-sku="SMP-HARBORPLAN"]').click();
  const cart = page.locator("dialog.os-cart");
  await expect(cart).toBeVisible();
  await expect(cart).toContainText("Harbor planter");
  await cart.getByRole("button", { name: "Check out" }).click();

  // The dev Stripe checkout page (prices come from the Hub's catalog, not the browser).
  await page.waitForURL(/\/dev\/stripe\/checkout\//);
  await expect(page.locator("body")).toContainText("48.00");
  await page.getByLabel("Email").fill(buyer);
  await page.getByRole("button", { name: "Pay (test)" }).click();
  await page.waitForURL(/os_checkout=success/);
  expect(page.url()).toContain(`/s/${site.id}/shop/harbor-planter/`);

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
