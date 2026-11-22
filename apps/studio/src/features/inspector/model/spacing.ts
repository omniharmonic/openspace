import {
  isSpaceToken,
  MAX_SPACE_PX,
  SPACE_TOKENS,
  type SpaceToken,
  type SpaceValue,
} from "@omniharmonic/openspace-schema";
import { type Density, SPACE_SCALES, sectionRhythmPx } from "@omniharmonic/openspace-theme";
import type { Bp } from "./responsive";

/**
 * Spacing in Studio: people see and type pixels; the site's spacing scale (which follows the
 * density) is the magnet. A value that lands exactly on a step is stored as the step, so it keeps
 * following the site's rhythm; anything else is stored as exact pixels.
 */

/** Viewport widths Studio previews at, for "Auto" values. */
export const BP_VIEWPORT: Record<Bp, number> = { d: 1440, t: 834, m: 390 };

export function stepPx(density: Density, token: SpaceToken): number {
  return token === "none" ? 0 : (SPACE_SCALES[density]?.[token] ?? 0);
}

/** A spacing value in px (steps on this density's scale). */
export function spacePx(value: SpaceValue, density: Density): number {
  return typeof value === "number" ? value : stepPx(density, value);
}

/** The step whose size is exactly `px`, if any. */
export function exactStep(px: number, density: Density): SpaceToken | undefined {
  return SPACE_TOKENS.find((t) => stepPx(density, t) === px);
}

/** What to store for a typed pixel value: the step when it matches one, else whole pixels. */
export function valueForPx(px: number, density: Density): SpaceValue {
  const n = Math.min(MAX_SPACE_PX, Math.max(0, Math.round(px)));
  return exactStep(n, density) ?? n;
}

/**
 * Snapping for drags: the nearest step within `threshold` px (Squarespace-easy), unless `free`
 * (Alt held), which keeps exact pixels (Figma-precise).
 */
export function snapPx(
  px: number,
  density: Density,
  { free = false, threshold = 6 }: { free?: boolean; threshold?: number } = {},
): { px: number; value: SpaceValue; step?: SpaceToken } {
  const n = Math.min(MAX_SPACE_PX, Math.max(0, Math.round(px)));
  if (!free) {
    let best: SpaceToken | undefined;
    let dist = Number.POSITIVE_INFINITY;
    for (const t of SPACE_TOKENS) {
      const d = Math.abs(stepPx(density, t) - n);
      if (d < dist) {
        dist = d;
        best = t;
      }
    }
    if (best && dist <= threshold) return { px: stepPx(density, best), value: best, step: best };
  }
  const step = exactStep(n, density);
  return { px: n, value: step ?? n, ...(step ? { step } : {}) };
}

/** The steps as menu options: "MD · 24px". */
export function stepOptions(density: Density) {
  return SPACE_TOKENS.map((t) => ({
    value: t,
    label: t === "none" ? "None" : t.toUpperCase(),
    px: stepPx(density, t),
  }));
}

/** "Auto" spacing (no value set) in px on a breakpoint. */
export function autoSpacing(density: Density, bp: Bp) {
  const r = sectionRhythmPx(density, BP_VIEWPORT[bp]);
  return {
    sectionPad: r.padY,
    blockGap: Math.round(r.gap * 0.6),
    columnGap: stepPx(density, "xl"),
  };
}

export function describeSpace(value: SpaceValue | undefined, density: Density): string {
  if (value === undefined) return "Auto";
  return isSpaceToken(value)
    ? `${value.toUpperCase()} · ${stepPx(density, value)}px`
    : `${value}px`;
}
