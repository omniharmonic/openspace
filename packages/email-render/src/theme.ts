import type { Styles } from "@openspace/schema";
import {
  compileStyles,
  DEFAULT_PAIRING_ID,
  type FontFamilySpec,
  getPairing,
} from "@openspace/theme";
import { esc, safeColor } from "./escape";

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
}

/** Concrete (var-free) design tokens for email clients. */
export interface EmailTheme {
  light: EmailPalette;
  dark: EmailPalette;
  headingFont: string;
  bodyFont: string;
  /** Corner radius in px for buttons / images. */
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

function palette(raw: Record<string, string> | undefined, fb: EmailPalette): EmailPalette {
  if (!raw) return fb;
  const c = (k: string, d: string) => safeColor(raw[k], d);
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
  };
}

export function buildEmailTheme(styles?: Styles): EmailTheme {
  const fallback: EmailTheme = {
    light: DEFAULT_LIGHT,
    dark: DEFAULT_DARK,
    headingFont: WEB_SAFE.serif,
    bodyFont: WEB_SAFE["sans-serif"],
    radius: 6,
    buttonRadius: 6,
    fontsUrl: null,
  };
  if (!styles) return fallback;
  try {
    const { tokens } = compileStyles(styles);
    const pairing = getPairing(tokens.choices.pairing) ?? getPairing(DEFAULT_PAIRING_ID);
    const shape = tokens.choices.shape;
    const radius = shape === "sharp" ? 0 : shape === "soft" ? 6 : 12;
    const pill = /pill/.test(String(tokens.choices.buttons));
    return {
      light: palette(tokens.themes.light as unknown as Record<string, string>, DEFAULT_LIGHT),
      dark: palette(tokens.themes.dark as unknown as Record<string, string>, DEFAULT_DARK),
      headingFont: stack(pairing?.heading, fallback.headingFont),
      bodyFont: stack(pairing?.body, fallback.bodyFont),
      radius,
      buttonRadius: pill ? 999 : radius,
      fontsUrl: /^https:\/\/fonts\.googleapis\.com\//.test(tokens.fonts.googleFontsUrl)
        ? tokens.fonts.googleFontsUrl
        : null,
    };
  } catch {
    return fallback;
  }
}

/** Dark-mode override stylesheet (class hooks are applied inline by the block renderers). */
export function darkCss(t: EmailTheme): string {
  const d = t.dark;
  const rules = [
    `.os-bg{background-color:${d.background} !important}`,
    `.os-surface{background-color:${d.surface} !important}`,
    `.os-text{color:${d.text} !important}`,
    `.os-muted{color:${d.muted} !important}`,
    `.os-heading{color:${d.heading} !important}`,
    `.os-link{color:${d.link} !important}`,
    `.os-btn{background-color:${d.accent} !important;border-color:${d.accent} !important}`,
    `.os-btn-text{color:${d.accentText} !important}`,
    `.os-rule{border-color:${d.border} !important}`,
    `.os-hr{background-color:${d.border} !important}`,
  ];
  return rules.join("\n");
}

/** Outlook.com / Gmail app attribute-based dark-mode selectors mirror the media query. */
export function darkCssOutlook(t: EmailTheme): string {
  const d = t.dark;
  return [
    `[data-ogsb] .os-bg{background-color:${d.background} !important}`,
    `[data-ogsb] .os-surface{background-color:${d.surface} !important}`,
    `[data-ogsc] .os-text{color:${d.text} !important}`,
    `[data-ogsc] .os-muted{color:${d.muted} !important}`,
    `[data-ogsc] .os-heading{color:${d.heading} !important}`,
    `[data-ogsc] .os-link{color:${d.link} !important}`,
    `[data-ogsb] .os-btn{background-color:${d.accent} !important}`,
    `[data-ogsc] .os-btn-text{color:${d.accentText} !important}`,
  ].join("\n");
}

export { esc };
