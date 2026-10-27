/**
 * Images on any site: the best rendition of an `<img>`/`<picture>` (lazy-loading attributes,
 * `srcset` widths, platform CDNs that resize by URL — Wix, Webflow, WordPress, Framer, Shopify),
 * kept at or under the 2400 px long edge where the URL says how big it is, with smaller
 * renditions as fallbacks for the media importer.
 */
import { attr, type Element, find } from "../dom";
import type { SqImage } from "../types";

const MAX = 2400;

export interface SrcsetEntry {
  url: string;
  /** Width descriptor (`800w`), when given. */
  w?: number;
  /** Density descriptor (`2x`), when given. */
  x?: number;
}

export function parseSrcset(srcset: string | undefined): SrcsetEntry[] {
  if (!srcset) return [];
  const out: SrcsetEntry[] = [];
  // URLs may contain commas (Wix `w_980,h_600`): split on ", " followed by a URL start.
  for (const part of srcset.split(/,\s+(?=(?:https?:)?\/\/|\/|[a-z0-9])/i)) {
    const [url, desc] = part.trim().split(/\s+/);
    if (!url) continue;
    const w = /^(\d+)w$/.exec(desc ?? "")?.[1];
    const x = /^([\d.]+)x$/.exec(desc ?? "")?.[1];
    out.push({ url, ...(w ? { w: Number(w) } : {}), ...(x ? { x: Number(x) } : {}) });
  }
  return out;
}

const abs = (u: string, base: string): string | undefined => {
  try {
    const url = new URL(u.trim(), base);
    if (!/^https?:$/.test(url.protocol)) return undefined;
    if (url.protocol === "http:") url.protocol = "https:";
    return url.toString();
  } catch {
    return undefined;
  }
};

/** Wix: any `…/media/<id>~mv2.jpg/v1/fill/w_980,…/name.jpg` → resized renditions of the original. */
function wixRenditions(url: string): { url: string; alternates: string[] } | undefined {
  const m = /^(https:\/\/static\.wixstatic\.com\/media\/([^/]+?\.(?:jpe?g|png|webp|gif)))/i.exec(
    url,
  );
  if (!m) return undefined;
  const base = m[1] as string;
  const name = m[2] as string;
  const fit = (w: number) => `${base}/v1/fit/w_${w},h_${w},q_90/${name}`;
  return { url: fit(MAX), alternates: [fit(1600), fit(1000)] };
}

/** WordPress: `photo-1024x683.jpg` → `photo.jpg` (the original upload). */
export function wpOriginal(url: string): string | undefined {
  const m = /^(.*\/wp-content\/uploads\/.+?)-\d{2,5}x\d{2,5}(\.(?:jpe?g|png|webp|gif|avif))$/i.exec(
    url.split("?")[0] ?? "",
  );
  return m ? `${m[1]}${m[2]}` : undefined;
}

/** Shopify: `…/files/x_800x.jpg?v=1` → `…/files/x.jpg?width=2400`. */
function shopifyRenditions(url: string): { url: string; alternates: string[] } | undefined {
  if (!/cdn\.shopify\.com|\/cdn\/shop\//.test(url)) return undefined;
  const clean = url.replace(/_(\d+x\d*|\d*x\d+)(?=\.[a-z]+(?:\?|$))/i, "");
  const u = new URL(clean);
  const at = (w: number) => {
    const c = new URL(u);
    c.searchParams.set("width", String(w));
    return c.toString();
  };
  return { url: at(MAX), alternates: [at(1600), at(1000)] };
}

/** Framer: `?scale-down-to=512` → 2400 (and smaller) renditions. */
function framerRenditions(url: string): { url: string; alternates: string[] } | undefined {
  if (!/framerusercontent\.com\/images\//.test(url)) return undefined;
  const u = new URL(url);
  u.search = "";
  const at = (w: number) => `${u.toString()}?scale-down-to=${w}`;
  return { url: at(2048), alternates: [at(1024), u.toString()] };
}

/**
 * Pick the best URL for an image from its candidates: the largest `srcset` width at or under the
 * limit (renditions above it are fallbacks of last resort), then the plain `src`.
 */
export function bestRendition(
  src: string | undefined,
  srcset: SrcsetEntry[],
  base: string,
): { url: string; alternates: string[] } | undefined {
  const all = srcset
    .map((e) => ({ ...e, url: abs(e.url, base) }))
    .filter((e): e is SrcsetEntry & { url: string } => !!e.url);
  const plain = src ? abs(src, base) : undefined;
  const special = (u: string) => wixRenditions(u) ?? shopifyRenditions(u) ?? framerRenditions(u);
  const first = plain ?? all[0]?.url;
  if (first) {
    const s = special(first);
    if (s) return s;
  }
  if (!all.length) {
    if (!plain) return undefined;
    const orig = wpOriginal(plain);
    return orig ? { url: orig, alternates: [plain] } : { url: plain, alternates: [] };
  }
  const sized = all.filter((e) => e.w).sort((a, b) => (b.w ?? 0) - (a.w ?? 0));
  const ok = sized.filter((e) => (e.w ?? 0) <= MAX);
  const byDensity = all.filter((e) => e.x).sort((a, b) => (b.x ?? 0) - (a.x ?? 0));
  const ordered = [
    ...ok.map((e) => e.url),
    ...byDensity.map((e) => e.url),
    ...(plain ? [plain] : []),
    ...sized.filter((e) => (e.w ?? 0) > MAX).map((e) => e.url),
  ];
  const unique = [...new Set(ordered)];
  if (!unique.length) return undefined;
  return { url: unique[0] as string, alternates: unique.slice(1, 4) };
}

const LAZY_SRC = [
  "data-src",
  "data-lazy-src",
  "data-original",
  "data-orig-src",
  "data-image",
  "src",
];
const LAZY_SRCSET = ["data-srcset", "data-lazy-srcset", "srcset"];

const isPlaceholder = (u: string | undefined) =>
  !u ||
  u.startsWith("data:") ||
  /(?:^|\/)(?:blank|spacer|pixel|transparent|placeholder|lazy)\.(?:gif|png|svg)/i.test(u) ||
  /\.svg(?:\?|#|$)/i.test(u);

/** Is this an icon / tracking pixel rather than content? */
export function isDecorative(img: Element): boolean {
  const w = Number(attr(img, "width"));
  const h = Number(attr(img, "height"));
  if ((w && w < 48) || (h && h < 48)) return true;
  if (attr(img, "role") === "presentation" && !attr(img, "alt")) return true;
  if (attr(img, "aria-hidden") === "true") return true;
  const src = attr(img, "src") ?? "";
  return /facebook\.com\/tr|google-analytics|doubleclick|pixel\.|\/emoji\//i.test(src);
}

/** The image an `<img>` (or a `<picture>`/`<figure>` holding one) shows. */
export function imageFromImg(el: Element, base: string): SqImage | undefined {
  const img = el.tagName === "img" ? el : find(el, (e) => e.tagName === "img");
  if (!img) return undefined;
  let src: string | undefined;
  for (const a of LAZY_SRC) {
    const v = attr(img, a);
    if (v && !isPlaceholder(v)) {
      src = v;
      break;
    }
  }
  let srcset: SrcsetEntry[] = [];
  for (const a of LAZY_SRCSET) {
    const v = parseSrcset(attr(img, a)).filter((e) => !isPlaceholder(e.url));
    if (v.length) {
      srcset = v;
      break;
    }
  }
  // <picture><source srcset> renditions.
  const picture = el.tagName === "picture" ? el : undefined;
  if (picture && !srcset.length) {
    const source = find(picture, (e) => e.tagName === "source");
    srcset = parseSrcset(attr(source, "srcset") ?? attr(source, "data-srcset"));
  }
  if (!src && !srcset.length) return undefined;
  const best = bestRendition(src, srcset, base);
  if (!best) return undefined;
  const w = Number(attr(img, "width"));
  const h = Number(attr(img, "height"));
  return {
    url: best.url,
    alt: (attr(img, "alt") ?? "").replace(/\s+/g, " ").trim(),
    ...(w > 0 && h > 0 ? { width: w, height: h } : {}),
    ...(best.alternates.length ? { alternates: best.alternates } : {}),
  };
}

/** `background-image: url(...)` in an inline style. */
export function backgroundImageOf(el: Element, base: string): SqImage | undefined {
  const style = attr(el, "style") ?? "";
  const m = /background(?:-image)?\s*:[^;]*url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(style);
  const raw = m?.[1] ?? attr(el, "data-bg") ?? attr(el, "data-background-image");
  if (!raw || isPlaceholder(raw)) return undefined;
  const best = bestRendition(raw, [], base);
  return best
    ? {
        url: best.url,
        alt: "",
        ...(best.alternates.length ? { alternates: best.alternates } : {}),
      }
    : undefined;
}
