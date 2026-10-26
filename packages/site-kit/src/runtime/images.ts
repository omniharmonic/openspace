/**
 * The image resolution pass (arch §4.3), Astro-independent part: which widths and formats to
 * request for a local media image, and how `getImage()` results become a renderer
 * `ResolvedImage`.
 */
import type { ResolvedImage } from "@openspace/renderer";

/** Width ladder for responsive images (capped at the master's width, ≤ 2400px masters). */
export const IMAGE_WIDTHS = [480, 960, 1600, 2400] as const;

export function imageWidths(original: number): number[] {
  const ws: number[] = IMAGE_WIDTHS.filter((w) => w < original);
  ws.push(Math.min(original, 2400));
  return [...new Set(ws)];
}

/** Fallback format for `<img src>` (keeps transparency for PNG). */
export function fallbackFormat(format: string): "jpg" | "png" {
  return format === "png" || format === "gif" ? "png" : "jpg";
}

/** Width of the `<img src>` fallback: big enough for most layouts without being the master. */
export const fallbackWidth = (original: number) => Math.min(original, 1600);

export interface TransformResult {
  src: string;
  srcset: string;
}

export function resolvedImage(
  meta: { width: number; height: number },
  results: { avif: TransformResult; webp: TransformResult; fallback: TransformResult },
  placeholder?: string,
): ResolvedImage {
  const out: ResolvedImage = {
    src: results.fallback.src,
    srcset: results.fallback.srcset,
    sources: [
      { type: "image/avif", srcset: results.avif.srcset },
      { type: "image/webp", srcset: results.webp.srcset },
    ],
    width: meta.width,
    height: meta.height,
  };
  if (placeholder) out.placeholder = placeholder;
  return out;
}

/** Local media images a page needs resolved (skips remote URLs, SVG and generated share images). */
export function localImageSrcs(srcs: Iterable<string>): string[] {
  return [...srcs].filter(
    (s) => s.startsWith("media/") && !s.startsWith("media/_os-og/") && /\.(?:jpe?g|png|webp|avif|gif)$/i.test(s),
  );
}
