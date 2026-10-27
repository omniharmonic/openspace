import {
  COLOR_ROLES,
  COLOR_SCALE_STEPS,
  COLOR_THEMES,
  type ColorTheme,
  type StyleChoices,
  type Styles,
} from "@omniharmonic/openspace-schema";
import { formatOklch, type Oklch, oklchToHex, parseColor } from "./color";
import {
  auditContrast,
  type ContrastFailure,
  type ContrastMode,
  relativeLuminance,
  type ThemeColorSet,
} from "./contrast";
import { chosenCustomFont, customFontStack, nearestWeight } from "./custom-fonts";
import {
  BUTTON_ROLES,
  buttonTokens,
  IMAGE_TREATMENT_VALUES,
  MOTION_VALUES,
  radiusTokens,
  SHADOW_VALUES,
  sectionTokens,
  spaceTokens,
  WIDTH_TOKENS,
} from "./layout";
import { dtcgToCss, flattenDtcg, SOLE_ALIAS_RE } from "./overrides";
import {
  DEFAULT_PAIRING_ID,
  type FontFamilySpec,
  fontsourceCss,
  getPairing,
  googleFontsUrl,
  type TypePairing,
} from "./pairings";
import {
  accentStates,
  buildPalette,
  type ContrastAdjustment,
  onColor,
  type Palette,
  solveThemes,
  themeRoles,
} from "./themes";
import { fluidClamp, fontTokens, TYPE_PRESET_NAMES, tunedPreset, typeScale } from "./type-scale";
import { type ColorRole, type ColorScale, STATE_ROLES, type ThemeRole } from "./types";
import { imageTreatmentClass, THEME_CLASSES, themeClass, varName } from "./vars";

export interface CompileWarning {
  code:
    | "invalid-brand"
    | "unknown-pairing"
    | "invalid-override"
    | "custom-token"
    | "contrast-adjusted"
    | "contrast-failure";
  path?: string;
  message: string;
}

export interface CompileOptions {
  /**
   * Run the contrast solver (default `true`). With `false`, colors ship exactly as chosen and
   * overridden, and `contrast.failures` lists what fails — what Studio shows before the
   * one-click "nearest accessible" fix.
   */
  solve?: boolean;
}

export interface ThemeTokens {
  choices: StyleChoices;
  pairing: TypePairing;
  palette: {
    brand: string;
    brandOklch: string;
    accent: ColorScale<string>;
    neutral: ColorScale<string>;
  };
  /** Final role colors (`#rrggbb`) per section theme. */
  themes: ThemeColorSet;
  fonts: { googleFontsUrl: string; fontsource: string[] };
  /** Every emitted custom property, by where it is declared. */
  vars: {
    root: Record<string, string>;
    themes: Record<ColorTheme, Record<string, string>>;
    /** Declared on `:root` and every theme class so `var()` references resolve per section. */
    themed: Record<string, string>;
    imageTreatments: Record<string, Record<string, string>>;
    reducedMotion: Record<string, string>;
  };
}

export interface CompiledStyles {
  tokens: ThemeTokens;
  css: string;
  contrast: { mode: ContrastMode; adjustments: ContrastAdjustment[]; failures: ContrastFailure[] };
  warnings: CompileWarning[];
}

const FALLBACK_BRAND = "oklch(0.55 0.12 250)";
const COLOR_THEME_SET = new Set<string>(COLOR_THEMES);
const COLOR_ROLE_SET = new Set<string>(COLOR_ROLES);
/** Override scope that targets every section theme: `color.all.<role>`. */
export const ALL_THEMES = "all";
const THEME_ROLES: readonly ThemeRole[] = [...COLOR_ROLES, ...STATE_ROLES];

function scaleHex(scale: ColorScale<Oklch>): ColorScale<string> {
  const out = {} as ColorScale<string>;
  for (const step of COLOR_SCALE_STEPS) out[step] = oklchToHex(scale[step]);
  return out;
}

/** Resolve a theme color override value to a concrete color (aliases to the palette allowed). */
function overrideColor(
  raw: unknown,
  palette: Palette,
  roles: Record<ColorRole, Oklch>,
): Oklch | null {
  if (typeof raw !== "string") return null;
  const alias = SOLE_ALIAS_RE.exec(raw.trim());
  if (alias?.[1]) {
    const [group, name] = alias[1].split(".");
    if (group !== "color" || !name) return null;
    if (name === "brand") return palette.brand;
    const m = /^(accent|neutral)-(\d+)$/.exec(name);
    if (m) {
      const scale = m[1] === "accent" ? palette.accent : palette.neutral;
      return (scale as Record<number, Oklch>)[Number(m[2])] ?? null;
    }
    return COLOR_ROLE_SET.has(name) ? roles[name as ColorRole] : null;
  }
  try {
    return parseColor(raw);
  } catch {
    return null;
  }
}

/**
 * Compile `content/styles.json` into the full token set and the site's token stylesheet.
 *
 * Override paths (DTCG):
 * - `color.all.<role>`: the role in **every** section theme;
 * - `color.<role>`: the role in the default (light) theme only;
 * - `color.<theme>.<role>`: the role in one section theme.
 *   Precedence is theme > light > all. All three apply before the contrast solver runs; an
 *   overridden `accent` gets a freshly picked `accent-text` unless that is overridden too, and
 *   `accent-hover`/`accent-pressed` are always derived from the final accent.
 * - `color.accent-500` / `color.neutral-200` / `color.brand` replace scale variables.
 * - Every other path maps to `--os-<path>` (see `vars.ts`), e.g. `type.display.letterSpacing`.
 */
export function compileStyles(styles: Styles, options: CompileOptions = {}): CompiledStyles {
  const { choices } = styles;
  const warnings: CompileWarning[] = [];
  const mode: ContrastMode = choices.palette.contrast ?? "standard";

  // --- palette ---
  let brand: Oklch;
  try {
    brand = parseColor(choices.palette.brand);
  } catch {
    warnings.push({
      code: "invalid-brand",
      path: "choices.palette.brand",
      message: `Could not read brand color "${choices.palette.brand}"; using ${FALLBACK_BRAND}.`,
    });
    brand = parseColor(FALLBACK_BRAND);
  }
  const palette = buildPalette(brand, choices.palette.neutral);

  // --- pairing ---
  let pairing = getPairing(choices.pairing);
  if (!pairing) {
    warnings.push({
      code: "unknown-pairing",
      path: "choices.pairing",
      message: `Unknown type pairing "${choices.pairing}"; using "${DEFAULT_PAIRING_ID}".`,
    });
    pairing = getPairing(DEFAULT_PAIRING_ID) as TypePairing;
  }

  // A site's own fonts (Google Fonts) per role replace the pairing's (imports set them).
  pairing = withWebFonts(pairing, choices.typography);

  // --- token maps (insertion order = output order) ---
  const accentHex = scaleHex(palette.accent);
  const neutralHex = scaleHex(palette.neutral);
  const root = new Map<string, string>();
  root.set(varName("color", "brand"), oklchToHex(palette.brand));
  for (const step of COLOR_SCALE_STEPS) root.set(varName("color", "accent", step), accentHex[step]);
  for (const step of COLOR_SCALE_STEPS)
    root.set(varName("color", "neutral", step), neutralHex[step]);

  const fonts = fontTokens(pairing);
  // Uploaded fonts replace the pairing's heading and/or body family (PRD §5.1).
  const headingFont = chosenCustomFont(styles, choices.headingFont);
  if (headingFont) {
    fonts.heading = customFontStack(headingFont);
    fonts["weight-heading"] = String(nearestWeight(headingFont, pairing.headingWeight));
  }
  const bodyFont = chosenCustomFont(styles, choices.bodyFont);
  if (bodyFont) {
    fonts.body = customFontStack(bodyFont);
    fonts["weight-body"] = String(nearestWeight(bodyFont, pairing.bodyWeight));
    fonts["weight-strong"] = String(nearestWeight(bodyFont, pairing.strongWeight));
  }
  for (const [k, v] of Object.entries(fonts)) root.set(varName("font", k), v);
  const type = typeScale(pairing);
  const tuned = choices.typography?.scale ?? {};
  for (const preset of TYPE_PRESET_NAMES) {
    const step = tuned[preset];
    const values = step ? { ...type[preset], ...tunedPreset(step) } : type[preset];
    for (const [prop, v] of Object.entries(values)) root.set(varName("type", preset, prop), v);
  }
  root.set(varName("measure"), "70ch");
  for (const [k, v] of Object.entries(spaceTokens(choices.density)))
    root.set(varName("space", k), v);
  const rhythm = sectionTokens(choices.density);
  const lay = choices.layout;
  if (lay?.sectionPadding !== undefined)
    rhythm["pad-y"] = fluidClamp(
      lay.sectionPaddingMobile ?? Math.round(lay.sectionPadding * 0.55),
      lay.sectionPadding,
    );
  if (lay?.gutter !== undefined)
    rhythm.gutter = fluidClamp(lay.gutterMobile ?? Math.min(lay.gutter, 20), lay.gutter);
  for (const [k, v] of Object.entries(rhythm)) root.set(varName("section", k), v);
  const widths: Record<string, string> = { ...WIDTH_TOKENS };
  if (lay?.contentWidth !== undefined) widths.content = `${lay.contentWidth}px`;
  if (lay?.narrowWidth !== undefined) widths.narrow = `${lay.narrowWidth}px`;
  for (const [k, v] of Object.entries(widths)) root.set(varName("width", k), v);
  for (const [k, v] of Object.entries(radiusTokens(choices.shape)))
    root.set(varName("radius", k), v);
  for (const [k, v] of Object.entries(SHADOW_VALUES)) root.set(varName("shadow", k), v);
  for (const [k, v] of Object.entries(MOTION_VALUES[choices.motion]))
    root.set(varName("motion", k), v);

  const themed = new Map<string, string>();
  const buttons = buttonTokens(choices.buttons);
  for (const role of BUTTON_ROLES) {
    for (const [prop, v] of Object.entries(buttons[role]))
      themed.set(varName("button", role, prop), v);
  }
  for (const [k, v] of Object.entries(IMAGE_TREATMENT_VALUES[choices.imageTreatment]))
    themed.set(varName("image", k), v);
  themed.set(
    varName("eyebrow", "color"),
    choices.typography?.eyebrowColor === "muted"
      ? `var(${varName("color", "text-muted")})`
      : `var(${varName("color", "link")})`,
  );

  // --- overrides ---
  const roles = themeRoles(palette);
  const custom = new Map<string, string>();
  /** `theme:role` → the override path that set it. */
  const overriddenRoles = new Map<string, string>();
  const roleOverrides: {
    tier: number;
    scope: string;
    role: ColorRole;
    dotted: string;
    value: unknown;
  }[] = [];
  for (const { path, token, type: t } of flattenDtcg(styles.overrides)) {
    const dotted = path.join(".");
    const invalid = (why: string) =>
      warnings.push({ code: "invalid-override", path: dotted, message: why });

    if (path[0] === "color") {
      const [, a, b] = path;
      const scope =
        path.length === 3 && a && (a === ALL_THEMES || COLOR_THEME_SET.has(a)) ? a : null;
      const role = scope ? b : path.length === 2 ? a : undefined;
      if (role && COLOR_ROLE_SET.has(role)) {
        // Precedence: `color.<theme>.<role>` > `color.<role>` (light) > `color.all.<role>`.
        const tier = scope === ALL_THEMES ? 0 : scope ? 2 : 1;
        roleOverrides.push({
          tier,
          scope: scope ?? "light",
          role: role as ColorRole,
          dotted,
          value: token.$value,
        });
        continue;
      }
    }

    // Composite typography token: expand into per-property vars.
    if (t === "typography" && typeof token.$value === "object" && token.$value !== null) {
      for (const [prop, sub] of Object.entries(token.$value as Record<string, unknown>).sort()) {
        const subType =
          prop === "fontFamily" ? "fontFamily" : prop === "fontSize" ? "dimension" : undefined;
        const css = dtcgToCss(sub as never, subType);
        if (css === null) invalid(`Unsupported value for ${prop}.`);
        else applyVar(varName(...path, prop), css);
      }
      continue;
    }

    const colorPath = path[0] === "color";
    const css = dtcgToCss(token.$value, t ?? (colorPath ? "color" : undefined));
    if (css === null) {
      invalid(`Unsupported or unsafe value ${JSON.stringify(token.$value)}.`);
      continue;
    }
    applyVar(varName(...path), css);
  }

  function applyVar(name: string, css: string) {
    if (root.has(name)) root.set(name, css);
    else if (themed.has(name)) themed.set(name, css);
    else {
      custom.set(name, css);
      warnings.push({
        code: "custom-token",
        path: name,
        message: `${name} is not a built-in token; emitted as a custom property.`,
      });
    }
  }
  for (const name of [...custom.keys()].sort()) root.set(name, custom.get(name) as string);
  for (const o of roleOverrides.sort((x, y) => x.tier - y.tier)) {
    const targets = o.scope === ALL_THEMES ? COLOR_THEMES : [o.scope as ColorTheme];
    for (const target of targets) {
      const color = overrideColor(o.value, palette, roles[target]);
      if (!color) {
        warnings.push({
          code: "invalid-override",
          path: o.dotted,
          message: `"${String(o.value)}" is not a color.`,
        });
        break;
      }
      roles[target][o.role] = color;
      overriddenRoles.set(`${target}:${o.role}`, o.dotted);
    }
  }
  // A new accent gets a fresh label color unless that was overridden too.
  for (const theme of COLOR_THEMES) {
    if (overriddenRoles.has(`${theme}:accent`) && !overriddenRoles.has(`${theme}:accent-text`)) {
      roles[theme]["accent-text"] = onColor(roles[theme].accent, palette);
    }
  }

  // --- contrast ---
  let themes: ThemeColorSet;
  let adjustments: ContrastAdjustment[] = [];
  if (options.solve === false) {
    themes = {} as ThemeColorSet;
    for (const theme of COLOR_THEMES) {
      const set = roles[theme];
      const all = { ...set, ...accentStates(set.accent, set["accent-text"]) };
      const out = {} as Record<ThemeRole, string>;
      for (const role of THEME_ROLES) out[role] = oklchToHex(all[role]);
      themes[theme] = out;
    }
  } else {
    ({ themes, adjustments } = solveThemes(roles, mode));
  }
  const failures = auditContrast(themes, { contrast: mode });
  for (const a of adjustments) {
    const path = overriddenRoles.get(`${a.theme}:${a.role}`);
    if (!path) continue;
    warnings.push({
      code: "contrast-adjusted",
      path,
      message: `Override ${a.from} adjusted to ${a.to} to reach ${a.required}:1 against ${a.against} (${a.theme}).`,
    });
  }
  for (const f of failures) {
    warnings.push({
      code: "contrast-failure",
      path: `${f.theme}.${f.fg}/${f.bg}`,
      message: `${f.fg} on ${f.bg} is ${f.ratio}:1 in ${f.theme}; needs ${f.required}:1 (try ${f.suggestion}).`,
    });
  }

  const themeVars = {} as Record<ColorTheme, Record<string, string>>;
  for (const theme of COLOR_THEMES) {
    const vars: Record<string, string> = {};
    for (const role of THEME_ROLES) vars[varName("color", role)] = themes[theme][role];
    themeVars[theme] = vars;
  }

  const imageTreatments: Record<string, Record<string, string>> = {};
  for (const [treatment, values] of Object.entries(IMAGE_TREATMENT_VALUES)) {
    imageTreatments[treatment] = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [varName("image", k), v]),
    );
  }
  const reducedMotion = Object.fromEntries(
    Object.entries(MOTION_VALUES.none)
      .filter(([k]) => k !== "ease")
      .map(([k, v]) => [varName("motion", k), v]),
  );

  const tokens: ThemeTokens = {
    choices,
    pairing,
    palette: {
      brand: oklchToHex(palette.brand),
      brandOklch: formatOklch(palette.brand),
      accent: accentHex,
      neutral: neutralHex,
    },
    themes,
    fonts: { googleFontsUrl: googleFontsUrl(pairing), fontsource: fontsourceCss(pairing) },
    vars: {
      root: Object.fromEntries(root),
      themes: themeVars,
      themed: Object.fromEntries(themed),
      imageTreatments,
      reducedMotion,
    },
  };

  return {
    tokens,
    css: emitCss(tokens),
    contrast: { mode, adjustments, failures },
    warnings,
  };
}

/** The pairing with the site's own Google Fonts (`choices.typography`) in place of its families. */
export function withWebFonts(
  pairing: TypePairing,
  typography: StyleChoices["typography"],
): TypePairing {
  if (!typography?.heading && !typography?.body && !typography?.label) return pairing;
  const spec = (font: NonNullable<typeof typography.heading>, wanted: number[]) => {
    const weights = [...new Set(font.weights ?? wanted)].sort((a, b) => a - b);
    return {
      family: font.family,
      category: font.category,
      weights,
      ...(font.italic ? { italic: true } : {}),
    } satisfies FontFamilySpec;
  };
  const near = (weights: number[], wanted: number) =>
    weights.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best));
  const scale = typography.scale ?? {};
  const out: TypePairing = { ...pairing };
  if (typography.heading) {
    const wanted = scale.h1?.weight ?? scale.h2?.weight ?? scale.display?.weight;
    out.heading = spec(typography.heading, [wanted ?? pairing.headingWeight]);
    out.headingWeight = wanted ?? near(out.heading.weights, pairing.headingWeight);
  }
  if (typography.body) {
    const wanted = scale.body?.weight;
    out.body = spec(typography.body, [wanted ?? 400, 600]);
    out.bodyWeight = wanted ?? near(out.body.weights, 400);
    out.strongWeight = near(
      out.body.weights.filter((w) => w > out.bodyWeight).concat(out.bodyWeight),
      600,
    );
  }
  if (typography.label) {
    const wanted = [scale.eyebrow, scale.button, scale.nav]
      .map((s) => s?.weight)
      .filter((w): w is number => w !== undefined);
    out.label = spec(typography.label, wanted.length ? wanted : [400, 500]);
  }
  return out;
}

function block(selectors: string[], decls: Record<string, string>, indent = ""): string {
  const lines = Object.entries(decls).map(([k, v]) => `${indent}  ${k}: ${v};`);
  return `${indent}${selectors.join(`,\n${indent}`)} {\n${lines.join("\n")}\n${indent}}`;
}

/** Deterministic token stylesheet. */
export function emitCss(tokens: ThemeTokens): string {
  const parts: string[] = [
    "/* OpenSpace design tokens. Generated by @omniharmonic/openspace-theme from content/styles.json; do not edit. */",
    block([":root"], tokens.vars.root),
  ];
  for (const theme of COLOR_THEMES) {
    const scheme = relativeLuminance(tokens.themes[theme].background) > 0.18 ? "light" : "dark";
    const selectors =
      theme === "light" ? [":root", `.${themeClass(theme)}`] : [`.${themeClass(theme)}`];
    parts.push(block(selectors, { "color-scheme": scheme, ...tokens.vars.themes[theme] }));
  }
  parts.push(block([":root", ...THEME_CLASSES.map((c) => `.${c}`)], tokens.vars.themed));
  for (const [treatment, decls] of Object.entries(tokens.vars.imageTreatments)) {
    parts.push(block([`.${imageTreatmentClass(treatment)}`], decls));
  }
  parts.push(
    `@media (prefers-reduced-motion: reduce) {\n${block([":root"], tokens.vars.reducedMotion, "  ")}\n}`,
  );
  return `${parts.join("\n\n")}\n`;
}
