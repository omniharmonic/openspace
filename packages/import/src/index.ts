/**
 * @omniharmonic/openspace-import — move an existing website into OpenSpace. Today: Squarespace
 * (7.0 and 7.1) via page HTML, the sitemap, `?format=json` (owner mode) and the WordPress export.
 * Bundled into the CLI (`openspace import squarespace`) and its local MCP server.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ImageResizer } from "@omniharmonic/openspace-mcp-tools";
import type { SiteConfig, SiteDocument } from "@omniharmonic/openspace-schema";
import { writeSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { type FetchFn, SiteFetcher } from "./fetch";
import { type BuildResult, buildSite } from "./map/site";
import { MediaImporter } from "./media";
import { renderReport } from "./report";
import { crawlSquarespace } from "./squarespace/crawl";
import type { SqSite } from "./squarespace/types";

export const name = "@omniharmonic/openspace-import";

export { parseRobots, RobotsDisallowed, robotsAllows, SiteFetcher, USER_AGENT } from "./fetch";
export { htmlToRichText } from "./map/richtext";
export { blocksToMarkdoc, buildSite } from "./map/site";
export { nearestPairing } from "./map/theme";
export { UrlMap } from "./map/urls";
export { MediaImporter } from "./media";
export { renderReport } from "./report";
export { crawlSquarespace, NotSquarespaceError } from "./squarespace/crawl";
export { parsePage } from "./squarespace/page";
export { parseTheme } from "./squarespace/theme";
export type * from "./squarespace/types";
export { parseWxr } from "./squarespace/wxr";

export const REPORT_FILE = "IMPORT-REPORT.md";

export interface ImportOptions {
  /** The Squarespace site's address. */
  url: string;
  /** `openspace.json` for the new site (site id, deploy target…). */
  config: SiteConfig;
  /** The owner confirmed they own the site: also read `?format=json` data. */
  owner?: boolean;
  /** Contents of a WordPress (WXR) export for blog posts. */
  wxr?: string;
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
  doc: SiteDocument;
  build: BuildResult;
  /** Media files to write (repo path → bytes). */
  files: Map<string, Uint8Array>;
  report: string;
  requests: number;
}

/** Read a Squarespace site and turn it into an OpenSpace site document (nothing is written). */
export async function importSquarespace(opts: ImportOptions): Promise<ImportResult> {
  const now = opts.now ?? new Date();
  const fetcher = new SiteFetcher({
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
    ...(opts.delayMs !== undefined
      ? { delayMs: opts.delayMs, cdnDelayMs: Math.min(50, opts.delayMs) }
      : {}),
    ...(opts.owner
      ? { ownerAllows: (u: URL) => /(?:^|&)format=json(?:&|$)/.test(u.search.slice(1)) }
      : {}),
  });
  const site = await crawlSquarespace({
    url: opts.url,
    fetcher,
    ...(opts.owner ? { owner: true } : {}),
    ...(opts.wxr ? { wxr: opts.wxr } : {}),
    ...(opts.maxPages ? { maxPages: opts.maxPages } : {}),
    ...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
  });
  const media = new MediaImporter({
    fetch: fetcher.fetchForMedia,
    ...(opts.resize ? { resize: opts.resize } : {}),
    now,
    ...(opts.offline ? { offline: true } : {}),
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
    owner: opts.owner === true,
    wxr: Boolean(opts.wxr),
    now,
  });
  return {
    site,
    doc: build.doc,
    build,
    files: media.files,
    report,
    requests: fetcher.requested.length,
  };
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
