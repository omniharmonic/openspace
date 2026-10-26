import DOMPurify from "dompurify";

/**
 * Sanitize an uploaded SVG with DOMPurify's SVG profile (arch §5.6): scripts, event handlers,
 * `foreignObject`, external references and `javascript:` URLs are removed. Throws when the
 * text isn't an SVG at all.
 */
export function sanitizeSvg(text: string): string {
  if (!/<svg[\s>]/i.test(text)) throw new Error("That file isn't an SVG image.");
  const clean = DOMPurify.sanitize(text, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "script", "style"],
    FORBID_ATTR: ["xlink:href"],
    ALLOW_DATA_ATTR: false,
  });
  const out = typeof clean === "string" ? clean : String(clean);
  if (!/<svg[\s>]/i.test(out)) throw new Error("That SVG couldn't be cleaned safely.");
  // Keep only same-document references (`#id`) in href attributes.
  return out.replace(/\shref="(?!#)[^"]*"/gi, "");
}

/** Intrinsic size of an SVG from width/height (px) or its viewBox; defaults to 512×512. */
export function svgSize(text: string): { width: number; height: number } {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0] ?? "";
  const attr = (name: string) => new RegExp(`\\s${name}="([^"]+)"`, "i").exec(tag)?.[1];
  const px = (v: string | undefined) => {
    if (!v || v.endsWith("%")) return undefined;
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
  };
  let width = px(attr("width"));
  let height = px(attr("height"));
  const vb = attr("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if ((!width || !height) && vb && vb.length === 4 && (vb[2] ?? 0) > 0 && (vb[3] ?? 0) > 0) {
    const ratio = (vb[3] as number) / (vb[2] as number);
    if (width && !height) height = Math.round(width * ratio);
    else if (height && !width) width = Math.round(height / ratio);
    else {
      width = Math.round(vb[2] as number);
      height = Math.round(vb[3] as number);
    }
  }
  return { width: width ?? 512, height: height ?? 512 };
}
