import { TYPE_PAIRINGS } from "@omniharmonic/openspace-theme";

/**
 * The fonts Studio offers in its font picker: every family the curated pairings use plus a
 * hand-picked set of popular Google Fonts (all SIL OFL / Apache, so they publish self-hosted
 * like the pairings' fonts). Anyone can still use any other Google font by typing its name.
 */

/** How the picker groups fonts (finer than the schema's fallback category). */
export type FontKind = "serif" | "sans-serif" | "display" | "handwriting" | "monospace";

export interface CatalogFont {
  family: string;
  kind: FontKind;
}

export const KIND_LABEL: Record<FontKind, string> = {
  serif: "Serif",
  "sans-serif": "Sans serif",
  display: "Display",
  handwriting: "Handwriting",
  monospace: "Monospace",
};

const POPULAR: Record<FontKind, string[]> = {
  serif: [
    "Playfair Display",
    "Lora",
    "Merriweather",
    "Cormorant Garamond",
    "EB Garamond",
    "Libre Baskerville",
    "Crimson Pro",
    "DM Serif Display",
    "Spectral",
    "Bitter",
    "Literata",
    "Noto Serif",
    "PT Serif",
    "Roboto Slab",
    "Zilla Slab",
    "Gelasio",
    "Young Serif",
    "Bodoni Moda",
    "Cardo",
    "Libre Caslon Text",
    "Alegreya",
    "Vollkorn",
    "Domine",
    "Prata",
  ],
  "sans-serif": [
    "Inter",
    "Roboto",
    "Open Sans",
    "Montserrat",
    "Lato",
    "Poppins",
    "Nunito Sans",
    "Work Sans",
    "DM Sans",
    "Manrope",
    "Plus Jakarta Sans",
    "Figtree",
    "Outfit",
    "Raleway",
    "Rubik",
    "Karla",
    "Mulish",
    "Source Sans 3",
    "Noto Sans",
    "Josefin Sans",
    "Archivo",
    "Barlow",
    "Lexend",
    "Albert Sans",
    "Onest",
    "Geist",
    "Sora",
    "Urbanist",
    "Red Hat Display",
    "Jost",
  ],
  display: [
    "Bebas Neue",
    "Oswald",
    "Anton",
    "Abril Fatface",
    "Syne",
    "Unbounded",
    "Righteous",
    "Bricolage Grotesque",
    "Space Grotesk",
    "Archivo Black",
    "Alfa Slab One",
    "Lobster",
    "Comfortaa",
    "Fredoka",
    "Big Shoulders Display",
    "Cinzel",
    "Italiana",
    "Gloock",
  ],
  handwriting: [
    "Caveat",
    "Dancing Script",
    "Pacifico",
    "Shadows Into Light",
    "Satisfy",
    "Great Vibes",
    "Kalam",
    "Patrick Hand",
    "Amatic SC",
    "Homemade Apple",
    "Sacramento",
    "Indie Flower",
  ],
  monospace: [
    "JetBrains Mono",
    "IBM Plex Mono",
    "Space Mono",
    "DM Mono",
    "Fira Code",
    "Roboto Mono",
    "Source Code Pro",
    "Geist Mono",
  ],
};

function build(): CatalogFont[] {
  const seen = new Map<string, CatalogFont>();
  const add = (family: string, kind: FontKind) => {
    const key = family.toLowerCase();
    if (!seen.has(key)) seen.set(key, { family, kind });
  };
  // The pairings' families first: they're known-good with the site's type scale.
  for (const p of TYPE_PAIRINGS)
    for (const f of [p.heading, p.body, p.label]) if (f) add(f.family, f.category);
  for (const [kind, families] of Object.entries(POPULAR) as [FontKind, string[]][])
    for (const family of families) add(family, kind);
  return [...seen.values()].sort((a, b) => a.family.localeCompare(b.family));
}

export const FONT_CATALOG: readonly CatalogFont[] = build();

export function catalogFont(family: string): CatalogFont | undefined {
  const key = family.trim().toLowerCase();
  return FONT_CATALOG.find((f) => f.family.toLowerCase() === key);
}

/** The schema's fallback category (serif, sans-serif or monospace) for a picker kind. */
export function fallbackCategory(kind: FontKind): "serif" | "sans-serif" | "monospace" {
  if (kind === "monospace") return "monospace";
  // Handwriting reads closer to a serif fallback; display faces are mostly sans.
  return kind === "serif" || kind === "handwriting" ? "serif" : "sans-serif";
}

/** Characters the picker renders in each family (its own name), so previews load tiny subsets. */
export function previewText(families: readonly string[]): string {
  const chars = new Set("Aa".split(""));
  for (const f of families) for (const ch of f) chars.add(ch);
  return [...chars].sort().join("");
}

/**
 * Google Fonts CSS that loads just enough of each family to draw its name (one request for a
 * batch). Families Google doesn't have are skipped by Google, not an error.
 */
export function previewCssUrl(families: readonly string[]): string {
  const params = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`);
  return `https://fonts.googleapis.com/css2?${params.join("&")}&display=swap&text=${encodeURIComponent(previewText(families))}`;
}
