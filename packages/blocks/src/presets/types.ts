import type { CollectionKind, ColorTheme, Header, Link, Section } from "@openspace/schema";

/** Preset categories (doc 04 §6), in "Add section" menu order. */
export const PRESET_CATEGORIES = [
  "header",
  "hero",
  "about",
  "services",
  "features",
  "gallery",
  "testimonials",
  "pricing",
  "faq",
  "team",
  "stats",
  "logos",
  "cta",
  "contact",
  "newsletter",
  "blog",
  "events",
  "products",
  "footer",
] as const;
export type PresetCategory = (typeof PRESET_CATEGORIES)[number];

export const PRESET_CATEGORY_LABELS: Record<PresetCategory, string> = {
  header: "Header",
  hero: "Hero",
  about: "About & story",
  services: "Services & offerings",
  features: "Features & benefits",
  gallery: "Gallery & portfolio",
  testimonials: "Testimonials",
  pricing: "Pricing",
  faq: "FAQ",
  team: "Team",
  stats: "Stats & impact",
  logos: "Logos & press",
  cta: "Call to action",
  contact: "Contact, location & hours",
  newsletter: "Newsletter",
  blog: "Blog & summaries",
  events: "Events",
  products: "Products",
  footer: "Footer",
};

/** Preset id: `category/name@version`, e.g. `hero/split-image@1`. */
export type PresetId = `${string}/${string}@${number}`;

/**
 * Where a piece of copy lives in a section built from the preset, so the Design check can
 * measure it against the preset's recommended length:
 * - `heading`: the section's headings (heading blocks' text and rich-text headings), optionally
 *   only one level;
 * - `body`: running paragraphs in text blocks (eyebrow and small paragraphs are labels, not body),
 *   measured per text block;
 * - `field`: a text or rich-text field of every block of a type;
 * - `items`: a field of every item in a block's list (`accordion.items[].question`).
 */
export type CopyTarget =
  | { kind: "heading"; level?: 1 | 2 | 3 | 4 }
  | { kind: "body" }
  | { kind: "field"; block: string; field: string }
  | { kind: "items"; block: string; list: string; field: string };

/** Recommended length for one piece of copy, in words (inclusive). */
export interface CopyRule {
  /** Machine name: `headline`, `intro`, `quote`. */
  slot: string;
  /** Plain-language name shown in Design check messages: "Headline". */
  label: string;
  target: CopyTarget;
  words: readonly [min: number, max: number];
}

/** An image slot and the crop it is designed for. */
export interface ImageSlot {
  slot: string;
  /** Aspect ratio the slot crops to (`4:5`, `16:9`), or `original`/`fill` (fills a grid cell). */
  aspect: string;
  /** How many images the slot holds (galleries, team grids). */
  count?: number;
}

export interface PresetAi {
  purpose: string;
  whenToUse: string;
  avoid: string;
}

/**
 * - `page`: a section inserted into a page;
 * - `footer`: a section used as the site footer (`site.footer`);
 * - `header`: Site header settings (`site.header`), not a section.
 */
export type PresetTarget = "page" | "footer" | "header";

/** JSON-serializable preset metadata (Studio thumbnails, MCP, AGENTS.md). */
export interface PresetMeta {
  id: PresetId;
  category: PresetCategory;
  name: string;
  version: number;
  label: string;
  description: string;
  target: PresetTarget;
  /** Layout mode of the built section (`none` for header presets). */
  layout: "stack" | "grid" | "none";
  /** Grid presets that layer blocks on top of each other. */
  overlap: boolean;
  copy: CopyRule[];
  images: ImageSlot[];
  /** Section color themes the preset is designed (and tested) for. */
  themes: ColorTheme[];
  /** The theme `build()` uses unless told otherwise. */
  defaultTheme: ColorTheme;
  /** Collection kinds the preset reads (summary, events and product presets). */
  collections: CollectionKind[];
  tags: string[];
  ai: PresetAi;
}

export interface PresetBuildOptions {
  /** Section color theme (default: the preset's `defaultTheme`). */
  colorTheme?: ColorTheme;
  /** Target of the main call to action (default: a sensible relative URL such as `/contact`). */
  primaryLink?: Link;
  /** Target of the secondary action, when the preset has one. */
  secondaryLink?: Link;
  /** Collection name for presets that list collection items (default per preset). */
  collection?: string;
}

export interface SectionPreset extends PresetMeta {
  target: "page" | "footer";
  /** A new section with fresh ids (and fresh `frm_` form ids) on every call. */
  build(opts?: PresetBuildOptions): Section;
}

export interface HeaderPreset extends PresetMeta {
  target: "header";
  /** Site header settings (`site.header`). */
  build(opts?: PresetBuildOptions): Header;
}

export type Preset = SectionPreset | HeaderPreset;
