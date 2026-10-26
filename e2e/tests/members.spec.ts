import { expect, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { Hub, unique, waitForMail } from "../support/hub";

// PRD §4.8 members (FR-60/61): a members-only page on the dev preview asks for a magic link; the
// link arrives in the outbox; following it grants access to the page.
test("members-only page → magic link in the outbox → access on the /s preview", async ({
  page,
}) => {
  const owner = await Hub.login(unique("June Ito"));
  const site = await owner.createSite({ name: unique("Ito Studio"), template: "meadow" });
  const { document: doc } = await owner.draft(site.id);
  const about = Object.values(doc.pages).find((p) => p.slug === "about");
  expect(about).toBeTruthy();
  await owner.ops(site.id, [
    {
      id: `e2e-${Date.now()}`,
      actor: `user:${owner.user.id}`,
      ts: Date.now(),
      op: "page.update",
      page: about?.id,
      set: { access: { members: true } },
    },
  ]);
  const pub = await owner.publish(site.id);
  expect(pub.publish?.status).toBe("published");
  const secret = about?.title ?? "About";

  // Anonymous visitor: redirected to the Hub's member sign-in, no page content.
  await page.goto(`${HUB_URL}/s/${site.id}/about/`);
  await expect(page).toHaveURL(new RegExp(`/m/${site.id}/login`));
  const email = `member-${Date.now().toString(36)}@e2e.test`;
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(/check your inbox/i).first()).toBeVisible();

  const mail = await waitForMail({ to: email, kind: "member-magic-link" });
  const link = mail.links.find((l) => l.includes(`/m/${site.id}/verify/`));
  expect(link, mail.links.join(", ")).toBeTruthy();
  await page.goto(link as string);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(new RegExp(`/s/${site.id}/about/?$`));
  await expect(page.locator("main")).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(secret));
  // The member is now in the site's directory.
  const { members } = await owner.get<{ members: Array<{ email: string }> }>(
    `/api/sites/${site.id}/members`,
  );
  expect(members.map((m) => m.email)).toContain(email);
  await owner.dispose();
});
