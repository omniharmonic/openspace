import {
  type CollectionConfig,
  type CollectionItem,
  type Page,
  type SiteDocument,
  SiteDocumentSchema,
} from "@omniharmonic/openspace-schema";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { FileChange } from "../github/types";

/**
 * The site repository ⇄ `SiteDocument` mapping (arch §2.1, with `openspace.json`):
 *
 * ```
 * openspace.json                       → doc.config
 * content/site.json                    → doc.site
 * content/styles.json                  → doc.styles
 * content/media.json                   → doc.media (metadata keyed by media path)
 * content/pages/home.json              → page with slug ""
 * content/pages/about.json             → slug "about"
 * content/pages/services/index.json    → slug "services" (folders mirror URLs)
 * content/pages/services/pricing.json  → slug "services/pricing"
 * content/collections/<name>/_collection.json → doc.collectionConfigs[name]
 * content/collections/<name>/<slug>.mdoc      → doc.collections[name][slug] (YAML frontmatter + Markdoc)
 * ```
 *
 * Everything else in the repo (src/, public/, media bytes, presets, workflows…) is not part of
 * the document and is left untouched by `diffSiteFiles`.
 */

export const CONFIG_PATH = "openspace.json";
export const SITE_PATH = "content/site.json";
export const STYLES_PATH = "content/styles.json";
export const MEDIA_INDEX_PATH = "content/media.json";
export const PAGES_DIR = "content/pages/";
export const COLLECTIONS_DIR = "content/collections/";
const HOME_FILE = "home.json";

export class SiteFilesError extends Error {
  constructor(
    message: string,
    readonly issues: Array<{ path: (string | number)[]; message: string }> = [],
  ) {
    super(message);
    this.name = "SiteFilesError";
  }
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function parseJson(files: Record<string, string>, path: string): unknown {
  const text = files[path];
  if (text === undefined) throw new SiteFilesError(`Missing ${path}`);
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new SiteFilesError(`${path} is not valid JSON: ${(err as Error).message}`);
  }
}

// --- page paths --------------------------------------------------------------------------------

/** `content/pages/<x>` → page slug, or null if the path is not a page file. */
export function slugForPagePath(path: string): string | null {
  if (!path.startsWith(PAGES_DIR) || !path.endsWith(".json")) return null;
  const rel = path.slice(PAGES_DIR.length, -".json".length);
  if (rel === "home") return "";
  if (rel === "index") return "";
  if (rel.endsWith("/index")) return rel.slice(0, -"/index".length);
  return rel;
}

/**
 * Page slug → file path. Home is `home.json`; a page with child pages (or the slug "home",
 * which would collide with the home page) lives at `<slug>/index.json`.
 */
export function pagePathForSlug(slug: string, allSlugs: Iterable<string> = []): string {
  if (slug === "") return `${PAGES_DIR}${HOME_FILE}`;
  const hasChildren = [...allSlugs].some((s) => s.startsWith(`${slug}/`));
  if (hasChildren || slug === "home" || slug === "index") return `${PAGES_DIR}${slug}/index.json`;
  return `${PAGES_DIR}${slug}.json`;
}

// --- Markdoc items -------------------------------------------------------------------------------

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)([\s\S]*)$/;

export function parseMdoc(text: string): { frontmatter: Record<string, unknown>; body: string } {
  const m = FRONTMATTER_RE.exec(text);
  if (!m) return { frontmatter: {}, body: text };
  const fm = parseYaml(m[1] ?? "") ?? {};
  if (typeof fm !== "object" || Array.isArray(fm))
    throw new SiteFilesError("Frontmatter must be a mapping");
  let body = m[2] ?? "";
  if (body.startsWith("\r\n")) body = body.slice(2);
  else if (body.startsWith("\n")) body = body.slice(1);
  return { frontmatter: fm as Record<string, unknown>, body };
}

export function serializeMdoc(frontmatter: Record<string, unknown>, body: string): string {
  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 });
  return `---\n${yaml}---\n\n${body}`;
}

// --- files → document ----------------------------------------------------------------------------

/** Assemble a `SiteDocument` from repo files and validate it against the schema. */
export function loadSiteDocument(files: Record<string, string>): SiteDocument {
  const pages: Record<string, unknown> = {};
  const collections: Record<string, Record<string, unknown>> = {};
  const collectionConfigs: Record<string, unknown> = {};
  const itemFiles: Array<{ name: string; slug: string; path: string }> = [];

  for (const path of Object.keys(files).sort()) {
    if (path.startsWith(PAGES_DIR) && path.endsWith(".json")) {
      const page = parseJson(files, path) as { id?: unknown };
      const key = typeof page.id === "string" ? page.id : path;
      if (Object.hasOwn(pages, key))
        throw new SiteFilesError(`Page id ${key} appears in more than one file`);
      pages[key] = page;
      continue;
    }
    if (path.startsWith(COLLECTIONS_DIR)) {
      const rel = path.slice(COLLECTIONS_DIR.length).split("/");
      if (rel.length !== 2) continue;
      const [name, file] = rel as [string, string];
      if (file === "_collection.json") collectionConfigs[name] = parseJson(files, path);
      else if (file.endsWith(".mdoc"))
        itemFiles.push({ name, slug: file.slice(0, -".mdoc".length), path });
    }
  }

  for (const { name, slug, path } of itemFiles) {
    const kind = (collectionConfigs[name] as CollectionConfig | undefined)?.kind ?? "blog";
    // Untyped ("custom") collections are not part of the typed document model.
    if (kind === "custom") continue;
    const { frontmatter, body } = parseMdoc(files[path] as string);
    collections[name] ??= {};
    (collections[name] as Record<string, unknown>)[slug] = { kind, slug, frontmatter, body };
  }

  const raw = {
    config: parseJson(files, CONFIG_PATH),
    site: parseJson(files, SITE_PATH),
    styles: parseJson(files, STYLES_PATH),
    pages,
    collections,
    ...(Object.keys(collectionConfigs).length ? { collectionConfigs } : {}),
    media: files[MEDIA_INDEX_PATH] === undefined ? {} : parseJson(files, MEDIA_INDEX_PATH),
  };
  const parsed = SiteDocumentSchema.safeParse(raw);
  if (!parsed.success)
    throw new SiteFilesError(
      "The site content does not match the schema",
      parsed.error.issues.map((i) => ({
        path: i.path.map((p) => (typeof p === "symbol" ? String(p) : p)),
        message: i.message,
      })),
    );
  return parsed.data;
}

// --- document → files ----------------------------------------------------------------------------

/** Serialize a `SiteDocument` to the files it owns (keys are repo paths). */
export function siteDocumentToFiles(doc: SiteDocument): Record<string, string> {
  const files: Record<string, string> = {
    [CONFIG_PATH]: json(doc.config),
    [SITE_PATH]: json(doc.site),
    [STYLES_PATH]: json(doc.styles),
  };
  if (Object.keys(doc.media).length) files[MEDIA_INDEX_PATH] = json(doc.media);
  const pages: Page[] = Object.values(doc.pages);
  const slugs = pages.map((p) => p.slug);
  for (const page of pages) files[pagePathForSlug(page.slug, slugs)] = json(page);
  for (const [name, config] of Object.entries(doc.collectionConfigs ?? {}))
    files[`${COLLECTIONS_DIR}${name}/_collection.json`] = json(config);
  for (const [name, items] of Object.entries(doc.collections))
    for (const [slug, item] of Object.entries(items) as Array<[string, CollectionItem]>)
      files[`${COLLECTIONS_DIR}${name}/${slug}.mdoc`] = serializeMdoc(
        item.frontmatter as Record<string, unknown>,
        item.body,
      );
  return files;
}

/** True for repo paths whose contents are derived from the `SiteDocument`. */
/**
 * Files a publish or rollback carries from the draft (or an earlier version) to `main`: the
 * site's content, media and `openspace.json`. Everything else — the publish workflow,
 * `package.json`, Astro config, custom code — stays as it is on `main`, so a fix made there
 * (or by the update bot / a hosting switch) is never undone by publishing.
 */
export function isPublishedPath(path: string): boolean {
  return path === CONFIG_PATH || path.startsWith("content/") || path.startsWith("media/");
}

/** The same, without `openspace.json` (a rollback keeps today's hosting target and Hub URL). */
export function isContentPath(path: string): boolean {
  return path.startsWith("content/") || path.startsWith("media/");
}

export function isDocumentPath(path: string): boolean {
  if (
    path === CONFIG_PATH ||
    path === SITE_PATH ||
    path === STYLES_PATH ||
    path === MEDIA_INDEX_PATH
  )
    return true;
  if (path.startsWith(PAGES_DIR) && path.endsWith(".json")) return true;
  if (path.startsWith(COLLECTIONS_DIR)) {
    const rel = path.slice(COLLECTIONS_DIR.length).split("/");
    return rel.length === 2 && (rel[1] === "_collection.json" || (rel[1] ?? "").endsWith(".mdoc"));
  }
  return false;
}

/**
 * The file changes that make `current` (repo files) represent `doc`: writes for new/changed
 * document files and deletions for document files that no longer exist (renamed slugs, deleted
 * pages). Files outside the document are never touched.
 */
export function diffSiteFiles(current: Record<string, string>, doc: SiteDocument): FileChange[] {
  const next = siteDocumentToFiles(doc);
  const changes: FileChange[] = [];
  for (const [path, content] of Object.entries(next))
    if (current[path] !== content) changes.push({ path, content });
  for (const path of Object.keys(current))
    if (isDocumentPath(path) && !(path in next)) {
      // Custom collections are not in the document; leave their items alone.
      const rel = path.startsWith(COLLECTIONS_DIR)
        ? path.slice(COLLECTIONS_DIR.length).split("/")
        : null;
      if (rel && rel[1] !== "_collection.json") {
        const cfg = current[`${COLLECTIONS_DIR}${rel[0]}/_collection.json`];
        if (cfg && /"kind"\s*:\s*"custom"/.test(cfg)) continue;
      }
      changes.push({ path, content: null });
    }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}
