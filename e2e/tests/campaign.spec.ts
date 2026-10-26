import { expect, test } from "@playwright/test";
import { anonHub, Hub, type OutboxMessage, unique, waitForMail } from "../support/hub";
import { signIn } from "../support/studio";

// PRD §4.10 email campaigns (FR-36..FR-38): compose in Studio → send to a tag segment → mail lands
// in the dev outbox for that segment only, with List-Unsubscribe headers.
test("compose → send to a segment → outbox has it with List-Unsubscribe", async ({
  page,
  context,
}) => {
  const owner = await Hub.login(unique("Willa Stone"));
  const site = await owner.createSite({ name: unique("Willow Street Yoga"), template: "meadow" });
  const tag = `retreats${Date.now().toString(36)}`;
  const inSeg = [`a-${tag}@e2e.test`, `b-${tag}@e2e.test`];
  const outSeg = `c-${tag}@e2e.test`;
  const imported = await owner.post<{ added: number }>(`/api/sites/${site.id}/subscribers/import`, {
    csv: `email,tags\n${inSeg[0]},${tag}\n${inSeg[1]},${tag}\n${outSeg},\n`,
    consent: true,
  });
  expect(imported.added).toBe(3);

  await signIn(context, owner.user.name);
  await page.goto(`/sites/${site.id}/campaigns/new`);
  const subject = `Winter retreat ${tag}`;
  await page.getByRole("textbox", { name: "Subject" }).fill(subject);
  const tags = page.getByLabel("Only subscribers tagged");
  await tags.fill(tag);
  await tags.press("Enter");
  await expect(page.getByText(new RegExp(`Subscribers tagged ${tag}: 2 people`))).toBeVisible();

  await page.getByRole("button", { name: "Send now" }).click();
  const confirm = page.getByRole("dialog", { name: "Send to 2 people?" });
  await confirm.getByRole("button", { name: "Send now" }).click();
  await expect(confirm).toBeHidden();

  for (const to of inSeg) {
    const m: OutboxMessage = await waitForMail({ to, kind: "campaign" });
    expect(m.subject).toBe(subject);
    expect(m.headers["List-Unsubscribe"]).toMatch(/^<http:\/\/localhost:\d+\/n\/unsubscribe\/.+>$/);
    expect(m.text).not.toContain("{{os_");
  }
  const api = await anonHub();
  const res = await api.get(`/dev/outbox.json?to=${encodeURIComponent(outSeg)}`);
  const { messages } = (await res.json()) as { messages: OutboxMessage[] };
  expect(messages.filter((m) => m.kind === "campaign")).toHaveLength(0);
  await api.dispose();
  await owner.dispose();
});
