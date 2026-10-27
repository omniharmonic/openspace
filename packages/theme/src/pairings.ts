/**
 * Curated type pairings (doc 04 §4.1). Every family is SIL Open Font License, available from
 * Google Fonts and Fontsource (self-hosted at build time — no third-party font requests).
 */

export type FontCategory = "serif" | "sans-serif" | "monospace";

export interface FontFamilySpec {
  /** CSS / Google Fonts family name. */
  family: string;
  category: FontCategory;
  /** Weights to load (ascending). */
  weights: number[];
  /** Load italics for these weights too. */
  italic?: boolean;
  /** Fontsource package id (`@fontsource/<id>`); derived from the family name when omitted. */
  fontsourceId?: string;
  /** The family has an optical-size axis (`font-optical-sizing: auto` is meaningful). */
  opticalSize?: boolean;
}

export interface TypePairing {
  id: string;
  name: string;
  heading: FontFamilySpec;
  body: FontFamilySpec;
  /**
   * Eyebrows, buttons and navigation, when they use a third family (a site's own typography;
   * curated pairings leave it out and labels use the body font).
   */
  label?: FontFamilySpec;
  /** Weight for display/h1–h4. */
  headingWeight: number;
  /** Weight for running text. */
  bodyWeight: number;
  /** Weight for `<strong>`, buttons and nav. */
  strongWeight: number;
  /** Tracking for large headings (display, h1, h2); smaller headings get half. */
  headingTracking: string;
  /** Uppercase eyebrow tracking. */
  eyebrowTracking: string;
  /** Mood keywords for Studio's pairing picker. */
  mood: string[];
  /** Launch template that uses this pairing (doc 04 §7). */
  template?: string;
}

/** System fallback stacks by category (appended after the web font). */
export const FALLBACK_STACKS: Record<FontCategory, string[]> = {
  serif: ["ui-serif", "Georgia", "Cambria", '"Times New Roman"', "Times", "serif"],
  "sans-serif": [
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    '"Segoe UI"',
    "Roboto",
    '"Helvetica Neue"',
    "Arial",
    "sans-serif",
  ],
  monospace: [
    "ui-monospace",
    "SFMono-Regular",
    "Menlo",
    "Consolas",
    '"Liberation Mono"',
    "monospace",
  ],
};

const serif = (
  family: string,
  weights: number[],
  extra: Partial<FontFamilySpec> = {},
): FontFamilySpec => ({ family, category: "serif", weights, ...extra });
const sans = (
  family: string,
  weights: number[],
  extra: Partial<FontFamilySpec> = {},
): FontFamilySpec => ({ family, category: "sans-serif", weights, ...extra });

function pairing(
  p: Omit<TypePairing, "bodyWeight" | "strongWeight" | "eyebrowTracking"> &
    Partial<Pick<TypePairing, "bodyWeight" | "strongWeight" | "eyebrowTracking">>,
): TypePairing {
  return { bodyWeight: 400, strongWeight: 600, eyebrowTracking: "0.12em", ...p };
}

export const TYPE_PAIRINGS: readonly TypePairing[] = [
  // --- the twelve launch-template pairings (doc 04 §7) ---
  pairing({
    id: "fraunces-hanken",
    name: "Fraunces & Hanken Grotesk",
    heading: serif("Fraunces", [400, 500, 600], { italic: true, opticalSize: true }),
    body: sans("Hanken Grotesk", [400, 500, 600]),
    headingWeight: 400,
    headingTracking: "-0.02em",
    mood: ["calm", "organic", "warm"],
    template: "meadow",
  }),
  pairing({
    id: "newsreader-public-sans",
    name: "Newsreader & Public Sans",
    heading: serif("Newsreader", [400, 500, 600], { italic: true, opticalSize: true }),
    body: sans("Public Sans", [400, 600, 700]),
    headingWeight: 500,
    headingTracking: "-0.015em",
    mood: ["trustworthy", "civic", "editorial"],
    template: "harbor",
  }),
  pairing({
    id: "instrument",
    name: "Instrument Serif & Instrument Sans",
    heading: serif("Instrument Serif", [400], { italic: true }),
    body: sans("Instrument Sans", [400, 500, 600]),
    headingWeight: 400,
    headingTracking: "-0.01em",
    mood: ["minimal", "gallery", "refined"],
    template: "atelier",
  }),
  pairing({
    id: "source-serif-plex",
    name: "Source Serif 4 & IBM Plex Sans",
    heading: serif("Source Serif 4", [400, 600, 700], { italic: true, opticalSize: true }),
    body: sans("IBM Plex Sans", [400, 500, 600]),
    headingWeight: 600,
    headingTracking: "-0.015em",
    mood: ["crisp", "editorial", "confident"],
    template: "ledger",
  }),
  pairing({
    id: "young-serif-work-sans",
    name: "Young Serif & Work Sans",
    heading: serif("Young Serif", [400]),
    body: sans("Work Sans", [400, 500, 600]),
    headingWeight: 400,
    headingTracking: "-0.01em",
    mood: ["warm", "appetizing", "friendly"],
    template: "hearth",
  }),
  pairing({
    id: "bricolage-geist",
    name: "Bricolage Grotesque & Geist",
    heading: sans("Bricolage Grotesque", [500, 600, 700], { opticalSize: true }),
    body: sans("Geist", [400, 500, 600]),
    headingWeight: 700,
    headingTracking: "-0.035em",
    mood: ["bold", "modern", "technical"],
    template: "signal",
  }),
  pairing({
    id: "literata-manrope",
    name: "Literata & Manrope",
    heading: serif("Literata", [400, 500, 600], { italic: true, opticalSize: true }),
    body: sans("Manrope", [400, 500, 700]),
    headingWeight: 500,
    headingTracking: "-0.015em",
    mood: ["literary", "reading", "calm"],
    template: "field-notes",
  }),
  pairing({
    id: "syne-dm-sans",
    name: "Syne & DM Sans",
    heading: sans("Syne", [600, 700, 800]),
    body: sans("DM Sans", [400, 500, 700]),
    headingWeight: 700,
    headingTracking: "-0.02em",
    mood: ["expressive", "nocturnal", "artsy"],
    template: "encore",
  }),
  pairing({
    id: "gloock-albert-sans",
    name: "Gloock & Albert Sans",
    heading: serif("Gloock", [400]),
    body: sans("Albert Sans", [400, 500, 600]),
    headingWeight: 400,
    headingTracking: "-0.01em",
    mood: ["tactile", "crafted", "classic"],
    template: "kiln",
  }),
  pairing({
    id: "spectral-epilogue",
    name: "Spectral & Epilogue",
    heading: serif("Spectral", [400, 500, 600], { italic: true }),
    body: sans("Epilogue", [400, 500, 600]),
    headingWeight: 500,
    headingTracking: "-0.01em",
    mood: ["grounded", "collective", "earnest"],
    template: "commons",
  }),
  pairing({
    id: "cormorant-jost",
    name: "Cormorant Garamond & Jost",
    heading: serif("Cormorant Garamond", [400, 500, 600], { italic: true }),
    body: sans("Jost", [400, 500]),
    headingWeight: 500,
    headingTracking: "0em",
    strongWeight: 500,
    eyebrowTracking: "0.2em",
    mood: ["romantic", "refined", "elegant"],
    template: "vow",
  }),
  pairing({
    id: "outfit",
    name: "Outfit",
    heading: sans("Outfit", [600, 700]),
    body: sans("Outfit", [400, 500]),
    headingWeight: 700,
    headingTracking: "-0.025em",
    strongWeight: 600,
    mood: ["punchy", "mobile", "friendly"],
    template: "link",
  }),
  // --- library pairings ---
  pairing({
    id: "playfair-source-sans",
    name: "Playfair Display & Source Sans 3",
    heading: serif("Playfair Display", [400, 600, 700], { italic: true }),
    body: sans("Source Sans 3", [400, 600]),
    headingWeight: 600,
    headingTracking: "-0.015em",
    mood: ["classic", "fashion", "editorial"],
  }),
  pairing({
    id: "dm-serif-dm-sans",
    name: "DM Serif Display & DM Sans",
    heading: serif("DM Serif Display", [400], { italic: true }),
    body: sans("DM Sans", [400, 500, 700]),
    headingWeight: 400,
    headingTracking: "-0.015em",
    mood: ["confident", "warm", "modern"],
  }),
  pairing({
    id: "lora-inter",
    name: "Lora & Inter",
    heading: serif("Lora", [500, 600, 700], { italic: true }),
    body: sans("Inter", [400, 500, 600], { opticalSize: true }),
    headingWeight: 600,
    headingTracking: "-0.01em",
    mood: ["approachable", "balanced", "versatile"],
  }),
  pairing({
    id: "eb-garamond-inter",
    name: "EB Garamond & Inter",
    heading: serif("EB Garamond", [400, 500, 600], { italic: true }),
    body: sans("Inter", [400, 500, 600], { opticalSize: true }),
    headingWeight: 500,
    headingTracking: "-0.01em",
    mood: ["scholarly", "timeless", "quiet"],
  }),
  pairing({
    id: "libre-baskerville-karla",
    name: "Libre Baskerville & Karla",
    heading: serif("Libre Baskerville", [400, 700], { italic: true }),
    body: sans("Karla", [400, 500, 700]),
    headingWeight: 400,
    headingTracking: "-0.01em",
    mood: ["bookish", "trustworthy", "warm"],
  }),
  pairing({
    id: "space-grotesk-inter",
    name: "Space Grotesk & Inter",
    heading: sans("Space Grotesk", [500, 600, 700]),
    body: sans("Inter", [400, 500, 600], { opticalSize: true }),
    headingWeight: 600,
    headingTracking: "-0.03em",
    mood: ["technical", "startup", "precise"],
  }),
  pairing({
    id: "sora-inter",
    name: "Sora & Inter",
    heading: sans("Sora", [500, 600, 700]),
    body: sans("Inter", [400, 500, 600], { opticalSize: true }),
    headingWeight: 600,
    headingTracking: "-0.03em",
    mood: ["clean", "product", "modern"],
  }),
  pairing({
    id: "plus-jakarta",
    name: "Plus Jakarta Sans",
    heading: sans("Plus Jakarta Sans", [600, 700, 800]),
    body: sans("Plus Jakarta Sans", [400, 500]),
    headingWeight: 700,
    headingTracking: "-0.025em",
    mood: ["friendly", "product", "crisp"],
  }),
  pairing({
    id: "manrope",
    name: "Manrope",
    heading: sans("Manrope", [600, 700, 800]),
    body: sans("Manrope", [400, 500]),
    headingWeight: 700,
    headingTracking: "-0.025em",
    mood: ["neutral", "geometric", "calm"],
  }),
  pairing({
    id: "unbounded-figtree",
    name: "Unbounded & Figtree",
    heading: sans("Unbounded", [500, 600, 700]),
    body: sans("Figtree", [400, 500, 600]),
    headingWeight: 600,
    headingTracking: "-0.02em",
    mood: ["loud", "playful", "event"],
  }),
  pairing({
    id: "bodoni-montserrat",
    name: "Bodoni Moda & Montserrat",
    heading: serif("Bodoni Moda", [400, 500, 600], { italic: true, opticalSize: true }),
    body: sans("Montserrat", [400, 500, 600]),
    headingWeight: 500,
    headingTracking: "-0.01em",
    mood: ["luxury", "fashion", "dramatic"],
  }),
  pairing({
    id: "libre-caslon-nunito-sans",
    name: "Libre Caslon Text & Nunito Sans",
    heading: serif("Libre Caslon Text", [400, 700], { italic: true }),
    body: sans("Nunito Sans", [400, 600, 700]),
    headingWeight: 400,
    headingTracking: "-0.01em",
    mood: ["gentle", "heritage", "warm"],
  }),
  pairing({
    id: "zilla-slab-inter",
    name: "Zilla Slab & Inter",
    heading: serif("Zilla Slab", [500, 600, 700]),
    body: sans("Inter", [400, 500, 600], { opticalSize: true }),
    headingWeight: 600,
    headingTracking: "-0.01em",
    mood: ["sturdy", "journalistic", "honest"],
  }),
  pairing({
    id: "bitter-roboto",
    name: "Bitter & Roboto",
    heading: serif("Bitter", [500, 600, 700], { italic: true }),
    body: sans("Roboto", [400, 500, 700]),
    headingWeight: 600,
    headingTracking: "-0.015em",
    mood: ["practical", "clear", "service"],
  }),
  pairing({
    id: "alegreya",
    name: "Alegreya & Alegreya Sans",
    heading: serif("Alegreya", [500, 600, 700], { italic: true }),
    body: sans("Alegreya Sans", [400, 500, 700]),
    headingWeight: 600,
    headingTracking: "-0.01em",
    mood: ["humanist", "literary", "warm"],
  }),
  pairing({
    id: "josefin-crimson",
    name: "Josefin Sans & Crimson Pro",
    heading: sans("Josefin Sans", [400, 600, 700]),
    body: serif("Crimson Pro", [400, 500, 600], { italic: true }),
    headingWeight: 600,
    headingTracking: "0em",
    eyebrowTracking: "0.18em",
    mood: ["vintage", "elegant", "art-deco"],
  }),
  pairing({
    id: "merriweather-open-sans",
    name: "Merriweather & Open Sans",
    heading: serif("Merriweather", [400, 700], { italic: true }),
    body: sans("Open Sans", [400, 600, 700]),
    headingWeight: 700,
    headingTracking: "-0.01em",
    mood: ["readable", "dependable", "community"],
  }),
  pairing({
    id: "plex-mono-plex-sans",
    name: "IBM Plex Mono & IBM Plex Sans",
    heading: { family: "IBM Plex Mono", category: "monospace", weights: [500, 600] },
    body: sans("IBM Plex Sans", [400, 500, 600]),
    headingWeight: 600,
    headingTracking: "-0.02em",
    mood: ["developer", "technical", "structured"],
  }),
  pairing({
    id: "crimson-figtree",
    name: "Crimson Pro & Figtree",
    heading: serif("Crimson Pro", [500, 600, 700], { italic: true }),
    body: sans("Figtree", [400, 500, 600]),
    headingWeight: 600,
    headingTracking: "-0.01em",
    mood: ["soft", "personal", "story"],
  }),
  pairing({
    id: "abril-lato",
    name: "Abril Fatface & Lato",
    heading: serif("Abril Fatface", [400]),
    body: sans("Lato", [400, 700]),
    headingWeight: 400,
    headingTracking: "-0.01em",
    strongWeight: 700,
    mood: ["poster", "bold", "retro"],
  }),
  pairing({
    id: "archivo",
    name: "Archivo",
    heading: sans("Archivo", [600, 700, 800]),
    body: sans("Archivo", [400, 500]),
    headingWeight: 700,
    headingTracking: "-0.03em",
    mood: ["industrial", "grotesque", "direct"],
  }),
];

/** Pairing used when `choices.pairing` names an unknown id. */
export const DEFAULT_PAIRING_ID = "fraunces-hanken";

const BY_ID = new Map(TYPE_PAIRINGS.map((p) => [p.id, p]));

export function getPairing(id: string): TypePairing | undefined {
  return BY_ID.get(id);
}

/** `"Hanken Grotesk"` → `hanken-grotesk` */
export function fontsourceId(spec: FontFamilySpec): string {
  return (
    spec.fontsourceId ??
    spec.family
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

const quoteFamily = (family: string) => (/^[a-z-]+$/i.test(family) ? family : `"${family}"`);

/** CSS `font-family` stack for one family: the web font, then the category's system stack. */
export function fontStack(spec: FontFamilySpec): string {
  return [`"${spec.family}"`, ...FALLBACK_STACKS[spec.category]]
    .map((f) => (f.startsWith('"') ? f : quoteFamily(f)))
    .join(", ");
}

/** Families of a pairing with merged weights (heading and body may share a family). */
export function pairingFamilies(p: TypePairing): FontFamilySpec[] {
  const merged = new Map<string, FontFamilySpec>();
  for (const spec of [p.heading, p.body, ...(p.label ? [p.label] : [])]) {
    const prev = merged.get(spec.family);
    if (!prev) {
      merged.set(spec.family, { ...spec, weights: [...spec.weights] });
      continue;
    }
    prev.weights = [...new Set([...prev.weights, ...spec.weights])].sort((a, b) => a - b);
    prev.italic = prev.italic || spec.italic;
  }
  return [...merged.values()];
}

/**
 * Google Fonts CSS2 API URL for a pairing — for previews and the Studio font picker only;
 * published sites self-host via Fontsource.
 */
export function googleFontsUrl(p: TypePairing, display = "swap"): string {
  const families = pairingFamilies(p).map((spec) => {
    const name = spec.family.replace(/ /g, "+");
    const weights = [...spec.weights].sort((a, b) => a - b);
    if (spec.italic) {
      const tuples = [...weights.map((w) => `0,${w}`), ...weights.map((w) => `1,${w}`)];
      return `family=${name}:ital,wght@${tuples.join(";")}`;
    }
    return `family=${name}:wght@${weights.join(";")}`;
  });
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=${display}`;
}

/** Fontsource npm packages to install for a pairing, e.g. `@fontsource/fraunces`. */
export function fontsourcePackages(p: TypePairing): string[] {
  return pairingFamilies(p).map((spec) => `@fontsource/${fontsourceId(spec)}`);
}

/**
 * Fontsource CSS entry points per weight/style: module specifiers (`@fontsource/fraunces/400.css`)
 * by default, or jsDelivr URLs with `{ cdn: true }`.
 */
export function fontsourceCss(p: TypePairing, options: { cdn?: boolean } = {}): string[] {
  const out: string[] = [];
  for (const spec of pairingFamilies(p)) {
    const pkg = `@fontsource/${fontsourceId(spec)}`;
    const base = options.cdn ? `https://cdn.jsdelivr.net/npm/${pkg}@5` : pkg;
    for (const w of spec.weights) {
      out.push(`${base}/${w}.css`);
      if (spec.italic) out.push(`${base}/${w}-italic.css`);
    }
  }
  return out;
}
