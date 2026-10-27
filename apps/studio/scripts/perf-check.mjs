// Studio performance check (PRD §7.1): first load of the editor under a throttled "fast 4G,
// mid-range phone" profile, JavaScript transferred per route, typing latency in the inspector
// and the time from a keystroke to the canvas showing it. Run against a built mock Studio:
//   VITE_MOCK_API=1 pnpm --filter @omniharmonic/openspace-studio build && pnpm --filter @omniharmonic/openspace-studio preview
//   pnpm --filter @omniharmonic/openspace-studio check:perf [baseUrl] [--dist=dist] [--runs=3]
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const require = createRequire(new URL("../../../e2e/package.json", import.meta.url));
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
const BASE = args.find((a) => !a.startsWith("--")) ?? "http://localhost:4173";
const DIST = flags.dist ?? new URL("../dist", import.meta.url).pathname;
const RUNS = Number(flags.runs ?? 3);
// Lighthouse's mobile profile: 150 ms RTT, 1.6 Mbps down is "slow 4G"; Studio targets a
// laptop or tablet on ordinary broadband, so we use "fast 4G": 40 ms RTT, 9 Mbps, CPU ×4.
const NETWORK = {
  offline: false,
  latency: 40,
  downloadThroughput: (9 * 1024 * 1024) / 8,
  uploadThroughput: (3 * 1024 * 1024) / 8,
};

const gz = new Map();
function gzipSize(url) {
  const path = new URL(url).pathname;
  if (gz.has(path)) return gz.get(path);
  let n = 0;
  try {
    const file = join(DIST, path);
    if (statSync(file).isFile()) n = gzipSync(readFileSync(file)).length;
  } catch {}
  gz.set(path, n);
  return n;
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

const browser = await chromium.launch();
async function session(throttle) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  // Sign in first (unthrottled): the measurement starts at a warm session, cold cache.
  await page.goto(`${BASE}/signin`);
  await page.getByLabel("Your name").fill("Sam Rivera");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/sites/);
  const site = await page.locator(".st-sitecard__name a").first().getAttribute("href");
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (throttle) {
    await cdp.send("Network.emulateNetworkConditions", NETWORK);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  return { ctx, page, cdp, site };
}

async function firstLoad(path) {
  const { ctx, page, cdp, site } = await session(true);
  const scripts = new Set();
  page.on("request", (r) => {
    if (r.resourceType() === "script") scripts.add(r.url());
  });
  const url = path === "editor" ? `${BASE}${site}` : `${BASE}/sites`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "commit" });
  if (path === "editor") {
    // Usable: the page is on the canvas (its sections rendered inside the frame).
    await page
      .frameLocator("iframe[title='Page canvas']")
      .locator(".os-section")
      .first()
      .waitFor({ timeout: 60_000 });
  } else {
    await page.locator(".st-sitecard").first().waitFor({ timeout: 60_000 });
  }
  const ms = Date.now() - t0;
  const js = [...scripts].reduce((n, u) => n + gzipSize(u), 0);
  if (flags.list)
    console.error(
      `${path}:\n${[...scripts].map((u) => `  ${kb(gzipSize(u))}  ${new URL(u).pathname}`).join("\n")}`,
    );
  await cdp.detach();
  await ctx.close();
  return { ms, js, count: scripts.size };
}

async function typing() {
  const s = await session(false);
  await s.page.goto(`${BASE}${s.site}`);
  const frame = s.page.frameLocator("iframe[title='Page canvas']");
  await frame.locator(".os-section").first().waitFor();
  // Select the first heading-like text block through the canvas and type in the inspector.
  await frame.locator(".os-section h1, .os-section h2").first().click();
  const input = s.page
    .locator(".st-ip textarea, .st-ip input[type=text], .st-ip [contenteditable=true]")
    .first();
  await input.waitFor({ timeout: 10_000 });
  await input.click();
  await s.page.keyboard.press("End");
  const typed = [];
  const painted = [];
  for (const ch of "Sunrise") {
    // Keystroke → next frame painted with the new character in the field (input latency),
    // and → the canvas showing it (canvas update).
    const r = await s.page.evaluate(
      (c) =>
        new Promise((resolve) => {
          const t0 = performance.now();
          const el = document.activeElement;
          const frameDoc = document.querySelector("iframe[title='Page canvas']")?.contentDocument;
          const before = frameDoc?.body.textContent ?? "";
          el.dispatchEvent(new KeyboardEvent("keydown", { key: c, bubbles: true }));
          if (el.isContentEditable) document.execCommand("insertText", false, c);
          else {
            const proto =
              el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
            const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value").set;
            setter.call(el, el.value + c);
            el.dispatchEvent(new Event("input", { bubbles: true }));
          }
          let input;
          requestAnimationFrame(() =>
            setTimeout(() => {
              input = performance.now() - t0;
              const poll = () => {
                const now = frameDoc?.body.textContent ?? "";
                if (now !== before) resolve([input, performance.now() - t0]);
                else if (performance.now() - t0 > 3000) resolve([input, -1]);
                else requestAnimationFrame(poll);
              };
              poll();
            }, 0),
          );
        }),
      ch,
    );
    typed.push(r[0]);
    painted.push(r[1]);
    await s.page.waitForTimeout(120);
  }
  await s.ctx.close();
  return { input: median(typed), canvas: median(painted.filter((x) => x >= 0)) };
}

const loads = { dashboard: [], editor: [] };
for (let i = 0; i < RUNS; i++) {
  loads.dashboard.push(await firstLoad("dashboard"));
  loads.editor.push(await firstLoad("editor"));
}
const t = await typing();
await browser.close();

console.log("| Measure | Result | Target |");
console.log("|---|---|---|");
for (const [name, runs] of Object.entries(loads)) {
  const r = runs[0];
  console.log(
    `| ${name} first load (fast 4G, CPU ×4, cold cache; median of ${runs.length}) | ${(median(runs.map((x) => x.ms)) / 1000).toFixed(2)} s | < 3 s |`,
  );
  console.log(`| ${name} JavaScript (gzip, ${r.count} files) | ${kb(r.js)} | — |`);
}
console.log(
  `| Typing in the inspector (keystroke → next frame) | ${t.input.toFixed(0)} ms | < 50 ms |`,
);
console.log(`| Keystroke → canvas shows it | ${t.canvas.toFixed(0)} ms | < 100 ms |`);
