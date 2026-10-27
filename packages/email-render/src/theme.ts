import type { Styles } from "@omniharmonic/openspace-schema";
import {
  compileStyles,
  DEFAULT_PAIRING_ID,
  type FontFamilySpec,
  getPairing,
} from "@omniharmonic/openspace-theme";
import type { EmailWarning } from "./diag";
import { safeColor } from "./escape";

export interface EmailPalette {
  background: string;
  surface: string;
  text: string;
  muted: string;
  heading: string;
  accent: string;
  accentText: string;
  border: string;
  link: string;
  /** Highlight mark background / foreground. */
  highlight: string;
  highlightText: string;
}

/** Concrete (var-free) design tokens for email clients. */
export interface EmailTheme {
  light: EmailPalette;
  dark: EmailPalette;
  /** Every light-theme role plus `accent-<step>` / `neutral-<step>` scale colors, for token lookups. */
  colors: Record<string, string>;
  headingFont: string;
  bodyFont: string;
  /** Corner radius in px for images / container. */
  radius: number;
  buttonRadius: number;
  fontsUrl: string | null;
}

const DEFAULT_LIGHT: EmailPalette = {
  background: "#ffffff",
  surface: "#f5f5f4",
  text: "#262626",
  muted: "#5c5c5c",
  heading: "#111111",
  accent: "#1d4ed8",
  accentText: "#ffffff",
  border: "#e4e4e7",
  link: "#1d4ed8",
  highlight: "#fff3a3",
  highlightText: "#262626",
};
const DEFAULT_DARK: EmailPalette = {
  background: "#111111",
  surface: "#1c1c1c",
  text: "#e8e8e8",
  muted: "#a3a3a3",
  heading: "#ffffff",
  accent: "#93b4ff",
  accentText: "#0b1020",
  border: "#333333",
  link: "#93b4ff",
  highlight: "#5c4d00",
  highlightText: "#fff3a3",
};

const WEB_SAFE = {
  serif: "Georgia, 'Times New Roman', Times, serif",
  "sans-serif": "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  monospace: "'Courier New', Courier, monospace",
} as const;

/** Font stack for inline styles: single-quoted so it is safe inside `style="..."`. */
function stack(spec: FontFamilySpec | undefined, fallback: string): string {
  if (!spec) return fallback;
  const name = spec.family.replace(/[^A-Za-z0-9 -]/g, "");
  return `'${name}', ${WEB_SAFE[spec.category]}`;
}

function palette(
  raw: Record<string, string> | undefined,
  fb: EmailPalette,
  scheme: string,
  warnings: EmailWarning[],
  highlight: Pick<EmailPalette, "highlight" | "highlightText">,
): EmailPalette {
  if (!raw) {
    warnings.push({ code: "theme", message: `No ${scheme} theme colors; using defaults.` });
    return fb;
  }
  const c = (k: string, d: string) => {
    const v = raw[k];
    const ok = safeColor(v, "");
    if (!ok) {
      warnings.push({
        code: "color-substituted",
        message: `Unusable ${scheme} color "${k}" (${String(v)}); using ${d}.`,
        path: `theme.${scheme}.${k}`,
      });
      return d;
    }
    return ok;
  };
  return {
    background: c("background", fb.background),
    surface: c("surface", fb.surface),
    text: c("text", fb.text),
    muted: c("text-muted", fb.muted),
    heading: c("heading", fb.heading),
    accent: c("accent", fb.accent),
    accentText: c("accent-text", fb.accentText),
    border: c("border", fb.border),
    link: c("link", fb.link),
    ...highlight,
  };
}

const FALLBACK: EmailTheme = {
  light: DEFAULT_LIGHT,
  dark: DEFAULT_DARK,
  colors: { ...DEFAULT_LIGHT },
  headingFont: WEB_SAFE.serif,
  bodyFont: WEB_SAFE["sans-serif"],
  radius: 6,
  buttonRadius: 6,
  fontsUrl: null,
};

export function buildEmailTheme(styles?: Styles): { theme: EmailTheme; warnings: EmailWarning[] } {
  const warnings: EmailWarning[] = [];
  if (!styles) return { theme: FALLBACK, warnings };
  try {
    const { tokens, warnings: compileWarnings } = compileStyles(styles);
    for (const w of compileWarnings) {
      warnings.push({ code: "theme", message: w.message, path: w.path });
    }
    const pairing = getPairing(tokens.choices.pairing) ?? getPairing(DEFAULT_PAIRING_ID);
    const shape = tokens.choices.shape;
    const radius = shape === "sharp" ? 0 : shape === "soft" ? 6 : 12;
    const pill = /pill/.test(String(tokens.choices.buttons));
    const lightRaw = tokens.themes.light as unknown as Record<string, string>;
    const darkRaw = tokens.themes.dark as unknown as Record<string, string>;
    const neutral = tokens.palette.neutral;
    const accent = tokens.palette.accent;
    const light = palette(lightRaw, DEFAULT_LIGHT, "light", warnings, {
      highlight: accent[100],
      highlightText: neutral[900],
    });
    const dark = palette(darkRaw, DEFAULT_DARK, "dark", warnings, {
      highlight: accent[800],
      highlightText: neutral[50],
    });
    const colors: Record<string, string> = { ...lightRaw };
    for (const [step, v] of Object.entries(accent)) colors[`accent-${step}`] = v;
    for (const [step, v] of Object.entries(neutral)) colors[`neutral-${step}`] = v;
    return {
      theme: {
        light,
        dark,
        colors,
        headingFont: stack(pairing?.heading, FALLBACK.headingFont),
        bodyFont: stack(pairing?.body, FALLBACK.bodyFont),
        radius,
        buttonRadius: pill ? 999 : radius,
        fontsUrl: /^https:\/\/fonts\.googleapis\.com\//.test(tokens.fonts.googleFontsUrl)
          ? tokens.fonts.googleFontsUrl
          : null,
      },
      warnings,
    };
  } catch (e) {
    warnings.push({
      code: "theme-error",
      message: `Styles could not be compiled (${e instanceof Error ? e.message : String(e)}); using default email theme.`,
    });
    return { theme: FALLBACK, warnings };
  }
}

/** Dark-mode override rules (class hooks are applied inline by the block renderers). */
function darkRules(t: EmailTheme): string[][] {
  const d = t.dark;
  return [
    [".os-bg", `background-color:${d.background}`],
    [".os-surface", `background-color:${d.surface}`],
    [".os-text", `color:${d.text}`],
    [".os-muted", `color:${d.muted}`],
    [".os-heading", `color:${d.heading}`],
    [".os-link", `color:${d.link}`],
    [".os-btn", `background-color:${d.accent};border-color:${d.accent}`],
    [".os-btn-text", `color:${d.accentText}`],
    [".os-outline", `border-color:${d.accent}`],
    [".os-rule", `border-color:${d.border}`],
    [".os-hr", `background-color:${d.border}`],
    [".os-mark", `background-color:${d.highlight};color:${d.highlightText}`],
  ];
}

export function darkCss(t: EmailTheme): string {
  return darkRules(t)
    .map(([sel, decl]) => `${sel}{${decl?.split(";").join(" !important;")} !important}`)
    .join("\n");
}

/** Outlook.com / Gmail app attribute-based dark-mode selectors mirror the media query. */
export function darkCssOutlook(t: EmailTheme): string {
  return darkRules(t)
    .map(([sel, decl]) => {
      const attr = decl?.startsWith("color:") ? "data-ogsc" : "data-ogsb";
      const imp = `${decl?.split(";").join(" !important;")} !important`;
      return `[${attr}] ${sel}{${imp}}`;
    })
    .join("\n");
}
