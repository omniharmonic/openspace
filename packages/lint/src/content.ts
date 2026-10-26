import { blockHeadings } from "@openspace/blocks";
import {
  type Block,
  type GridRect,
  type ImageValue,
  plainText,
  type RichTextDoc,
  type Section,
  STACK_UNITS,
} from "@openspace/schema";

/** What the checks need to know about blocks and sections. */

/** Blocks that carry no reading text (media and decoration). Everything else is "text". */
export const NON_TEXT_BLOCKS = new Set([
  "image",
  "gallery",
  "video",
  "shape",
  "spacer",
  "line",
  "divider",
  "map",
  "before-after",
  "embed",
]);
export const isTextBlock = (b: Block) => !NON_TEXT_BLOCKS.has(b.type);

/** Blocks that are, or contain, an action a visitor can take. */
export const ACTION_BLOCKS = new Set([
  "button",
  "form",
  "newsletter",
  "booking",
  "donation",
  "product",
  "member-login",
  "link-list",
  "pricing",
]);

/** Blocks with a `headingLevel` + optional heading text (library B). */
const LEVEL_FIELD_BLOCKS = new Set([
  "summary",
  "events",
  "hours",
  "contact-info",
  "countdown",
  "booking",
  "donation",
  "member-login",
  "social-feed",
]);

const lvl = (tag: unknown, fallback = 3) => {
  const m = /^h([1-6])$/.exec(String(tag ?? ""));
  return m ? Number(m[1]) : fallback;
};
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? (v as Record<string, unknown>[]) : [];

export interface OutlineHeading {
  level: number;
  text: string;
  blockId: string;
  /** Whether the level is editable (heading/text blocks, `headingLevel` fields). */
  editable: boolean;
}

/** Headings a block renders, in document order. */
export function headingsOf(block: Block): OutlineHeading[] {
  const f = block.fields;
  const out = (level: number, text: string, editable = false): OutlineHeading => ({
    level,
    text,
    blockId: block.id,
    editable,
  });
  switch (block.type) {
    case "heading":
    case "text":
      return blockHeadings(block).map((h) => out(h.level, h.text, true));
    case "card":
      return f.heading ? [out(3, String(f.heading))] : [];
    case "columns":
      return list(f.items).map((i) => out(3, String(i.heading ?? "")));
    case "team":
      return list(f.people).map((p) => out(3, String(p.name ?? "")));
    case "pricing":
      return list(f.plans).map((p) => out(3, String(p.name ?? "")));
    case "timeline":
      return list(f.items).map((i) => out(3, String(i.title ?? "")));
    case "restaurant-menu":
      return list(f.sections).map((s) => out(3, String(s.title ?? "")));
    case "audio":
      return [out(3, String(f.title ?? ""))];
    case "newsletter":
      return f.heading ? [out(2, String(f.heading))] : [];
    default:
      if (LEVEL_FIELD_BLOCKS.has(block.type) && f.heading)
        return [out(lvl(f.headingLevel), String(f.heading), true)];
      return [];
  }
}

/** Blocks of a section in rendered (DOM) order: stack by column, grid by desktop reading order. */
export function blocksInOrder(section: Section): Block[] {
  const layout = section.layout;
  if (layout.mode === "stack") {
    const cols = layout.columns.d.length;
    const byCol: Block[][] = Array.from({ length: cols }, () => []);
    for (const b of section.blocks) byCol[Math.min(Math.max(b.column ?? 0, 0), cols - 1)]?.push(b);
    return byCol.flat();
  }
  return [...section.blocks].sort((a, b) => {
    const ra = layout.items[a.id]?.d;
    const rb = layout.items[b.id]?.d;
    if (!ra || !rb) return 0;
    return ra.y - rb.y || ra.x - rb.x;
  });
}

/** All visible plain text in a block (for emptiness and word counts). */
export function blockText(block: Block): string {
  const parts: string[] = [];
  const walk = (v: unknown, key?: string) => {
    if (typeof v === "string") {
      if (
        key &&
        /^(?:src|url|href|link|id|type|variant|icon|level|size|aspect|network|day|opens|closes|currency|source|provider|mode|frequency|target|tileServer|headingLevel|placeholder|columns|separator|speed|color|shape|thickness|length|height|role|align|alignment|layout|fit|theme|kind)$/.test(
          key,
        )
      )
        return;
      parts.push(v);
    } else if (Array.isArray(v)) for (const x of v) walk(x);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.type === "doc" && Array.isArray(o.content)) {
        parts.push(plainText(o as unknown as RichTextDoc));
        return;
      }
      if (typeof o.src === "string") return; // images: alt text isn't reading text
      for (const [k, x] of Object.entries(o)) walk(x, k);
    }
  };
  walk(block.fields);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export interface FoundImage {
  image: ImageValue;
  /** Field path inside the block, e.g. `["images", 2, "image"]`. */
  path: (string | number)[];
}

/** Every image value (`{ src, alt }`) inside a block's fields. */
export function imagesIn(block: Block): FoundImage[] {
  const out: FoundImage[] = [];
  const walk = (v: unknown, path: (string | number)[]) => {
    if (Array.isArray(v)) {
      v.forEach((x, i) => {
        walk(x, [...path, i]);
      });
    } else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.src === "string" && typeof o.alt === "string" && !("kind" in o)) {
        out.push({ image: o as unknown as ImageValue, path });
        return;
      }
      for (const [k, x] of Object.entries(o)) walk(x, [...path, k]);
    }
  };
  walk(block.fields, []);
  return out;
}

// --- display size -------------------------------------------------------------------------------

/** Desktop design widths (CSS px) for the content width tokens and the viewport. */
export const VIEWPORT = 1920;
/** Desktop grid row unit (CSS px). */
export const GRID_ROW_PX = 24;
export const CONTENT_WIDTHS = { narrow: 720, content: 1280, wide: 1440, full: VIEWPORT } as const;

function containerWidth(section: Section): number {
  return CONTENT_WIDTHS[section.layout.width ?? "content"];
}

/** Largest CSS width a block is drawn at on desktop. */
export function blockDisplayWidth(section: Section, block: Block): number {
  const W = containerWidth(section);
  const layout = section.layout;
  if (layout.mode === "stack") {
    const cols = layout.columns.d;
    const span = cols[Math.min(block.column ?? 0, cols.length - 1)] ?? STACK_UNITS;
    return (W * span) / STACK_UNITS;
  }
  const rect = layout.items[block.id]?.d;
  if (!rect) return W;
  return rectWidth(rect, W);
}

export function rectWidth(rect: GridRect, W: number): number {
  let w = (W * rect.w) / 24;
  const side = (VIEWPORT - W) / 2;
  if (rect.bleed === "left" || rect.bleed === "both") w += side;
  if (rect.bleed === "right" || rect.bleed === "both") w += side;
  return w;
}

/** Display width of one image inside a block (galleries, cards and lists divide the block). */
export function imageDisplayWidth(
  block: Block,
  blockWidth: number,
  path: (string | number)[],
): number {
  const f = block.fields;
  const n = (v: unknown, d: number) => Number(v ?? d) || d;
  switch (block.type) {
    case "gallery":
      if (block.variant === "slideshow") return blockWidth;
      if (block.variant === "carousel") return blockWidth / 2.5;
      if (block.variant === "strips") return blockWidth / 2;
      return blockWidth / n(f.columns, 3);
    case "columns":
      return blockWidth / n(f.columns, 3);
    case "team":
      return blockWidth / n(f.columns, 3);
    case "testimonial":
    case "quote-carousel":
      return 96;
    default:
      return path.length > 1 ? blockWidth / 2 : blockWidth;
  }
}

/** Crop aspect (w/h) an image block draws at, when it crops. */
export function cropAspect(block: Block, section: Section): number | undefined {
  const layout = section.layout;
  if (layout.mode === "grid") {
    // Grid images fill their cell (rows are at least one row unit tall).
    const rect = layout.items[block.id]?.d;
    if (!rect || block.type !== "image") return undefined;
    return rectWidth(rect, CONTENT_WIDTHS[layout.width ?? "content"]) / (rect.h * GRID_ROW_PX);
  }
  const a = block.fields.aspect;
  if (typeof a !== "string" || !/^\d+:\d+$/.test(a)) return undefined;
  const [w, h] = a.split(":").map(Number) as [number, number];
  return w / h;
}
