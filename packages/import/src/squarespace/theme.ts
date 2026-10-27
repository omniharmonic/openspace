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
  // 7.0 templates set fonts per element (`.title`, `h2`, nav…): take the most used families.
  if (
    !theme.fonts.heading ||
    !theme.fonts.body ||
    /^(?:inherit|initial)$/i.test(theme.fonts.body.family)
  ) {
    const ranked = (filter: (sel: string) => boolean) => {
      const counts = new Map<string, number>();
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*font-family\s*:\s*([^;}]+)[^{}]*)\}/g)) {
        if (!filter(m[1] as string)) continue;
        const fam = unquote(m[3] as string);
        if (
          !fam ||
          /squarespace-ui|^(?:inherit|initial|sans-serif|serif|monospace)$|helvetica|arial|icon|font ?awesome/i.test(
            fam,
          )
        )
          continue;
        counts.set(fam, (counts.get(fam) ?? 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
    };
    const all = ranked(() => true);
    const headings = ranked((sel) => /(?:^|[\s,>])h[1-3]\b|title|heading/i.test(sel));
    if (!theme.fonts.heading && (headings[0] ?? all[0]))
      theme.fonts.heading = { family: (headings[0] ?? all[0]) as string };
    const bodyFam = all.find((f) => f !== theme.fonts.heading?.family) ?? all[0];
    if ((!theme.fonts.body || /^(?:inherit|initial)$/i.test(theme.fonts.body.family)) && bodyFam)
      theme.fonts.body = { family: bodyFam };
  }
  // 7.0: the primary button color is the clearest brand signal.
  if (!theme.colors.accent) {
    const counts = new Map<string, number>();
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (
        !/sqs-block-button-element|sqs-button-element--primary|sqs-system-button|sqs-editable-button/.test(
          m[1] as string,
        ) ||
        /:hover|:focus|:active/.test(m[1] as string)
      )
        continue;
      const bg = /background(?:-color)?\s*:\s*(#[0-9a-f]{3,6}|rgba?\([^)]*\)|hsla?\([^)]*\))/i.exec(
        m[2] as string,
      )?.[1];
      const hex = bg ? cssColorToHex(bg) : undefined;
      if (!hex) continue;
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
      if (
        Math.max(r as number, g as number, b as number) -
          Math.min(r as number, g as number, b as number) <
        40
      )
        continue;
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top) theme.colors.accent = top;
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
  else {
    // 7.0: `button-corner-style-pill`, `medium-button-shape-pill`.
    const c7 = bodyClasses
      .map(
        (c) => /^(?:button-corner-style|medium-button-shape)-(square|rounded|pill)$/.exec(c)?.[1],
      )
      .find(Boolean);
    if (c7 === "square" || c7 === "rounded" || c7 === "pill") theme.buttons.shape = c7;
  }
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
