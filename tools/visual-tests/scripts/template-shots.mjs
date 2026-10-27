// Screenshots of rendered template pages for the visual review (docs/qa/templates) and the
// template images on openspace.host (apps/www/media).
//   OS_TEMPLATE_RENDER=<dir> pnpm --filter @omniharmonic/openspace-templates exec vitest run render
//   node scripts/template-shots.mjs <renderDir> <outDir> [--only=orbit,darkroom] [--pages=home,work]
//        [--widths=1440,390] [--look=1] [--full] [--port=8798]
//   node scripts/template-shots.mjs <renderDir> <outDir> --looks      # <id>-looks.png sheets
//   node scripts/template-shots.mjs <renderDir> <outDir> --showcase   # <id>.jpg, 1280 × 800
// Serves <renderDir> (pages use root-relative URLs, so any port works). Page shots are full
// height, saved as <template>-<page>-<width>.png and downscaled like the committed set
// (1440 → 480, 834 → 320, 390 → 240 px wide) unless --full. Pages default to `home` plus every
// top-level page. `--look=N` is the template's Nth look (template.json order). Look sheets put
// the top of the home page in each of the three looks side by side (1400 × 478).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { serve } from "./serve.mjs";

const require = createRequire(join(import.meta.dirname, "../../../e2e/package.json"));
const { chromium } = require("@playwright/test");
const TEMPLATES = join(import.meta.dirname, "../../../templates");

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
const SHEET = { width: 1400, height: 478, gap: 10 };

/** Look ids in the template's own order (the render folder only knows their names). */
function lookIds(id) {
  return JSON.parse(readFileSync(join(TEMPLATES, id, "template.json"), "utf8")).looks.map(
    (l) => l.id,
  );
}

/** Scroll through so lazy photos load, then wait for any still decoding. */
async function settle(page) {
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
          : new Promise((r) => {
              img.addEventListener("load", r, { once: true });
              setTimeout(r, 4000);
            }),
      ),
    );
  });
  await page.waitForTimeout(300);
}

await mkdir(outDir, { recursive: true });
const PORT = Number(flags.port ?? 8798);
const server = await serve(renderDir, PORT);
const browser = await chromium.launch();
const open = async (url, width, height) => {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "load" });
  await settle(page);
  return { page, context };
};
try {
  const ids = (await readdir(renderDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name !== "_os")
    .map((e) => e.name)
    .filter((id) => !flags.only || flags.only.split(",").includes(id));
  for (const id of ids) {
    const looks = lookIds(id);
    const base = (look) => `http://localhost:${PORT}/${id}/${look}/`;

    if (flags.looks) {
      // Each column is 460 px wide: the top 1496 px of a 1440 px page, scaled.
      const col = (SHEET.width - 2 * SHEET.gap) / 3;
      const shots = [];
      for (const look of looks.slice(0, 3)) {
        const { page, context } = await open(base(look), 1440, 900);
        const png = await page.screenshot({
          clip: { x: 0, y: 0, width: 1440, height: Math.round((SHEET.height * 1440) / col) },
          fullPage: true,
        });
        shots.push(png.toString("base64"));
        await context.close();
      }
      const context = await browser.newContext({
        viewport: { width: SHEET.width, height: SHEET.height },
      });
      const page = await context.newPage();
      await page.setContent(
        `<body style="margin:0;display:flex;gap:${SHEET.gap}px;background:#8a8a8a">${shots
          .map(
            (b) =>
              `<img src="data:image/png;base64,${b}" style="width:${col}px;height:${SHEET.height}px;object-fit:cover;object-position:top">`,
          )
          .join("")}</body>`,
      );
      await page.screenshot({ path: join(outDir, `${id}-looks.png`) });
      await context.close();
      console.log(`${id}: look sheet`);
      continue;
    }

    if (flags.showcase) {
      const { page, context } = await open(base(looks[0]), 1280, 800);
      await page.screenshot({ path: join(outDir, `${id}.jpg`), type: "jpeg", quality: 80 });
      await context.close();
      console.log(`${id}: showcase`);
      continue;
    }

    const look = looks[Number(flags.look ?? 1) - 1] ?? looks[0];
    const pages = (await readdir(join(renderDir, id, look), { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    const wanted = flags.pages ? flags.pages.split(",") : ["home", ...pages];
    for (const name of wanted) {
      for (const width of widths) {
        const { page, context } = await open(
          `${base(look)}${name === "home" ? "" : `${name}/`}`,
          width,
          900,
        );
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
