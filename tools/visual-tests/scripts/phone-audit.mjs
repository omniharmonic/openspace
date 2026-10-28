// Phone audit: every page of every rendered template at 360, 390 and 768 px, measured by the
// Phone check's in-browser probe (@omniharmonic/openspace-lint phone-probe), with screenshots.
//   OS_TEMPLATE_RENDER=<renderDir> OS_LOOKS=1 pnpm --filter @omniharmonic/openspace-templates exec vitest run render
//   node --experimental-strip-types scripts/phone-audit.mjs <renderDir> <outDir> [--only=meadow]
//        [--widths=360,390,768] [--shots=home|all|none] [--port=8797]
// Writes <outDir>/report.json (every finding), <outDir>/summary.md (counts per template and
// kind) and <outDir>/shots/<template>-<page>-<width>.png (full height, downscaled to 50%).
import { execFileSync } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  PHONE_PREPARE_SCRIPT,
  PHONE_PROBE_SCRIPT,
} from "../../../packages/lint/src/phone-probe.ts";
import { serve } from "./serve.mjs";

const require = createRequire(join(import.meta.dirname, "../../../e2e/package.json"));
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
const [renderDir, outDir] = args.filter((a) => !a.startsWith("--"));
if (!renderDir || !outDir) throw new Error("usage: phone-audit.mjs <renderDir> <outDir>");
const widths = (flags.widths ?? "360,390,768").split(",").map(Number);
const shots = flags.shots ?? "home";
const PORT = Number(flags.port ?? 8797);

async function pagesOf(dir, prefix = "") {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name === "index.html") out.push(prefix || "home");
    if (e.isDirectory())
      out.push(...(await pagesOf(join(dir, e.name), `${prefix}${prefix ? "/" : ""}${e.name}`)));
  }
  return out;
}

await mkdir(join(outDir, "shots"), { recursive: true });
const server = await serve(renderDir, PORT);
const browser = await chromium.launch();
const report = [];
try {
  const ids = (await readdir(renderDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name !== "_os")
    .map((e) => e.name)
    .filter((id) => !flags.only || flags.only.split(",").includes(id))
    .sort();
  for (const id of ids) {
    const [look] = (await readdir(join(renderDir, id), { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    const pages = (await pagesOf(join(renderDir, id, look))).sort();
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: width < 700 ? 780 : 1024 },
        deviceScaleFactor: 1,
        reducedMotion: "reduce",
        hasTouch: width < 700,
        isMobile: width < 700,
      });
      for (const name of pages) {
        const page = await context.newPage();
        const url = `http://localhost:${PORT}/${id}/${look}/${name === "home" ? "" : `${name}/`}`;
        try {
          await page.goto(url, { waitUntil: "load", timeout: 30_000 });
          await page.evaluate(PHONE_PREPARE_SCRIPT);
          const result = await page.evaluate(PHONE_PROBE_SCRIPT);
          report.push({ template: id, page: name, width, ...result });
          const want = shots === "all" || (shots === "home" && name === "home");
          if (want) {
            const file = join(outDir, "shots", `${id}-${name.replaceAll("/", "_")}-${width}.png`);
            await page.screenshot({ path: file, fullPage: true });
            try {
              execFileSync("sips", ["--resampleWidth", String(Math.round(width / 2)), file], {
                stdio: "ignore",
              });
            } catch {
              // full size elsewhere
            }
          }
          const n = result.findings.length;
          if (n) console.log(`${id}/${name}@${width}: ${n} finding(s)`);
        } catch (e) {
          console.error(`${id}/${name}@${width}: ${e.message.split("\n")[0]}`);
          report.push({ template: id, page: name, width, error: e.message.split("\n")[0] });
        } finally {
          await page.close();
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

await writeFile(join(outDir, "report.json"), `${JSON.stringify(report, null, 1)}\n`);
const byKind = new Map();
const byTemplate = new Map();
let total = 0;
for (const r of report)
  for (const f of r.findings ?? []) {
    total++;
    const k = `${f.kind}@${r.width < 700 ? "phone" : "tablet"}`;
    byKind.set(k, (byKind.get(k) ?? 0) + 1);
    byTemplate.set(r.template, (byTemplate.get(r.template) ?? 0) + 1);
  }
const lines = [
  `# Phone audit — ${new Date().toISOString().slice(0, 10)}`,
  "",
  `Pages × widths measured: ${report.length} (${widths.join(", ")} px). Findings: ${total}.`,
  "",
  "## By kind",
  "",
  "| kind | count |",
  "| --- | ---: |",
  ...[...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} |`),
  "",
  "## By template",
  "",
  "| template | findings |",
  "| --- | ---: |",
  ...[...byTemplate.entries()].sort().map(([k, n]) => `| ${k} | ${n} |`),
  "",
];
await writeFile(join(outDir, "summary.md"), lines.join("\n"));
console.log(`\n${total} findings → ${join(outDir, "summary.md")}`);
