/**
 * `openspace import [squarespace|wordpress|url] <url> [dir]`: move a site into a new OpenSpace site
 * folder — the starter shell, then pages, collections, media, navigation, SEO, redirects and a
 * Site Styles approximation from `@omniharmonic/openspace-import`, then `openspace check`.
 * Without a platform the importer detects it from the home page.
 */
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  type ComputedLook,
  type ImportResult,
  importSite,
  type PageRenderer,
  type Platform,
  platformLabel,
  REPORT_FILE,
  writeImport,
} from "@omniharmonic/openspace-import";
import { CURRENT_SCHEMA_VERSION, newId, type SiteConfig } from "@omniharmonic/openspace-schema";
import { writeAgentsMd } from "./agents";
import { type CheckReport, runCheck } from "./check";
import { CliError, type Io } from "./io";
import { loadResizer } from "./mcp";
import { loadPlaywright } from "./mcp/screenshot";
import { deployUrlFor, isEmptyDir, slugify, writeShell } from "./new";

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

export async function runImportSite(
  io: Io,
  url: string,
  dirArg: string | undefined,
  opts: ImportSiteOptions = {},
): Promise<ImportSiteResult> {
  const target = opts.target ?? "github-pages";
  const dir = resolve(io.cwd, dirArg ?? defaultFolder(url));
  if (!(await isEmptyDir(dir)))
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
  const config: SiteConfig = {
    $schema: "https://schema.openspace.dev/v1/site-config.json",
    siteId: newId("st"),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    template: { id: "starter", version: "1.0.0" },
    hub: opts.hub ?? "https://hub.openspace.dev",
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
    ...(opts.owner ? { owner: true } : {}),
    ...(wxr ? { wxr } : {}),
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.maxPages ? { maxPages: opts.maxPages } : {}),
    ...(opts.delay !== undefined ? { delayMs: opts.delay } : {}),
    ...(opts.media === false ? { offline: true } : { resize: await loadResizer() }),
    onProgress: (m) => io.err(`  ${m}`),
  }).catch((e: Error) => {
    throw new CliError(e.message);
  });
  if (opts.title) result.doc.site.title = opts.title.slice(0, 120);

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
  const check = await runCheck(dir);
  return { dir, result, check };
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
