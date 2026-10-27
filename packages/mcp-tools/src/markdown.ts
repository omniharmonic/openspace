/**
 * Rich text crosses the MCP boundary as Markdown (arch §3.5): `get_page` returns rich-text fields
 * as Markdown strings and the edit tools accept Markdown (or ProseMirror JSON) for them. The
 * conversion is driven by each block's field metadata, so it reaches rich text nested in list
 * items too (accordion answers, tab panels…).
 */
import {
  type Block,
  type BlockRegistry,
  type FieldMeta,
  fromMarkdown,
  type RichTextDoc,
  toMarkdown,
} from "@omniharmonic/openspace-schema";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isDoc = (v: unknown): v is RichTextDoc => isRecord(v) && v.type === "doc";

type Direction = "out" | "in";

function convertValue(meta: FieldMeta | undefined, value: unknown, dir: Direction): unknown {
  if (!meta) return value;
  if (meta.kind === "richText") {
    if (dir === "out" && isDoc(value)) return toMarkdown(value);
    if (dir === "in" && typeof value === "string") return fromMarkdown(value);
    return value;
  }
  if (meta.kind === "list" && Array.isArray(value))
    return value.map((item) => (isRecord(item) ? convertFields(meta.fields, item, dir) : item));
  return value;
}

export function convertFields(
  metas: Record<string, FieldMeta>,
  fields: Record<string, unknown>,
  dir: Direction,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = convertValue(metas[k], v, dir);
  return out;
}

/** Block fields with rich text as Markdown (unknown block types pass through). */
export function fieldsToAgent(
  registry: BlockRegistry,
  type: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const def = registry.get(type);
  return def ? convertFields(def.meta.fields, fields, "out") : fields;
}

/** Agent-supplied values for a field map (e.g. a custom component's sample content). */
export function valuesFromAgent(
  metas: Record<string, FieldMeta>,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  return convertFields(metas, fields, "in");
}

/** Agent-supplied fields with Markdown strings turned into rich-text documents. */
export function fieldsFromAgent(
  registry: BlockRegistry,
  type: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const def = registry.get(type);
  return def ? convertFields(def.meta.fields, fields, "in") : fields;
}

export function blockToAgent(registry: BlockRegistry, block: Block): Record<string, unknown> {
  return { ...block, fields: fieldsToAgent(registry, block.type, block.fields) };
}

/** Plain text preview of a block (first ~80 chars of its text fields), for summaries. */
export function blockPreview(registry: BlockRegistry, block: Block, max = 80): string {
  const def = registry.get(block.type);
  const parts: string[] = [];
  const walk = (metas: Record<string, FieldMeta>, fields: Record<string, unknown>) => {
    for (const [k, m] of Object.entries(metas)) {
      const v = fields[k];
      if (m.kind === "text" && typeof v === "string") parts.push(v);
      else if (m.kind === "richText" && isDoc(v)) parts.push(toMarkdown(v).replace(/\s+/g, " "));
      else if (m.kind === "image" && isRecord(v) && typeof v.alt === "string")
        parts.push(`[image: ${v.alt || "no alt"}]`);
      else if (m.kind === "list" && Array.isArray(v))
        for (const item of v) if (isRecord(item)) walk(m.fields, item);
      if (parts.join(" ").length > max) return;
    }
  };
  if (def) walk(def.meta.fields, block.fields);
  const text = parts.join(" · ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
