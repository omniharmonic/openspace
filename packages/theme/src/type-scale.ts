import { fontStack, type TypePairing } from "./pairings";

/** Every typography preset: the nine content presets plus the UI-only `button` and `nav`. */
export const TYPE_PRESET_NAMES = [
  "display",
  "h1",
  "h2",
  "h3",
  "h4",
  "lead",
  "body",
  "small",
  "eyebrow",
  "button",
  "nav",
] as const;
export type TypePresetName = (typeof TYPE_PRESET_NAMES)[number];

/** Fluid scale parameters (doc 04 §4.2). Sizes interpolate between the two viewports. */
export const FLUID_TYPE = {
  minViewport: 360,
  maxViewport: 1440,
  /** Body size (px) at the min / max viewport. */
  minBase: 16,
  maxBase: 18,
  minRatio: 1.2,
  maxRatio: 1.333,
} as const;

/** Scale step per preset (0 = body); fractional steps sit between ratios. */
const PRESET_STEP: Record<TypePresetName, number> = {
  display: 5.5,
  h1: 4,
  h2: 3,
  h3: 2,
  h4: 1,
  lead: 0.5,
  body: 0,
  small: -1,
  eyebrow: -1,
  button: -0.5,
  nav: -0.5,
};

const LINE_HEIGHT: Record<TypePresetName, number> = {
  display: 1.05,
  h1: 1.1,
  h2: 1.15,
  h3: 1.2,
  h4: 1.3,
  lead: 1.5,
  body: 1.6,
  small: 1.5,
  eyebrow: 1.3,
  button: 1.2,
  nav: 1.3,
};

/** Smallest rendered size (px) for any preset — keeps captions and eyebrows legible. */
export const MIN_FONT_SIZE_PX = 14;

const HEADINGS = new Set<TypePresetName>(["display", "h1", "h2", "h3", "h4"]);
const LARGE_HEADINGS = new Set<TypePresetName>(["display", "h1", "h2"]);

const r4 = (v: number) => {
  const r = Math.round(v * 10000) / 10000;
  return Object.is(r, -0) ? 0 : r;
};

/**
 * `clamp()` that moves linearly from `minPx` at the min viewport to `maxPx` at the max viewport.
 * Sizes are emitted in rem so they respect the reader's font-size preference.
 */
export function fluidClamp(
  minPx: number,
  maxPx: number,
  minViewport: number = FLUID_TYPE.minViewport,
  maxViewport: number = FLUID_TYPE.maxViewport,
): string {
  if (Math.abs(maxPx - minPx) < 0.01) return `${r4(minPx / 16)}rem`;
  const slope = (maxPx - minPx) / (maxViewport - minViewport);
  const intercept = minPx - slope * minViewport;
  const lo = Math.min(minPx, maxPx);
  const hi = Math.max(minPx, maxPx);
  return `clamp(${r4(lo / 16)}rem, ${r4(intercept / 16)}rem + ${r4(slope * 100)}vw, ${r4(hi / 16)}rem)`;
}

/** Font size (px) for a scale step at the min and max viewport. */
export function stepSizes(step: number): { min: number; max: number } {
  return {
    min: FLUID_TYPE.minBase * FLUID_TYPE.minRatio ** step,
    max: FLUID_TYPE.maxBase * FLUID_TYPE.maxRatio ** step,
  };
}

export interface TypePresetTokens {
  "font-family": string;
  "font-size": string;
  "line-height": string;
  "letter-spacing": string;
  "font-weight": string;
  "text-transform": string;
}

/** Half of an em tracking value: `-0.02em` → `-0.01em`. */
function halfTracking(value: string): string {
  const m = /^(-?\d*\.?\d+)em$/.exec(value.trim());
  return m?.[1] ? `${r4(Number.parseFloat(m[1]) / 2)}em` : value;
}

/** Typography preset tokens for a pairing. Families reference `--os-font-*` vars. */
export function typeScale(p: TypePairing): Record<TypePresetName, TypePresetTokens> {
  const out = {} as Record<TypePresetName, TypePresetTokens>;
  for (const name of TYPE_PRESET_NAMES) {
    const sizes = stepSizes(PRESET_STEP[name]);
    const min = Math.max(MIN_FONT_SIZE_PX, sizes.min);
    const max = Math.max(MIN_FONT_SIZE_PX, sizes.max);
    const heading = HEADINGS.has(name);
    let letterSpacing = "0em";
    if (LARGE_HEADINGS.has(name)) letterSpacing = p.headingTracking;
    else if (heading) letterSpacing = halfTracking(p.headingTracking);
    else if (name === "eyebrow") letterSpacing = p.eyebrowTracking;
    else if (name === "button" || name === "nav") letterSpacing = "0.01em";
    let weight = "var(--os-font-weight-body)";
    if (heading) weight = "var(--os-font-weight-heading)";
    else if (name === "eyebrow" || name === "button" || name === "nav")
      weight = "var(--os-font-weight-strong)";
    out[name] = {
      "font-family": heading ? "var(--os-font-heading)" : "var(--os-font-body)",
      "font-size": fluidClamp(min, max),
      "line-height": String(LINE_HEIGHT[name]),
      "letter-spacing": letterSpacing,
      "font-weight": weight,
      "text-transform": name === "eyebrow" ? "uppercase" : "none",
    };
  }
  return out;
}

/** Font family + weight tokens for a pairing. */
export function fontTokens(p: TypePairing): Record<string, string> {
  return {
    heading: fontStack(p.heading),
    body: fontStack(p.body),
    "weight-heading": String(p.headingWeight),
    "weight-body": String(p.bodyWeight),
    "weight-strong": String(p.strongWeight),
  };
}
