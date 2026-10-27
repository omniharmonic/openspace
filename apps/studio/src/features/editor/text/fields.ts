import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import type { Block, FieldMeta, RichTextDoc } from "@omniharmonic/openspace-schema";

/**
 * The words in a block that can be edited on the canvas: every rich-text and plain text field,
 * including those inside list items (`items.2.body`).
 */
export interface TextFieldRef {
  path: string;
  kind: "rich" | "plain";
  multiline: boolean;
  maxLength?: number;
  optional: boolean;
}

/** Which field of which block is being edited inline. */
export interface EditingField {
  path: string;
  kind: "rich" | "plain";
}

export function getAt(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Immutable set: returns a copy of `root` with `path` replaced (arrays stay arrays). */
export function setAt<T>(root: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  if (head === undefined) return value as T;
  const base = (root ?? {}) as Record<string, unknown> | unknown[];
  const copy = (Array.isArray(base) ? [...base] : { ...base }) as Record<string, unknown>;
  copy[head] = rest.length ? setAt(copy[head], rest.join("."), value) : value;
  return copy as T;
}

/**
 * `block.update` arguments for changing one field path: ops set top-level field keys, so a
 * nested change replaces the whole top-level value it lives in.
 */
export function fieldSet(block: Block, path: string, value: unknown): Record<string, unknown> {
  const [top, ...rest] = path.split(".");
  const key = top as string;
  return { [key]: rest.length ? setAt(block.fields[key], rest.join("."), value) : value };
}

function walk(
  fields: Record<string, FieldMeta>,
  values: Record<string, unknown> | undefined,
  prefix: string,
  out: TextFieldRef[],
) {
  for (const [key, meta] of Object.entries(fields)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (meta.kind === "richText")
      out.push({
        path,
        kind: "rich",
        multiline: true,
        maxLength: meta.maxLength,
        optional: meta.optional,
      });
    else if (meta.kind === "text")
      out.push({
        path,
        kind: "plain",
        multiline: Boolean(meta.multiline),
        maxLength: meta.maxLength,
        optional: meta.optional,
      });
    else if (meta.kind === "list") {
      const items = values?.[key];
      if (Array.isArray(items))
        items.forEach((item, i) => {
          walk(meta.fields, item as Record<string, unknown>, `${path}.${i}`, out);
        });
    }
  }
}

export function textFieldsOf(block: Block): TextFieldRef[] {
  const def = blocksRegistry().get(block.type);
  if (!def) return [];
  const out: TextFieldRef[] = [];
  walk(def.meta.fields, block.fields, "", out);
  return out;
}

const hasWords = (v: unknown) =>
  typeof v === "string"
    ? v.trim().length > 0
    : Boolean((v as RichTextDoc | undefined)?.content?.length);

/** The field Enter (or "Edit text") opens: the first one with words in it, rich text first. */
export function defaultTextField(block: Block): EditingField | null {
  const refs = textFieldsOf(block).filter((r) => hasWords(getAt(block.fields, r.path)));
  const pick = refs.find((r) => r.kind === "rich") ?? refs[0];
  return pick ? { path: pick.path, kind: pick.kind } : null;
}

export const hasEditableText = (block: Block) => defaultTextField(block) !== null;

/**
 * Elements on the canvas showing a block's plain text fields, matched by their text (blocks
 * render text fields as plain text nodes, so the element whose whole text equals the value is
 * the one to edit). Each element is used once, in document order.
 */
export function plainTextTargets(blockEl: Element, block: Block): Map<string, HTMLElement> {
  const out = new Map<string, HTMLElement>();
  const used = new Set<Element>();
  const candidates = [...blockEl.querySelectorAll<HTMLElement>("*")].filter(
    (el) =>
      !el.closest(".os-rich, [data-os-field], iframe, script, style, [data-os-inline-editor]") &&
      el.tagName !== "SCRIPT",
  );
  for (const ref of textFieldsOf(block)) {
    if (ref.kind !== "plain") continue;
    const value = getAt(block.fields, ref.path);
    if (typeof value !== "string" || !value.trim()) continue;
    const want = value.replace(/\s+/g, " ").trim();
    const matches = candidates.filter(
      (el) => !used.has(el) && (el.textContent ?? "").replace(/\s+/g, " ").trim() === want,
    );
    // The innermost element whose text is exactly the value.
    const el = matches.find((m) => !matches.some((o) => o !== m && m.contains(o)));
    if (el) {
      out.set(ref.path, el);
      used.add(el);
      for (const m of matches) if (m.contains(el)) used.add(m);
    }
  }
  return out;
}

/** The text field under a point in the canvas (iframe client coordinates). */
export function fieldAtPoint(
  blockEl: Element,
  block: Block,
  x: number,
  y: number,
): EditingField | null {
  const inside = (el: Element) => {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  const rich = [...blockEl.querySelectorAll("[data-os-field]")].filter(inside);
  const hitRich = rich[rich.length - 1];
  if (hitRich) return { path: hitRich.getAttribute("data-os-field") as string, kind: "rich" };
  for (const [path, el] of plainTextTargets(blockEl, block))
    if (inside(el)) return { path, kind: "plain" };
  return null;
}

/** The field definition at a path (`items.2.body` → the list's `body` field). */
export function fieldMetaAt(block: Block, path: string): FieldMeta | undefined {
  const def = blocksRegistry().get(block.type);
  let fields: Record<string, FieldMeta> | undefined = def?.meta.fields;
  let meta: FieldMeta | undefined;
  for (const key of path.split(".")) {
    if (/^\d+$/.test(key)) continue;
    meta = fields?.[key];
    fields = meta?.kind === "list" ? meta.fields : undefined;
  }
  return meta;
}
