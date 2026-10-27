/**
 * Visual fidelity in a real browser (Playwright, optional): measure the original site's look
 * while importing (`lookProber`), and compare an imported site with the original
 * (`openspace compare`, `openspace import … --compare`, the local MCP tool `compare_fidelity`):
 * both are rendered at desktop and phone widths, measured by the same probe, diffed per page and
 * per section, and put side by side in PNGs (original left, OpenSpace right).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  TUNE_GROUPS,
  type TuneInput,
  tuneRound,
  withVisual,
} from "@omniharmonic/openspace-import";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { loadSiteDocument, writeSiteDocument } from "@omniharmonic/openspace-site-kit/content";
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

async function probeOf(page: Page): Promise<LookProbe> {
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
  /**
   * Auto-tune: up to this many rounds of adjusting Site Styles and sections from the differences,
   * re-rendering and measuring again; the best-scoring version is kept (0 = compare only).
   */
  tune?: number;
  /**
   * Small JPEG side-by-sides (first screen of each page) plus `fidelity-summary.json`, for the
   * hosted import to save with the site and show in Studio.
   */
  thumbs?: boolean;
}

export interface CompareResult {
  report: FidelityReport;
  markdown: string;
  out: string;
  /** Written side-by-side images (absolute paths). */
  images: string[];
  /** Score before auto-tuning (when it ran) and what tuning changed. */
  tuning?: { before: FidelityReport; changes: string[]; rounds: number };
  /** The thumbnails written (file names in `out`), when asked for. */
  thumbs?: Record<string, string>;
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

/**
 * How alike two full-page screenshots look, 0–1 (computed in the browser, no image library).
 * Both are scaled to 64 px wide; the original is cut into bands of 8 rows and each band is
 * compared with the best-aligned band of the new page nearby (within 8% of the page height, so a
 * section a little taller doesn't throw off everything below it): structural similarity (SSIM) of
 * the luminance in 8×8 windows (45%) and the color difference (35%); plus how close the page
 * heights are (20%). Identical pages score 1; unrelated pages typically 0.2–0.5.
 */
export async function visualSimilarity(browser: Browser, a: Buffer, b: Buffer): Promise<number> {
  const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
  try {
    await page.setContent("<!doctype html><body></body>");
    return (await page.evaluate(
      `(async ([srcA, srcB]) => {
        const load = (src) => new Promise((r, x) => { const i = new Image(); i.onload = () => r(i); i.onerror = x; i.src = src; });
        const [A, B] = await Promise.all([load(srcA), load(srcB)]);
        const W = 64, band = 8, C1 = 6.5025, C2 = 58.5225;
        const maps = (img) => {
          const h = Math.max(band, Math.min(1200, Math.round((img.height * W) / img.width)));
          const c = document.createElement("canvas"); c.width = W; c.height = h;
          const g = c.getContext("2d"); g.drawImage(img, 0, 0, W, h);
          const d = g.getImageData(0, 0, W, h).data;
          const col = new Float32Array(W * h * 3), lum = new Float32Array(W * h);
          for (let p = 0; p < W * h; p++) { const i = p * 4; col[p * 3] = d[i]; col[p * 3 + 1] = d[i + 1]; col[p * 3 + 2] = d[i + 2]; lum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; }
          return { h, col, lum };
        };
        const a = maps(A), b = maps(B);
        const cmp = (ya, yb) => {
          let s = 0, n = 0, dc = 0;
          for (let x = 0; x + 8 <= W; x += 4) {
            let ma = 0, mb = 0;
            for (let j = 0; j < 8; j++) for (let k = 0; k < 8; k++) { ma += a.lum[(ya + j) * W + x + k]; mb += b.lum[(yb + j) * W + x + k]; }
            ma /= 64; mb /= 64;
            let va = 0, vb = 0, cv = 0;
            for (let j = 0; j < 8; j++) for (let k = 0; k < 8; k++) { const da = a.lum[(ya + j) * W + x + k] - ma, db = b.lum[(yb + j) * W + x + k] - mb; va += da * da; vb += db * db; cv += da * db; }
            va /= 63; vb /= 63; cv /= 63;
            s += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++;
          }
          for (let j = 0; j < band; j++) for (let x = 0; x < W; x++) { const p = (ya + j) * W + x, q = (yb + j) * W + x; dc += Math.abs(a.col[p * 3] - b.col[q * 3]) + Math.abs(a.col[p * 3 + 1] - b.col[q * 3 + 1]) + Math.abs(a.col[p * 3 + 2] - b.col[q * 3 + 2]); }
          return { s: s / n, c: 1 - dc / (band * W * 765) };
        };
        const reach = Math.max(6, Math.round(Math.max(a.h, b.h) * 0.08));
        let ss = 0, sc = 0, n = 0;
        for (let y = 0; y + band <= a.h; y += band) {
          const center = Math.round((y * b.h) / a.h);
          let best = null;
          for (let yb = Math.max(0, center - reach); yb <= Math.min(b.h - band, center + reach); yb++) { const r = cmp(y, yb); const t = r.s + r.c; if (!best || t > best.t) best = { ...r, t }; }
          if (best) { ss += Math.max(0, best.s); sc += best.c; n++; }
        }
        if (!n) return 0;
        const height = Math.min(A.height, B.height) / Math.max(A.height, B.height);
        return 0.45 * (ss / n) + 0.35 * (sc / n) + 0.2 * height;
      })(${JSON.stringify([`data:image/png;base64,${a.toString("base64")}`, `data:image/png;base64,${b.toString("base64")}`])})`,
    )) as number;
  } catch {
    return Number.NaN;
  } finally {
    await page.close().catch(() => undefined);
  }
}

/** Original | OpenSpace, first screen only, small JPEG (for Studio's "What needs your attention"). */
async function thumbnail(
  browser: Browser,
  left: Buffer,
  right: Buffer,
  width: number,
): Promise<Buffer> {
  const colW = width >= 1000 ? 360 : 195;
  const scale = colW / width;
  const h = Math.round(
    Math.min(width >= 1000 ? 1100 : 760, pngSize(left).height, pngSize(right).height) * scale,
  );
  const page = await browser.newPage({
    viewport: { width: colW * 2 + 8, height: h },
    deviceScaleFactor: 1,
  });
  try {
    const img = (png: Buffer) =>
      `<div style="width:${colW}px;height:${h}px;overflow:hidden"><img src="data:image/png;base64,${png.toString("base64")}" style="display:block;width:${colW}px"></div>`;
    await page.setContent(
      `<!doctype html><body style="margin:0;background:#fff;display:flex;gap:8px">${img(left)}${img(right)}</body>`,
      { waitUntil: "load" },
    );
    return await page.screenshot({
      type: "jpeg",
      quality: 72,
      clip: { x: 0, y: 0, width: colW * 2 + 8, height: h },
    });
  } finally {
    await page.close().catch(() => undefined);
  }
}

interface Shot {
  probe: LookProbe;
  png: Buffer;
}

/** Compare the imported site in `dir` with the original at `original` (and auto-tune it). */
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
  // A page whose address changed in the move (`/home` → `/home-2`): compare with its old address.
  const oldPath = new Map<string, string>();
  for (const r of doc.site.redirects ?? []) {
    const to = `/${slugOf(r.to)}`;
    if (!oldPath.has(to) && r.from.startsWith("/") && !/[?*:]/.test(r.from))
      oldPath.set(to, r.from);
  }
  /** The original never changes: measured once. */
  const originals = new Map<string, Shot | null>();
  const shoot = async (url: string, width: number): Promise<Shot> => {
    const page = await open(browser, url, width);
    try {
      const probe = await probeOf(page);
      const png = (await page.screenshot({ type: "png", fullPage: true })) as Buffer;
      return { probe, png };
    } finally {
      await page.close().catch(() => undefined);
    }
  };
  interface Round {
    comparisons: PageComparison[];
    measured: TuneInput[];
    shots: Map<string, { original: Shot; imported: Shot }>;
  }
  const measure = async (): Promise<Round> => {
    const comparisons: PageComparison[] = [];
    const measured: TuneInput[] = [];
    const shots = new Map<string, { original: Shot; imported: Shot }>();
    for (const path of pages) {
      const from = originalUrl(original, oldPath.get(path) ?? path);
      const to = `${server.url}/${slugOf(path)}`;
      for (const width of widths) {
        const key = `${path}@${width}`;
        log(`Comparing ${path} at ${width}px…`);
        try {
          if (!originals.has(key))
            originals.set(
              key,
              await shoot(from, width).catch((e: Error) => {
                log(`  couldn't open the original ${from}: ${e.message.split("\n")[0]}`);
                return null;
              }),
            );
          const o = originals.get(key);
          if (!o) continue;
          const i = await shoot(to, width);
          let cmp = compareLooks(o.probe, i.probe, path);
          cmp.imported = `${slugOf(path) ? `/${slugOf(path)}` : "/"} (local preview)`;
          const v = await visualSimilarity(browser, o.png, i.png);
          if (Number.isFinite(v)) cmp = withVisual(cmp, v);
          comparisons.push(cmp);
          measured.push({
            path,
            viewport: width,
            original: o.probe,
            imported: i.probe,
            comparison: cmp,
          });
          shots.set(key, { original: o, imported: i });
        } catch (e) {
          log(`  couldn't compare ${path} at ${width}px: ${(e as Error).message.split("\n")[0]}`);
        }
      }
    }
    return { comparisons, measured, shots };
  };
  let best: Round;
  let tuning: CompareResult["tuning"];
  try {
    best = await measure();
    const first = fidelityReport(best.comparisons);
    const rounds = Math.max(0, Math.min(5, opts.tune ?? 0));
    if (rounds && best.measured.length) {
      const changes: string[] = [];
      let bestDoc = doc;
      let bestScore = first.exact ?? first.score;
      let ran = 0;
      // Each try re-renders and re-measures every page: bounded.
      let budget = 2 + rounds * 3;
      for (let pass = 0; pass < rounds && budget > 0; pass++) {
        let improved = false;
        // One group at a time (type, fonts, rhythm, buttons, sections): kept only if it helps.
        for (const group of TUNE_GROUPS) {
          if (budget <= 0) break;
          const t = tuneRound(bestDoc, best.measured, [group]);
          if (!t.changes.length) continue;
          budget--;
          log(
            `Tuning ${group}: ${t.changes.slice(0, 4).join("; ")}${t.changes.length > 4 ? "…" : ""}`,
          );
          try {
            await writeSiteDocument(root, t.doc);
          } catch (e) {
            log(`  that change didn't validate (${(e as Error).message.split("\n")[0]}); skipped`);
            await writeSiteDocument(root, bestDoc);
            continue;
          }
          const next = await measure();
          const score = fidelityReport(next.comparisons).exact ?? 0;
          // Kept only when it helps (by more than measuring noise).
          const better = score > bestScore + 0.1;
          log(
            `  score ${bestScore.toFixed(1)} → ${score.toFixed(1)}${better ? " (kept)" : " (undone)"}`,
          );
          if (better) {
            bestScore = score;
            bestDoc = t.doc;
            best = next;
            changes.push(...t.changes);
            improved = true;
          } else await writeSiteDocument(root, bestDoc);
        }
        ran++;
        if (!improved) break;
      }
      tuning = { before: first, changes, rounds: ran };
    }
  } catch (e) {
    await browser.close().catch(() => undefined);
    await server.close();
    throw e;
  }
  const images: Record<string, string[]> = {};
  const written: string[] = [];
  const thumbs: Record<string, string> = {};
  try {
    for (const [key, { original: o, imported: i }] of best.shots) {
      const [path, w] = key.split("@") as [string, string];
      const width = Number(w);
      const name = `${slugOf(path).replace(/\//g, "-") || "home"}-${width < 700 ? "m" : "d"}`;
      if (opts.images !== false) {
        const parts = await sideBySide(browser, o.png, i.png, width);
        const files: string[] = [];
        for (const [n, png] of parts.entries()) {
          const file = `sbs-${name}-${n}.png`;
          await writeFile(join(out, file), png);
          files.push(file);
          written.push(join(out, file));
        }
        images[key] = files;
      }
      if (opts.thumbs) {
        const file = `thumb-${name}.jpg`;
        await writeFile(join(out, file), await thumbnail(browser, o.png, i.png, width));
        thumbs[key] = file;
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
    await server.close();
  }
  const report = fidelityReport(best.comparisons);
  const markdown = fidelityMarkdown(report, {
    images,
    ...(tuning ? { tuning: { before: tuning.before.score, changes: tuning.changes } } : {}),
  });
  await writeFile(join(out, "FIDELITY-REPORT.md"), markdown);
  await writeFile(join(out, "fidelity.json"), `${JSON.stringify(report, null, 2)}\n`);
  // What the browser measured on both sides (for a closer look, or a skill's next step).
  await writeFile(
    join(out, "probes.json"),
    `${JSON.stringify(
      best.measured.map((m) => ({
        path: m.path,
        width: m.viewport,
        original: m.original,
        imported: m.imported,
      })),
      null,
      1,
    )}\n`,
  );
  if (opts.thumbs)
    await writeFile(
      join(out, "fidelity-summary.json"),
      `${JSON.stringify(fidelitySummary(report, tuning, thumbs), null, 2)}\n`,
    );
  return {
    report,
    markdown,
    out,
    images: written,
    ...(tuning ? { tuning } : {}),
    ...(opts.thumbs ? { thumbs } : {}),
  };
}

/** What the hosted import saves with the site for Studio (`fidelity-summary.json`). */
export function fidelitySummary(
  report: FidelityReport,
  tuning: CompareResult["tuning"],
  thumbs: Record<string, string>,
) {
  const before = new Map(
    (tuning?.before.pages ?? []).map((p) => [`${p.path}@${p.viewport}`, p.score]),
  );
  return {
    version: 1,
    score: report.score,
    ...(tuning ? { before: tuning.before.score, changes: tuning.changes.slice(0, 40) } : {}),
    pages: report.pages.map((p) => {
      const key = `${p.path}@${p.viewport}`;
      const b = before.get(key);
      const worst = [...p.checks, ...p.sections.flatMap((s) => s.checks)]
        .filter((c) => !c.ok && !c.credit)
        .sort((x, y) => y.weight - x.weight)
        .slice(0, 3)
        .map((c) => c.what);
      return {
        path: p.path,
        device: p.viewport < 700 ? "phone" : "desktop",
        score: p.score,
        ...(b !== undefined ? { before: b } : {}),
        ...(thumbs[key] ? { image: thumbs[key] } : {}),
        ...(worst.length ? { differs: worst } : {}),
      };
    }),
  };
}

/** Is a browser available for measuring and tuning (Playwright installed)? */
export async function browserReady(): Promise<boolean> {
  const pw = await loadPlaywright();
  return !("error" in pw);
}

/** Add the fidelity score (before → after tuning) to the import's `--summary` JSON. */
export async function addFidelityToSummary(file: string, r: CompareResult): Promise<void> {
  try {
    const summary = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    summary.fidelity = {
      score: r.report.score,
      ...(r.tuning ? { before: r.tuning.before.score } : {}),
    };
    await writeFile(file, `${JSON.stringify(summary, null, 2)}\n`);
  } catch {
    // no summary to extend
  }
}

/** Terminal lines for a comparison. */
export function compareSummary(r: CompareResult): string[] {
  const lines = [
    r.tuning
      ? `Visual match with the original: ${r.tuning.before.score}/100 → ${r.report.score}/100 after ${r.tuning.rounds} tuning round(s).`
      : `Visual match with the original: ${r.report.score}/100.`,
  ];
  for (const p of r.report.pages) {
    const off = [
      ...p.checks.filter((c) => !c.ok && !c.credit).map((c) => c.what),
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
