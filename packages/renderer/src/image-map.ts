/**
 * The image resolution contract (arch §4.3). site-kit walks a page, resolves every image through
 * Astro's `getImage()` and passes the result in; `<Img>` reads it. Keys are the `src` exactly as
 * stored in content (`media/2026/10/hero.jpg` or an https URL).
 */
export interface ResolvedImageSource {
  /** MIME type, e.g. `image/avif`, `image/webp`. */
  type: string;
  srcset: string;
}

export interface ResolvedImage {
  /** Fallback URL (JPEG/PNG) for `<img src>`. */
  src: string;
  /** Fallback-format srcset for `<img srcset>`. */
  srcset?: string;
  /** Modern formats, best first, rendered as `<source>`s. */
  sources?: ResolvedImageSource[];
  /** Intrinsic dimensions (always emitted: no layout shift). */
  width: number;
  height: number;
  /** Tiny blurred placeholder data URI (< 300 bytes). */
  placeholder?: string;
}

export type ImageMap = Readonly<Record<string, ResolvedImage>>;

/** Every image `src` referenced by a JSON value (pages, site, blocks). */
export function collectImageSrcs(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    if (/^media\/.+\.(?:jpe?g|png|webp|avif|gif|svg)$/i.test(value) || isRemoteImage(value))
      out.add(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectImageSrcs(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectImageSrcs(v, out);
  }
  return out;
}

function isRemoteImage(value: string): boolean {
  return (
    /^https:\/\/images\.unsplash\.com\//.test(value) ||
    /^https:\/\/\S+\.(?:jpe?g|png|webp|avif|gif)(?:\?\S*)?$/i.test(value)
  );
}
