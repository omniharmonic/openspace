import type {
  BUTTON_STYLES,
  DENSITIES,
  ImageTreatment,
  MOTION_LEVELS,
  SHAPES,
} from "@openspace/schema";
import { fluidClamp } from "./type-scale";

export type Density = (typeof DENSITIES)[number];
export type Shape = (typeof SHAPES)[number];
export type ButtonStyle = (typeof BUTTON_STYLES)[number];
export type MotionLevel = (typeof MOTION_LEVELS)[number];

const rem = (px: number) => (px === 0 ? "0" : `${Math.round((px / 16) * 10000) / 10000}rem`);

// --- density -----------------------------------------------------------------------------------

/** Space steps (`3xs`…`3xl`) on a 4px base, in px, per density. */
export const SPACE_SCALES: Record<Density, Record<string, number>> = {
  compact: { "3xs": 4, "2xs": 8, xs: 12, sm: 16, md: 20, lg: 24, xl: 32, "2xl": 48, "3xl": 64 },
  comfortable: {
    "3xs": 4,
    "2xs": 8,
    xs: 12,
    sm: 16,
    md: 24,
    lg: 32,
    xl: 48,
    "2xl": 64,
    "3xl": 96,
  },
  airy: { "3xs": 4, "2xs": 8, xs: 16, sm: 24, md: 32, lg: 48, xl: 64, "2xl": 96, "3xl": 128 },
};

/** Fluid section rhythm (px at 360px → 1440px viewports). */
const SECTION_RHYTHM: Record<
  Density,
  { padY: [number, number]; gap: [number, number]; gutter: [number, number] }
> = {
  compact: { padY: [48, 80], gap: [16, 24], gutter: [20, 32] },
  comfortable: { padY: [64, 120], gap: [24, 32], gutter: [24, 40] },
  airy: { padY: [88, 168], gap: [32, 48], gutter: [24, 48] },
};

export function spaceTokens(density: Density): Record<string, string> {
  const out: Record<string, string> = { none: "0" };
  for (const [step, px] of Object.entries(SPACE_SCALES[density])) out[step] = rem(px);
  return out;
}

export function sectionTokens(density: Density): Record<string, string> {
  const r = SECTION_RHYTHM[density];
  return {
    "pad-y": fluidClamp(...r.padY),
    "block-gap": fluidClamp(...r.gap),
    gutter: fluidClamp(...r.gutter),
  };
}

/** Content widths (doc 04 §2.2). */
export const WIDTH_TOKENS = { narrow: "720px", content: "1280px", wide: "1440px" } as const;

// --- shape -------------------------------------------------------------------------------------

/** Radius scale + component radii (px) per shape. `full` is always a pill. */
export const RADIUS_SCALES: Record<Shape, Record<string, number>> = {
  sharp: { none: 0, sm: 0, md: 0, lg: 0, xl: 0, button: 0, card: 0, input: 0, image: 0 },
  soft: { none: 0, sm: 4, md: 8, lg: 12, xl: 20, button: 8, card: 12, input: 6, image: 8 },
  round: { none: 0, sm: 8, md: 14, lg: 22, xl: 32, button: 14, card: 22, input: 12, image: 22 },
};

export function radiusTokens(shape: Shape): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, px] of Object.entries(RADIUS_SCALES[shape]))
    out[name] = px === 0 ? "0" : `${px}px`;
  out.full = "9999px";
  return out;
}

export const SHADOW_VALUES: Record<"none" | "sm" | "md" | "lg", string> = {
  none: "none",
  sm: "0 1px 2px rgb(0 0 0 / 0.06), 0 1px 3px rgb(0 0 0 / 0.08)",
  md: "0 2px 4px rgb(0 0 0 / 0.05), 0 6px 16px rgb(0 0 0 / 0.08)",
  lg: "0 4px 8px rgb(0 0 0 / 0.04), 0 16px 40px rgb(0 0 0 / 0.12)",
};

// --- buttons -----------------------------------------------------------------------------------

export const BUTTON_ROLES = ["primary", "secondary", "tertiary"] as const;
export type ButtonRole = (typeof BUTTON_ROLES)[number];

/** Per-role CSS properties a button reads; each becomes `--os-button-<role>-<prop>`. */
export const BUTTON_PROPS = [
  "bg",
  "color",
  "border-color",
  "border-width",
  "radius",
  "padding-x",
  "padding-y",
  "text-decoration",
  "icon",
  "bg-hover",
  "color-hover",
  "border-color-hover",
] as const;
export type ButtonProp = (typeof BUTTON_PROPS)[number];

type Kind = "solid" | "outline" | "underline" | "text-arrow";
interface Variant {
  kind: Kind;
  pill: boolean;
  /** `accent` (brand-colored) or `text` (neutral ink). */
  tone: "accent" | "text";
}

/** How each Site Styles button choice maps onto the three roles. */
const BUTTON_SYSTEMS: Record<ButtonStyle, Record<ButtonRole, Variant>> = {
  solid: {
    primary: { kind: "solid", pill: false, tone: "accent" },
    secondary: { kind: "outline", pill: false, tone: "text" },
    tertiary: { kind: "underline", pill: false, tone: "text" },
  },
  outline: {
    primary: { kind: "outline", pill: false, tone: "accent" },
    secondary: { kind: "outline", pill: false, tone: "text" },
    tertiary: { kind: "underline", pill: false, tone: "text" },
  },
  underline: {
    primary: { kind: "underline", pill: false, tone: "accent" },
    secondary: { kind: "underline", pill: false, tone: "text" },
    tertiary: { kind: "text-arrow", pill: false, tone: "text" },
  },
  "pill-solid": {
    primary: { kind: "solid", pill: true, tone: "accent" },
    secondary: { kind: "outline", pill: true, tone: "text" },
    tertiary: { kind: "underline", pill: false, tone: "text" },
  },
  "pill-outline": {
    primary: { kind: "outline", pill: true, tone: "accent" },
    secondary: { kind: "outline", pill: true, tone: "text" },
    tertiary: { kind: "underline", pill: false, tone: "text" },
  },
  "text-arrow": {
    primary: { kind: "text-arrow", pill: false, tone: "accent" },
    secondary: { kind: "text-arrow", pill: false, tone: "text" },
    tertiary: { kind: "underline", pill: false, tone: "text" },
  },
};

const c = (role: string) => `var(--os-color-${role})`;
const mix = (a: string, b: string, pct: number) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;

/**
 * Button tokens. Label colors only use roles the contrast solver guarantees at 4.5:1 on their
 * surface: `accent-text` on `accent`, and `link` / `text` on the section background.
 */
function variantTokens(v: Variant): Record<ButtonProp, string> {
  const ink = v.tone === "accent" ? c("link") : c("text");
  const radius = v.pill ? "var(--os-radius-full)" : "var(--os-radius-button)";
  const padded = { "padding-x": "var(--os-space-lg)", "padding-y": "var(--os-space-xs)" };
  const bare = { "padding-x": "0", "padding-y": "var(--os-space-3xs)" };
  switch (v.kind) {
    case "solid": {
      const fill = v.tone === "accent" ? c("accent") : c("text");
      const label = v.tone === "accent" ? c("accent-text") : c("background");
      const hover = mix(fill, c("text"), 88);
      return {
        bg: fill,
        color: label,
        "border-color": fill,
        "border-width": "1px",
        radius,
        ...padded,
        "text-decoration": "none",
        icon: "none",
        "bg-hover": hover,
        "color-hover": label,
        "border-color-hover": hover,
      };
    }
    case "outline": {
      const line = v.tone === "accent" ? c("accent") : c("text");
      const fillHover = v.tone === "accent" ? c("accent") : c("text");
      const labelHover = v.tone === "accent" ? c("accent-text") : c("background");
      return {
        bg: "transparent",
        color: ink,
        "border-color": line,
        "border-width": "1.5px",
        radius,
        ...padded,
        "text-decoration": "none",
        icon: "none",
        "bg-hover": fillHover,
        "color-hover": labelHover,
        "border-color-hover": fillHover,
      };
    }
    case "underline":
      return {
        bg: "transparent",
        color: ink,
        "border-color": "transparent",
        "border-width": "0",
        radius: "0",
        ...bare,
        "text-decoration": "underline",
        icon: "none",
        "bg-hover": "transparent",
        "color-hover": c("heading"),
        "border-color-hover": "transparent",
      };
    case "text-arrow":
      return {
        bg: "transparent",
        color: ink,
        "border-color": "transparent",
        "border-width": "0",
        radius: "0",
        ...bare,
        "text-decoration": "none",
        icon: '"→"',
        "bg-hover": "transparent",
        "color-hover": c("heading"),
        "border-color-hover": "transparent",
      };
  }
}

export function buttonTokens(style: ButtonStyle): Record<ButtonRole, Record<ButtonProp, string>> {
  const sys = BUTTON_SYSTEMS[style];
  return {
    primary: variantTokens(sys.primary),
    secondary: variantTokens(sys.secondary),
    tertiary: variantTokens(sys.tertiary),
  };
}

// --- motion ------------------------------------------------------------------------------------

export const MOTION_PROPS = [
  "enabled",
  "duration-fast",
  "duration-base",
  "duration-slow",
  "ease",
  "reveal-distance",
  "reveal-duration",
  "stagger",
  "hover-scale",
  "parallax",
] as const;
export type MotionProp = (typeof MOTION_PROPS)[number];

export const MOTION_VALUES: Record<MotionLevel, Record<MotionProp, string>> = {
  none: {
    enabled: "0",
    "duration-fast": "0ms",
    "duration-base": "0ms",
    "duration-slow": "0ms",
    ease: "linear",
    "reveal-distance": "0px",
    "reveal-duration": "0ms",
    stagger: "0ms",
    "hover-scale": "1",
    parallax: "0",
  },
  subtle: {
    enabled: "1",
    "duration-fast": "150ms",
    "duration-base": "250ms",
    "duration-slow": "400ms",
    ease: "cubic-bezier(0.2, 0, 0, 1)",
    "reveal-distance": "12px",
    "reveal-duration": "600ms",
    stagger: "60ms",
    "hover-scale": "1.02",
    parallax: "0",
  },
  expressive: {
    enabled: "1",
    "duration-fast": "200ms",
    "duration-base": "350ms",
    "duration-slow": "600ms",
    ease: "cubic-bezier(0.16, 1, 0.3, 1)",
    "reveal-distance": "32px",
    "reveal-duration": "900ms",
    stagger: "110ms",
    "hover-scale": "1.06",
    parallax: "0.2",
  },
};

// --- image treatments --------------------------------------------------------------------------

export const IMAGE_PROPS = [
  "radius",
  "clip-path",
  "aspect-ratio",
  "filter",
  "blend",
  "backdrop",
  "overlay",
  "overlay-blend",
  "overlay-opacity",
  "frame-padding",
  "frame-color",
  "frame-border",
] as const;
export type ImageProp = (typeof IMAGE_PROPS)[number];

/** Fractal-noise tile for the `grain` treatment (inline SVG, no network request). */
const GRAIN_SVG =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const IMAGE_BASE: Record<ImageProp, string> = {
  radius: "0",
  "clip-path": "none",
  "aspect-ratio": "auto",
  filter: "none",
  blend: "normal",
  backdrop: "transparent",
  overlay: "none",
  "overlay-blend": "normal",
  "overlay-opacity": "0",
  "frame-padding": "0",
  "frame-color": "transparent",
  "frame-border": "0 solid transparent",
};

/**
 * Image treatment tokens. The renderer reads them on the image wrapper (`radius`, `clip-path`,
 * `aspect-ratio`, `backdrop`, frame), the `<img>` (`filter`, `blend`) and a `::after` overlay.
 * Duotone: a grayscale image multiplied over a light accent, then a dark accent lightened in.
 */
export const IMAGE_TREATMENT_VALUES: Record<ImageTreatment, Record<ImageProp, string>> = {
  none: IMAGE_BASE,
  rounded: { ...IMAGE_BASE, radius: "max(var(--os-radius-lg), 0.75rem)" },
  arch: { ...IMAGE_BASE, radius: "9999px 9999px 0 0" },
  circle: { ...IMAGE_BASE, radius: "50%", "aspect-ratio": "1" },
  blob: { ...IMAGE_BASE, radius: "42% 58% 63% 37% / 41% 44% 56% 59%" },
  duotone: {
    ...IMAGE_BASE,
    radius: "var(--os-radius-image)",
    filter: "grayscale(1) contrast(1.1)",
    blend: "multiply",
    backdrop: "var(--os-color-accent-200)",
    overlay: "linear-gradient(var(--os-color-accent-900), var(--os-color-accent-900))",
    "overlay-blend": "lighten",
    "overlay-opacity": "1",
  },
  grain: {
    ...IMAGE_BASE,
    radius: "var(--os-radius-image)",
    overlay: GRAIN_SVG,
    "overlay-blend": "overlay",
    "overlay-opacity": "0.22",
  },
  frame: {
    ...IMAGE_BASE,
    radius: "var(--os-radius-sm)",
    "frame-padding": "var(--os-space-xs)",
    "frame-color": "var(--os-color-surface-raised)",
    "frame-border": "1px solid var(--os-color-border)",
  },
};
