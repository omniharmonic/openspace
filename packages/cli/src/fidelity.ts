/**
 * Visual fidelity in a real browser (Playwright, optional): measure the original site's look
 * while importing (`lookProber`), and compare an imported site with the original
 * (`openspace compare`, `openspace import … --compare`, the local MCP tool `compare_fidelity`):
 * both are rendered at desktop and phone widths, measured by the same probe, diffed per page and
 * per section, and put side by side in PNGs (original left, OpenSpace right).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  compareLooks,
  type FidelityReport,
  fidelityMarkdown,
  fidelityReport,
  type LookProbe,
  type PageComparison,
  PROBE_SCRIPT,
  parseProbe,
} from "@omniharmonic/openspace-import";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { loadSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { CliError } from "./io";
import { startPreviewServer } from "./mcp/preview-server";
import { loadPlaywright, prepareScript } from "./mcp/screenshot";

// biome-ignore lint/suspicious/noExplicitAny: Playwright is optional and untyped here
type Browser = any;
// biome-ignore lint/suspicious/noExplicitAny: Playwright is optional and untyped here
type Page = any;

export const DESKTOP = 1440;
export const PHONE = 390;

async function launch(): Promise<Browser> {
  const pw = await loadPlaywright();
  if ("error" in pw) throw new CliError(pw.error);
  try {
    return await pw.chromium.launch({ headless: true });
  } catch (first) {
    try {
      return await pw.chromium.launch({ headless: true, channel: "chrome" });
    } catch {
      throw new CliError(
        `Couldn't start a browser (${(first as Error).message.split("\n")[0]}). Run \`npx playwright install chromium\`.`,
      );
    }
  }
}

/** Open a page at a width, let lazy content and fonts settle. */
async function open(browser: Browser, url: string, width: number): Promise<Page> {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    deviceScaleFactor: 1,
    ...(width < 700 ? { isMobile: true, hasTouch: true } : {}),
  });
  await page.goto(url, { waitUntil: "load", timeout: 45_000 });
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.evaluate(prepareScript()).catch(() => undefined);
  await page.evaluate("document.fonts && document.fonts.ready").catch(() => undefined);
  return page;
}

async function probe(page: Page): Promise<LookProbe> {
  const raw = await page.evaluate(PROBE_SCRIPT);
  const p = parseProbe(raw);
  if (!p) throw new Error(`The page at ${page.url()} couldn't be measured.`);
  return p;
}

/**
 * The importer's live-look prober: the home page measured at desktop and phone width. Undefined
 * when Playwright (or its browser) isn't installed — the import then reads the look from CSS.
 */
export async function lookProber(): Promise<
  ((url: string) => Promise<{ desktop?: unknown; mobile?: unknown }>) | undefined
> {
  const pw = await loadPlaywright();
  if ("error" in pw) return undefined;
  return async (url) => {
    const browser = await launch();
    try {
      const out: { desktop?: unknown; mobile?: unknown } = {};
      for (const [key, width] of [
        ["desktop", DESKTOP],
        ["mobile", PHONE],
      ] as const) {
        const page = await open(browser, url, width);
        try {
          out[key] = await page.evaluate(PROBE_SCRIPT);
        } finally {
          await page.close().catch(() => undefined);
        }
      }
      return out;
    } finally {
      await browser.close().catch(() => undefined);
    }
  };
}

const pngSize = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

/**
 * Original | OpenSpace, side by side, cut into screen-sized PNGs (desktop shots at half size).
 * Composed in the browser itself, so no image library is needed.
 */
async function sideBySide(
  browser: Browser,
  left: Buffer,
  right: Buffer,
  width: number,
): Promise<Buffer[]> {
  const scale = width >= 1000 ? 0.5 : 1;
  const a = pngSize(left);
  const b = pngSize(right);
  const colW = Math.round(width * scale);
  const gap = 20;
  const total = Math.round(Math.max(a.height, b.height) * scale);
  const page = await browser.newPage({
    viewport: { width: colW * 2 + gap, height: 900 },
    deviceScaleFactor: 1,
  });
  try {
    const img = (png: Buffer, h: number) =>
      `<img src="data:image/png;base64,${png.toString("base64")}" style="display:block;width:${colW}px;height:${Math.round(h * scale)}px">`;
    await page.setContent(
      `<!doctype html><body style="margin:0;background:#fff;display:flex;gap:0;align-items:flex-start">${img(left, a.height)}<div style="width:${gap}px;align-self:stretch;min-height:${total}px;background:#ff00ff"></div>${img(right, b.height)}</body>`,
      { waitUntil: "load" },
    );
    const out: Buffer[] = [];
    const seg = 1400;
    for (let y = 0; y < total && out.length < 12; y += seg)
      out.push(
        await page.screenshot({
          type: "png",
          clip: { x: 0, y, width: colW * 2 + gap, height: Math.min(seg, total - y) },
          fullPage: true,
        }),
      );
    return out;
  } finally {
    await page.close().catch(() => undefined);
  }
}

export interface CompareOptions {
  /** Site paths to compare (`/`, `/about`); default: up to 6 pages of the imported site. */
  pages?: string[];
  /** Folder for the report and images; default `<dir>/.fidelity`. */
  out?: string;
  /** Widths (default desktop 1440 and phone 390). */
  widths?: number[];
  /** Write side-by-side PNGs (default true). */
  images?: boolean;
}

export interface CompareResult {
  report: FidelityReport;
  markdown: string;
  out: string;
  /** Written side-by-side images (absolute paths). */
  images: string[];
}

const slugOf = (path: string) => path.replace(/^\/+|\/+$/g, "");

/** The original page's address for a site path: the original address + the path. */
export function originalUrl(base: string, path: string): string {
  const b = new URL(base.includes("://") ? base : `https://${base}`);
  const root = b.pathname.endsWith("/") ? b.pathname : `${b.pathname}/`;
  const slug = slugOf(path);
  return new URL(`${root}${slug ? `${slug}/` : ""}`, b.origin).toString();
}

function defaultPages(doc: SiteDocument): string[] {
  const pages = Object.values(doc.pages)
    .filter((p) => !p.seo?.noindex)
    .map((p) => `/${p.slug}`);
  pages.sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));
  return pages.slice(0, 6);
}

/** Compare the imported site in `dir` with the original at `original`. */
export async function runCompare(
  original: string,
  dir: string,
  opts: CompareOptions = {},
  log: (line: string) => void = () => undefined,
): Promise<CompareResult> {
  const root = resolve(dir);
  let doc: SiteDocument;
  try {
    doc = await loadSiteDocument(root);
  } catch (e) {
    throw new CliError(`${root} isn't an OpenSpace site folder (${(e as Error).message}).`);
  }
  const out = resolve(opts.out ?? join(root, ".fidelity"));
  await mkdir(out, { recursive: true });
  // The default folder ignores itself, so a comparison is never committed with the site.
  if (!opts.out) await writeFile(join(out, ".gitignore"), "*\n");
  const pages = (opts.pages?.length ? opts.pages : defaultPages(doc)).map((p) => `/${slugOf(p)}`);
  const widths = opts.widths ?? [DESKTOP, PHONE];
  const server = await startPreviewServer(root, () => loadSiteDocument(root));
  const browser = await launch();
  const comparisons: PageComparison[] = [];
  const images: Record<string, string[]> = {};
  const written: string[] = [];
  const probes: { path: string; width: number; original: LookProbe; imported: LookProbe }[] = [];
  try {
    for (const path of pages) {
      const from = originalUrl(original, path);
      const to = `${server.url}/${slugOf(path)}`;
      for (const width of widths) {
        log(`Comparing ${path} at ${width}px…`);
        let a: Page | undefined;
        let b: Page | undefined;
        try {
          a = await open(browser, from, width);
          b = await open(browser, to, width);
          const [pa, pb] = [await probe(a), await probe(b)];
          probes.push({ path, width, original: pa, imported: pb });
          const cmp = compareLooks(pa, pb, path);
          cmp.imported = `${slugOf(path) ? `/${slugOf(path)}` : "/"} (local preview)`;
          comparisons.push(cmp);
          if (opts.images !== false) {
            const [left, right] = await Promise.all([
              a.screenshot({ type: "png", fullPage: true }),
              b.screenshot({ type: "png", fullPage: true }),
            ]);
            const parts = await sideBySide(browser, left, right, width);
            const name = `${slugOf(path).replace(/\//g, "-") || "home"}-${width < 700 ? "m" : "d"}`;
            const files: string[] = [];
            for (const [n, png] of parts.entries()) {
              const file = `sbs-${name}-${n}.png`;
              await writeFile(join(out, file), png);
              files.push(file);
              written.push(join(out, file));
            }
            images[`${path}@${width}`] = files;
          }
        } catch (e) {
          log(`  couldn't compare ${path} at ${width}px: ${(e as Error).message.split("\n")[0]}`);
        } finally {
          await a?.close().catch(() => undefined);
          await b?.close().catch(() => undefined);
        }
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
    await server.close();
  }
  const report = fidelityReport(comparisons);
  const markdown = fidelityMarkdown(report, { images });
  await writeFile(join(out, "FIDELITY-REPORT.md"), markdown);
  await writeFile(join(out, "fidelity.json"), `${JSON.stringify(report, null, 2)}\n`);
  // What the browser measured on both sides (for a closer look, or a skill's next step).
  await writeFile(join(out, "probes.json"), `${JSON.stringify(probes, null, 1)}\n`);
  return { report, markdown, out, images: written };
}

/** Terminal lines for a comparison. */
export function compareSummary(r: CompareResult): string[] {
  const lines = [`Visual match with the original: ${r.report.score}/100.`];
  for (const p of r.report.pages) {
    const off = [
      ...p.checks.filter((c) => !c.ok).map((c) => c.what),
      ...p.sections
        .filter((s) => s.score < 80)
        .map((s) => `section ${s.index + 1}${s.heading ? ` "${s.heading.slice(0, 30)}"` : ""}`),
    ];
    lines.push(
      `  ${p.path} ${p.viewport}px: ${p.score}/100${off.length ? ` — differs: ${off.slice(0, 6).join(", ")}${off.length > 6 ? "…" : ""}` : ""}`,
    );
  }
  lines.push(`  Report and side-by-side images: ${join(r.out, "FIDELITY-REPORT.md")}`);
  return lines;
}
