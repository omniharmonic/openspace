/**
 * The CSS custom-property contract. Every token the compiler emits is named here; the renderer's
 * base stylesheet and blocks must reference tokens only through these names.
 *
 * Naming rule (also how DTCG override paths map to properties): path segments, camelCase turned
 * kebab-case, joined with `-`, prefixed `--os-`. `type.display.letterSpacing` →
 * `--os-type-display-letter-spacing`; `color.accent-500` → `--os-color-accent-500`.
 *
 * Where each lives in the compiled CSS:
 * - `color.*` roles: per section theme, on `:root, .os-theme-light` and `.os-theme-<name>`.
 * - `button.*`, `image.*`: re-declared on `:root` and every `.os-theme-*` so their `var()`
 *   references resolve against the enclosing section's roles; `.os-image-<treatment>` classes
 *   override `image.*` per block.
 * - everything else: `:root`.
 */
import {
  COLOR_ROLES,
  COLOR_SCALE_STEPS,
  COLOR_THEMES,
  type ColorTheme,
  RADIUS_TOKENS,
  SHADOW_TOKENS,
  SPACE_TOKENS,
} from "@omniharmonic/openspace-schema";
import {
  BUTTON_PROPS,
  BUTTON_ROLES,
  type ButtonProp,
  type ButtonRole,
  IMAGE_PROPS,
  type ImageProp,
  MOTION_PROPS,
  type MotionProp,
} from "./layout";
import { TYPE_PRESET_NAMES, type TypePresetName, type TypePresetTokens } from "./type-scale";
import { type ScaleStep, STATE_ROLES, type ThemeRole } from "./types";

export const VAR_PREFIX = "--os-";

/** `["type", "display", "letterSpacing"]` → `--os-type-display-letter-spacing` */
export function varName(...path: (string | number)[]): string {
  return (
    VAR_PREFIX +
    path
      .map((seg) =>
        String(seg)
          .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
          .toLowerCase(),
      )
      .join("-")
  );
}

/** `var(--os-…)` for a path. */
export const cssVar = (...path: (string | number)[]) => `var(${varName(...path)})`;

/** Variable for a schema color token (`accent`, `text-muted`, `neutral-200`). */
export const colorVar = (token: string) => varName("color", token);

/** Section theme class: `.os-theme-dark` → `os-theme-dark`. */
export const themeClass = (theme: ColorTheme) => `os-theme-${theme}`;
/** Per-block image treatment class. */
export const imageTreatmentClass = (treatment: string) => `os-image-${treatment}`;

/** Space steps (schema `SPACE_TOKENS`). */
export const SPACE_STEPS = SPACE_TOKENS;
/** Schema `RADIUS_TOKENS` plus component radii set by the shape choice. */
export const RADIUS_NAMES = [...RADIUS_TOKENS, "button", "card", "input", "image"] as const;
/** Schema `SHADOW_TOKENS`. */
export const SHADOW_NAMES = SHADOW_TOKENS;
export const TYPE_PROPS = [
  "font-family",
  "font-size",
  "line-height",
  "letter-spacing",
  "font-weight",
  "text-transform",
] as const satisfies readonly (keyof TypePresetTokens)[];

const record = <K extends string | number, V>(keys: readonly K[], fn: (k: K) => V) =>
  Object.fromEntries(keys.map((k) => [k, fn(k)])) as Record<K, V>;

/** The documented variable map. Values are custom-property names (`--os-…`). */
export const TOKEN_VARS = {
  /** Semantic roles plus `accent-hover` / `accent-pressed` (theme-scoped, contrast-solved). */
  color: record<ThemeRole, string>([...COLOR_ROLES, ...STATE_ROLES], (r) => varName("color", r)),
  /** Accent scale `--os-color-accent-50` … `-950`. */
  accent: record<ScaleStep, string>(COLOR_SCALE_STEPS, (s) => varName("color", "accent", s)),
  /** Neutral scale `--os-color-neutral-50` … `-950`. */
  neutral: record<ScaleStep, string>(COLOR_SCALE_STEPS, (s) => varName("color", "neutral", s)),
  /** The (gamut-mapped) brand color as chosen. */
  brand: varName("color", "brand"),
  font: {
    heading: varName("font", "heading"),
    body: varName("font", "body"),
    /** Eyebrows, buttons and navigation (the body font unless the site has a label font). */
    label: varName("font", "label"),
    weightHeading: varName("font", "weight", "heading"),
    weightBody: varName("font", "weight", "body"),
    weightStrong: varName("font", "weight", "strong"),
  },
  /** Typography presets: `--os-type-<preset>-<css-property>`. */
  type: record<TypePresetName, Record<(typeof TYPE_PROPS)[number], string>>(
    TYPE_PRESET_NAMES,
    (preset) => record(TYPE_PROPS, (prop) => varName("type", preset, prop)),
  ),
  /** Max line length for running text (~70 characters). */
  measure: varName("measure"),
  space: record(SPACE_STEPS, (s) => varName("space", s)),
  section: {
    padY: varName("section", "pad-y"),
    blockGap: varName("section", "block-gap"),
    gutter: varName("section", "gutter"),
  },
  width: {
    narrow: varName("width", "narrow"),
    content: varName("width", "content"),
    wide: varName("width", "wide"),
  },
  radius: record(RADIUS_NAMES, (r) => varName("radius", r)),
  /** Eyebrow text color: the link color, or muted text (`choices.typography.eyebrowColor`). */
  eyebrowColor: varName("eyebrow", "color"),
  shadow: record(SHADOW_NAMES, (s) => varName("shadow", s)),
  /** Buttons: `--os-button-<primary|secondary|tertiary>-<prop>`. */
  button: record<ButtonRole, Record<ButtonProp, string>>(BUTTON_ROLES, (role) =>
    record(BUTTON_PROPS, (prop) => varName("button", role, prop)),
  ),
  motion: record<MotionProp, string>(MOTION_PROPS, (p) => varName("motion", p)),
  image: record<ImageProp, string>(IMAGE_PROPS, (p) => varName("image", p)),
} as const;

/** Every variable name in {@link TOKEN_VARS}, flattened, in declaration order. */
export function allTokenVars(): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
  };
  walk(TOKEN_VARS);
  return out;
}

/** Section theme class names, in schema order. */
export const THEME_CLASSES = COLOR_THEMES.map(themeClass);
