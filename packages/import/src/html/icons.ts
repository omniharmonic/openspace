/**
 * The site's icon (favicon / home-screen icon) from `<link rel=…>` tags: an SVG icon first (it
 * stays vector), then the largest PNG (`apple-touch-icon`, `sizes="192x192"`), then any other
 * raster. `.ico` files are skipped (the media pipeline stores JPEG/PNG/GIF/WebP/AVIF/SVG), as are
 * platform default icons.
 */
import { attr, type Element, findAll } from "../dom";

const DEFAULTS =
  /\/universal\/default-favicon|\/wp-includes\/images\/w-logo|favicon\.ico(?:[?#]|$)/i;

export function bestIcon(head: Element | undefined, base: string): string | undefined {
  if (!head) return undefined;
  const links = findAll(
    head,
    (e) =>
      e.tagName === "link" &&
      /(?:^|\s)(?:icon|apple-touch-icon(?:-precomposed)?|mask-icon)(?:\s|$)/i.test(
        attr(e, "rel") ?? "",
      ) &&
      !!attr(e, "href"),
  );
  const scored = links
    .map((e) => {
      let url: string;
      try {
        url = new URL(attr(e, "href") as string, base).toString().replace(/^http:/, "https:");
      } catch {
        return undefined;
      }
      if (!/^https:/.test(url) || DEFAULTS.test(url)) return undefined;
      const rel = (attr(e, "rel") ?? "").toLowerCase();
      const type = (attr(e, "type") ?? "").toLowerCase();
      // Safari's pinned-tab mask is monochrome: a last resort.
      if (rel.includes("mask-icon")) return { url, score: 1 };
      const svg = type.includes("svg") || /\.svg(?:[?#]|$)/i.test(url);
      if (/\.ico(?:[?#]|$)/i.test(url) || type.includes("x-icon")) return undefined;
      const size = Math.max(
        0,
        ...(attr(e, "sizes") ?? "")
          .split(/\s+/)
          .map((s) => Number(/^(\d+)x\d+$/i.exec(s)?.[1] ?? 0)),
      );
      const px = size || (rel.includes("apple-touch") ? 180 : 32);
      return { url, score: svg ? 10_000 : px };
    })
    .filter((x): x is { url: string; score: number } => !!x);
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.url;
}
