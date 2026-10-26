// Lighthouse (mobile, default throttling) on every template demo home page, built through
// site-kit and served statically. Prints a Markdown table and writes JSON summaries.
//   node scripts/build-templates.mjs && node scripts/lighthouse.mjs [--only=meadow] [--runs=3]
// CI gate: --min-perf=95 --min-a11y=100 [--max-lcp=2000] exits 1 when a template falls short
// (medians), after printing the table.
// CHROME_PATH picks the browser (default: Playwright's Chromium on macOS or Linux, else Chrome).
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
// HTTP/2 over TLS like the hosts sites publish to (default); --http1 for the old harness.
const HTTP2 = !flags.http1;

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
  const linuxCache = join(homedir(), ".cache", "ms-playwright");
  if (existsSync(linuxCache)) {
    const dirs = readdirSync(linuxCache)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort();
    for (const d of dirs.reverse()) {
      for (const sub of ["chrome-linux64", "chrome-linux"]) {
        const bin = join(linuxCache, d, sub, "chrome");
        if (existsSync(bin)) return bin;
      }
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
  chromeFlags: [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    ...(HTTP2 ? ["--ignore-certificate-errors"] : []),
  ],
});
const rows = [];
try {
  for (const id of ids) {
    const server = await serve(join(BUILD, id, "dist"), 0, { http2: HTTP2 });
    const url = `${HTTP2 ? "https" : "http"}://localhost:${server.address().port}${PAGE}`;
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

// CI gate (doc 04 §8.3 / PRD §7.1): fail when any template is below the thresholds.
const minPerf = flags["min-perf"] ? Number(flags["min-perf"]) : null;
const minA11y = flags["min-a11y"] ? Number(flags["min-a11y"]) : null;
const maxLcp = flags["max-lcp"] ? Number(flags["max-lcp"]) : null;
const failures = rows.flatMap((r) => [
  ...(minPerf !== null && r.perf < minPerf ? [`${r.id}: performance ${r.perf} < ${minPerf}`] : []),
  ...(minA11y !== null && r.a11y < minA11y
    ? [`${r.id}: accessibility ${r.a11y} < ${minA11y}`]
    : []),
  ...(maxLcp !== null && r.lcp > maxLcp ? [`${r.id}: LCP ${ms(r.lcp)} > ${ms(maxLcp)}`] : []),
]);
if (ids.length === 0 && (minPerf !== null || minA11y !== null)) {
  console.error("No built templates found: run scripts/build-templates.mjs first.");
  process.exit(1);
}
if (failures.length) {
  console.error(`\nLighthouse thresholds not met:\n${failures.map((f) => `- ${f}`).join("\n")}`);
  process.exit(1);
}
