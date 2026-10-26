import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { Hub, unique, waitForMail } from "../support/hub";
import { signIn } from "../support/studio";

// PRD §4.5 forms + newsletter (FR-30..FR-34): submit the live site's form with and without JS →
// Studio inbox → CSV; newsletter double opt-in through the dev outbox → confirmed in Studio.
test.describe.configure({ mode: "serial" });

let owner: Hub;
let siteId: string;
const notify = `owner-${Date.now().toString(36)}@e2e.test`;

test.beforeAll(async () => {
  owner = await Hub.login(unique("Iris Park"));
  siteId = (await owner.createSite({ name: unique("Fernwood Contact"), template: "meadow" })).id;
  await owner.patch(`/api/sites/${siteId}/services/settings`, { notifyEmail: notify });
});
test.afterAll(async () => owner?.dispose());

const contactUrl = () => `${HUB_URL}/s/${siteId}/contact/`;

test("contact form without JavaScript posts and redirects back with success", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(contactUrl());
  const form = page.locator("form[data-os-form]");
  await form.locator('[name="name"]').fill("Noor No-Script");
  await form.locator('[name="email"]').fill("noor@e2e.test");
  await form.locator('select[name="topic"]').selectOption({ index: 1 });
  await form.locator('[name="message"]').fill("Do you have a beginners class on Saturdays?");
  await form.locator('button[type="submit"], input[type="submit"]').first().click();
  await page.waitForURL(/os_form=success/);
  expect(page.url()).toContain(`/s/${siteId}/contact/`);
  await ctx.close();
});

test("contact form with JavaScript shows the success message in place", async ({ page }) => {
  await page.goto(contactUrl());
  const form = page.locator("form[data-os-form]");
  await form.locator('[name="name"]').fill("Jules Script");
  await form.locator('[name="email"]').fill("jules@e2e.test");
  await form.locator('select[name="topic"]').selectOption({ index: 1 });
  await form.locator('[name="message"]').fill("Can I book a ninety minute massage?");
  await form.locator('button[type="submit"], input[type="submit"]').first().click();
  await expect(page.locator("form[data-os-form]").getByRole("status")).toHaveText(
    "Thank you — we'll reply within a day.",
  );
  expect(page.url()).not.toContain("os_form=");
  // The owner is told right away (instant notifications by default).
  const mail = await waitForMail({ to: notify, kind: "form-notification" });
  expect(mail.text).toContain("Jules Script");
});

test("entries appear in the Studio inbox and in the CSV export", async ({ page, context }) => {
  await signIn(context, owner.user.name);
  await page.goto(`/sites/${siteId}/inbox`);
  const entries = page.getByRole("list", { name: "Entries" });
  await expect(entries).toContainText("Noor No-Script");
  await expect(entries).toContainText("Jules Script");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const file = await download;
  const csv = readFileSync((await file.path()) as string, "utf8");
  expect(csv.split("\n")[0]).toContain("form_name");
  expect(csv).toContain("Noor No-Script");
  expect(csv).toContain("jules@e2e.test");
});

test("newsletter double opt-in: signup → email in the outbox → confirm → confirmed in Studio", async ({
  page,
  context,
}) => {
  const email = `reader-${Date.now().toString(36)}@e2e.test`;
  await page.goto(contactUrl());
  const form = page.locator("form[data-os-behavior='newsletter']").first();
  await form.locator('[name="email"]').fill(email);
  await form.locator('button[type="submit"], input[type="submit"]').first().click();
  await expect(page.getByRole("status").filter({ hasText: /check your inbox/i })).toBeVisible();

  const mail = await waitForMail({ to: email, kind: "newsletter-confirm" });
  const link = mail.links.find((l) => l.includes("/n/confirm/"));
  expect(link, mail.links.join(", ")).toBeTruthy();

  // Pending in Studio until confirmed.
  const pending = await owner.get<{ counts: { pending: number; confirmed: number } }>(
    `/api/sites/${siteId}/subscribers`,
  );
  expect(pending.counts.pending).toBe(1);

  await page.goto(link as string);
  await page.getByRole("button", { name: /Confirm/ }).click();
  await expect(page.getByText(/confirmed|you're in|subscribed/i).first()).toBeVisible();

  await signIn(context, owner.user.name);
  await page.goto(`/sites/${siteId}/subscribers`);
  const row = page.getByRole("row", { name: new RegExp(email) });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Subscribed");
  const after = await owner.get<{ subscribers: Array<{ email: string; status: string }> }>(
    `/api/sites/${siteId}/subscribers`,
  );
  expect(after.subscribers.find((s) => s.email === email)?.status).toBe("confirmed");
});
