// Lighthouse (mobile, default throttling) on every template demo home page, built through
// site-kit and served statically. Prints a Markdown table and writes JSON summaries.
//   node scripts/build-templates.mjs && node scripts/lighthouse.mjs [--only=meadow] [--runs=3]
// CHROME_PATH picks the browser (default: Playwright's Chromium, else Google Chrome).
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import { templateIds } from "./build-templates.mjs";
import { serve } from "./serve.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..");
const args = process.argv.slice(2);
const flags = Object.fromEntries(
  args
    .filter((a) => a.startsWith("--"))
    .map((a) => {
      const [k, v = "1"] = a.slice(2).split("=");
      return [k, v];
    }),
);
const BUILD = flags.build ?? join(PKG, ".build");
const OUT = flags.out ?? join(PKG, "out", "lighthouse");
const RUNS = Number(flags.runs ?? 1);
const PAGE = flags.page ?? "/";

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(homedir(), "Library", "Caches", "ms-playwright");
  if (existsSync(cache)) {
    const dirs = readdirSync(cache)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort();
    for (const d of dirs.reverse()) {
      const app = join(cache, d, "chrome-mac-arm64", "Google Chrome for Testing.app");
      const bin = join(app, "Contents", "MacOS", "Google Chrome for Testing");
      if (existsSync(bin)) return bin;
      const linux = join(cache, d, "chrome-linux", "chrome");
      if (existsSync(linux)) return linux;
    }
  }
  return undefined;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const only = flags.only?.split(",");
const ids = (await templateIds()).filter(
  (t) => (!only || only.includes(t)) && existsSync(join(BUILD, t, "dist")),
);
await mkdir(OUT, { recursive: true });
const chrome = await chromeLauncher.launch({
  chromePath: chromePath(),
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
});
const rows = [];
try {
  for (const id of ids) {
    const server = await serve(join(BUILD, id, "dist"));
    const url = `http://localhost:${server.address().port}${PAGE}`;
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const r = await lighthouse(url, {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      });
      runs.push(r.lhr);
    }
    server.close();
    const pick = (fn) => median(runs.map(fn));
    const lhr = runs[0];
    const audit = (k) => (l) => l.audits[k]?.numericValue ?? 0;
    const row = {
      id,
      perf: pick((l) => Math.round(l.categories.performance.score * 100)),
      a11y: pick((l) => Math.round(l.categories.accessibility.score * 100)),
      bp: pick((l) => Math.round(l.categories["best-practices"].score * 100)),
      seo: pick((l) => Math.round(l.categories.seo.score * 100)),
      fcp: pick(audit("first-contentful-paint")),
      lcp: pick(audit("largest-contentful-paint")),
      tbt: pick(audit("total-blocking-time")),
      cls: pick(audit("cumulative-layout-shift")),
      si: pick(audit("speed-index")),
      js:
        Math.round(
          (lhr.audits["network-requests"]?.details?.items ?? [])
            .filter((it) => it.resourceType === "Script")
            .reduce((n, it) => n + (it.transferSize ?? 0), 0) / 102.4,
        ) / 10,
      failing: Object.values(lhr.audits)
        .filter(
          (a) =>
            a.score !== null &&
            a.score < 0.9 &&
            a.scoreDisplayMode !== "informative" &&
            a.scoreDisplayMode !== "notApplicable" &&
            a.scoreDisplayMode !== "manual",
        )
        .map((a) => `${a.id}${a.displayValue ? ` (${a.displayValue})` : ""}`),
    };
    rows.push(row);
    await writeFile(join(OUT, `${id}.json`), JSON.stringify(row, null, 2));
    if (flags.full) await writeFile(join(OUT, `${id}.lhr.json`), JSON.stringify(lhr));
    console.error(`${id}: perf ${row.perf} a11y ${row.a11y} bp ${row.bp} seo ${row.seo}`);
  }
} finally {
  await chrome.kill();
}

const ms = (n) => `${(n / 1000).toFixed(2)} s`;
console.log(
  "| Template | Perf | A11y | Best practices | SEO | FCP | LCP | TBT | CLS | Speed Index | JS (KB, transfer) |",
);
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows)
  console.log(
    `| ${r.id} | ${r.perf} | ${r.a11y} | ${r.bp} | ${r.seo} | ${ms(r.fcp)} | ${ms(r.lcp)} | ${Math.round(r.tbt)} ms | ${r.cls.toFixed(3)} | ${ms(r.si)} | ${r.js} |`,
  );
for (const r of rows) if (r.failing.length) console.log(`\n${r.id}: ${r.failing.join(", ")}`);
