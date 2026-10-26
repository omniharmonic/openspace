import { compiledStylesFor } from "@openspace/renderer";
import { type ColorTheme, ColorTokenSchema, type Styles } from "@openspace/schema";
import { isColor, toHex } from "@openspace/theme";
import type { ColorToken, ColorValue } from "../../../ui";

/**
 * Bridges schema color values (`accent`, `neutral-200`, `#1a2b3c`, `oklch(…)`) and the UI kit's
 * token-first picker value.
 */

const ROLE_NAMES: Record<string, string> = {
  accent: "Accent",
  "accent-text": "On accent",
  background: "Background",
  surface: "Surface",
  "surface-raised": "Raised surface",
  text: "Text",
  "text-muted": "Muted text",
  heading: "Heading",
  border: "Border",
  link: "Link",
};

/** Palette tokens offered by color pickers, resolved in one section theme. */
export function paletteTokens(styles: Styles, theme: ColorTheme = "light"): ColorToken[] {
  const { tokens } = compiledStylesFor(styles);
  const roles = tokens.themes[theme] as Record<string, string>;
  const out: ColorToken[] = Object.entries(ROLE_NAMES).map(([id, name]) => ({
    id,
    name,
    value: roles[id] ?? "#000000",
  }));
  for (const step of [100, 300, 500, 700, 900] as const)
    out.push({ id: `accent-${step}`, name: `Accent ${step}`, value: tokens.palette.accent[step] });
  for (const step of [50, 200, 500, 800, 950] as const)
    out.push({
      id: `neutral-${step}`,
      name: `Neutral ${step}`,
      value: tokens.palette.neutral[step],
    });
  return out;
}

export function toPickerValue(value: string | undefined): ColorValue | null {
  if (!value) return null;
  if (ColorTokenSchema.safeParse(value).success) return { kind: "token", token: value };
  if (isColor(value)) {
    try {
      return { kind: "exact", hex: toHex(value) };
    } catch {
      return null;
    }
  }
  return null;
}

export function fromPickerValue(value: ColorValue): string {
  return value.kind === "token" ? value.token : value.hex.toLowerCase();
}

/** CSS for previewing a schema color value in Studio chrome. */
export function previewColor(value: string | undefined, tokens: ColorToken[]): string | undefined {
  if (!value) return undefined;
  const token = tokens.find((t) => t.id === value);
  if (token) return token.value;
  return isColor(value) ? value : undefined;
}
