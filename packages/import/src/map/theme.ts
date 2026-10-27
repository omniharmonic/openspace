/**
 * The Squarespace look → OpenSpace Site Styles (never the original CSS): the brand color from the
 * site palette's most characterful color, a neutral tint from the background, the nearest curated
 * font pairing, shape/buttons from the button settings and density from section heights. The
 * contrast solver (`compileStyles`) then makes every theme accessible; its adjustments are
 * reported.
 */
import type { Styles } from "@omniharmonic/openspace-schema";
import {
  compileStyles,
  contrastRatio,
  curatedPalettes,
  deltaEOK,
  parseColor,
  TYPE_PAIRINGS,
  type TypePairing,
} from "@omniharmonic/openspace-theme";
import type { SqSite, SqTheme } from "../squarespace/types";

export interface ThemeDecision {
  styles: Styles;
  /** Plain-language notes for the report. */
  notes: string[];
  /** The site background is dark: unthemed sections use the dark theme. */
  siteDark: boolean;
}

const chroma = (hex: string) => {
  try {
    return parseColor(hex).c;
  } catch {
    return 0;
  }
};
const lightness = (hex: string) => {
  try {
    return parseColor(hex).l;
  } catch {
    return 1;
  }
};

const SERIF_HINTS =
  /serif|garamond|baskerville|caslon|playfair|lora|merriweather|georgia|times|bodoni|didot|freight|minion|crimson|cormorant|spectral|domine|prata|libre|tiempos|canela|ogg|recoleta|fraunces|newsreader|literata|gloock|young|abril|zilla|bitter|alegreya|source serif|ivar|chronicle|lyon|sabon|mrs eaves|adobe|span|essonnes|bookman|cardo|vollkorn|eb |old standard|nanum myeongjo|noto serif|pt serif|roboto slab|arvo|rockwell|clarendon/i;
const SANS_OVERRIDE =
  /sans|grotesk|grotesque|gothic|helvetica|arial|inter|futura|proxima|montserrat|poppins|lato|open sans|roboto(?! slab)|nunito|work sans|dm sans|manrope|karla|jost|outfit|figtree|archivo|acumin|neue|avenir|gill|franklin|brandon|sofia|museo sans|raleway|mulish|rubik|ibm plex sans|josefin sans/i;

export function fontCategory(family: string): "serif" | "sans-serif" | "monospace" {
  if (/mono|courier|code/i.test(family)) return "monospace";
  if (
    SANS_OVERRIDE.test(family) &&
    !/\bserif\b(?!.*sans)/i.test(family.replace(/sans.?serif/i, ""))
  )
    return "sans-serif";
  return SERIF_HINTS.test(family) ? "serif" : "sans-serif";
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The curated pairing closest to the site's heading/body fonts. */
export function nearestPairing(fonts: SqTheme["fonts"]): { pairing: TypePairing; exact: string[] } {
  const h = fonts.heading?.family;
  const b = fonts.body?.family ?? h;
  let best = TYPE_PAIRINGS[0] as TypePairing;
  let bestScore = -1;
  let exact: string[] = [];
  for (const p of TYPE_PAIRINGS) {
    let score = 0;
    const hits: string[] = [];
    if (h && norm(p.heading.family) === norm(h)) {
      score += 4;
      hits.push(p.heading.family);
    } else if (h && p.heading.category === fontCategory(h)) score += 1.5;
    if (b && norm(p.body.family) === norm(b)) {
      score += 3;
      hits.push(p.body.family);
    } else if (b && p.body.category === fontCategory(b)) score += 1;
    // Same family for both on the source site → prefer single-family pairings.
    if (h && b && norm(h) === norm(b) && norm(p.heading.family) === norm(p.body.family))
      score += 0.75;
    if (h && fonts.heading?.weight && p.headingWeight === fonts.heading.weight) score += 0.25;
    if (score > bestScore) {
      best = p;
      bestScore = score;
      exact = hits;
    }
  }
  return { pairing: best, exact };
}

/** The most characterful palette color: accent unless it is white/black/gray. */
function pickBrand(theme: SqTheme): { brand: string; from: string } | undefined {
  const order: (keyof SqTheme["colors"])[] = ["accent", "darkAccent", "lightAccent", "black"];
  for (const k of order) {
    const hex = theme.colors[k];
    if (!hex) continue;
    const l = lightness(hex);
    if (chroma(hex) >= 0.035 && l > 0.15 && l < 0.92) return { brand: hex, from: k };
  }
  return undefined;
}

function neutralFor(hex: string | undefined): "warm" | "cool" | "pure" {
  if (!hex) return "warm";
  try {
    const c = parseColor(hex);
    if (c.c < 0.003) return "pure";
    if (c.h >= 170 && c.h <= 300) return "cool";
    return "warm";
  } catch {
    return "warm";
  }
}

export function mapTheme(site: SqSite): ThemeDecision {
  const t = site.theme;
  const notes: string[] = [];
  const bg = t.siteBackground ?? t.colors.white;
  const siteDark = bg ? lightness(bg) < 0.4 : false;
  const picked = pickBrand(t);
  let brand: string;
  let source: "brand" | "curated" = "brand";
  if (picked) {
    brand = picked.brand;
    notes.push(`Brand color ${picked.brand} (Squarespace "${picked.from}" color).`);
  } else {
    const dark = t.colors.darkAccent ?? t.colors.black;
    // A monochrome site: ink brand; snap to the curated Monochrome palette when close.
    brand = "oklch(0.25 0 0)";
    source = "curated";
    notes.push(
      `The Squarespace palette has no strong color (${[t.colors.accent, dark].filter(Boolean).join(", ") || "none found"}), so the Monochrome palette is used.`,
    );
  }
  // Snap to a curated palette when it is visually the same color.
  try {
    const b = parseColor(brand);
    const near = curatedPalettes
      .map((p) => ({ p, d: deltaEOK(b, parseColor(p.brand)) }))
      .sort((x, y) => x.d - y.d)[0];
    if (near && near.d < 0.02 && source === "brand")
      notes.push(`That is almost exactly the curated "${near.p.name}" palette.`);
  } catch {
    // keep as is
  }
  const neutral = picked ? neutralFor(bg) : "pure";
  const { pairing, exact } = nearestPairing(t.fonts);
  const fontsSeen = [t.fonts.heading?.family, t.fonts.body?.family].filter(Boolean);
  if (fontsSeen.length)
    notes.push(
      `Fonts on Squarespace: ${[...new Set(fontsSeen)].join(" / ")} → pairing "${pairing.name}" (${pairing.heading.family} / ${pairing.body.family})${exact.length ? `, same family for ${exact.join(" and ")}` : ", the closest curated match"}. Licensed fonts can be uploaded in Site Styles → Fonts.`,
    );
  else notes.push(`Fonts couldn't be read; pairing "${pairing.name}" is a neutral default.`);
  const shape =
    t.buttons.shape === "pill" ? "round" : t.buttons.shape === "square" ? "sharp" : "soft";
  const outline = t.buttons.style === "outline";
  const buttons =
    t.buttons.shape === "pill"
      ? outline
        ? "pill-outline"
        : "pill-solid"
      : outline
        ? "outline"
        : "solid";
  const heights = site.pages.flatMap((p) => p.sections.map((s) => s.height)).filter(Boolean);
  const small = heights.filter((h) => h === "small").length;
  const large = heights.filter((h) => h === "large").length;
  const density =
    heights.length && small / heights.length > 0.5
      ? "compact"
      : heights.length && large / heights.length > 0.4
        ? "airy"
        : "comfortable";
  if (t.sizes.h1 && t.sizes.normal) {
    const ratio = t.sizes.h1 / t.sizes.normal;
    notes.push(
      `Type scale on Squarespace: Heading 1 is ${ratio.toFixed(1)}× body text${ratio > 4 ? " (very large; OpenSpace's display preset is the nearest)" : ""}. Density "${density}" from the section heights.`,
    );
  }
  const styles: Styles = {
    choices: {
      palette: { brand, neutral, contrast: "standard", source },
      pairing: pairing.id,
      density,
      shape,
      buttons,
      motion: "subtle",
      imageTreatment: "none",
    },
  };
  // Run the contrast solver and say what it changed.
  try {
    const compiled = compileStyles(styles);
    const adj = compiled.contrast.adjustments.length;
    if (adj)
      notes.push(
        `The contrast solver adjusted ${adj} color pairing(s) so every section theme meets WCAG AA (e.g. ${compiled.contrast.adjustments
          .slice(0, 2)
          .map((a) =>
            `${(a as { theme?: string }).theme ?? ""} ${(a as { role?: string }).role ?? ""}`.trim(),
          )
          .join(", ")}).`,
      );
    const light = compiled.tokens.themes.light;
    if (bg && light?.background)
      notes.push(
        `Page background ${bg} on Squarespace → ${light.background} (text contrast ${contrastRatio(light.text, light.background).toFixed(1)}:1).`,
      );
  } catch {
    // compile problems surface in openspace check
  }
  return { styles, notes, siteDark };
}
