// Screenshots of rendered template pages for the visual review (docs/qa/templates).
//   OS_TEMPLATE_RENDER=<dir> pnpm --filter @omniharmonic/openspace-templates exec vitest run render
//   node scripts/template-shots.mjs <renderDir> <outDir> [--only=orbit,darkroom] [--pages=home,work]
//        [--widths=1440,390] [--look=1] [--full]
// Serves <renderDir> on :8798 (--port; pages use root-relative URLs, so any port works) and saves full-page shots as
// <template>-<page>-<width>.png, downscaled like the committed set (1440 → 480, 834 → 320,
// 390 → 240 px wide) unless --full. Pages default to `home` plus every top-level page.
import { execFileSync } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
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
if (!renderDir || !outDir) throw new Error("usage: template-shots.mjs <renderDir> <outDir>");
const widths = (flags.widths ?? "1440,390").split(",").map(Number);
const SCALE = { 1440: 480, 834: 320, 390: 240 };
const lookIndex = Number(flags.look ?? 1) - 1;

await mkdir(outDir, { recursive: true });
const PORT = Number(flags.port ?? 8798);
const server = await serve(renderDir, PORT);
const browser = await chromium.launch();
try {
  const ids = (await readdir(renderDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name !== "_os")
    .map((e) => e.name)
    .filter((id) => !flags.only || flags.only.split(",").includes(id));
  for (const id of ids) {
    const looks = (await readdir(join(renderDir, id))).sort();
    const look = looks[lookIndex] ?? looks[0];
    const pages = (await readdir(join(renderDir, id, look), { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    const wanted = flags.pages ? flags.pages.split(",") : ["home", ...pages];
    for (const name of wanted) {
      const path = name === "home" ? "" : `${name}/`;
      for (const width of widths) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          deviceScaleFactor: 1,
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        await page.goto(`http://localhost:${PORT}/${id}/${look}/${path}`, { waitUntil: "load" });
        // Lazy images: scroll through so every photo loads before the full-page shot.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y);
            await new Promise((r) => setTimeout(r, 60));
          }
          window.scrollTo(0, 0);
          await Promise.all(
            [...document.images].map((img) =>
              img.complete
                ? null
                : new Promise(
                    (r) => img.addEventListener("load", r, { once: true }) || setTimeout(r, 4000),
                  ),
            ),
          );
        });
        await page.waitForTimeout(300);
        const file = join(outDir, `${id}-${name}-${width}.png`);
        await page.screenshot({ path: file, fullPage: true });
        // Downscale after capture (a fractional deviceScaleFactor draws hairline seams between
        // sections). macOS `sips`; elsewhere the shot stays full size.
        if (!flags.full && SCALE[width])
          try {
            execFileSync("sips", ["--resampleWidth", String(SCALE[width]), file], {
              stdio: "ignore",
            });
          } catch {}
        await context.close();
      }
    }
    console.log(`${id}: ${wanted.join(", ")}`);
  }
} finally {
  await browser.close();
  server.close?.();
}
