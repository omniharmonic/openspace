/**
 * @omniharmonic/openspace-import — move an existing website into OpenSpace, from anywhere:
 * - Squarespace (7.0 and 7.1): page HTML, the sitemap, `?format=json` (owner mode), a WXR export;
 * - WordPress: the public REST API and/or a WXR export, plus the home page for chrome and look;
 * - any other site (Wix, Webflow, Carrd, Framer, hand-made HTML): sitemap/robots-respecting crawl
 *   with readability-style content extraction, optionally rendered in a browser.
 * `importSite` detects the platform and dispatches. All importers produce the same source model,
 * mapped by the shared mapper (blocks, sections and presets, media, theme, redirects, report).
 * Bundled into the CLI (`openspace import …`) and its local MCP server.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ImageResizer } from "@omniharmonic/openspace-mcp-tools";
import type { SiteConfig, SiteDocument } from "@omniharmonic/openspace-schema";
import { writeSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { type FetchFn, SiteFetcher } from "./fetch";
import { crawlGeneric, type PageRenderer } from "./generic/crawl";
import { type BuildResult, buildSite } from "./map/site";
import { MediaImporter } from "./media";
import { type Detection, detectPlatform, platformInfo, platformLabel } from "./platform";
import { renderReport } from "./report";
import { crawlSquarespace } from "./squarespace/crawl";
import type { Platform, SqSite } from "./types";
import { crawlWordPress } from "./wordpress/crawl";

export const name = "@omniharmonic/openspace-import";

export { parseRobots, RobotsDisallowed, robotsAllows, SiteFetcher, USER_AGENT } from "./fetch";
export { crawlGeneric, type PageRenderer } from "./generic/crawl";
export { sitemapUrls } from "./html/discover";
export { type HtmlPage, parseHtmlPage, sectionsFrom } from "./html/extract";
export { bestRendition, imageFromImg, parseSrcset } from "./html/image";
export { type ComputedLook, themeFromCss } from "./html/theme";
export { htmlToRichText } from "./map/richtext";
export { applyNearestPreset, nearestPreset } from "./map/sections";
export { blocksToMarkdoc, buildSite } from "./map/site";
export { nearestPairing } from "./map/theme";
export { UrlMap } from "./map/urls";
export { MediaImporter } from "./media";
export {
  type Detection,
  detectPlatform,
  generatorOf,
  PLATFORMS,
  type PlatformInfo,
  parsePlatform,
  platformInfo,
  platformLabel,
} from "./platform";
export { renderReport } from "./report";
export { crawlSquarespace, NotSquarespaceError } from "./squarespace/crawl";
export { parsePage } from "./squarespace/page";
export { parseTheme } from "./squarespace/theme";
export { parseWxr } from "./squarespace/wxr";
export type * from "./types";
export { autop, decodeEntities, expandShortcodes, wpRawToHtml } from "./wordpress/content";
export { crawlWordPress, NotWordPressError, wpMediaImage } from "./wordpress/crawl";

export const REPORT_FILE = "IMPORT-REPORT.md";

export interface ImportOptions {
  /** The site's address. */
  url: string;
  /** `openspace.json` for the new site (site id, deploy target…). */
  config: SiteConfig;
  /** The owner confirmed they own the site: also read `?format=json` data. */
  owner?: boolean;
  /** Contents of a WordPress (WXR) export (Squarespace: blog posts; WordPress: everything). */
  wxr?: string;
  /**
   * Which importer to use: a platform, or "auto" (default for `importSite`) to detect it from
   * the home page. Platforms without a specialised importer use the generic one.
   */
  platform?: Platform | "auto";
  /** Render pages in a browser first (sites built by JavaScript, e.g. Wix). Generic importer. */
  render?: PageRenderer;
  fetch?: FetchFn;
  resize?: ImageResizer;
  now?: Date;
  maxPages?: number;
  /** Pause between requests to the site (ms). */
  delayMs?: number;
  /** Don't download media (structure-only dry run). */
  offline?: boolean;
  onProgress?: (message: string) => void;
}

export interface ImportResult {
  site: SqSite;
  /** How the platform was chosen (auto-detection), when it was. */
  detection?: Detection;
  doc: SiteDocument;
  build: BuildResult;
  /** Media files to write (repo path → bytes). */
  files: Map<string, Uint8Array>;
  report: string;
  requests: number;
}

function fetcherFor(opts: ImportOptions, owner = false): SiteFetcher {
  return new SiteFetcher({
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.delayMs !== undefined
      ? { delayMs: opts.delayMs, cdnDelayMs: Math.min(50, opts.delayMs) }
      : {}),
    ...(owner
      ? { ownerAllows: (u: URL) => /(?:^|&)format=json(?:&|$)/.test(u.search.slice(1)) }
      : {}),
  });
}

/** Map a crawled site, collect media and write the report (shared by every importer). */
async function finish(
  site: SqSite,
  fetcher: SiteFetcher,
  opts: ImportOptions,
  extra: { owner?: boolean; detection?: Detection } = {},
): Promise<ImportResult> {
  const now = opts.now ?? new Date();
  const media = new MediaImporter({
    fetch: fetcher.fetchForMedia,
    ...(opts.resize ? { resize: opts.resize } : {}),
    now,
    ...(opts.offline ? { offline: true } : {}),
    source: platformLabel(site.platform),
  });
  opts.onProgress?.("Mapping pages, collections and media…");
  const build = await buildSite(site, {
    config: opts.config,
    media,
    now,
    ...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
  });
  let bytes = 0;
  for (const b of media.files.values()) bytes += b.length;
  const report = renderReport({
    sq: site,
    build,
    mediaFiles: media.files.size,
    mediaBytes: bytes,
    requests: fetcher.requested.length,
    owner: extra.owner === true,
    wxr: Boolean(opts.wxr),
    now,
  });
  return {
    site,
    ...(extra.detection ? { detection: extra.detection } : {}),
    doc: build.doc,
    build,
    files: media.files,
    report,
    requests: fetcher.requested.length,
  };
}

/** Read a Squarespace site and turn it into an OpenSpace site document (nothing is written). */
export async function importSquarespace(opts: ImportOptions): Promise<ImportResult> {
  const fetcher = fetcherFor(opts, opts.owner === true);
  const site = await crawlSquarespace({
    url: opts.url,
    fetcher,
    ...(opts.owner ? { owner: true } : {}),
    ...(opts.wxr ? { wxr: opts.wxr } : {}),
    ...(opts.maxPages ? { maxPages: opts.maxPages } : {}),
    ...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
  });
  site.platform = "squarespace";
  return finish(site, fetcher, opts, { owner: opts.owner === true });
}

/** Read a WordPress site (REST API and/or WXR export) into an OpenSpace site document. */
export async function importWordPress(
  opts: ImportOptions & { apiRoot?: string; generator?: string },
): Promise<ImportResult> {
  const fetcher = fetcherFor(opts);
  const site = await crawlWordPress({
    url: opts.url,
    fetcher,
    ...(opts.wxr ? { wxr: opts.wxr } : {}),
    ...(opts.apiRoot ? { apiRoot: opts.apiRoot } : {}),
    ...(opts.generator ? { generator: opts.generator } : {}),
    ...(opts.maxPages ? { maxPages: opts.maxPages } : {}),
    ...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
  });
  return finish(site, fetcher, opts);
}

/** Read any site with the generic HTML importer. */
export async function importUrl(
  opts: ImportOptions & { generator?: string },
): Promise<ImportResult> {
  const fetcher = fetcherFor(opts);
  const platform = opts.platform && opts.platform !== "auto" ? opts.platform : "generic";
  try {
    const site = await crawlGeneric({
      url: opts.url,
      fetcher,
      platform,
      ...(opts.generator ? { generator: opts.generator } : {}),
      ...(opts.maxPages ? { maxPages: opts.maxPages } : {}),
      ...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
      ...(opts.render ? { render: opts.render } : {}),
    });
    return await finish(site, fetcher, opts);
  } finally {
    await opts.render?.close().catch(() => undefined);
  }
}

/** Fetch the home page and say which platform built the site. */
export async function detectSite(
  url: string,
  opts: Pick<ImportOptions, "fetch" | "delayMs"> = {},
): Promise<Detection & { url: string }> {
  let base: string;
  try {
    base = new URL(url.includes("://") ? url : `https://${url}`).origin;
  } catch {
    throw new Error(`"${url}" is not a web address.`);
  }
  const fetcher = fetcherFor({ url, config: {} as SiteConfig, ...opts });
  const r = await fetcher.text(`${base}/`).catch((e: Error) => {
    throw new Error(`Couldn't read ${base}: ${e.message}`);
  });
  if (!r || r.status >= 400)
    throw new Error(
      `Couldn't read ${base}${r ? ` (HTTP ${r.status})` : ""}. Check the address and that the site is public.`,
    );
  return { ...detectPlatform(r.text, { "content-type": r.contentType }), url: r.url || base };
}

/**
 * `openspace import <url>`: detect the platform (unless `platform` says) and run the matching
 * importer — Squarespace, WordPress, or the generic importer for everything else.
 */
export async function importSite(opts: ImportOptions): Promise<ImportResult> {
  let detection: Detection | undefined;
  let platform: Platform;
  if (!opts.platform || opts.platform === "auto") {
    opts.onProgress?.(`Detecting the platform of ${opts.url}…`);
    detection = await detectSite(opts.url, opts);
    platform = detection.platform;
    opts.onProgress?.(
      `${platformInfo(platform).id === "generic" ? "No known platform" : platformLabel(platform)}${detection.evidence.length ? ` (${detection.evidence.slice(0, 3).join(", ")})` : ""}.`,
    );
  } else platform = opts.platform;
  const importer = platformInfo(platform).importer;
  const result =
    importer === "squarespace"
      ? await importSquarespace(opts)
      : importer === "wordpress"
        ? await importWordPress({
            ...opts,
            ...(detection?.wpApi ? { apiRoot: detection.wpApi } : {}),
            ...(detection?.generator ? { generator: detection.generator } : {}),
          })
        : await importUrl({
            ...opts,
            platform,
            ...(detection?.generator ? { generator: detection.generator } : {}),
          });
  return detection ? { ...result, detection } : result;
}

/** Write an import into a site folder: content through the site-kit writer, media, the report. */
export async function writeImport(dir: string, result: ImportResult): Promise<{ written: number }> {
  for (const [path, bytes] of result.files) {
    const abs = join(dir, path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, bytes);
  }
  const w = await writeSiteDocument(dir, result.doc);
  await writeFile(join(dir, REPORT_FILE), result.report);
  return { written: w.written.length + result.files.size + 1 };
}
