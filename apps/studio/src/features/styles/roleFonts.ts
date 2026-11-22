import type { FontRole, Styles } from "@omniharmonic/openspace-schema";
import { getPairing, TYPE_PAIRINGS } from "@omniharmonic/openspace-theme";
import { catalogFont, type FontKind, fallbackCategory } from "./font-catalog";
import type { StylesSet } from "./model";

/**
 * One font per role (headings, text, labels), whatever layer it comes from. The theme stacks
 * three: the pairing's font, a Google font chosen for the role (`choices.typography.<role>`) and,
 * for headings and text, an uploaded font (`choices.headingFont` / `bodyFont`), which wins.
 * Studio shows one answer per role and writes exactly one layer back.
 */

export const ROLE_LABEL: Record<FontRole, string> = {
  heading: "Headings",
  body: "Text",
  label: "Labels",
};

/** Roles an uploaded font can fill (the schema has no uploaded label font). */
export const UPLOAD_ROLES = ["heading", "body"] as const;
const UPLOAD_KEY = { heading: "headingFont", body: "bodyFont" } as const;

export type RoleFontSource = "pairing" | "google" | "uploaded";

export interface RoleFont {
  family: string;
  source: RoleFontSource;
  /** For labels: true when they simply follow the text font. */
  followsText?: boolean;
}

export type FontPick =
  | { kind: "pairing" }
  | { kind: "google"; family: string; fontKind?: FontKind }
  | { kind: "uploaded"; family: string };

function pairingOf(styles: Styles) {
  return getPairing(styles.choices.pairing) ?? (TYPE_PAIRINGS[0] as (typeof TYPE_PAIRINGS)[0]);
}

/** The font a role uses now. */
export function roleFont(styles: Styles, role: FontRole): RoleFont {
  const c = styles.choices;
  if (role !== "label") {
    const uploaded = c[UPLOAD_KEY[role]];
    const exists = uploaded
      ? styles.fonts?.find((f) => f.family.toLowerCase() === uploaded.toLowerCase())
      : undefined;
    if (exists) return { family: exists.family, source: "uploaded" };
  }
  const google = c.typography?.[role];
  if (google) return { family: google.family, source: "google" };
  const p = pairingOf(styles);
  if (role === "heading") return { family: p.heading.family, source: "pairing" };
  if (role === "body") return { family: p.body.family, source: "pairing" };
  if (p.label) return { family: p.label.family, source: "pairing" };
  return { ...roleFont(styles, "body"), followsText: true };
}

/** What the pairing alone would use for a role (for "Pairing default" rows). */
export function pairingFont(styles: Styles, role: FontRole): string {
  const p = pairingOf(styles);
  if (role === "heading") return p.heading.family;
  if (role === "body") return p.body.family;
  return p.label?.family ?? "Same as text";
}

/** Every family the site uses right now, de-duplicated, headings first. */
export function fontsInUse(styles: Styles): string[] {
  const out: string[] = [];
  for (const role of ["heading", "body", "label"] as const) {
    const f = roleFont(styles, role);
    if (!out.some((x) => x.toLowerCase() === f.family.toLowerCase())) out.push(f.family);
  }
  return out;
}

/** The `styles.patch` that makes `role` use `pick` (and clears the layers that would hide it). */
export function roleFontPatch(role: FontRole, pick: FontPick): StylesSet {
  const set: StylesSet = {};
  const uploadKey = role === "label" ? null : UPLOAD_KEY[role];
  if (pick.kind === "uploaded") {
    if (!uploadKey) throw new Error("Uploaded fonts can be used for headings and text.");
    set[`choices.${uploadKey}`] = pick.family;
    // Drop the Google font underneath, so removing the upload later falls back to the pairing.
    set[`choices.typography.${role}`] = undefined;
    return set;
  }
  if (uploadKey) set[`choices.${uploadKey}`] = undefined;
  if (pick.kind === "pairing") {
    set[`choices.typography.${role}`] = undefined;
    return set;
  }
  const kind = pick.fontKind ?? catalogFont(pick.family)?.kind;
  set[`choices.typography.${role}`] = {
    family: pick.family,
    category: kind ? fallbackCategory(kind) : guessCategory(pick.family),
    // Headings and text load italics too (emphasis); labels never use them.
    ...(role === "label" ? {} : { italic: true }),
  };
  return set;
}

/** Undo-history label for a font change. */
export function roleFontLabel(role: FontRole, pick: FontPick): string {
  const where = ROLE_LABEL[role].toLowerCase();
  return pick.kind === "pairing"
    ? `Use the pairing’s font for ${where}`
    : `Use ${pick.family} for ${where}`;
}

/** A family name Site Styles accepts for a Google font (letters, numbers, spaces). */
export const FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/;

/** Tidy what someone typed into a Google Fonts family name ("  playfair   display" → "Playfair Display"). */
export function tidyFamily(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

const SERIF =
  /serif|garamond|baskerville|caslon|playfair|lora|merriweather|crimson|cormorant|spectral|domine|prata|libre|fraunces|newsreader|literata|bodoni|didot|vollkorn|cardo|alegreya|bitter|zilla|slab/i;

/** Google Fonts category for a family name (good enough for the fallback stack). */
export function guessCategory(family: string): "serif" | "sans-serif" | "monospace" {
  if (/mono|code/i.test(family)) return "monospace";
  if (/sans/i.test(family)) return "sans-serif";
  return SERIF.test(family) ? "serif" : "sans-serif";
}

/** Which role a text style draws from (the inline toolbar's font button). */
export function roleForTextStyle(style: string | null | undefined): FontRole {
  if (style && /^(display|h[1-6])$/.test(style)) return "heading";
  if (style === "eyebrow") return "label";
  return "body";
}
