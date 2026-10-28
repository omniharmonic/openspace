/**
 * `openspace import [squarespace|wordpress|url] <url> [dir]`: move a site into a new OpenSpace site
 * folder — the starter shell, then pages, collections, media, navigation, SEO, redirects and a
 * Site Styles approximation from `@omniharmonic/openspace-import`, then `openspace check`.
 * Without a platform the importer detects it from the home page.
 */

import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  type ComputedLook,
  type ImportResult,
  importSite,
  type PageRenderer,
  type Platform,
  parseGitHubTarget,
  platformLabel,
  REPORT_FILE,
  writeImport,
} from "@omniharmonic/openspace-import";
import { CURRENT_SCHEMA_VERSION, newId, type SiteConfig } from "@omniharmonic/openspace-schema";
import { writeAgentsMd } from "./agents";
import { type CheckReport, runCheck } from "./check";
import { lookProber } from "./fidelity";
import { CliError, type Io } from "./io";
import { loadResizer } from "./mcp";
import { loadPlaywright } from "./mcp/screenshot";
import { deployUrlFor, isEmptyDir, slugify, writeShell } from "./new";
import { runPhoneCheck } from "./phone";
import { assertGitHubPagesStart } from "./wow-first";

export interface ImportSiteOptions {
  /** Which importer: a platform, or "auto" (default) to detect it. */
  platform?: Platform | "auto";
  /** Render pages in a browser (Playwright) before reading them: sites built by JavaScript. */
  render?: boolean;
  /** WordPress (WXR) export file: Squarespace blog posts, or a whole WordPress site. */
  export?: string;
  /** The user owns the site: also read Squarespace's `?format=json` data. */
  owner?: boolean;
  target?: "github-pages" | "cloudflare";
  repo?: string;
  url?: string;
  domain?: string;
  title?: string;
  hub?: string;
  maxPages?: number;
  /** Pause between requests to the site, in ms. */
  delay?: number;
  /** Don't download images and files (structure only). */
  media?: boolean;
  /**
   * Import into an existing OpenSpace site folder (the hosted import, a repository being
   * converted): its `openspace.json` identity (site id, Hub, address) and shell are kept, its
   * content and media are replaced.
   */
  intoExisting?: boolean;
  /** GitHub imports: read the source from this checkout instead of the network. */
  sourceDir?: string;
  /** Write a JSON summary here (the hosted import reports it back). */
  summary?: string;
  /**
   * Measure the live site's fonts and spacing in a browser (Playwright, when installed) so the
   * import keeps them. Default on; off when the network is faked (tests).
   */
  measure?: boolean;
  /** Injected for tests. */
  fetch?: typeof fetch;
  now?: Date;
}

/** @deprecated use ImportSiteOptions */
export type ImportSquarespaceOptions = Omit<ImportSiteOptions, "platform" | "render">;

export interface ImportSiteResult {
  dir: string;
  result: ImportResult;
  check: CheckReport;
}

/** A folder name from the site's address: `https://www.maya-yoga.com` → `maya-yoga`. */
export function defaultFolder(url: string): string {
  const gh = parseGitHubTarget(url);
  if (gh && !/\.(?:com|org|net|io|co)\b/.test(gh.repo.replace(/\.github\.io$/i, "")))
    return slugify(gh.repo.replace(/\.github\.io$/i, "") || gh.owner);
  try {
    const host = new URL(url.includes("://") ? url : `https://${url}`).host.replace(/^www\./, "");
    const first =
      /\.(?:squarespace\.com|wixsite\.com|webflow\.io|wordpress\.com|carrd\.co|framer\.(?:website|app|ai)|weebly\.com|ghost\.io)$/.test(
        host,
      )
        ? host.split(".")[0]
        : host.split(".").slice(0, -1).join("-");
    return slugify(first || host);
  } catch {
    return "imported-site";
  }
}

/** A Playwright page renderer for `--render` (pages built by JavaScript, e.g. Wix). */
export async function loadRenderer(): Promise<PageRenderer> {
  const pw = await loadPlaywright();
  if ("error" in pw)
    throw new CliError(
      `--render needs Playwright: run \`npm i -D playwright && npx playwright install chromium\` (${pw.error})`,
    );
  // biome-ignore lint/suspicious/noExplicitAny: Playwright is optional and untyped here
  let browser: Promise<any> | undefined;
  return {
    async render(url) {
      browser ??= pw.chromium.launch({ headless: true });
      const b = await browser;
      const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
      try {
        await page.goto(url, { waitUntil: "load", timeout: 45_000 });
        await page
          .evaluate(`(async () => {
            for (let y = 0, i = 0; y < document.body.scrollHeight && i < 40; y += 800, i++) {
              window.scrollTo(0, y);
              await new Promise((r) => setTimeout(r, 100));
            }
            window.scrollTo(0, 0);
          })()`)
          .catch(() => undefined);
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
        const look = (await page
          .evaluate(`(() => {
            const cs = (el) => (el ? getComputedStyle(el) : undefined);
            const body = cs(document.body);
            const h = cs(document.querySelector("h1, h2"));
            const btn = cs(document.querySelector("a[class*=button], a[class*=btn], button[class*=button], .wp-element-button, .w-button"));
            const a = cs(document.querySelector("main a, a"));
            const px = (v) => (v ? parseFloat(v) / 16 : undefined);
            return {
              background: body && body.backgroundColor,
              text: body && body.color,
              bodyFont: body && body.fontFamily,
              bodySize: body && px(body.fontSize),
              headingFont: h && h.fontFamily,
              headingWeight: h ? Number(h.fontWeight) : undefined,
              h1Size: h && px(h.fontSize),
              buttonBg: btn && btn.backgroundColor,
              buttonRadius: btn && btn.borderRadius,
              buttonBorder: btn && btn.borderStyle,
              link: a && a.color,
            };
          })()`)
          .catch(() => undefined)) as ComputedLook | undefined;
        return { html: await page.content(), url: page.url(), ...(look ? { look } : {}) };
      } finally {
        await page.close().catch(() => undefined);
      }
    },
    async close() {
      const b = await browser?.catch(() => undefined);
      await b?.close().catch(() => undefined);
    },
  };
}

/** SVG → PNG with sharp (icons and marks), when sharp is installed. */
export async function loadRasterizer(): Promise<
  ((svg: Uint8Array, opts?: { icon?: boolean }) => Promise<Uint8Array>) | undefined
> {
  try {
    const spec = "sharp";
    const mod = (await import(/* @vite-ignore */ spec)) as { default: unknown };
    // biome-ignore lint/suspicious/noExplicitAny: optional dependency without types here
    const sharp = mod.default as any;
    return async (svg, opts = {}) => {
      if (!opts.icon)
        return new Uint8Array(
          await sharp(Buffer.from(svg), { density: 288 })
            .resize({ width: 384, height: 384, fit: "inside", withoutEnlargement: false })
            .png()
            .toBuffer(),
        );
      // An icon: small, on the left of a wide transparent strip, so a full-width card image
      // shows it at icon size (as the original did).
      const h = 96;
      const icon = await sharp(Buffer.from(svg), { density: 288 })
        .resize({ width: h, height: h, fit: "inside" })
        .png()
        .toBuffer();
      return new Uint8Array(
        await sharp({
          create: {
            width: h * 6,
            height: h,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite([{ input: icon, left: 0, top: 0 }])
          .png()
          .toBuffer(),
      );
    };
  } catch {
    return undefined;
  }
}

/** The browser look prober, unless turned off, faked network (tests) or no Playwright. */
async function measuring(opts: ImportSiteOptions) {
  if (opts.measure === false || opts.fetch || opts.media === false) return {};
  const lookProbe = await lookProber();
  return lookProbe ? { lookProbe } : {};
}

async function existingConfig(dir: string): Promise<SiteConfig> {
  try {
    return JSON.parse(await readFile(join(dir, "openspace.json"), "utf8")) as SiteConfig;
  } catch {
    throw new CliError(
      `${dir} isn't an OpenSpace site folder (no openspace.json). Leave out --into-existing to create a new one.`,
    );
  }
}

export async function runImportSite(
  io: Io,
  url: string,
  dirArg: string | undefined,
  opts: ImportSiteOptions = {},
): Promise<ImportSiteResult> {
  // Wow first: an import always goes live on free GitHub Pages first (see wow-first.ts).
  assertGitHubPagesStart(opts.target);
  const target = "github-pages" as const;
  const dir = resolve(io.cwd, dirArg ?? defaultFolder(url));
  const existing = opts.intoExisting ? await existingConfig(dir) : undefined;
  if (!existing && !(await isEmptyDir(dir)))
    throw new CliError(`${dir} already exists and is not empty. Choose a new folder.`);
  let wxr: string | undefined;
  if (opts.export) {
    try {
      wxr = await readFile(resolve(io.cwd, opts.export), "utf8");
    } catch (e) {
      throw new CliError(`Can't read the export file ${opts.export}: ${(e as Error).message}`);
    }
  }
  const slug = slugify(basename(dir));
  const config: SiteConfig = existing ?? {
    $schema: "https://schema.openspace.host/v1/site-config.json",
    siteId: newId("st"),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    template: { id: "starter", version: "1.0.0" },
    hub: opts.hub ?? "https://hub.openspace.host",
    deploy: {
      target,
      url: deployUrlFor({ ...opts, target }, slug),
      customDomain: opts.domain ?? null,
    },
    features: { forms: true, newsletter: false, analytics: false, search: true },
  };

  const result = await importSite({
    url,
    config,
    platform: opts.platform ?? "auto",
    ...(opts.render ? { render: await loadRenderer() } : {}),
    ...(await measuring(opts)),
    ...(opts.owner ? { owner: true } : {}),
    ...(wxr ? { wxr } : {}),
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.maxPages ? { maxPages: opts.maxPages } : {}),
    ...(opts.delay !== undefined ? { delayMs: opts.delay } : {}),
    ...(opts.media === false
      ? { offline: true }
      : { resize: await loadResizer(), rasterizeSvg: await loadRasterizer() }),
    ...(opts.sourceDir ? { repoDir: resolve(io.cwd, opts.sourceDir) } : {}),
    ...(io.env.GITHUB_TOKEN || io.env.GH_TOKEN
      ? { token: (io.env.GITHUB_TOKEN || io.env.GH_TOKEN) as string }
      : {}),
    onProgress: (m) => io.err(`  ${m}`),
  }).catch((e: Error) => {
    throw new CliError(e.message);
  });
  if (opts.title) result.doc.site.title = opts.title.slice(0, 120);

  if (existing) {
    // Replace the content and media; the shell, workflows and identity stay.
    await rm(join(dir, "content"), { recursive: true, force: true });
    await rm(join(dir, "media"), { recursive: true, force: true });
    if (!(await readFile(join(dir, "package.json"), "utf8").catch(() => "")))
      await writeShell(dir, existing.deploy?.target ?? "github-pages", slug);
    await writeImport(dir, result);
    await writeAgentsMd(dir, result.doc.site.title);
    await phoneFixRendered(dir, opts, io);
    const check = await runCheck(dir);
    const r = { dir, result, check };
    if (opts.summary) await writeSummary(resolve(io.cwd, opts.summary), r);
    return r;
  }
  const createdRoot = await mkdir(dir, { recursive: true });
  try {
    await writeShell(dir, target, slug);
    await writeImport(dir, result);
    await writeAgentsMd(dir, result.doc.site.title);
  } catch (e) {
    if (createdRoot) await rm(createdRoot, { recursive: true, force: true });
    else
      for (const entry of await readdir(dir))
        await rm(join(dir, entry), { recursive: true, force: true });
    throw e;
  }
  await phoneFixRendered(dir, opts, io);
  const check = await runCheck(dir);
  const r = { dir, result, check };
  if (opts.summary) await writeSummary(resolve(io.cwd, opts.summary), r);
  return r;
}

/**
 * With a browser (`--render`), the imported pages are also measured as a phone and everything
 * that can be fixed for phones is (the importer already applied the fixes that need no browser).
 */
async function phoneFixRendered(
  dir: string,
  opts: { render?: boolean },
  io: { err(s: string): void },
): Promise<void> {
  if (!opts.render) return;
  try {
    const r = await runPhoneCheck(dir, { fix: true });
    if (r.fixed.length) io.err(`  Fixed ${r.fixed.length} thing(s) for phones.`);
  } catch (e) {
    io.err(`  Couldn't check the pages on a phone: ${(e as Error).message.split("\n")[0]}`);
  }
}

/** Counts for the hosted import's progress ("12 pages, 48 images"). */
export function importCounts(r: ImportSiteResult) {
  const { result, check } = r;
  return {
    title: result.site.title,
    platform: result.site.platform ?? "squarespace",
    pages: Object.keys(result.doc.pages).length,
    items: Object.values(result.doc.collections).reduce((n, c) => n + Object.keys(c).length, 0),
    media: result.files.size,
    redirects: result.build.redirects.length,
    attention: result.build.notices.filter((n) => n.kind !== "collection" && n.kind !== "theme")
      .length,
    setup: result.checklist.items.length,
    check: { ok: check.ok, errors: check.errors, warnings: check.warnings },
    ...(result.github?.domain ? { domain: result.github.domain } : {}),
  };
}

async function writeSummary(path: string, r: ImportSiteResult): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(importCounts(r), null, 2)}\n`);
}

/** `openspace import squarespace`: the Squarespace importer (no detection). */
export function runImportSquarespace(
  io: Io,
  url: string,
  dirArg: string | undefined,
  opts: ImportSquarespaceOptions = {},
): Promise<ImportSiteResult> {
  return runImportSite(io, url, dirArg, { ...opts, platform: "squarespace" });
}

/** @deprecated use ImportSiteResult */
export type ImportSquarespaceResult = ImportSiteResult;

/** One-paragraph summary for the terminal (and the MCP tool). */
export function importSummary(r: ImportSiteResult): string[] {
  const { result, check, dir } = r;
  const items = Object.values(result.doc.collections).reduce(
    (n, c) => n + Object.keys(c).length,
    0,
  );
  const attention = result.build.notices.filter(
    (n) => n.kind !== "collection" && n.kind !== "theme",
  ).length;
  const from =
    result.site.platform && result.site.platform !== "generic"
      ? ` (${platformLabel(result.site.platform)})`
      : "";
  return [
    `Imported ${result.site.title}${from} into ${dir}:`,
    `  ${Object.keys(result.doc.pages).length} pages, ${items} collection items, ${result.files.size} media files, ${result.build.redirects.length} redirects (${result.requests} requests).`,
    `  openspace check: ${check.ok ? "OK" : "FAILED"} — ${check.errors} error(s), ${check.warnings} warning(s).`,
    `  ${attention} item(s) need attention: see ${join(dir, REPORT_FILE)}.`,
  ];
}
