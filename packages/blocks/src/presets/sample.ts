import type { Block, RichTextDoc, Section } from "@omniharmonic/openspace-schema";
import { plainText } from "@omniharmonic/openspace-schema";

/**
 * Sample content (the "sample" marker for presets).
 *
 * Presets ship demo copy so a section looks finished in the gallery — but the people, quotes,
 * prices, numbers and contact details in it belong to a made-up business (a bakery's reviews, a
 * restaurant's staff). Inserted into a real site they must be replaced, never published.
 *
 * The marker is machine-readable but lives in the preset, not in the site's content: every
 * string a preset builds into one of the {@link SAMPLE_BLOCK_TYPES} is sample content. A block
 * still holding one of those exact strings is unedited sample content; editing the field clears
 * it, because the value no longer matches. (A per-block `sample` flag in the document would need
 * a schema change that sites built with older site-kit releases reject, and it would go stale.)
 */

/** Block types whose preset copy describes specific people, quotes, prices, numbers or contacts. */
export const SAMPLE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "testimonial",
  "quote",
  "quote-carousel",
  "team",
  "restaurant-menu",
  "stats",
  "pricing",
  "timeline",
  "contact-info",
  "table",
]);

/** Field keys that hold settings or links rather than reading text. */
const NOT_TEXT =
  /^(?:src|url|href|link|id|type|variant|icon|level|size|aspect|network|day|opens|closes|currency|source|provider|mode|frequency|target|tileServer|headingLevel|placeholder|columns|separator|speed|color|shape|thickness|length|height|align|alignment|layout|fit|theme|kind|alt|style|interval|period)$/;

/** Lower-cased, whitespace-collapsed text for comparison. */
export function normalizeSampleText(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Specific enough that a match means "unedited sample", not a coincidence or a generic label
 * ("Chef", "raised so far", "Day ticket"): a person's or business's name (two capitalised words),
 * a sentence (a quote, a bio), or a number, address, price, phone or email.
 */
function specific(s: string): boolean {
  const t = s.trim();
  if (t.length < 4) return false;
  if (/\d/.test(t) || t.includes("@")) return true;
  if (/\p{Lu}[\p{L}’'-]+[\s.,&]+(?:\p{Ll}{1,3}\s+)?\p{Lu}[\p{L}’'-]+/u.test(t)) return true;
  return t.split(/\s+/).length >= 6;
}

/** The reading strings in a block's fields (rich text as one string per paragraph/heading). */
export function sampleStringsOf(block: Block): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    if (specific(s)) out.push(normalizeSampleText(s));
  };
  const walk = (v: unknown, key?: string) => {
    if (typeof v === "string") {
      if (!key || !NOT_TEXT.test(key)) push(v);
    } else if (Array.isArray(v)) for (const x of v) walk(x);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.type === "doc" && Array.isArray(o.content)) {
        for (const node of o.content)
          push(plainText({ type: "doc", content: [node] } as unknown as RichTextDoc));
        return;
      }
      if (typeof o.src === "string") return; // an image: its alt text isn't sample copy
      for (const [k, x] of Object.entries(o)) walk(x, k);
    }
  };
  walk(block.fields);
  return out;
}

/** Every sample string a built section carries, normalized. */
export function sectionSampleStrings(section: Section): Set<string> {
  const out = new Set<string>();
  for (const b of section.blocks)
    if (SAMPLE_BLOCK_TYPES.has(b.type)) for (const s of sampleStringsOf(b)) out.add(s);
  return out;
}

/** A block in `section` still holding sample content from `sample`, with the strings found. */
export interface SampleMatch {
  blockId: string;
  blockType: string;
  found: string[];
}

/** Blocks of `section` that still hold any of the preset's sample strings. */
export function sampleMatches(section: Section, sample: ReadonlySet<string>): SampleMatch[] {
  if (!sample.size) return [];
  const out: SampleMatch[] = [];
  for (const b of section.blocks) {
    if (b.hidden || !SAMPLE_BLOCK_TYPES.has(b.type)) continue;
    const found = [...new Set(sampleStringsOf(b).filter((s) => sample.has(s)))];
    if (found.length) out.push({ blockId: b.id, blockType: b.type, found });
  }
  return out;
}

/** Placeholder text a person left in ("[PLACEHOLDER]", "[Your name]", "Lorem ipsum", "TBD"). */
export const PLACEHOLDER_RE =
  /\[(?:placeholder|todo|tbd|tk|insert[^\]]*|your [^\]]*|add [^\]]*)\]|\blorem ipsum\b|\{\{[^}]*\}\}/i;
