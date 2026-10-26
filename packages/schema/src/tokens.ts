import { z } from "zod";
import { named } from "./registry";

/**
 * Design-token vocabularies shared by sections, blocks and styles. Content refers to tokens
 * by name; the theme compiler (`@openspace/theme`) turns them into `--os-*` custom properties.
 */

/** Section/block color themes (doc 04 §3.2). Each is a complete role set from the palette. */
export const COLOR_THEMES = ["light", "light-accent", "dark", "dark-accent", "brand"] as const;
export const ColorThemeSchema = named(
  "ColorTheme",
  "One of the five section color themes.",
  z.enum(COLOR_THEMES),
);
export type ColorTheme = z.infer<typeof ColorThemeSchema>;

/** Spacing step scale (doc 04 §5): 4px base, modular steps. */
export const SPACE_TOKENS = [
  "none",
  "3xs",
  "2xs",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
] as const;
export const SpaceTokenSchema = z.enum(SPACE_TOKENS);
export type SpaceToken = z.infer<typeof SpaceTokenSchema>;

export const RADIUS_TOKENS = ["none", "sm", "md", "lg", "xl", "full"] as const;
export const RadiusTokenSchema = z.enum(RADIUS_TOKENS);
export type RadiusToken = z.infer<typeof RadiusTokenSchema>;

export const SHADOW_TOKENS = ["none", "sm", "md", "lg"] as const;
export const ShadowTokenSchema = z.enum(SHADOW_TOKENS);
export type ShadowToken = z.infer<typeof ShadowTokenSchema>;

/** Typography presets usable in content (doc 04 §4.2). `button` and `nav` are UI-only. */
export const TYPE_PRESETS = [
  "display",
  "h1",
  "h2",
  "h3",
  "h4",
  "lead",
  "body",
  "small",
  "eyebrow",
] as const;
export const TypePresetSchema = z.enum(TYPE_PRESETS);
export type TypePreset = z.infer<typeof TypePresetSchema>;

export const ALIGNMENTS = ["start", "center", "end"] as const;
export const AlignSchema = z.enum(ALIGNMENTS);
export type Align = z.infer<typeof AlignSchema>;

/** Image treatments (doc 04 §5). */
export const IMAGE_TREATMENTS = [
  "none",
  "rounded",
  "arch",
  "circle",
  "blob",
  "duotone",
  "grain",
  "frame",
] as const;
export const ImageTreatmentSchema = z.enum(IMAGE_TREATMENTS);
export type ImageTreatment = z.infer<typeof ImageTreatmentSchema>;

/** Entrance animations; all are disabled under `prefers-reduced-motion`. */
export const ANIMATIONS = ["none", "fade", "rise", "slide", "zoom", "clip"] as const;
export const AnimationSchema = z.strictObject({
  entrance: z.enum(ANIMATIONS),
  stagger: z.boolean().optional(),
});
export type Animation = z.infer<typeof AnimationSchema>;

/** Semantic color roles (doc 04 §3.1). */
export const COLOR_ROLES = [
  "background",
  "surface",
  "surface-raised",
  "text",
  "text-muted",
  "heading",
  "accent",
  "accent-text",
  "border",
  "focus",
  "link",
  "success",
  "warning",
  "danger",
] as const;
export const COLOR_SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

const COLOR_TOKEN_RE = new RegExp(
  `^(?:${COLOR_ROLES.join("|")}|(?:accent|neutral)-(?:${COLOR_SCALE_STEPS.join("|")}))$`,
);

/** A palette token: a semantic role (`accent`, `text-muted`) or a scale step (`accent-500`). */
export const ColorTokenSchema = named(
  "ColorToken",
  "A palette token: a semantic role such as `accent` or a scale step such as `neutral-200`.",
  z
    .string()
    .regex(COLOR_TOKEN_RE, { message: "Expected a color token such as accent or neutral-200" }),
);
export type ColorToken = z.infer<typeof ColorTokenSchema>;

const CSS_COLOR_RE =
  /^(?:#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|(?:oklch|oklab|rgb|rgba|hsl|hsla|lab|lch)\([^()]*\))$/;

/** An exact CSS color (hex, oklch(), rgb(), hsl(), lab(), lch()). Designer-mode escape hatch. */
export const CssColorSchema = named(
  "CssColor",
  "An exact CSS color: hex, oklch(), oklab(), rgb(), hsl(), lab() or lch().",
  z
    .string()
    .regex(CSS_COLOR_RE, { message: "Expected a CSS color such as #1a2b3c or oklch(0.6 0.1 145)" }),
);
export type CssColor = z.infer<typeof CssColorSchema>;

/** Token reference or exact color. */
export const ColorValueSchema = z.union([ColorTokenSchema, CssColorSchema]);
export type ColorValue = z.infer<typeof ColorValueSchema>;
