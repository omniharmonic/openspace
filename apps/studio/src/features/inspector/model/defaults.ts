import type { FieldMeta, JsonValue, ListFieldMeta } from "@openspace/schema";
import { cloneBlock } from "../../editor/model/actions";

/**
 * A sensible value for a new field of `meta` (used for new list items when there is nothing to
 * copy). Required text gets a short placeholder phrase so the item validates and shows up.
 */
export function blankValue(meta: FieldMeta): unknown {
  if (meta.default !== undefined) return structuredClone(meta.default);
  if (meta.optional) return undefined;
  switch (meta.kind) {
    case "text":
      return meta.minLength ? "New item".padEnd(meta.minLength, ".") : "New item";
    case "richText":
      return {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "New item" }] }],
      };
    case "boolean":
      return false;
    case "number":
      return meta.min ?? 0;
    case "select":
      return meta.options[0]?.value;
    case "list":
      return [];
    case "color":
      return "accent";
    default:
      return undefined;
  }
}

/** Fresh ids inside a copied value (form ids), via the editor's block cloning. */
function freshIds<T>(value: T): T {
  const probe = cloneBlock({
    id: "blk_0000000000" as never,
    type: "x",
    v: 1,
    fields: { v: value },
  });
  return (probe.fields as { v: T }).v;
}

/**
 * The value for a new list item: a copy of the last item (so it looks like its neighbours,
 * the way Squarespace adds items), else the first item of the block's default list, else
 * blank values for each field.
 */
export function newListItem(
  meta: ListFieldMeta,
  items: readonly Record<string, unknown>[],
  defaults?: JsonValue,
): Record<string, unknown> {
  const last = items.at(-1);
  if (last) return freshIds(structuredClone(last));
  const fromDefaults = Array.isArray(defaults) ? defaults[0] : undefined;
  if (fromDefaults && typeof fromDefaults === "object")
    return freshIds(structuredClone(fromDefaults) as Record<string, unknown>);
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(meta.fields)) {
    const v = blankValue(field);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** Move an item within a list (drag reorder); returns a new array. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item as T);
  return out;
}

/** The title of a list item in the inspector: its `itemLabel` field, else the first text. */
export function itemTitle(
  meta: ListFieldMeta,
  item: Record<string, unknown>,
  index: number,
  plain: (v: unknown) => string,
): string {
  const keys = meta.itemLabel ? [meta.itemLabel] : [];
  for (const [k, f] of Object.entries(meta.fields))
    if (f.kind === "text" || f.kind === "richText") keys.push(k);
  for (const k of keys) {
    const text = plain(item[k]).trim();
    if (text) return text.length > 48 ? `${text.slice(0, 47)}…` : text;
  }
  const img = item.image as { alt?: string } | undefined;
  if (img?.alt) return img.alt;
  return `Item ${index + 1}`;
}
