/**
 * `openspace import squarespace <url> [dir]`: move a Squarespace site into a new OpenSpace site
 * folder — the starter shell, then pages, collections, media, navigation, SEO, redirects and a
 * Site Styles approximation from `@omniharmonic/openspace-import`, then `openspace check`.
 */
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  type ImportResult,
  importSquarespace,
  REPORT_FILE,
  writeImport,
} from "@omniharmonic/openspace-import";
import { CURRENT_SCHEMA_VERSION, newId, type SiteConfig } from "@omniharmonic/openspace-schema";
import { writeAgentsMd } from "./agents";
import { type CheckReport, runCheck } from "./check";
import { CliError, type Io } from "./io";
import { loadResizer } from "./mcp";
import { deployUrlFor, isEmptyDir, slugify, writeShell } from "./new";

export interface ImportSquarespaceOptions {
  /** WordPress (WXR) export file for blog posts. */
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

export interface ImportSquarespaceResult {
  dir: string;
  result: ImportResult;
  check: CheckReport;
}

/** A folder name from the site's address: `https://www.maya-yoga.com` → `maya-yoga`. */
export function defaultFolder(url: string): string {
  try {
    const host = new URL(url.includes("://") ? url : `https://${url}`).host.replace(/^www\./, "");
    const first = host.endsWith(".squarespace.com")
      ? host.split(".")[0]
      : host.split(".").slice(0, -1).join("-");
    return slugify(first || host);
  } catch {
    return "imported-site";
  }
}

export async function runImportSquarespace(
  io: Io,
  url: string,
  dirArg: string | undefined,
  opts: ImportSquarespaceOptions = {},
): Promise<ImportSquarespaceResult> {
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

  const result = await importSquarespace({
    url,
    config,
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

/** One-paragraph summary for the terminal (and the MCP tool). */
export function importSummary(r: ImportSquarespaceResult): string[] {
  const { result, check, dir } = r;
  const items = Object.values(result.doc.collections).reduce(
    (n, c) => n + Object.keys(c).length,
    0,
  );
  const attention = result.build.notices.filter(
    (n) => n.kind !== "collection" && n.kind !== "theme",
  ).length;
  return [
    `Imported ${result.site.title} into ${dir}:`,
    `  ${Object.keys(result.doc.pages).length} pages, ${items} collection items, ${result.files.size} media files, ${result.build.redirects.length} redirects (${result.requests} requests).`,
    `  openspace check: ${check.ok ? "OK" : "FAILED"} — ${check.errors} error(s), ${check.warnings} warning(s).`,
    `  ${attention} item(s) need attention: see ${join(dir, REPORT_FILE)}.`,
  ];
}
