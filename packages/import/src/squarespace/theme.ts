/**
 * Read the look of a Squarespace site from its CSS and body classes: the five-color site
 * palette (7.1 `--white-hsl`, `--accent-hsl`…), heading/body fonts, type sizes, button shape and
 * header behaviour. 7.0 sites get a best-effort read of `body`/`h1` rules.
 */
import type { SqTheme } from "./types";

const toHex = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, "0");

/** `0,0%,27.8%` (Squarespace HSL triplet) → `#474747`. */
export function hslTripletToHex(triplet: string): string | undefined {
  const m = /^\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*$/.exec(triplet);
  if (!m) return undefined;
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const hue = (p: number, q: number, t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r = l;
  let g = l;
  let b = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  return `#${toHex(r * 255)}${toHex(g * 255)}${toHex(b * 255)}`;
}

/** A CSS color literal (hex, rgb[a]) → hex, or undefined. */
export function cssColorToHex(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})\b/.exec(v);
  if (hex) {
    const h = hex[1] as string;
    return h.length === 3 ? `#${[...h].map((c) => c + c).join("")}` : `#${h}`;
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (rgb) return `#${toHex(Number(rgb[1]))}${toHex(Number(rgb[2]))}${toHex(Number(rgb[3]))}`;
  const hsl = /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/.exec(v);
  if (hsl) return hslTripletToHex(`${hsl[1]},${hsl[2]}%,${hsl[3]}%`);
  return undefined;
}

const PALETTE_KEYS = ["white", "black", "accent", "lightAccent", "darkAccent"] as const;

const firstVar = (css: string, name: string): string | undefined => {
  const m = new RegExp(`--${name}\\s*:\\s*([^;}]+)`).exec(css);
  return m ? (m[1] as string).trim() : undefined;
};

const unquote = (s: string) =>
  s
    .replace(/^["']|["']$/g, "")
    .split(",")[0]
    ?.replace(/^["']|["']$/g, "")
    .trim() ?? "";

/** Parse a Squarespace site.css (plus inline styles) and the page's body classes. */
export function parseTheme(css: string, bodyClasses: readonly string[] = []): SqTheme {
  const theme: SqTheme = { colors: {}, fonts: {}, sizes: {}, buttons: {} };
  for (const key of PALETTE_KEYS) {
    const v = firstVar(css, `${key}-hsl`);
    const hex = v ? hslTripletToHex(v) : undefined;
    if (hex) theme.colors[key] = hex;
  }
  const bg = firstVar(css, "siteBackgroundColor");
  if (bg) {
    const ref = /var\(--(\w+)-hsl\)/.exec(bg)?.[1] as (typeof PALETTE_KEYS)[number] | undefined;
    const hex = ref ? theme.colors[ref] : cssColorToHex(bg);
    if (hex) theme.siteBackground = hex;
  }
  for (const [slot, name] of [
    ["heading", "heading-font"],
    ["body", "body-font"],
  ] as const) {
    const fam = firstVar(css, `${name}-font-family`);
    if (fam && !fam.startsWith("var(")) {
      const weight = Number(firstVar(css, `${name}-font-weight`));
      theme.fonts[slot] = {
        family: unquote(fam),
        ...(Number.isFinite(weight) && weight > 0 ? { weight } : {}),
      };
    }
  }
  const sizeVars = {
    h1: "heading-1-size-value",
    h2: "heading-2-size-value",
    h3: "heading-3-size-value",
    h4: "heading-4-size-value",
    large: "large-text-size-value",
    normal: "normal-text-size-value",
    small: "small-text-size-value",
  } as const;
  for (const [k, v] of Object.entries(sizeVars)) {
    const n = Number(firstVar(css, v));
    if (Number.isFinite(n) && n > 0) theme.sizes[k as keyof typeof sizeVars] = n;
  }

  // 7.0: plain rules.
  if (!theme.fonts.body) {
    const body = /(?:^|[}\s,])body\s*\{([^}]*)\}/.exec(css)?.[1];
    const fam = body ? /font-family\s*:\s*([^;}]+)/.exec(body)?.[1] : undefined;
    if (fam) theme.fonts.body = { family: unquote(fam) };
    const bgc = body ? /background(?:-color)?\s*:\s*([^;}]+)/.exec(body)?.[1] : undefined;
    const hex = bgc ? cssColorToHex(bgc) : undefined;
    if (hex && !theme.siteBackground) theme.siteBackground = hex;
  }
  if (!theme.fonts.heading) {
    const h1 = /(?:^|[}\s,])h1\s*\{([^}]*)\}/.exec(css)?.[1];
    const fam = h1 ? /font-family\s*:\s*([^;}]+)/.exec(h1)?.[1] : undefined;
    if (fam) theme.fonts.heading = { family: unquote(fam) };
  }
  if (!theme.colors.accent) {
    const link = /(?:^|[}\s,])a\s*\{([^}]*)\}/.exec(css)?.[1];
    const c = link ? /(?:^|;)\s*color\s*:\s*([^;}]+)/.exec(link)?.[1] : undefined;
    const hex = c ? cssColorToHex(c) : undefined;
    if (hex) theme.colors.accent = hex;
  }

  const has = (c: string) => bodyClasses.includes(c);
  const shape = bodyClasses
    .find((c) => c.startsWith("primary-button-shape-"))
    ?.slice("primary-button-shape-".length);
  if (shape === "square" || shape === "rounded" || shape === "pill") theme.buttons.shape = shape;
  const style = bodyClasses
    .find((c) => c.startsWith("primary-button-style-"))
    ?.slice("primary-button-style-".length);
  if (style === "solid" || style === "outline" || style === "raised") theme.buttons.style = style;
  if (
    has("tweak-fixed-header") ||
    has("tweak-fixed-header-style-basic") ||
    has("tweak-fixed-header-style-scroll-back")
  )
    theme.headerFixed = true;
  if (has("tweak-transparent-header")) theme.headerTransparent = true;
  return theme;
}
