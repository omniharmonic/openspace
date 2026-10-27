// Stress check (doc 04 §8.2): load every stress page written by `src/stress.render.test.ts` at
// 320, 390, 834, 1280, 1440 and 1920 px and at 200% zoom (1280 px at 2×, so 640 CSS px), and
// report anything that runs past the screen or out of its box. Failing sections are
// screenshotted. Usage:
//   OS_STRESS=$PWD/out/stress pnpm --filter @omniharmonic/openspace-visual-tests exec vitest run src/stress.render.test.ts
//   node scripts/stress.mjs [out/stress] [--widths=320,390] [--only=hero/] [--shots=out/stress-shots]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./serve.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, "..", "..", "..", "e2e", "package.json"));
const { chromium } = require("@playwright/test");

const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v = "1"] = a.slice(2).split("=");
      return [k, v];
    }),
);
const DIR = args.find((a) => !a.startsWith("--")) ?? join(HERE, "..", "out", "stress");
const SHOTS = flags.shots ?? join(HERE, "..", "out", "stress-shots");
const VIEWPORTS = [
  { name: "320", width: 320, height: 720, scale: 2, mobile: true },
  { name: "390", width: 390, height: 844, scale: 2, mobile: true },
  { name: "834", width: 834, height: 1112, scale: 1, mobile: false },
  { name: "1280", width: 1280, height: 800, scale: 1, mobile: false },
  { name: "1440", width: 1440, height: 900, scale: 1, mobile: false },
  { name: "1920", width: 1920, height: 1080, scale: 1, mobile: false },
  { name: "1280@200%", width: 640, height: 400, scale: 2, mobile: false },
].filter((v) => !flags.widths || flags.widths.split(",").includes(v.name));

const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
const presets = manifest.presets.filter((p) => !flags.only || p.id.startsWith(flags.only));
const headers = flags.only ? [] : manifest.headers;
mkdirSync(SHOTS, { recursive: true });

/** Runs in the page: problems per section (`[data-os-id]`) or for the header. */
function check(ids) {
  const W = window.innerWidth;
  const desc = (el) => {
    const cls = typeof el.className === "string" ? el.className.split(" ")[0] : "";
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${text ? ` "${text}"` : ""}`;
  };
  const clipper = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) return a;
    }
    return null;
  };
  const scan = (root) => {
    const out = new Set();
    for (const el of root.querySelectorAll("*")) {
      // Hidden on purpose (spam traps, screen-reader text) or meant to run past the edge.
      if (
        el.closest(
          '[aria-hidden="true"], .os-visually-hidden, [aria-roledescription="carousel"], [data-os-behavior="carousel"], [data-os-behavior="marquee"]',
        )
      )
        continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.position === "fixed") continue;
      if (r.right > W + 1 || r.left < -1) {
        const a = clipper(el);
        const ar = a?.getBoundingClientRect();
        if (!a || ar.right > W + 1 || ar.left < -1) out.add(`past the screen edge: ${desc(el)}`);
      }
      if (
        /^(H[1-6]|P|A|BUTTON|LI|FIGCAPTION|BLOCKQUOTE|DT|DD|LABEL|TD|TH)$/.test(el.tagName) &&
        el.clientWidth > 0 &&
        el.scrollWidth > el.clientWidth + 2 &&
        s.textOverflow !== "ellipsis" &&
        !/(auto|scroll)/.test(s.overflowX)
      )
        out.add(`text wider than its box: ${desc(el)}`);
    }
    return [...out].slice(0, 6);
  };
  const result = { pageOverflow: document.documentElement.scrollWidth - W, sections: {} };
  for (const id of ids) {
    const el =
      id === "header"
        ? document.querySelector("header")
        : document.querySelector(`[data-os-id="${id}"]`);
    if (el) result.sections[id] = scan(el);
  }
  return result;
}

const server = await serve(DIR);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const failures = [];
let checked = 0;
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  const visit = async (path, ids, label, variantOf) => {
    await page.goto(base + path, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(check, ids);
    checked += ids.length;
    for (const [id, problems] of Object.entries(r.sections)) {
      if (!problems.length) continue;
      const variant = variantOf(id);
      const shot = join(
        SHOTS,
        `${label.replaceAll("/", "_")}--${variant}--${vp.name.replace("%", "pct")}.png`,
      );
      const target =
        id === "header" ? page.locator("header").first() : page.locator(`[data-os-id="${id}"]`);
      await target.screenshot({ path: shot }).catch(() => {});
      failures.push({ what: label, variant, viewport: vp.name, problems, shot });
    }
    if (r.pageOverflow > 0 && !Object.values(r.sections).some((p) => p.length))
      failures.push({
        what: label,
        variant: "page",
        viewport: vp.name,
        problems: [`page scrolls sideways by ${r.pageOverflow}px`],
      });
  };
  for (const p of presets) {
    const variants = new Map(p.sections.map((s) => [s.id, s.variant]));
    await visit(p.path, [...variants.keys()], p.id, (id) => variants.get(id));
  }
  for (const h of headers) await visit(h.path, ["header"], `header ${h.id}`, () => "header");
  console.error(`${vp.name}: done (${failures.length} failures so far)`);
  await ctx.close();
}
await browser.close();
server.close();

writeFileSync(join(SHOTS, "report.json"), JSON.stringify({ checked, failures }, null, 2));
console.log(
  `Checked ${checked} renders (${presets.length} presets × variations, ${headers.length} headers) at ${VIEWPORTS.length} sizes.`,
);
if (!failures.length) console.log("No overflow or clipped text.");
else {
  console.log(`${failures.length} failures:`);
  for (const f of failures)
    console.log(`- ${f.what} [${f.variant}] @ ${f.viewport}: ${f.problems.join("; ")}`);
}
process.exitCode = failures.length ? 1 : 0;
