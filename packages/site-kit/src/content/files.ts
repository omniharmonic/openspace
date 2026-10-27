import {
  COLLECTION_KINDS,
  type CollectionConfig,
  type CollectionItem,
  type CollectionKind,
} from "@omniharmonic/openspace-schema";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * File-level conventions of a site repository (arch §2.1). Pure string functions; the
 * filesystem-touching loader/writer lives in `./index.ts`.
 */

export const CONFIG_FILE = "openspace.json";
export const SITE_FILE = "content/site.json";
export const STYLES_FILE = "content/styles.json";
/** Media metadata (ruling: one file, keyed by repo path). */
export const MEDIA_FILE = "content/media.json";
export const PAGES_DIR = "content/pages";
export const COLLECTIONS_DIR = "content/collections";
export const COLLECTION_CONFIG_FILE = "_collection.json";
/** Custom component definitions: `content/components/<name>.json` (ADR custom-components). */
export const COMPONENTS_DIR = "content/components";
export const ITEM_EXT = ".mdoc";

/** Formatting-stable JSON: two-space indent, trailing newline. */
export function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Canonical file for a page slug, relative to `content/pages`: `""` → `home.json`,
 * `about` → `about.json`, `services/pricing` → `services/pricing.json`. A page whose slug is
 * also a folder of other pages may live at `<slug>/index.json` instead; both are accepted.
 */
export function pageFileFor(slug: string): string {
  return slug === "" ? "home.json" : `${slug}.json`;
}

/** Slugs a page file location may hold (`a/b.json` → `a/b`; `a/index.json` → `a`). */
export function slugsForPageFile(rel: string): string[] {
  const noExt = rel.replace(/\\/g, "/").replace(/\.json$/, "");
  if (noExt === "home" || noExt === "index") return [""];
  if (noExt.endsWith("/index")) return [noExt.slice(0, -"/index".length), noExt];
  return [noExt];
}

/** Whether a page file location is acceptable for a slug. */
export function pageFileMatchesSlug(rel: string, slug: string): boolean {
  return slugsForPageFile(rel).includes(slug);
}

const NAME_KIND: Record<string, CollectionKind> = {
  blog: "blog",
  journal: "blog",
  news: "blog",
  posts: "blog",
  writing: "blog",
  events: "events",
  calendar: "events",
  portfolio: "portfolio",
  projects: "portfolio",
  work: "portfolio",
  podcast: "podcast",
  episodes: "podcast",
  products: "products",
  shop: "products",
  store: "products",
};

/** Item kind for a collection: its `_collection.json` kind, else a conventional folder name. */
export function collectionKind(
  name: string,
  config: CollectionConfig | undefined,
): CollectionKind | undefined {
  if (config && config.kind !== "custom") return config.kind;
  if (config?.kind === "custom") return undefined;
  if ((COLLECTION_KINDS as readonly string[]).includes(name)) return name as CollectionKind;
  return NAME_KIND[name];
}

export interface ParsedItemFile {
  frontmatter: Record<string, unknown>;
  body: string;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n?/;

/** Split a `.mdoc` file into YAML frontmatter and Markdoc body. */
export function parseItemFile(source: string): ParsedItemFile {
  const m = FRONTMATTER_RE.exec(source);
  if (!m) return { frontmatter: {}, body: source };
  const raw = parseYaml(m[1] ?? "") as unknown;
  const frontmatter =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  let body = source.slice(m[0].length);
  if (body.startsWith("\r\n")) body = body.slice(2);
  else if (body.startsWith("\n")) body = body.slice(1);
  return { frontmatter, body };
}

/** Inverse of {@link parseItemFile}: `---\n<yaml>---\n\n<body>`. */
export function serializeItemFile(item: Pick<CollectionItem, "frontmatter" | "body">): string {
  const clean = JSON.parse(JSON.stringify(item.frontmatter)) as Record<string, unknown>;
  const yaml = stringifyYaml(clean, { lineWidth: 0 });
  return `---\n${yaml}---\n${item.body ? `\n${item.body}` : ""}`;
}
