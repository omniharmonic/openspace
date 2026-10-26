import {
  COLOR_THEMES,
  type ColorTheme,
  CssColorSchema,
  DTCG_TYPES,
  type DtcgValue,
  type Styles,
} from "@openspace/schema";
import {
  ALL_THEMES,
  CONTRAST_PAIRS,
  type ContrastFailure,
  type CuratedPalette,
  compileStyles,
  extractPalette,
  flattenDtcg,
  isColor,
  isSafeCssValue,
  type PaletteCandidate,
  toHex,
} from "@openspace/theme";

/**
 * Site Styles model: the patches the panel commits (`styles.patch` paths) and the contrast
 * checks it shows. Pure functions, so they're tested without the UI.
 */

export type StylesSet = Record<string, unknown>;

/** A brand color someone typed or picked, as stored (`#rrggbb` or the CSS color as given). */
export function normaliseBrand(input: string): string | null {
  const v = input.trim();
  const hexish = /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? (v.startsWith("#") ? v : `#${v}`) : v;
  if (!isColor(hexish)) return null;
  const out = /^#/.test(hexish) ? toHex(hexish).toLowerCase() : hexish;
  return CssColorSchema.safeParse(out).success ? out : toHex(hexish).toLowerCase();
}

export function brandPatch(
  brand: string,
  source: "brand" | "logo" | "image" | "curated",
): StylesSet {
  return { "choices.palette.brand": brand, "choices.palette.source": source };
}

export function curatedPatch(p: CuratedPalette): StylesSet {
  return {
    "choices.palette.brand": p.brand,
    "choices.palette.neutral": p.neutral,
    "choices.palette.source": "curated",
  };
}

/** `theme:role` pairs set by DTCG color overrides (`color.all.x`, `color.x`, `color.dark.x`). */
export function overriddenRoles(styles: Styles): Set<string> {
  const out = new Set<string>();
  for (const { path } of flattenDtcg(styles.overrides)) {
    if (path[0] !== "color") continue;
    if (path.length === 2 && path[1]) out.add(`light:${path[1]}`);
    if (path.length === 3 && path[1] && path[2]) {
      const scope = path[1];
      if (scope === ALL_THEMES) for (const t of COLOR_THEMES) out.add(`${t}:${path[2]}`);
      else out.add(`${scope}:${path[2]}`);
    }
  }
  return out;
}

export interface ContrastIssue {
  failure: ContrastFailure;
  /** Override path + color that fixes it with the least change, if one can be set. */
  fix: RoleFix | null;
}

export interface RoleFix {
  path: string;
  value: string;
  /** False when no single color for this role passes against all its backgrounds. */
  converged: boolean;
}

/**
 * Text/background pairs that fail WCAG AA (doc 04 §3.3) because of an exact color someone set.
 * Choices alone are always solved; the published site is solved too, but Studio never hides
 * that a chosen color was changed: it lists the pair and offers the nearest accessible color.
 */
export function contrastIssues(styles: Styles): ContrastIssue[] {
  const touched = overriddenRoles(styles);
  if (!touched.size) return [];
  const raw = compileStyles(styles, { solve: false });
  const derived = new Set(["accent-hover", "accent-pressed"]);
  const fixes = new Map<string, RoleFix | null>();
  return raw.contrast.failures
    .filter((f) => touched.has(`${f.theme}:${f.fg}`) || touched.has(`${f.theme}:${f.bg}`))
    .map((failure) => {
      const pair = CONTRAST_PAIRS.find((p) => p.fg === failure.fg && p.bg === failure.bg);
      const role = pair?.adjust === "bg" ? failure.bg : failure.fg;
      const key = `${failure.theme}:${role}`;
      if (!fixes.has(key))
        fixes.set(
          key,
          derived.has(role) ? null : solveRole(styles, failure.theme, role, failure.suggestion),
        );
      return { failure, fix: fixes.get(key) ?? null };
    });
}

function withOverride(styles: Styles, theme: string, role: string, value: string): Styles {
  const overrides = structuredClone(styles.overrides ?? {}) as Record<string, unknown>;
  const color = (overrides.color ?? {}) as Record<string, unknown>;
  const scope = (color[theme] ?? {}) as Record<string, unknown>;
  scope[role] = { $value: value, $type: "color" };
  color[theme] = scope;
  overrides.color = color;
  return { ...styles, overrides: overrides as Styles["overrides"] };
}

/**
 * The nearest accessible color for `role` in `theme` against every background it sits on:
 * start from the solver's suggestion for one pair and repeat until no pair with that role fails.
 */
function solveRole(styles: Styles, theme: string, role: string, first: string): RoleFix {
  // Only failures whose adjusted side is this role carry a suggestion for it.
  const adjusts = (f: ContrastFailure) => {
    const pair = CONTRAST_PAIRS.find((p) => p.fg === f.fg && p.bg === f.bg);
    return f.theme === theme && (pair?.adjust === "bg" ? f.bg : f.fg) === role;
  };
  let value = first;
  for (let i = 0; i < 6; i++) {
    const next = withOverride(styles, theme, role, value);
    const failing = compileStyles(next, { solve: false }).contrast.failures.find(adjusts);
    if (!failing) return { path: `overrides.color.${theme}.${role}`, value, converged: true };
    if (failing.suggestion === value) break;
    value = failing.suggestion;
  }
  return { path: `overrides.color.${theme}.${role}`, value, converged: false };
}

export function fixPatch(issue: ContrastIssue): StylesSet | null {
  if (!issue.fix) return null;
  return { [issue.fix.path]: { $value: issue.fix.value, $type: "color" } };
}

/** Plain-language name of a role/theme pair ("Body text on Dark accent"). */
export const ROLE_LABEL: Record<string, string> = {
  text: "Body text",
  heading: "Headings",
  "text-muted": "Muted text",
  link: "Links",
  accent: "Accent",
  "accent-text": "Button text",
  focus: "Focus ring",
  success: "Success text",
  warning: "Warning text",
  danger: "Error text",
  "accent-hover": "Button hover",
  "accent-pressed": "Button pressed",
  background: "background",
  surface: "surface",
  "surface-raised": "raised surface",
};

export const THEME_NAME: Record<ColorTheme, string> = {
  light: "Light",
  "light-accent": "Light accent",
  dark: "Dark",
  "dark-accent": "Dark accent",
  brand: "Brand",
};

// --- DTCG overrides --------------------------------------------------------------------------

export const TOKEN_PATH_RE = /^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+){1,5}$/;
export const OVERRIDE_TYPES = DTCG_TYPES.filter((t) =>
  [
    "color",
    "dimension",
    "fontFamily",
    "fontWeight",
    "duration",
    "number",
    "shadow",
    "cubicBezier",
  ].includes(t),
);

/** Parse what a designer typed for a token value (numbers stay numbers). */
export function parseTokenValue(raw: string, type: string | undefined): DtcgValue {
  const v = raw.trim();
  if ((type === "number" || type === "fontWeight") && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

export type OverrideCheck = { ok: true; set: StylesSet } | { ok: false; message: string };

/** Validate a DTCG override before it is saved. */
export function overridePatch(
  path: string,
  rawValue: string,
  type: string | undefined,
): OverrideCheck {
  const p = path.trim().replace(/^overrides\./, "");
  if (!TOKEN_PATH_RE.test(p))
    return { ok: false, message: "Use a token path like color.accent or type.h1.letterSpacing." };
  const value = parseTokenValue(rawValue, type);
  const alias = typeof value === "string" && /^\{[a-zA-Z0-9_.-]+\}$/.test(value);
  if (typeof value === "string" && !alias) {
    if (!value) return { ok: false, message: "Enter a value." };
    if (!isSafeCssValue(value))
      return { ok: false, message: "That value isn’t allowed in a design token." };
    if (type === "color" && !isColor(value))
      return {
        ok: false,
        message: "Use a color like #1a2b3c, oklch(…) or an alias like {color.accent-500}.",
      };
  }
  return {
    ok: true,
    set: { [`overrides.${p}`]: { $value: value, ...(type ? { $type: type } : {}) } },
  };
}

/** Overrides the compiler couldn't use, by dotted path, with its message. */
export function overrideWarnings(styles: Styles): Map<string, string> {
  const out = new Map<string, string>();
  for (const w of compileStyles(styles).warnings) {
    if (w.code === "invalid-override" && w.path) out.set(w.path, w.message);
  }
  return out;
}

// --- palette extraction ------------------------------------------------------------------------

/** Brand color candidates from an image (logo or photo), downsampled for speed. */
export async function extractFromImage(
  source: Blob | string,
  count = 5,
): Promise<PaletteCandidate[]> {
  let bitmap: ImageBitmap | HTMLImageElement;
  if (typeof source === "string") {
    bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("The image couldn’t be loaded"));
      img.src = source;
    });
  } else bitmap = await createImageBitmap(source);
  const w = bitmap.width;
  const h = bitmap.height;
  const scale = Math.min(1, 160 / Math.max(w, h, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can’t read images");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return extractPalette(data, { count });
}
