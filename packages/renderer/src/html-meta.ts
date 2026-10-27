/**
 * Page metadata helpers shared by `renderPageHtml` and the Studio (titles, descriptions, URLs,
 * compiled styles). Kept apart from `html.ts` so importing them never pulls `react-dom/server`
 * into a browser bundle.
 */
import type { Page, SiteDocument, Styles } from "@omniharmonic/openspace-schema";
import { type CompiledStyles, compileStyles } from "@omniharmonic/openspace-theme";
import type { ImageMap } from "./image-map";
import { mediaUrl } from "./link";

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ESC[ch] as string);

/** JSON for a `<script>` element: `<`, U+2028/9 escaped so content can never close the tag. */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(LINE_SEP, "\\u2028")
    .replace(PARA_SEP, "\\u2029");
}
const LINE_SEP = new RegExp(String.fromCharCode(0x2028), "g");
const PARA_SEP = new RegExp(String.fromCharCode(0x2029), "g");

/** `<style>` content can't contain `</style`; neutralise it in owner-provided CSS. */
export const safeCss = (css: string) => css.replace(/<\/style/gi, "<\\/style");

const compiled = new WeakMap<Styles, CompiledStyles>();
/** `compileStyles` memoised per styles object (site-kit renders many pages per build). */
export function compiledStylesFor(styles: Styles): CompiledStyles {
  let hit = compiled.get(styles);
  if (!hit) {
    hit = compileStyles(styles);
    compiled.set(styles, hit);
  }
  return hit;
}

/** The site's absolute URL (with base path), ending in `/`. */
export function siteUrlFor(doc: SiteDocument, override?: string): string {
  const raw =
    override ??
    (doc.config.deploy.customDomain
      ? `https://${doc.config.deploy.customDomain}`
      : doc.config.deploy.url);
  return raw.endsWith("/") ? raw : `${raw}/`;
}

/** Absolute URL for a site-relative path (`/about/`) — the base path is already in `siteUrl`. */
export function absolute(siteUrl: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return new URL(path.replace(/^\/+/, ""), siteUrl).toString();
}

/**
 * Absolute URL for a share image. Image-map srcs are already final URLs (root-relative ones
 * include the base path), so they resolve against the origin; `media/` paths resolve against
 * the site URL, which carries the base path.
 */
export function ogImageUrl(src: string, siteUrl: string, imageMap?: ImageMap): string {
  const mapped = imageMap?.[src]?.src;
  if (mapped) return new URL(mapped, siteUrl).toString();
  return absolute(siteUrl, mediaUrl(src));
}

/** `<title>`: SEO title, else page title, through the site's `%s` template (home: site title). */
export function pageTitle(doc: SiteDocument, page: Page): string {
  const own = page.seo?.title;
  if (own) return own;
  const template = doc.site.seo?.titleTemplate;
  if (page.slug === "") {
    return doc.site.tagline ? `${doc.site.title} — ${doc.site.tagline}` : doc.site.title;
  }
  return template ? template.replace("%s", page.title) : `${page.title} — ${doc.site.title}`;
}

export function pageDescription(doc: SiteDocument, page: Page): string | undefined {
  return page.seo?.description ?? doc.site.seo?.description ?? doc.site.tagline ?? undefined;
}
