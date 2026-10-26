/**
 * `@openspace/site-kit/content` — read and write a site repository's content as one
 * `SiteDocument` (arch §2.1). Shared by the Astro integration, the CLI, the local MCP server
 * and anything else that edits a checkout. Writing is formatting-stable: unchanged files are
 * left untouched byte-for-byte, so load → write is a no-op.
 */
import { mkdir, readdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import {
  type CollectionConfig,
  CollectionConfigSchema,
  type CollectionItem,
  CollectionItemSchema,
  type MediaMeta,
  type Page,
  PageSchema,
  type SiteConfig,
  SiteConfigSchema,
  type SiteDocument,
  SiteDocumentSchema,
  SiteSchema,
  StylesSchema,
} from "@openspace/schema";
import type { z } from "zod";
import {
  COLLECTION_CONFIG_FILE,
  COLLECTIONS_DIR,
  CONFIG_FILE,
  collectionKind,
  formatJson,
  ITEM_EXT,
  MEDIA_FILE,
  PAGES_DIR,
  pageFileFor,
  pageFileMatchesSlug,
  parseItemFile,
  SITE_FILE,
  STYLES_FILE,
  serializeItemFile,
} from "./files";

export * from "./files";

export interface ContentIssue {
  /** Repo-relative file the issue is in. */
  file: string;
  /** Path inside the file's value. */
  path: (string | number)[];
  message: string;
}

/** Content failed to load or validate; `issues` name the offending files. */
export class SiteContentError extends Error {
  constructor(readonly issues: ContentIssue[]) {
    super(
      `Site content is invalid:\n${issues
        .map((i) => `  ${i.file}${i.path.length ? ` (${i.path.join(".")})` : ""}: ${i.message}`)
        .join("\n")}`,
    );
    this.name = "SiteContentError";
  }
}

export interface LoadOptions {
  /** Validate the assembled document with `SiteDocumentSchema` (default true). */
  validate?: boolean;
}

export interface LoadedSite {
  doc: SiteDocument;
  /** Repo-relative file each page was read from, by page id. */
  pageFiles: Record<string, string>;
}

const toPosix = (p: string) => p.split(sep).join("/");

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

/** Load and validate everything; also returns where each page came from. */
export async function loadSite(rootDir: string, opts: LoadOptions = {}): Promise<LoadedSite> {
  const issues: ContentIssue[] = [];
  const readJson = async (rel: string, required: boolean): Promise<unknown> => {
    let text: string;
    try {
      text = await readFile(join(rootDir, rel), "utf8");
    } catch {
      if (required) issues.push({ file: rel, path: [], message: "File is missing" });
      return undefined;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch (e) {
      issues.push({ file: rel, path: [], message: `Invalid JSON: ${(e as Error).message}` });
      return undefined;
    }
  };
  const check = <S extends z.ZodType>(schema: S, value: unknown, file: string) => {
    const r = schema.safeParse(value);
    // Keep the file's own value (key order included) so load → write is byte-stable; zod's
    // output would reorder keys to the schema's order.
    if (r.success) return value as z.infer<S>;
    for (const i of r.error.issues)
      issues.push({ file, path: i.path as (string | number)[], message: i.message });
    return undefined;
  };

  const config = check(SiteConfigSchema, await readJson(CONFIG_FILE, true), CONFIG_FILE);
  const site = check(SiteSchema, await readJson(SITE_FILE, true), SITE_FILE);
  const styles = check(StylesSchema, await readJson(STYLES_FILE, true), STYLES_FILE);
  const mediaRaw = (await readJson(MEDIA_FILE, false)) ?? {};
  const media = mediaRaw as Record<string, MediaMeta>;

  const pages: Record<string, Page> = {};
  const pageFiles: Record<string, string> = {};
  for (const abs of await walk(join(rootDir, PAGES_DIR))) {
    if (!abs.endsWith(".json")) continue;
    const rel = toPosix(relative(rootDir, abs));
    const page = check(PageSchema, await readJson(rel, true), rel);
    if (!page) continue;
    const within = toPosix(relative(join(rootDir, PAGES_DIR), abs));
    if (!pageFileMatchesSlug(within, page.slug)) {
      issues.push({
        file: rel,
        path: ["slug"],
        message: `Page slug "${page.slug}" does not match its file location (expected ${PAGES_DIR}/${pageFileFor(page.slug)})`,
      });
    }
    if (pages[page.id]) {
      issues.push({
        file: rel,
        path: ["id"],
        message: `Page id ${page.id} is also used by ${pageFiles[page.id]}`,
      });
      continue;
    }
    pages[page.id] = page;
    pageFiles[page.id] = rel;
  }

  const collections: Record<string, Record<string, CollectionItem>> = {};
  const collectionConfigs: Record<string, CollectionConfig> = {};
  let collectionDirs: string[] = [];
  try {
    collectionDirs = (await readdir(join(rootDir, COLLECTIONS_DIR), { withFileTypes: true }))
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();
  } catch {
    collectionDirs = [];
  }
  for (const name of collectionDirs) {
    const dir = `${COLLECTIONS_DIR}/${name}`;
    const cfgRel = `${dir}/${COLLECTION_CONFIG_FILE}`;
    let cfg: CollectionConfig | undefined;
    if (await exists(join(rootDir, cfgRel))) {
      cfg = check(CollectionConfigSchema, await readJson(cfgRel, true), cfgRel);
      if (cfg) collectionConfigs[name] = cfg;
    }
    const kind = collectionKind(name, cfg);
    const items: Record<string, CollectionItem> = {};
    const files = (await readdir(join(rootDir, dir))).filter((f) => f.endsWith(ITEM_EXT)).sort();
    if (!kind) {
      if (files.length)
        issues.push({
          file: cfgRel,
          path: ["kind"],
          message: `Can't tell what kind of collection "${name}" is; set "kind" in ${COLLECTION_CONFIG_FILE}`,
        });
      continue;
    }
    for (const file of files) {
      const rel = `${dir}/${file}`;
      let parsed: ReturnType<typeof parseItemFile>;
      try {
        parsed = parseItemFile(await readFile(join(rootDir, rel), "utf8"));
      } catch (e) {
        issues.push({
          file: rel,
          path: [],
          message: `Invalid frontmatter: ${(e as Error).message}`,
        });
        continue;
      }
      const slug = file.slice(0, -ITEM_EXT.length);
      const item = check(
        CollectionItemSchema,
        { kind, slug, frontmatter: parsed.frontmatter, body: parsed.body },
        rel,
      );
      if (item) items[slug] = item;
    }
    collections[name] = items;
  }

  if (issues.length || !config || !site || !styles) throw new SiteContentError(issues);
  const doc: SiteDocument = { config, site, styles, pages, collections, media };
  if (Object.keys(collectionConfigs).length) doc.collectionConfigs = collectionConfigs;

  if (opts.validate !== false) {
    const r = SiteDocumentSchema.safeParse(doc);
    if (!r.success) {
      throw new SiteContentError(
        r.error.issues.map((i) => ({
          file: fileForDocPath(i.path as (string | number)[], pageFiles),
          path: (i.path as (string | number)[]).slice(fileDepth(i.path as (string | number)[])),
          message: i.message,
        })),
      );
    }
  }
  return { doc, pageFiles };
}

function fileDepth(path: (string | number)[]): number {
  switch (path[0]) {
    case "pages":
    case "media":
      return 2;
    case "collections":
      return 3;
    case "collectionConfigs":
      return 2;
    default:
      return 1;
  }
}

function fileForDocPath(path: (string | number)[], pageFiles: Record<string, string>): string {
  const [head, a, b] = path;
  switch (head) {
    case "config":
      return CONFIG_FILE;
    case "site":
      return SITE_FILE;
    case "styles":
      return STYLES_FILE;
    case "media":
      return MEDIA_FILE;
    case "pages":
      return pageFiles[String(a)] ?? PAGES_DIR;
    case "collections":
      return b === undefined
        ? `${COLLECTIONS_DIR}/${a}`
        : `${COLLECTIONS_DIR}/${a}/${b}${ITEM_EXT}`;
    case "collectionConfigs":
      return `${COLLECTIONS_DIR}/${a}/${COLLECTION_CONFIG_FILE}`;
    default:
      return "content";
  }
}

/** Read `openspace.json` + `content/**` into a validated `SiteDocument`. */
export async function loadSiteDocument(
  rootDir: string,
  opts: LoadOptions = {},
): Promise<SiteDocument> {
  return (await loadSite(rootDir, opts)).doc;
}

/** Read and validate only `openspace.json`. */
export async function loadSiteConfig(rootDir: string): Promise<SiteConfig> {
  const text = await readFile(join(rootDir, CONFIG_FILE), "utf8");
  const r = SiteConfigSchema.safeParse(JSON.parse(text));
  if (!r.success)
    throw new SiteContentError(
      r.error.issues.map((i) => ({
        file: CONFIG_FILE,
        path: i.path as (string | number)[],
        message: i.message,
      })),
    );
  return r.data;
}

export interface WriteResult {
  /** Repo-relative files created or changed. */
  written: string[];
  /** Repo-relative files removed (deleted pages/items). */
  removed: string[];
}

/**
 * Write a `SiteDocument` back to disk. Pages keep their current file when it still matches
 * their slug and move to the canonical location otherwise; deleted pages and items are
 * removed; files whose content is unchanged are not rewritten.
 */
export async function writeSiteDocument(
  rootDir: string,
  doc: SiteDocument,
  opts: { validate?: boolean } = {},
): Promise<WriteResult> {
  if (opts.validate !== false) {
    const r = SiteDocumentSchema.safeParse(doc);
    if (!r.success)
      throw new SiteContentError(
        r.error.issues.map((i) => ({
          file: "document",
          path: i.path as (string | number)[],
          message: i.message,
        })),
      );
  }
  const result: WriteResult = { written: [], removed: [] };
  const put = async (rel: string, text: string) => {
    const abs = join(rootDir, rel);
    let prev: string | undefined;
    try {
      prev = await readFile(abs, "utf8");
    } catch {
      prev = undefined;
    }
    if (prev === text) return;
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, text);
    result.written.push(rel);
  };
  const remove = async (rel: string) => {
    await rm(join(rootDir, rel), { force: true });
    result.removed.push(rel);
    // Tidy now-empty folders up to (not including) the content root.
    let dir = dirname(join(rootDir, rel));
    const stop = join(rootDir, "content");
    while (dir.startsWith(stop) && dir !== stop) {
      try {
        await rmdir(dir);
      } catch {
        break;
      }
      dir = dirname(dir);
    }
  };

  await put(CONFIG_FILE, formatJson(doc.config));
  await put(SITE_FILE, formatJson(doc.site));
  await put(STYLES_FILE, formatJson(doc.styles));
  if (Object.keys(doc.media).length || (await exists(join(rootDir, MEDIA_FILE))))
    await put(MEDIA_FILE, formatJson(doc.media));

  // Pages: map existing files by id so pages keep their location.
  const existing = new Map<string, string>();
  const pagesRoot = join(rootDir, PAGES_DIR);
  for (const abs of await walk(pagesRoot)) {
    if (!abs.endsWith(".json")) continue;
    try {
      const v = JSON.parse(await readFile(abs, "utf8")) as { id?: unknown };
      if (typeof v.id === "string") existing.set(v.id, toPosix(relative(pagesRoot, abs)));
    } catch {
      // Unreadable files are left alone.
    }
  }
  const keep = new Set<string>();
  for (const page of Object.values(doc.pages)) {
    const current = existing.get(page.id);
    const rel =
      current && pageFileMatchesSlug(current, page.slug) ? current : pageFileFor(page.slug);
    keep.add(rel);
    await put(`${PAGES_DIR}/${rel}`, formatJson(page));
  }
  for (const rel of existing.values()) if (!keep.has(rel)) await remove(`${PAGES_DIR}/${rel}`);

  // Collections.
  const names = new Set([
    ...Object.keys(doc.collections),
    ...Object.keys(doc.collectionConfigs ?? {}),
  ]);
  for (const name of [...names].sort()) {
    const dir = `${COLLECTIONS_DIR}/${name}`;
    const cfg = doc.collectionConfigs?.[name];
    if (cfg) await put(`${dir}/${COLLECTION_CONFIG_FILE}`, formatJson(cfg));
    const items = doc.collections[name] ?? {};
    for (const item of Object.values(items))
      await put(`${dir}/${item.slug}${ITEM_EXT}`, serializeItemFile(item));
    let onDisk: string[] = [];
    try {
      onDisk = (await readdir(join(rootDir, dir))).filter((f) => f.endsWith(ITEM_EXT));
    } catch {
      onDisk = [];
    }
    for (const f of onDisk) if (!items[f.slice(0, -ITEM_EXT.length)]) await remove(`${dir}/${f}`);
  }
  // Collections removed from the document entirely.
  try {
    for (const d of await readdir(join(rootDir, COLLECTIONS_DIR), { withFileTypes: true })) {
      if (!d.isDirectory() || names.has(d.name)) continue;
      for (const f of await readdir(join(rootDir, COLLECTIONS_DIR, d.name)))
        if (f.endsWith(ITEM_EXT)) await remove(`${COLLECTIONS_DIR}/${d.name}/${f}`);
    }
  } catch {
    // No collections folder.
  }
  return result;
}
