/**
 * The look of any site from its CSS (or, with `--render`, from computed styles in a real browser):
 * page background and text colors, the brand color (buttons, links, `--primary`-style custom
 * properties, else the most used chromatic color), heading and body fonts (CSS rules, Google
 * Fonts links, WordPress `--wp--preset--*` tokens), button shape and type sizes. The result feeds
 * the shared theme mapper, which snaps it to OpenSpace palettes and pairings and lets the contrast
 * solver make every theme accessible. Nothing of the original CSS is kept.
 */
import { cssColorToHex } from "../squarespace/theme";
import type { SqTheme } from "../types";

/** Styles read from a rendered page (Playwright), when available. */
export interface ComputedLook {
  background?: string;
  text?: string;
  bodyFont?: string;
  headingFont?: string;
  headingWeight?: number;
  h1Size?: number;
  bodySize?: number;
  buttonBg?: string;
  buttonBorder?: string;
  buttonRadius?: string;
  link?: string;
}

interface Rule {
  selectors: string[];
  decls: Map<string, string>;
}

function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = (m[1] as string).trim();
    if (!sel || sel.startsWith("@")) continue;
    const decls = new Map<string, string>();
    for (const d of (m[2] as string).split(";")) {
      const i = d.indexOf(":");
      if (i < 0) continue;
      const k = d.slice(0, i).trim().toLowerCase();
      const v = d
        .slice(i + 1)
        .replace(/!important/i, "")
        .trim();
      if (k && v && !decls.has(k)) decls.set(k, v);
    }
    rules.push({ selectors: sel.split(",").map((s) => s.trim()), decls });
  }
  return rules;
}

const GENERIC_FONTS =
  /^(?:inherit|initial|unset|serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|-apple-system|blinkmacsystemfont|segoe ui|roboto|helvetica neue|arial|helvetica|apple color emoji|segoe ui emoji|var\(.*)$/i;

function firstFamily(v: string | undefined): string | undefined {
  if (!v) return undefined;
  for (const raw of v.split(",")) {
    const f = raw.trim().replace(/^["']|["']$/g, "").trim();
    if (f && !GENERIC_FONTS.test(f)) return f;
  }
  // Only generic families: keep a recognizable one (Helvetica / Arial read as sans).
  const f = v.split(",")[0]?.trim().replace(/^["']|["']$/g, "");
  return f && !/^var\(|inherit|initial/.test(f) ? f : undefined;
}

const lum = (hex: string) => {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const chroma = (hex: string) => {
  const c = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  return Math.max(...c) - Math.min(...c);
};
const chromatic = (hex: string | undefined): hex is string =>
  !!hex && chroma(hex) >= 0.12 && lum(hex) > 0.04 && lum(hex) < 0.92;

/** Resolve `var(--x, fallback)` against custom properties (a few levels deep). */
function resolver(vars: Map<string, string>) {
  const resolve = (v: string | undefined, depth = 0): string | undefined => {
    if (!v) return undefined;
    if (depth > 6) return v;
    return v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name: string, fb?: string) => {
      const got = vars.get(name);
      return resolve(got ?? fb ?? "", depth + 1) ?? "";
    });
  };
  return resolve;
}

const colorOf = (v: string | undefined): string | undefined => {
  if (!v) return undefined;
  const m = /(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/i.exec(v);
  if (!m) return undefined;
  if (/rgba?\([^)]*,\s*0(?:\.0+)?\s*\)|transparent/i.test(m[1] as string)) return undefined;
  return cssColorToHex(m[1] as string);
};

const sizeRem = (v: string | undefined): number | undefined => {
  if (!v) return undefined;
  const m = /([\d.]+)(rem|em|px)\b/.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  return m[2] === "px" ? n / 16 : n;
};

const isBodySel = (s: string) => /^(?:html|body|:root|\.site|#site|\.page-wrapper|\.wp-site-blocks|#SITE_CONTAINER)$/i.test(s);
const isHeadingSel = (s: string) => /^(?:h1|h2|\.h1|\.h2|h1\s*\.[\w-]+|\.heading-1|\.wp-block-heading|\.elementor-heading-title|\.font_0|\.font_2)$/i.test(s);
const isButtonSel = (s: string) =>
  /(?:^|\s|\.)(?:btn|button|w-button|wp-block-button__link|wp-element-button|elementor-button|wixui-button|cta)\b/i.test(s) &&
  !/:(?:hover|focus|active|disabled)/.test(s);

/** Google Fonts `family=Playfair+Display:wght@400;700&family=Inter` → names. */
export function googleFontFamilies(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/google-fonts: ([^\s*]+)/g)) {
    let u: URL;
    try {
      u = new URL((m[1] as string).replace(/&amp;/g, "&"), "https://fonts.googleapis.com");
    } catch {
      continue;
    }
    for (const fam of u.searchParams.getAll("family"))
      for (const f of fam.split("|")) {
        const name = f.split(":")[0]?.replace(/\+/g, " ").trim();
        if (name && !out.includes(name)) out.push(name);
      }
  }
  return out;
}

export function themeFromCss(css: string, computed: ComputedLook = {}): SqTheme {
  const rules = parseRules(css);
  const vars = new Map<string, string>();
  // :root custom properties first, then any others.
  for (const pass of [true, false])
    for (const r of rules) {
      if (pass !== r.selectors.some((s) => s === ":root" || s === "html" || s === "body")) continue;
      for (const [k, v] of r.decls) if (k.startsWith("--") && !vars.has(k)) vars.set(k, v);
    }
  const resolve = resolver(vars);
  const pick = (sel: (s: string) => boolean, prop: string[]): string | undefined => {
    for (const r of rules)
      if (r.selectors.some(sel))
        for (const p of prop) {
          const v = resolve(r.decls.get(p));
          if (v) return v;
        }
    return undefined;
  };
  const background =
    colorOf(computed.background) ??
    colorOf(pick(isBodySel, ["background-color", "background"])) ??
    colorOf(vars.get("--wp--preset--color--base") ? resolve(vars.get("--wp--preset--color--base")) : undefined);
  const textColor =
    colorOf(computed.text) ??
    colorOf(pick(isBodySel, ["color"])) ??
    colorOf(resolve(vars.get("--wp--preset--color--contrast")));
  const buttonBgRaw = computed.buttonBg ?? pick(isButtonSel, ["background-color", "background"]);
  const buttonBg = colorOf(buttonBgRaw);
  const link = colorOf(computed.link) ?? colorOf(pick((s) => s === "a" || s === "a:link", ["color"]));
  const named = [...vars.entries()]
    .filter(([k]) => /primary|accent|brand|secondary|highlight|theme-color|main-color|vivid/i.test(k))
    .map(([, v]) => colorOf(resolve(v)))
    .find(chromatic);
  // Most used chromatic color, as a last resort.
  const counts = new Map<string, number>();
  for (const m of css.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]*\)/gi)) {
    const hex = colorOf(m[0]);
    if (chromatic(hex)) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  const frequent = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const accent = [buttonBg, named, link, frequent].find(chromatic);
  // Fonts.
  const google = googleFontFamilies(css);
  const wpHeading = firstFamily(resolve(vars.get("--wp--preset--font-family--heading")));
  const wpBody = firstFamily(resolve(vars.get("--wp--preset--font-family--body") ?? vars.get("--wp--preset--font-family--system-font")));
  const headingFamily =
    firstFamily(computed.headingFont) ?? firstFamily(pick(isHeadingSel, ["font-family"])) ?? wpHeading ?? google[0];
  const bodyFamily =
    firstFamily(computed.bodyFont) ?? firstFamily(pick(isBodySel, ["font-family"])) ?? wpBody ?? google[1] ?? google[0];
  const headingWeight =
    computed.headingWeight ?? (Number(pick(isHeadingSel, ["font-weight"])) || undefined);
  // Buttons.
  const radiusRaw = computed.buttonRadius ?? pick(isButtonSel, ["border-radius"]);
  const radius = radiusRaw ? Number.parseFloat(radiusRaw) : Number.NaN;
  const shape: SqTheme["buttons"]["shape"] = Number.isNaN(radius)
    ? undefined
    : /%/.test(radiusRaw ?? "") && radius >= 30
      ? "pill"
      : radius >= 20
        ? "pill"
        : radius <= 1
          ? "square"
          : "rounded";
  const outline =
    !buttonBg &&
    /transparent|none/i.test(buttonBgRaw ?? "") &&
    /solid/.test(computed.buttonBorder ?? pick(isButtonSel, ["border"]) ?? "");
  const h1 = computed.h1Size ?? sizeRem(pick((s) => s === "h1" || s === ".h1", ["font-size"]));
  const normal = computed.bodySize ?? sizeRem(pick(isBodySel, ["font-size"]));
  const theme: SqTheme = {
    colors: {
      ...(background && lum(background) >= 0.5 ? { white: background } : {}),
      ...(textColor ? { black: textColor } : {}),
      ...(accent ? { accent } : {}),
    },
    ...(background ? { siteBackground: background } : {}),
    fonts: {
      ...(headingFamily
        ? { heading: { family: headingFamily, ...(headingWeight ? { weight: headingWeight } : {}) } }
        : {}),
      ...(bodyFamily ? { body: { family: bodyFamily } } : {}),
    },
    sizes: {
      ...(h1 && h1 > 1 && h1 < 10 ? { h1 } : {}),
      ...(normal && normal > 0.6 && normal < 2 ? { normal } : {}),
    },
    buttons: { ...(shape ? { shape } : {}), ...(outline ? { style: "outline" as const } : {}) },
  };
  if (h1 && !normal) theme.sizes.normal = 1;
  return theme;
}
