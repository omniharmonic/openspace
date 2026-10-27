// Visual tour of Studio for design QA: screenshots every main surface at 1440, 834 and 390 in
// light and dark, and reports sideways overflow and clipped controls. Run against a mock build:
//   VITE_MOCK_API=1 pnpm --filter @omniharmonic/openspace-studio build && pnpm --filter @omniharmonic/openspace-studio preview
//   pnpm --filter @omniharmonic/openspace-studio tour [baseUrl] [outDir] [--only=name,name] [--widths=1440,390]
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(new URL("../../../e2e/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")),
);
const [BASE = "http://localhost:4173", OUT = "studio-tour"] = args.filter(
  (a) => !a.startsWith("--"),
);
const only = flags.only ? new Set(flags.only.split(",")) : null;
const widths = (flags.widths ?? "1440,834,390").split(",").map(Number);
const themes = (flags.themes ?? "light,dark").split(",");
mkdirSync(OUT, { recursive: true });

const problems = [];
const errors = [];

async function audit(page, where) {
  const r = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const clipped = [];
    for (const el of document.querySelectorAll("button, [role=button], a[href], input, select")) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") continue;
      // Ignore things inside the canvas iframe's scroller and deliberately off-screen items.
      if (el.closest("[aria-hidden=true], .st-sr-only, [data-overflow-ok]")) continue;
      // Inside a sideways scroller (phone toolbars, tab strips) the rest is a swipe away.
      let scroller = el.parentElement;
      while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowX))
        scroller = scroller.parentElement;
      if (scroller && scroller !== document.documentElement && scroller !== document.body) {
        const sb = scroller.getBoundingClientRect();
        if (sb.right <= window.innerWidth + 1) continue;
      }
      if (b.right > window.innerWidth + 1 && b.left < window.innerWidth)
        clipped.push(
          `${el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 30) || el.tagName} (right ${Math.round(b.right)})`,
        );
    }
    // Panels and dialogs whose content is wider than the box (clipped on the right).
    const wide = [];
    for (const box of document.querySelectorAll(
      ".st-ed-panel, [role=dialog], .st-mob__sheet, .st-ws, .st-settings",
    )) {
      for (const el of [box, ...box.querySelectorAll("*")]) {
        const s = getComputedStyle(el);
        if (!/(hidden|clip)/.test(s.overflowX)) continue;
        // Deliberate truncation (ellipsis, text-only boxes) is fine.
        if (s.textOverflow === "ellipsis" || el.children.length === 0) continue;
        if (el.scrollWidth > el.clientWidth + 1 && !/(auto|scroll)/.test(s.overflowX))
          wide.push(
            `${el.className.toString().split(" ")[0] || el.tagName} +${el.scrollWidth - el.clientWidth}px`,
          );
      }
    }
    // At "fit" zoom the page must sit inside the visible canvas, not run under a side panel.
    const occluded = [];
    const canvas = document.querySelector(".st-ed-canvas");
    const frame = document.querySelector(".st-ed-canvas__frame");
    const zoom = document.querySelector(".st-ed-zoom")?.textContent ?? "";
    if (canvas && frame && !document.querySelector("[data-testid=mobile-studio]")) {
      const c = canvas.getBoundingClientRect();
      const f = frame.getBoundingClientRect();
      for (const panel of document.querySelectorAll(".st-ed-panel")) {
        const p = panel.getBoundingClientRect();
        if (p.width && f.right > p.left + 1 && f.left < p.right - 1)
          occluded.push(`page under ${panel.className.split(" ").pop()} (zoom ${zoom.trim()})`);
      }
      if (!occluded.length && (f.right > c.right + 1 || f.left < c.left - 1))
        occluded.push(`page wider than the canvas (zoom ${zoom.trim()})`);
    }
    return { overflow, clipped: clipped.slice(0, 8), wide: wide.slice(0, 6), occluded };
  });
  if (r.overflow > 0) problems.push(`${where}: page scrolls sideways by ${r.overflow}px`);
  for (const c of r.clipped) problems.push(`${where}: control past the right edge: ${c}`);
  for (const w of r.wide) problems.push(`${where}: content wider than its box: ${w}`);
  for (const o of r.occluded) problems.push(`${where}: ${o}`);
}

async function shot(page, name, ctx) {
  if (only && !only.has(name)) return;
  await page.waitForTimeout(350);
  const file = join(OUT, `${name}-${ctx.width}-${ctx.theme}.png`);
  await page.screenshot({ path: file });
  await audit(page, `${name} ${ctx.width} ${ctx.theme}`);
}

async function signIn(page) {
  await page.goto(`${BASE}/signin`);
  await page.getByLabel("Your name").fill("Sam Rivera");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/sites/);
}

async function openFirstSite(page) {
  await page.goto(`${BASE}/sites`);
  await page.locator(".st-sitecard__name a").first().click();
  await page.waitForURL(/\/sites\/[^/]+$/);
}

const press = (page, key) => page.keyboard.press(key);
const mod = process.platform === "darwin" ? "Meta" : "Control";

async function desktopTour(page, ctx) {
  await page.goto(`${BASE}/signin`);
  await shot(page, "signin", ctx);
  await signIn(page);
  await page.waitForTimeout(600);
  await shot(page, "dashboard", ctx);
  await page.goto(`${BASE}/templates`);
  await page.waitForTimeout(1500);
  await shot(page, "gallery", ctx);
  const firstTemplate = page.getByRole("button", { name: /^Use / }).first();
  if (await firstTemplate.count()) {
    await firstTemplate.click();
    await page.waitForTimeout(900);
    await shot(page, "onboarding", ctx);
  }
  await openFirstSite(page);
  await page.locator("iframe[title='Page canvas']").waitFor();
  await page.waitForTimeout(1500);
  await shot(page, "editor", ctx);
  if (ctx.width < 768) return;
  const panels = ["layers", "add", "styles", "media", "chrome", "check", "looks"];
  for (const [i, name] of panels.entries()) {
    await page
      .locator("body")
      .click({ position: { x: 5, y: 300 } })
      .catch(() => {});
    await press(page, `Alt+Digit${i + 2}`);
    await page.waitForTimeout(name === "looks" ? 2500 : 900);
    await shot(page, `panel-${name}`, ctx);
  }
  await press(page, "Alt+Digit2");
  await page.waitForTimeout(400);
  // Select the first block on the canvas: inspector + floating block toolbar.
  const frame = page.frameLocator("iframe[title='Page canvas']");
  const heading = frame.locator(".os-section h1, .os-section h2").first();
  if (await heading.count()) {
    await heading.click();
    await page.waitForTimeout(700);
    await shot(page, "block-selected", ctx);
    await heading.dblclick();
    await page.waitForTimeout(900);
    await shot(page, "text-editing", ctx);
    await press(page, "Escape");
    await press(page, "Escape");
  }
  await press(page, `${mod}+KeyK`);
  await page.waitForTimeout(400);
  await shot(page, "command-palette", ctx);
  await press(page, "Escape");
  await page.keyboard.type("?");
  await page.waitForTimeout(400);
  await shot(page, "shortcuts", ctx);
  await press(page, "Escape");
  const publish = page.getByRole("button", { name: /^Publish/ }).first();
  if (await publish.count()) {
    await publish.click();
    await page.waitForTimeout(800);
    await shot(page, "publish", ctx);
    await press(page, "Escape");
  }
  const url = page.url().replace(/\/$/, "");
  for (const area of [
    "settings",
    "content",
    "inbox",
    "campaigns",
    "analytics",
    "orders",
    "members",
  ]) {
    await page.goto(`${url}/${area}`);
    await page.waitForTimeout(1300);
    await shot(page, `area-${area}`, ctx);
  }
}

async function phoneTour(page, ctx) {
  await signIn(page);
  await page.waitForTimeout(500);
  await shot(page, "dashboard", ctx);
  await page.goto(`${BASE}/templates`);
  await page.waitForTimeout(1500);
  await shot(page, "gallery", ctx);
  await openFirstSite(page);
  await page.getByTestId("mobile-studio").waitFor();
  await page.waitForTimeout(1000);
  await shot(page, "mobile-sections", ctx);
  await page.locator(".st-mob__row--section").first().click();
  await page.waitForTimeout(600);
  await shot(page, "mobile-section-sheet", ctx);
  const blockRow = page.getByRole("dialog").getByRole("button", { name: /^Text/ }).first();
  if (await blockRow.count()) {
    await blockRow.click();
    await page.waitForTimeout(700);
    await shot(page, "mobile-block-sheet", ctx);
    await press(page, "Escape");
  }
  await press(page, "Escape");
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.waitForTimeout(400);
  await shot(page, "mobile-pages", ctx);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.waitForTimeout(1200);
  await shot(page, "mobile-preview", ctx);
  const frame = page.frameLocator("iframe[title='Page canvas']");
  const heading = frame.locator(".os-section h1, .os-section h2").first();
  if (await heading.count()) {
    await heading.click();
    await page.waitForTimeout(700);
    await shot(page, "mobile-preview-selected", ctx);
  }
  await page.getByRole("button", { name: /Check/ }).click();
  await page.waitForTimeout(800);
  await shot(page, "mobile-check", ctx);
  await press(page, "Escape");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.waitForTimeout(400);
  await shot(page, "mobile-more", ctx);
}

const browser = await chromium.launch();
for (const width of widths)
  for (const theme of themes) {
    const phone = width < 768;
    const context = await browser.newContext({
      viewport: { width, height: phone ? 844 : width > 1000 ? 900 : 1112 },
      deviceScaleFactor: phone ? 2 : 1,
      isMobile: phone,
      hasTouch: phone,
      colorScheme: theme,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${width} ${theme}: ${e.message}`));
    const ctx = { width, theme };
    try {
      await (phone ? phoneTour(page, ctx) : desktopTour(page, ctx));
    } catch (e) {
      problems.push(`${width} ${theme}: tour stopped: ${e.message.split("\n")[0]}`);
    }
    console.log(`${width} ${theme} done`);
    await context.close();
  }
await browser.close();
for (const e of errors) console.error(`page error ${e}`);
if (problems.length) console.error(problems.join("\n"));
console.log(`Screenshots in ${OUT}`);
process.exit(problems.length || errors.length ? 1 : 0);
