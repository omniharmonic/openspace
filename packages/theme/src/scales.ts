import { COLOR_SCALE_STEPS } from "@omniharmonic/openspace-schema";
import { gamutMap, mixHue, type Oklch, parseColor } from "./color";
import type { ColorScale, ScaleStep } from "./types";

export type NeutralTint = "warm" | "cool" | "pure";

/** Accent ladder lightness per step: perceptually even in OKLCH. */
export const ACCENT_LIGHTNESS: ColorScale<number> = {
  50: 0.975,
  100: 0.94,
  200: 0.88,
  300: 0.8,
  400: 0.71,
  500: 0.625,
  600: 0.545,
  700: 0.465,
  800: 0.385,
  900: 0.305,
  950: 0.235,
};

/** Fraction of the brand chroma kept at each accent step (tints and shades desaturate). */
const ACCENT_CHROMA: ColorScale<number> = {
  50: 0.14,
  100: 0.28,
  200: 0.5,
  300: 0.74,
  400: 0.92,
  500: 1,
  600: 1,
  700: 0.92,
  800: 0.8,
  900: 0.66,
  950: 0.52,
};

export const NEUTRAL_LIGHTNESS: ColorScale<number> = {
  50: 0.985,
  100: 0.962,
  200: 0.922,
  300: 0.86,
  400: 0.72,
  500: 0.6,
  600: 0.5,
  700: 0.415,
  800: 0.325,
  900: 0.245,
  950: 0.185,
};

const NEUTRAL_CHROMA: ColorScale<number> = {
  50: 0.45,
  100: 0.55,
  200: 0.65,
  300: 0.75,
  400: 0.85,
  500: 0.9,
  600: 0.95,
  700: 1,
  800: 1,
  900: 1,
  950: 1,
};

/** Target hues for neutral temperature; the brand hue pulls the neutral toward the accent. */
const TINT_HUE = { warm: 70, cool: 250 } as const;

const toOklch = (c: string | Oklch): Oklch => (typeof c === "string" ? parseColor(c) : c);

function buildScale(fn: (step: ScaleStep) => Oklch): ColorScale<Oklch> {
  const out = {} as ColorScale<Oklch>;
  for (const step of COLOR_SCALE_STEPS) out[step] = gamutMap(fn(step));
  return out;
}

/**
 * 11-step accent scale (50–950) from a brand color: fixed perceptual lightness ladder, hue held,
 * chroma following the brand's and tapering toward the ends, each step gamut-mapped to sRGB.
 */
export function accentScale(brand: string | Oklch): ColorScale<Oklch> {
  const b = gamutMap(toOklch(brand));
  return buildScale((step) => ({
    l: ACCENT_LIGHTNESS[step],
    c: b.c * ACCENT_CHROMA[step],
    h: b.h,
  }));
}

/**
 * 11-step neutral scale tinted toward the brand. `warm` and `cool` lean the hue toward amber or
 * blue (pulled 35% toward the brand hue); `pure` is achromatic gray.
 */
export function neutralScale(brand: string | Oklch, tint: NeutralTint): ColorScale<Oklch> {
  if (tint === "pure") return buildScale((step) => ({ l: NEUTRAL_LIGHTNESS[step], c: 0, h: 0 }));
  const b = gamutMap(toOklch(brand));
  const target = TINT_HUE[tint];
  const h = b.c < 0.02 ? target : mixHue(target, b.h, 0.35);
  const base = Math.min(0.018, Math.max(0.008, b.c * 0.12));
  return buildScale((step) => ({ l: NEUTRAL_LIGHTNESS[step], c: base * NEUTRAL_CHROMA[step], h }));
}

/** The scale step whose lightness is closest to the color's (where the brand "sits"). */
export function nearestStep(color: string | Oklch): ScaleStep {
  const { l } = toOklch(color);
  let best: ScaleStep = 500;
  for (const step of COLOR_SCALE_STEPS) {
    if (Math.abs(ACCENT_LIGHTNESS[step] - l) < Math.abs(ACCENT_LIGHTNESS[best] - l)) best = step;
  }
  return best;
}
