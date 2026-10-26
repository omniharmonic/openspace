/**
 * Stress variations for section presets (doc 04 §8.2): copy at 3× and 0.3×, missing images,
 * very tall and very wide images, and 1 / 2 / 5 / 12 items in repeatable lists. Each variation
 * respects what Studio allows (a field's max length, a list's min and max items), so a failure
 * is something an owner could really produce.
 */
import type { Block, FieldMeta, JsonValue, RichTextDoc, Section } from "@openspace/schema";

export type FieldMetas = Record<string, FieldMeta>;
/** Field metadata per block type (`blocksRegistry().meta()`). */
export type MetaLookup = (type: string) => FieldMetas | undefined;

export type Variation =
  | { kind: "base" }
  | { kind: "copy"; factor: number }
  | { kind: "images"; mode: "missing" | "tall" | "wide" }
  | { kind: "items"; count: number };

export const VARIATIONS: { id: string; variation: Variation }[] = [
  { id: "base", variation: { kind: "base" } },
  { id: "copy-3x", variation: { kind: "copy", factor: 3 } },
  { id: "copy-0.3x", variation: { kind: "copy", factor: 0.3 } },
  { id: "images-missing", variation: { kind: "images", mode: "missing" } },
  { id: "images-tall", variation: { kind: "images", mode: "tall" } },
  { id: "images-wide", variation: { kind: "images", mode: "wide" } },
  { id: "items-1", variation: { kind: "items", count: 1 } },
  { id: "items-2", variation: { kind: "items", count: 2 } },
  { id: "items-5", variation: { kind: "items", count: 5 } },
  { id: "items-12", variation: { kind: "items", count: 12 } },
];

/** A neutral placeholder photo of a given shape (inline SVG, no network). */
export function placeholderImage(width: number, height: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a9a8c"/><stop offset="1" stop-color="#3f4d48"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const IMAGE_SHAPES = { tall: [600, 1800], wide: [2400, 600] } as const;

/** Scale a run of words: ×3 repeats it, ×0.3 keeps the first 30% (at least one word). */
export function scaleWords(text: string, factor: number, maxLength?: number): string {
  if (!text.trim()) return text;
  let out: string;
  if (factor >= 1) {
    out = Array.from({ length: Math.round(factor) }, () => text.trim()).join(" ");
  } else {
    const words = text.trim().split(/\s+/);
    out = words.slice(0, Math.max(1, Math.round(words.length * factor))).join(" ");
  }
  if (maxLength !== undefined && out.length > maxLength) {
    const cut = out.slice(0, maxLength);
    const space = cut.lastIndexOf(" ");
    out = (space > maxLength * 0.6 ? cut.slice(0, space) : cut).trim();
  }
  return out;
}

type Node = { type: string; text?: string; content?: Node[]; [k: string]: unknown };

function scaleRich(doc: RichTextDoc, factor: number, maxLength?: number): RichTextDoc {
  const budget = maxLength === undefined ? undefined : { left: maxLength };
  const walk = (node: Node): Node => {
    if (node.type === "text" && typeof node.text === "string") {
      let text = scaleWords(node.text, factor);
      if (budget) {
        text = text.slice(0, Math.max(0, budget.left));
        budget.left -= text.length;
      }
      return { ...node, text };
    }
    if (!node.content) return node;
    const content = node.content.map(walk).filter((n) => n.type !== "text" || n.text);
    return { ...node, content };
  };
  return walk(doc as unknown as Node) as unknown as RichTextDoc;
}

const isRich = (v: unknown): v is RichTextDoc =>
  Boolean(v && typeof v === "object" && (v as { type?: string }).type === "doc");
const isImage = (v: unknown): v is { src: string } & Record<string, unknown> =>
  Boolean(v && typeof v === "object" && typeof (v as { src?: unknown }).src === "string");

function transformFields(
  fields: Record<string, unknown>,
  metas: FieldMetas,
  v: Variation,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fields };
  for (const [key, meta] of Object.entries(metas)) {
    const value = fields[key];
    if (value === undefined || value === null) continue;
    if (v.kind === "copy" && meta.kind === "text" && typeof value === "string") {
      out[key] = scaleWords(value, v.factor, meta.maxLength);
    } else if (v.kind === "copy" && meta.kind === "richText" && isRich(value)) {
      out[key] = scaleRich(value, v.factor, meta.maxLength);
    } else if (v.kind === "images" && meta.kind === "image" && isImage(value)) {
      if (v.mode === "missing") {
        if (meta.optional) delete out[key];
        else out[key] = { ...value, src: "", width: undefined, height: undefined };
      } else {
        const [w, h] = IMAGE_SHAPES[v.mode];
        out[key] = { ...value, src: placeholderImage(w, h), width: w, height: h };
      }
    } else if (meta.kind === "list" && Array.isArray(value)) {
      let items = value as Record<string, unknown>[];
      if (v.kind === "items" && items.length > 0) {
        const min = meta.min ?? 0;
        const max = meta.max ?? Number.POSITIVE_INFINITY;
        const n = Math.min(max, Math.max(min, v.count));
        items = Array.from(
          { length: n },
          (_, i) => items[i % items.length] as Record<string, unknown>,
        );
      }
      out[key] = items.map((item) =>
        item && typeof item === "object" ? transformFields(item, meta.fields, v) : item,
      );
    }
  }
  return out;
}

/** The section with one stress variation applied to every block (new ids are not needed). */
export function applyVariation(section: Section, v: Variation, metaOf: MetaLookup): Section {
  if (v.kind === "base") return section;
  return {
    ...section,
    blocks: section.blocks.map((b): Block => {
      const metas = metaOf(b.type);
      if (!metas) return b;
      return { ...b, fields: transformFields(b.fields, metas, v) as Record<string, JsonValue> };
    }),
  };
}

/** Whether a variation changes anything in this section (skip identical renders). */
export function changes(section: Section, v: Variation, metaOf: MetaLookup): boolean {
  return JSON.stringify(applyVariation(section, v, metaOf)) !== JSON.stringify(section);
}

/** Header stress: a long site name and a very wide logo. */
export const LONG_SITE_NAME =
  "The Riverside Community Woodworking & Furniture Restoration Collective";
export const WIDE_LOGO = placeholderImage(1200, 120);
