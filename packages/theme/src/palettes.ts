import type { NeutralTint } from "./scales";

export interface CuratedPalette {
  id: string;
  name: string;
  /** Brand color (OKLCH) the full palette is generated from. */
  brand: string;
  neutral: NeutralTint;
  description: string;
  /** Launch templates this palette was designed for (doc 04 §7). */
  templates?: string[];
}

/** Named starting palettes for Studio's palette picker. */
export const curatedPalettes: readonly CuratedPalette[] = [
  {
    id: "sage",
    name: "Oat & Sage",
    brand: "oklch(0.62 0.07 145)",
    neutral: "warm",
    description: "Soft sage on oat paper; calm and organic.",
    templates: ["meadow"],
  },
  {
    id: "clay",
    name: "Clay",
    brand: "oklch(0.6 0.11 45)",
    neutral: "warm",
    description: "Sun-baked terracotta with bone neutrals.",
    templates: ["meadow", "kiln"],
  },
  {
    id: "harbor",
    name: "Harbor Blue",
    brand: "oklch(0.42 0.12 255)",
    neutral: "warm",
    description: "Deep civic blue on warm paper.",
    templates: ["harbor"],
  },
  {
    id: "signal-orange",
    name: "Signal Orange",
    brand: "oklch(0.68 0.19 45)",
    neutral: "warm",
    description: "A bright call-to-action orange.",
    templates: ["harbor"],
  },
  {
    id: "monochrome",
    name: "Monochrome",
    brand: "oklch(0.25 0 0)",
    neutral: "pure",
    description: "Ink and white; lets the photography lead.",
    templates: ["atelier"],
  },
  {
    id: "ledger-green",
    name: "Ledger Green",
    brand: "oklch(0.42 0.08 160)",
    neutral: "warm",
    description: "Deep green with ink and ivory.",
    templates: ["ledger"],
  },
  {
    id: "tomato",
    name: "Tomato",
    brand: "oklch(0.6 0.2 30)",
    neutral: "warm",
    description: "Ripe tomato red on cream.",
    templates: ["hearth"],
  },
  {
    id: "olive",
    name: "Olive Grove",
    brand: "oklch(0.55 0.09 115)",
    neutral: "warm",
    description: "Olive and cream, quietly appetizing.",
    templates: ["hearth"],
  },
  {
    id: "electric",
    name: "Electric Violet",
    brand: "oklch(0.62 0.25 285)",
    neutral: "cool",
    description: "Near-black chrome with an electric accent.",
    templates: ["signal"],
  },
  {
    id: "highlighter",
    name: "Highlighter",
    brand: "oklch(0.9 0.17 100)",
    neutral: "warm",
    description: "Paper and ink with a highlighter-yellow mark.",
    templates: ["field-notes"],
  },
  {
    id: "plum",
    name: "Night Plum",
    brand: "oklch(0.45 0.14 330)",
    neutral: "cool",
    description: "Dark plum with a vivid edge.",
    templates: ["encore"],
  },
  {
    id: "charcoal-clay",
    name: "Charcoal & Clay",
    brand: "oklch(0.52 0.08 50)",
    neutral: "warm",
    description: "Fired clay against charcoal and bone.",
    templates: ["kiln"],
  },
  {
    id: "earth",
    name: "Earth & Sky",
    brand: "oklch(0.5 0.1 140)",
    neutral: "cool",
    description: "Grounded greens under an open sky.",
    templates: ["commons"],
  },
  {
    id: "dusty-rose",
    name: "Dusty Rose",
    brand: "oklch(0.68 0.07 10)",
    neutral: "warm",
    description: "Linen, ink and a muted rose.",
    templates: ["vow"],
  },
  {
    id: "lagoon",
    name: "Lagoon",
    brand: "oklch(0.58 0.1 195)",
    neutral: "cool",
    description: "Clear teal water; fresh and open.",
    templates: ["link"],
  },
  {
    id: "saffron",
    name: "Saffron",
    brand: "oklch(0.78 0.15 80)",
    neutral: "warm",
    description: "Golden saffron, warm and generous.",
    templates: ["link"],
  },
  {
    id: "ink-blue",
    name: "Ink Blue",
    brand: "oklch(0.35 0.08 265)",
    neutral: "cool",
    description: "Fountain-pen blue; serious and literate.",
    templates: ["field-notes", "ledger"],
  },
  {
    id: "lavender",
    name: "Lavender",
    brand: "oklch(0.7 0.1 300)",
    neutral: "cool",
    description: "Gentle lavender for soft, restful brands.",
  },
  {
    id: "forest",
    name: "Forest",
    brand: "oklch(0.4 0.07 150)",
    neutral: "warm",
    description: "Old-growth green, steady and natural.",
    templates: ["commons"],
  },
  {
    id: "coral",
    name: "Coral",
    brand: "oklch(0.7 0.15 25)",
    neutral: "warm",
    description: "Playful coral with sunny neutrals.",
    templates: ["link"],
  },
];

export function getCuratedPalette(id: string): CuratedPalette | undefined {
  return curatedPalettes.find((p) => p.id === id);
}
