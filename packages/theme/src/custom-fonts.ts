/**
 * Uploaded fonts (PRD §5.1 "Font uploads"): `@font-face` rules for a site's own font files and
 * the font tokens that use them. The files publish with the site (`media/fonts/`), so the URLs
 * are resolved by the caller (renderer: base path; Studio canvas: preview URLs).
 */
import type { CustomFont, Styles } from "@omniharmonic/openspace-schema";
import { FALLBACK_STACKS } from "./pairings";

const FORMAT: Record<string, string> = { woff2: "woff2", ttf: "truetype", otf: "opentype" };

const CATEGORY_FALLBACK: Record<CustomFont["category"], string[]> = {
  serif: FALLBACK_STACKS.serif,
  "sans-serif": FALLBACK_STACKS["sans-serif"],
  monospace: FALLBACK_STACKS.monospace,
  display: FALLBACK_STACKS["sans-serif"],
  handwriting: ["cursive", ...FALLBACK_STACKS.serif],
};

const cssString = (s: string) => `"${s.replace(/["\\\n\r]/g, "")}"`;

/** `"Family", <fallback stack>` for an uploaded family. */
export function customFontStack(font: CustomFont): string {
  return [cssString(font.family), ...CATEGORY_FALLBACK[font.category]].join(", ");
}

/** The uploaded font a choice (`headingFont` / `bodyFont`) points at, if any. */
export function chosenCustomFont(
  styles: Pick<Styles, "fonts">,
  family: string | undefined,
): CustomFont | undefined {
  if (!family) return undefined;
  const key = family.toLowerCase();
  return styles.fonts?.find((f) => f.family.toLowerCase() === key);
}

/** The available weight closest to `wanted` (ties go to the heavier one). */
export function nearestWeight(font: CustomFont, wanted: number): number {
  let best = font.files[0]?.weight ?? wanted;
  for (const f of font.files) {
    const d = Math.abs(f.weight - wanted);
    const bd = Math.abs(best - wanted);
    if (d < bd || (d === bd && f.weight > best)) best = f.weight;
  }
  return best;
}

/**
 * `@font-face` rules for every uploaded font in use (heading/body choices), or for all of them
 * with `all: true` (Studio previews). `font-display: swap` keeps text visible while they load.
 */
export function customFontFaces(
  styles: Pick<Styles, "fonts" | "choices">,
  url: (src: string) => string,
  opts: { all?: boolean } = {},
): string {
  const used = new Set(
    [styles.choices.headingFont, styles.choices.bodyFont]
      .filter((x): x is string => !!x)
      .map((x) => x.toLowerCase()),
  );
  const rules: string[] = [];
  for (const font of styles.fonts ?? []) {
    if (!opts.all && !used.has(font.family.toLowerCase())) continue;
    for (const file of font.files) {
      const ext = file.src.split(".").pop()?.toLowerCase() ?? "";
      const format = FORMAT[ext];
      if (!format) continue;
      rules.push(
        `@font-face{font-family:${cssString(font.family)};src:url(${cssString(url(file.src))}) format("${format}");font-weight:${file.weight};font-style:${file.style};font-display:swap}`,
      );
    }
  }
  return rules.join("\n");
}

/** WOFF2 files worth preloading: the upright file nearest each chosen weight (heading, body). */
export function customFontPreloads(
  styles: Pick<Styles, "fonts" | "choices">,
  weights: { heading: number; body: number },
): string[] {
  const out: string[] = [];
  for (const [family, weight] of [
    [styles.choices.headingFont, weights.heading],
    [styles.choices.bodyFont, weights.body],
  ] as const) {
    const font = chosenCustomFont(styles, family);
    if (!font) continue;
    const w = nearestWeight(font, weight);
    const file = font.files.find(
      (f) => f.weight === w && f.style === "normal" && f.src.endsWith(".woff2"),
    );
    if (file && !out.includes(file.src)) out.push(file.src);
  }
  return out;
}
