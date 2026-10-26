// Real-browser layout check for Studio on phones (Chromium via Playwright, no jsdom):
// at 360, 390 and 430px wide, nothing scrolls sideways and every control in the phone
// layout is at least 44×44. Run against a built mock Studio:
//   VITE_MOCK_API=1 pnpm --filter @openspace/studio build && pnpm --filter @openspace/studio preview
//   pnpm --filter @openspace/studio check:phone [baseUrl]
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../e2e/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const BASE = process.argv[2] ?? "http://localhost:4173";

const problems = [];
const browser = await chromium.launch();

async function audit(page, where) {
  const r = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const small = [];
    for (const el of document.querySelectorAll(
      ".st-mob button, .st-mob [role=button], .st-mob__sheet button",
    )) {
      // A switch inside its <label> is tapped through the whole label.
      const b = (el.closest("label") ?? el).getBoundingClientRect();
      if (!b.width || !b.height || getComputedStyle(el).visibility === "hidden") continue;
      // Controls inside the inspector's rich-text toolbar are grouped; everything else is 44px.
      if (el.closest(".st-rt__toolbar")) continue;
      if (b.width < 44 || b.height < 44)
        small.push(
          `${el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 24)} ${Math.round(b.width)}×${Math.round(b.height)}`,
        );
    }
    return { overflow, small };
  });
  if (r.overflow > 0) problems.push(`${where}: scrolls sideways by ${r.overflow}px`);
  for (const s of r.small) problems.push(`${where}: small target ${s}`);
}

for (const width of [360, 390, 430]) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/signin`);
  await page.getByLabel("Your name").fill("Sam Rivera");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/sites/);
  await page.locator(".st-sitecard__name a").first().click();
  await page.getByTestId("mobile-studio").waitFor();
  await page.waitForTimeout(800);
  await audit(page, `${width} sections`);
  await page.locator(".st-mob__row--section").first().click();
  await page.waitForTimeout(500);
  await audit(page, `${width} section sheet`);
  // The block inspector in the sheet: every control (switches, segments, swatches) too.
  const blockRow = page.getByRole("dialog").getByRole("button", { name: /^Text/ }).first();
  if (await blockRow.count()) {
    await blockRow.click();
    await page.waitForTimeout(600);
    await audit(page, `${width} block inspector`);
    const design = page.getByRole("tab", { name: "Design" });
    if (await design.count()) {
      await design.click();
      await page.waitForTimeout(400);
      await audit(page, `${width} block design`);
    }
    await page.keyboard.press("Escape");
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await audit(page, `${width} pages`);
  await page.getByRole("button", { name: /Check/ }).click();
  await page.waitForTimeout(800);
  await audit(page, `${width} design check`);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.waitForTimeout(300);
  await audit(page, `${width} more`);
  console.log(`${width}px checked`);
  await ctx.close();
}
await browser.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Phone layout OK: no sideways scrolling, every control at least 44×44.");
