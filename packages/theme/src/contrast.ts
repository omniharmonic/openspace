import { COLOR_THEMES, type ColorTheme } from "@openspace/schema";
import { gamutMap, hexToRgb, type Oklch, oklchToHex, parseColor, srgbToLinear } from "./color";
import type { ColorRole } from "./types";

/** WCAG 2.x relative luminance of an sRGB color (0 = black, 1 = white). */
export function relativeLuminance(color: string | Oklch): number {
  const hex = typeof color === "string" ? toHexStrict(color) : oklchToHex(color);
  const { r, g, b } = srgbToLinear(hexToRgb(hex));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, 1–21. Colors are gamut-mapped and quantized to 8-bit sRGB first. */
export function contrastRatio(a: string | Oklch, b: string | Oklch): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function toHexStrict(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : oklchToHex(parseColor(color));
}

/** Contrast levels: `body` text, or `large` text and UI components (WCAG 1.4.3 / 1.4.11). */
export type ContrastLevel = "body" | "large";
export type ContrastMode = "standard" | "high";

/** Minimum ratios. `standard` = WCAG 2.2 AA; `high` = AAA (7:1 body, 4.5:1 large/UI). */
export const CONTRAST_MINIMUMS: Record<ContrastMode, Record<ContrastLevel, number>> = {
  standard: { body: 4.5, large: 3 },
  high: { body: 7, large: 4.5 },
};

export interface ContrastPair {
  fg: ColorRole;
  bg: ColorRole;
  level: ContrastLevel;
}

const BACKGROUNDS = ["background", "surface", "surface-raised"] as const;
const onAll = (fg: ColorRole, level: ContrastLevel): ContrastPair[] =>
  BACKGROUNDS.map((bg) => ({ fg, bg, level }));

/**
 * Every role pair that must meet contrast in every section theme. Order matters to the solver:
 * `accent` is settled against the backgrounds before `accent-text` is settled against `accent`.
 * `border` is decorative (inputs use `text-muted`-strength outlines) and is not checked.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...onAll("text", "body"),
  ...onAll("heading", "body"),
  ...onAll("text-muted", "body"),
  ...onAll("link", "body"),
  { fg: "accent", bg: "background", level: "large" },
  { fg: "accent", bg: "surface", level: "large" },
  { fg: "accent-text", bg: "accent", level: "body" },
  ...onAll("focus", "large"),
  ...onAll("success", "body"),
  ...onAll("warning", "body"),
  ...onAll("danger", "body"),
];

export type ThemeColors = Record<ColorRole, string>;
export type ThemeColorSet = Record<ColorTheme, ThemeColors>;

export interface ContrastFailure {
  theme: ColorTheme;
  fg: ColorRole;
  bg: ColorRole;
  fgColor: string;
  bgColor: string;
  ratio: number;
  required: number;
  level: ContrastLevel;
  /** The nearest accessible replacement for `fg` (lightness-only change). */
  suggestion: string;
}

/** List every failing text/background pair across the given themes. */
export function auditContrast(
  themes: Partial<ThemeColorSet>,
  options: { contrast?: ContrastMode } = {},
): ContrastFailure[] {
  const mins = CONTRAST_MINIMUMS[options.contrast ?? "standard"];
  const failures: ContrastFailure[] = [];
  for (const theme of COLOR_THEMES) {
    const colors = themes[theme];
    if (!colors) continue;
    for (const pair of CONTRAST_PAIRS) {
      const fgColor = colors[pair.fg];
      const bgColor = colors[pair.bg];
      const required = mins[pair.level];
      const ratio = contrastRatio(fgColor, bgColor);
      if (ratio < required) {
        failures.push({
          theme,
          ...pair,
          fgColor,
          bgColor,
          ratio: Math.round(ratio * 100) / 100,
          required,
          suggestion: nearestAccessible(fgColor, bgColor, required),
        });
      }
    }
  }
  return failures;
}

/** Safety margin the solver aims above the minimum so rounding never tips a pair under. */
const SOLVER_MARGIN = 0.03;

function withL(color: Oklch, l: number): Oklch {
  return gamutMap({ ...color, l });
}

/**
 * Lightness-only search: the color closest in lightness to `color` (same hue, chroma reduced only
 * as the gamut requires) that reaches `min` contrast against `against`. Returns `null` when even
 * the darkest/lightest end of the line can't reach `min`. `direction` restricts the search to
 * moving darker or lighter.
 */
export type Direction = "darker" | "lighter" | "either";

export function solveLightness(
  color: Oklch,
  against: Oklch | string,
  min: number,
  direction: Direction = "either",
): Oklch | null {
  const bg = typeof against === "string" ? parseColor(against) : against;
  const target = min + SOLVER_MARGIN;
  const start = gamutMap(color);
  if (contrastRatio(start, bg) >= target) return start;
  let best: Oklch | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  const ends = direction === "darker" ? [0] : direction === "lighter" ? [1] : [0, 1];
  for (const end of ends) {
    if (contrastRatio(withL(start, end), bg) < target) continue;
    // Binary search the boundary between start.l (fails) and end (passes).
    let fail = start.l;
    let pass = end;
    for (let i = 0; i < 24; i++) {
      const mid = (fail + pass) / 2;
      if (contrastRatio(withL(start, mid), bg) >= target) pass = mid;
      else fail = mid;
    }
    const delta = Math.abs(pass - start.l);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = withL(start, pass);
    }
  }
  return best;
}

/**
 * Nearest accessible version of `color` against `against`: same hue, lightness moved the least
 * distance needed to reach `min` (default 4.5:1). Falls back to the higher-contrast extreme.
 * Returns `#rrggbb`.
 */
export function nearestAccessible(color: string, against: string, min = 4.5): string {
  const fg = parseColor(color);
  const solved = solveLightness(fg, against, min);
  if (solved) return oklchToHex(solved);
  const dark = withL(fg, 0);
  const light = withL(fg, 1);
  return oklchToHex(contrastRatio(dark, against) >= contrastRatio(light, against) ? dark : light);
}
