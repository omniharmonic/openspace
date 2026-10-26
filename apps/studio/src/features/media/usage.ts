import type { SiteDocument } from "@openspace/schema";

/** Repo-size thresholds (arch §5.6): GitHub Pages' published-site limit is 1 GB. */
export const REPO_WARN_BYTES = 600 * 1024 * 1024;
export const REPO_BLOCK_BYTES = 900 * 1024 * 1024;

export type SizeLevel = "ok" | "warn" | "block";

/** Total size of the site's media library in bytes (the bulk of what the site stores). */
export function mediaBytes(doc: SiteDocument): number {
  let n = 0;
  for (const m of Object.values(doc.media)) n += m.bytes;
  return n;
}

export function sizeLevel(bytes: number): SizeLevel {
  if (bytes >= REPO_BLOCK_BYTES) return "block";
  if (bytes >= REPO_WARN_BYTES) return "warn";
  return "ok";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 * 1024 * 1024)
    return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export interface MediaUse {
  /** Where it's used, in plain words: "Home", "Site logo", "Journal: Spring retreat". */
  label: string;
  /** Page to open to see it, when it's on a page. */
  pageId?: string;
}

function references(value: unknown, path: string): boolean {
  if (value === path) return true;
  if (Array.isArray(value)) return value.some((v) => references(v, path));
  if (value && typeof value === "object")
    return Object.values(value as Record<string, unknown>).some((v) => references(v, path));
  return false;
}

/** Everywhere a media file is used in the site's content. */
export function mediaUsage(doc: SiteDocument, path: string): MediaUse[] {
  const uses: MediaUse[] = [];
  const site = doc.site;
  if (site.logo?.src === path) uses.push({ label: "Site logo" });
  if (site.favicon === path) uses.push({ label: "Browser tab icon" });
  if (site.seo?.image === path) uses.push({ label: "Default sharing image" });
  if (references(site.footer, path)) uses.push({ label: "Footer" });
  if (references(site.popup, path)) uses.push({ label: "Pop-up" });
  if (references(site.announcement, path)) uses.push({ label: "Announcement bar" });
  for (const page of Object.values(doc.pages)) {
    if (references(page.sections, path) || page.seo?.image === path)
      uses.push({ label: page.title, pageId: page.id });
  }
  for (const [name, items] of Object.entries(doc.collections)) {
    for (const item of Object.values(items)) {
      if (references(item, path))
        uses.push({
          label: `${name}: ${String((item.frontmatter as { title?: unknown }).title ?? item.slug)}`,
        });
    }
  }
  if (references(doc.styles, path)) uses.push({ label: "Site styles" });
  return uses;
}

/** Use counts for every file in the library (one pass per file; libraries are small). */
export function usageCounts(doc: SiteDocument): Record<string, number> {
  const out: Record<string, number> = {};
  for (const path of Object.keys(doc.media)) out[path] = mediaUsage(doc, path).length;
  return out;
}
