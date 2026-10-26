import { gzipSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { HUB_URL } from "../support/env";
import { anonHub, Hub, unique } from "../support/hub";
import { canvasReady, closeChecklist, signIn } from "../support/studio";

// NFRs: accessibility (Global Constraint 10, WCAG 2.2 AA — zero serious/critical axe violations on
// every template demo home and Studio's main screens) and performance (Global Constraint 11 —
// published content pages ship < 30 KB of JavaScript, gzipped).

async function seriousViolations(page: Page, opts: { exclude?: string[] } = {}) {
  let builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
    "wcag22aa",
  ]);
  for (const sel of opts.exclude ?? []) builder = builder.exclude(sel);
  const { violations } = await builder.analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.nodes
          .slice(0, 3)
          .map(
            (n) =>
              `${n.target.join(" ")} ${n.html.slice(0, 140)} — ${(n.failureSummary ?? "").replace(/\s+/g, " ").slice(0, 160)}`,
          )
          .join(" | ")}`,
    );
}

let templates: Array<{ id: string; looks: Array<{ id: string }> }> = [];
test.beforeAll(async () => {
  const api = await anonHub();
  templates = ((await (await api.get("/api/templates")).json()) as { templates: typeof templates })
    .templates;
  await api.dispose();
  expect(templates.length).toBeGreaterThanOrEqual(12);
});

test("axe: every template demo home in every look has no serious/critical violations", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const failures: string[] = [];
  for (const t of templates) {
    for (const look of t.looks) {
      await page.goto(`${HUB_URL}/t/${t.id}/?look=${look.id}`);
      await page.waitForLoadState("networkidle");
      const v = await seriousViolations(page);
      if (v.length) failures.push(`${t.id}/${look.id}: ${v.join("; ")}`);
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("axe: Studio main screens (gallery, new site, dashboard, editor) have no serious/critical violations", async ({
  page,
  context,
}) => {
  const failures: string[] = [];
  const check = async (name: string, exclude?: string[]) => {
    const v = await seriousViolations(page, { exclude });
    if (v.length) failures.push(`${name}: ${v.join("; ")}`);
  };
  await page.goto("/templates");
  await expect(page.getByRole("article", { name: "Meadow" })).toBeVisible();
  await check("gallery", ["iframe"]);
  await page.goto("/new/meadow");
  await expect(page.getByRole("heading", { name: "Make it yours" })).toBeVisible();
  await check("new site", ["iframe"]);

  const owner = await Hub.login(unique("Axe Person"));
  const site = await owner.createSite({ name: unique("Axe Studio"), template: "meadow" });
  await signIn(context, owner.user.name);
  await page.goto("/sites");
  await expect(page.getByRole("heading", { name: "Your sites" })).toBeVisible();
  await check("dashboard");
  await page.goto(`/sites/${site.id}`);
  await canvasReady(page);
  await closeChecklist(page);
  // The canvas iframe is the person's site (covered by the template scans above).
  await check("editor", ['iframe[title="Page canvas"]']);
  await page.goto(`/sites/${site.id}/settings/general`);
  await check("settings");
  await owner.dispose();
  expect(failures, failures.join("\n")).toEqual([]);
});

test("JS budget: published pages ship < 30 KB of JavaScript (gzipped)", async ({ page }) => {
  test.setTimeout(180_000);
  const owner = await Hub.login(unique("Budget Person"));
  const results: string[] = [];
  // A content template, a shop (cart) and an events/newsletter-heavy one.
  for (const template of ["meadow", "kiln", "encore"]) {
    const site = await owner.createSite({ name: unique(`Budget ${template}`), template });
    const bodies = new Map<string, Buffer>();
    page.on("response", async (res) => {
      const type = res.headers()["content-type"] ?? "";
      if (res.request().resourceType() === "script" || type.includes("javascript")) {
        try {
          bodies.set(res.url(), await res.body());
        } catch {
          /* navigation raced the body */
        }
      }
    });
    await page.goto(`${HUB_URL}/s/${site.id}/`);
    await page.waitForLoadState("networkidle");
    // Inline scripts count too.
    const inline = await page.$$eval("script:not([src])", (els) =>
      els.map((e) => e.textContent ?? "").join("\n"),
    );
    const total =
      [...bodies.values()].reduce((n, b) => n + gzipSync(b).length, 0) +
      gzipSync(Buffer.from(inline)).length;
    results.push(`${template}: ${(total / 1024).toFixed(1)} KB gz (${bodies.size} files)`);
    expect(total, results.join(", ")).toBeLessThan(30 * 1024);
    page.removeAllListeners("response");
  }
  test.info().annotations.push({ type: "js-budget", description: results.join(", ") });
  console.log(`[js-budget] ${results.join(", ")}`);
  await owner.dispose();
});
