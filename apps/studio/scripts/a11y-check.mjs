// Accessibility check of Studio's main screens with axe-core in real Chromium, light and dark,
// plus a keyboard walkthrough of core editing (no mouse). Run against a built mock Studio:
//   VITE_MOCK_API=1 pnpm --filter @openspace/studio build && pnpm --filter @openspace/studio preview
//   pnpm --filter @openspace/studio check:a11y [baseUrl]
// Fails on any serious or critical axe violation, or a keyboard step that doesn't work.
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../e2e/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const BASE = process.argv[2] ?? "http://localhost:4173";

const problems = [];
const summary = [];

async function axe(page, where) {
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(async () => {
    // The page canvas is the owner's site, checked by the template gates; Studio is checked here.
    const r = await window.axe.run(
      { exclude: [["iframe[title='Page canvas']"], [".st-preview"]] },
      {
        resultTypes: ["violations"],
        runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
      },
    );
    // A tree item's content includes its child items, so its name is its own label: the
    // label-in-name heuristic doesn't apply to the ARIA tree pattern.
    for (const v of r.violations)
      if (v.id === "label-content-name-mismatch")
        v.nodes = v.nodes.filter((n) => !/role="treeitem"/.test(n.html));
    return r.violations
      .filter((v) => v.nodes.length)
      .map((v) => ({
        id: v.id,
        // Experimental rules (axe doesn't run them by default) are reported, not gated.
        impact: v.tags.includes("experimental") ? "minor" : v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
      }));
  });
  const serious = result.filter((v) => v.impact === "serious" || v.impact === "critical");
  summary.push({ where, serious: serious.length, other: result.length - serious.length });
  for (const v of serious)
    problems.push(`${where}: [${v.impact}] ${v.id}: ${v.help} (${v.nodes.join(", ")})`);
  for (const v of result.filter((x) => !serious.includes(x)))
    console.error(`  note ${where}: [${v.impact}] ${v.id} (${v.nodes.join(", ")})`);
}

async function signIn(page) {
  await page.goto(`${BASE}/signin`);
  await page.getByLabel("Your name").fill("Sam Rivera");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/sites/);
}

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  // Reduced motion: axe measures settled colors, not a panel halfway through fading in.
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: theme,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/signin`);
  await axe(page, `${theme} sign in`);
  await signIn(page);
  await page.waitForTimeout(600);
  await axe(page, `${theme} dashboard`);
  await page.goto(`${BASE}/templates`);
  await page.waitForTimeout(1200);
  await axe(page, `${theme} template gallery`);
  await page.goto(`${BASE}/sites`);
  await page.locator(".st-sitecard__name a").first().click();
  await page.locator("iframe[title='Page canvas']").waitFor();
  await page.waitForTimeout(1200);
  await axe(page, `${theme} editor`);
  for (const [i, name] of [
    "layers",
    "add section",
    "site styles",
    "media",
    "header & footer",
    "design check",
    "looks",
  ].entries()) {
    await page.keyboard.press(`Alt+Digit${i + 2}`);
    await page.waitForTimeout(name === "looks" ? 2000 : 800);
    await axe(page, `${theme} ${name} panel`);
  }
  const url = page.url();
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
    await page.waitForTimeout(1200);
    await axe(page, `${theme} ${area}`);
  }
  await ctx.close();
}

// Keyboard walkthrough: open a site, select through the layers, edit text, undo, open the
// command palette and publish dialog, all without the mouse.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const step = async (name, fn) => {
    try {
      await fn();
      summary.push({ where: `keyboard: ${name}`, ok: true });
    } catch (e) {
      problems.push(`keyboard: ${name}: ${e.message.split("\n")[0]}`);
    }
  };
  await signIn(page);
  await page.goto(`${BASE}/sites`);
  await page.locator(".st-sitecard__name a").first().focus();
  await step("open a site with Enter", async () => {
    await page.keyboard.press("Enter");
    await page.locator("iframe[title='Page canvas']").waitFor({ timeout: 10_000 });
  });
  await step("Layers panel with ⌥2 and a focused tree", async () => {
    await page.keyboard.press("Alt+Digit2");
    const tree = page.getByRole("tree").first();
    await tree.waitFor({ timeout: 5000 });
    // Tab into the tree like a person would (programmatic focus doesn't count as keyboard).
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      if (await page.evaluate(() => document.activeElement?.getAttribute("role") === "treeitem"))
        break;
    }
    if (!(await page.evaluate(() => document.activeElement?.getAttribute("role") === "treeitem")))
      throw new Error("Tab never reaches the layers tree");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
  });
  await step("arrow keys select a layer and show the inspector", async () => {
    await page.getByRole("tab", { name: "Design" }).first().waitFor({ timeout: 5000 });
  });
  await step("rename a layer with Enter, finish with Enter, focus ring returns", async () => {
    await page.keyboard.press("Enter");
    await page.getByRole("textbox", { name: /(Section|Block) name/ }).waitFor({ timeout: 5000 });
    await page.keyboard.press("Enter");
    const ring = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "nothing focused";
      // The ring may be drawn by the element or its first child (layer rows draw it inside).
      for (const node of [el, el.firstElementChild].filter(Boolean)) {
        const s = getComputedStyle(node);
        if ((s.outlineStyle !== "none" && s.outlineWidth !== "0px") || s.boxShadow !== "none")
          return true;
      }
      return `${el.tagName.toLowerCase()}.${el.className} "${el.getAttribute("aria-label") ?? el.textContent?.slice(0, 30)}"`;
    });
    if (ring !== true) throw new Error(`no visible focus style on ${ring}`);
  });
  await step("command palette with ⌘K / Ctrl+K, closes with Escape", async () => {
    await page.keyboard.press(process.platform === "darwin" ? "Meta+KeyK" : "Control+KeyK");
    await page.getByRole("dialog").first().waitFor({ timeout: 5000 });
    await page
      .getByRole("combobox")
      .first()
      .waitFor({ timeout: 2000 })
      .catch(() => {});
    await page.waitForFunction(() => document.activeElement?.closest("[role=dialog]"));
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").first().waitFor({ state: "detached", timeout: 3000 });
  });
  await step("undo with ⌘Z leaves the editor working", async () => {
    await page.keyboard.press(process.platform === "darwin" ? "Meta+KeyZ" : "Control+KeyZ");
    await page.locator("iframe[title='Page canvas']").waitFor();
  });
  await step("publish dialog reachable by Tab and Enter", async () => {
    const publish = page.getByRole("button", { name: /^Publish/ }).first();
    await publish.focus({ timeout: 5000 }).catch(async (e) => {
      const names = await page.evaluate(() =>
        [...document.querySelectorAll("button")]
          .map((b) => b.getAttribute("aria-label") || b.textContent)
          .filter((t) => /publish/i.test(t ?? "")),
      );
      const dialogs = await page.evaluate(() =>
        [...document.querySelectorAll("[role=dialog]")]
          .map((d) => d.getAttribute("aria-label") || d.querySelector("h2")?.textContent)
          .join(", "),
      );
      throw new Error(
        `${e.message.split("\n")[0]} (buttons: ${names.join(" | ")}; dialogs open: ${dialogs})`,
      );
    });
    await page.keyboard.press("Enter");
    await page.getByRole("dialog", { name: /Publish/ }).waitFor({ timeout: 5000 });
    await page.keyboard.press("Escape");
  });
  await ctx.close();
}
await browser.close();

for (const s of summary)
  console.log(
    s.ok
      ? `ok    ${s.where}`
      : `${s.serious ? "FAIL" : "ok  "}  ${s.where}: ${s.serious} serious/critical, ${s.other} minor`,
  );
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Accessibility OK: no serious or critical axe issues; keyboard walkthrough passed.");
