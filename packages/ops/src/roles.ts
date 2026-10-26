import type { BlockRegistry, ColorTheme, Section, SiteDocument } from "@openspace/schema";
import { findBlock, findSection, locateBlock } from "./doc";
import { invert } from "./invert";
import type { Op } from "./ops";
import { deepEqual, isPathPrefix, isPlainObject, patchPaths } from "./paths";

/**
 * Collaborator roles (arch §6.4, PRD). The Hub enforces them on every op it accepts.
 *
 * - **owner**, **designer**: every op.
 * - **editor**: content, pages, navigation, media and collections — but no `styles.patch`, no
 *   `grid.place`, no section layout/style/lock changes, no code injection; and on locked
 *   sections only text/image field updates; no header settings; new sections only as a preset
 *   build or a copy of an existing section's layout and style.
 * - **contributor**: only `collection.upsert` of a draft item (never over a non-draft item, and
 *   never over a draft someone else started).
 */
export const ROLES = ["owner", "designer", "editor", "contributor"] as const;
export type Role = (typeof ROLES)[number];

export type RoleDecision = { allowed: true; op: Op } | { allowed: false; reason: string };

export interface RoleContext {
  /**
   * The document the op will apply to. Needed to find which section a block-level op touches
   * (and an item's current status for contributors). Without it, Editors are treated as if
   * any block they touch were in a locked section.
   */
  doc?: SiteDocument;
  /**
   * Block definitions: field kinds for locked-section checks. The Hub must pass it; without it
   * only same-shape changes to existing text/image fields are allowed (fail safe).
   */
  registry?: BlockRegistry;
  /** The person submitting the op (user id). Needed for contributor edits to existing items. */
  userId?: string;
  /**
   * Who started a collection item (user id), as recorded by the Hub when the item was created.
   * Contributors may only change existing drafts they started; without this (or `userId`)
   * edits to existing items are denied (fail safe).
   */
  itemAuthor?: (collection: string, slug: string) => string | undefined;
  /**
   * Builds the section a preset (`section.preset`, e.g. `hero/split-image@2`) produces in a color
   * theme, or undefined for an unknown preset or a theme the preset isn't designed for. Editors may
   * only insert sections whose layout and style match a preset build or an existing section
   * (duplicate / paste); without this, only the latter.
   */
  presetSection?: (preset: string, colorTheme: ColorTheme | undefined) => Section | undefined;
}

/**
 * A section's designer-owned look: its layout (grid rects keyed by block order, since a built or
 * duplicated section has fresh block ids) and its style.
 */
function sectionLook(section: Section): unknown {
  const layout = section.layout;
  if (layout.mode !== "grid") return { layout, style: section.style };
  const order = new Map(section.blocks.map((b, i) => [b.id as string, i]));
  const items = Object.entries(layout.items)
    .map(([id, item]) => [order.get(id) ?? -1, item] as const)
    .sort((a, b) => a[0] - b[0]);
  return { layout: { ...layout, items }, style: section.style };
}

/** True if `section` looks exactly like a preset build or a section already in the document. */
export function isKnownSectionLook(section: Section, context: RoleContext): boolean {
  const look = sectionLook(section);
  if (section.preset && context.presetSection) {
    const built = context.presetSection(section.preset, section.style?.colorTheme);
    if (built && deepEqual(sectionLook(built), look)) return true;
  }
  const doc = context.doc;
  if (!doc) return false;
  if (deepEqual(sectionLook(doc.site.footer), look)) return true;
  for (const page of Object.values(doc.pages))
    for (const s of page.sections) if (deepEqual(sectionLook(s), look)) return true;
  return false;
}

/** Ids of locked sections in a document (pages + footer). */
export function lockedSectionsOf(doc: SiteDocument): Set<string> {
  const out = new Set<string>();
  if (doc.site.footer.locked) out.add(doc.site.footer.id);
  for (const page of Object.values(doc.pages))
    for (const s of page.sections) if (s.locked) out.add(s.id);
  return out;
}

const CONTENT_KINDS = new Set(["text", "richText", "image"]);

function isImageValue(v: unknown): boolean {
  return isPlainObject(v) && typeof v.src === "string";
}

type Shape = "string" | "doc" | "image" | "images" | undefined;
function contentShape(v: unknown): Shape {
  if (typeof v === "string") return "string";
  if (isPlainObject(v) && v.type === "doc" && Array.isArray(v.content)) return "doc";
  if (isImageValue(v)) return "image";
  if (Array.isArray(v) && v.length > 0 && v.every(isImageValue)) return "images";
  return undefined;
}

/** True if both values are text/image content of the same shape. */
export function sameContentShape(before: unknown, after: unknown): boolean {
  const a = contentShape(before);
  return a !== undefined && a === contentShape(after);
}

/** Shape-based guess: a string, a rich-text doc, an image, or a list of images. */
export function isTextOrImageValue(v: unknown): boolean {
  if (typeof v === "string") return true;
  if (isPlainObject(v) && v.type === "doc" && Array.isArray(v.content)) return true;
  if (isImageValue(v)) return true;
  return Array.isArray(v) && v.length > 0 && v.every(isImageValue);
}

const deny = (reason: string): RoleDecision => ({ allowed: false, reason });

/**
 * True if `op` is exactly the undo of `priorOp`: it equals `invert(docBefore, priorOp)` apart from
 * op metadata. `docBefore` is the document `priorOp` was applied to (the server keeps it, or
 * recomputes it from the op log).
 *
 * How the Hub authorizes undo: an inverse can carry fields a role may not send directly (grid
 * placements and rows restoring a deleted block, for instance). When an op arrives, if it
 * `isInverseOf` one of the same actor's own earlier accepted ops — and nothing has touched those
 * locations since (`rebase` it over the intervening ops first) — accept it as an undo; otherwise
 * run `transformForRole` as usual.
 */
export function isInverseOf(op: Op, priorOp: Op, docBefore: SiteDocument): boolean {
  let expected: Op;
  try {
    expected = invert(docBefore, priorOp);
  } catch {
    return false;
  }
  const strip = ({ id: _i, actor: _a, ts: _t, ...body }: Op) => body;
  return deepEqual(strip(op), strip(expected));
}

/**
 * Decide whether `role` may submit `op`.
 *
 * The Hub must pass `context.doc` (and should pass `context.registry`): without them checks fail
 * safe and deny anything that depends on the document (block edits in locked sections, page
 * deletes, contributor saves). Undo ops are authorized separately — see `isInverseOf`. Allowed ops are returned unchanged (ops are never
 * silently rewritten, so what the user sees is what is stored).
 */
export function transformForRole(
  op: Op,
  role: Role,
  lockedSections: Iterable<string>,
  context: RoleContext = {},
): RoleDecision {
  const allow: RoleDecision = { allowed: true, op };
  if (role === "owner" || role === "designer") return allow;
  const { doc, registry } = context;

  if (role === "contributor") {
    if (op.op !== "collection.upsert")
      return deny("Contributors can only create and edit draft collection items");
    if (op.item.frontmatter.status !== "draft")
      return deny("Contributors can only save items as drafts; an editor publishes them");
    if (!doc) return deny("Can't check this item without the current document");
    const existing = doc.collections[op.collection]?.[op.item.slug];
    if (existing && existing.frontmatter.status !== "draft")
      return deny("This item is already published or scheduled; only editors can change it");
    if (existing) {
      const author = context.itemAuthor?.(op.collection, op.item.slug);
      if (!context.userId || !author || author !== context.userId)
        return deny("Someone else started this draft; only they or an editor can change it");
    }
    return allow;
  }

  if (role !== "editor") return deny(`Unknown role ${String(role)}`);
  const locked = new Set(lockedSections);
  /** Section of a block, or undefined if unknown (no doc / not found). */
  const sectionOfBlock = (page: string, block: string): string | undefined => {
    if (!doc) return undefined;
    const loc =
      findBlock(doc, page as Parameters<typeof findBlock>[1], block) ?? locateBlock(doc, block);
    return loc?.section.id;
  };
  const isLocked = (section: string | undefined) => section === undefined || locked.has(section);
  const sectionById = (page: string, id: string) =>
    doc ? findSection(doc, page as Parameters<typeof findSection>[1], id)?.section : undefined;
  const NO_GRID = "Editors can't reposition blocks on the grid";

  switch (op.op) {
    case "styles.patch":
      return deny("Editors can't change site styles");
    case "grid.place":
      return deny("Editors can't reposition blocks on the grid");
    case "section.update": {
      const paths = patchPaths(op);
      if (paths.some((p) => isPathPrefix("layout", p) || isPathPrefix("style", p)))
        return deny("Editors can't change section layout or style");
      if (paths.some((p) => isPathPrefix("locked", p)))
        return deny("Only owners and designers can lock or unlock sections");
      if (locked.has(op.section)) return deny("This section is locked");
      return allow;
    }
    case "section.move":
    case "section.delete":
      if (locked.has(op.section)) return deny("This section is locked");
      return allow;
    case "section.insert":
      if (op.section.locked) return deny("Only owners and designers can lock sections");
      if (!isKnownSectionLook(op.section, context))
        return deny(
          "Editors add sections from the section gallery (or duplicate one); its layout and style come from the design",
        );
      return allow;
    case "block.insert":
      if (locked.has(op.section)) return deny("This section is locked");
      if (op.place || op.rows) return deny(NO_GRID);
      return allow;
    case "block.delete":
      if (isLocked(sectionOfBlock(op.page, op.block))) return deny("This section is locked");
      if (op.rows) return deny(NO_GRID);
      return allow;
    case "block.move": {
      const from = sectionOfBlock(op.page, op.block);
      if (isLocked(from) || locked.has(op.to.section)) return deny("This section is locked");
      if (op.to.place || op.to.rows || op.fromRows) return deny(NO_GRID);
      // Moving into, out of or between grid sections lays the grid out again; reordering inside
      // one grid section keeps placements and is fine.
      if (from !== op.to.section) {
        const src = sectionById(op.page, from as string);
        const dest = sectionById(op.page, op.to.section);
        if (!src || !dest) return deny("Can't check this move without the current document");
        if (src.layout.mode === "grid" || dest.layout.mode === "grid") return deny(NO_GRID);
      }
      return allow;
    }
    case "block.update": {
      const section = sectionOfBlock(op.page, op.block);
      if (!isLocked(section)) return allow;
      if (
        op.variant !== undefined ||
        op.style !== undefined ||
        op.column !== undefined ||
        op.label !== undefined ||
        op.hidden !== undefined
      )
        return deny("This section is locked: only its text and images can change");
      if (op.unset?.length) return deny("This section is locked: fields can't be removed");
      const block = doc ? findBlock(doc, op.page, op.block)?.block : undefined;
      if (!block) return deny("Can't check this edit without the current document");
      const def = registry?.get(block.type);
      for (const [key, value] of Object.entries(op.set ?? {})) {
        const kind = def?.meta.fields[key]?.kind;
        // With a registry the field kind is authoritative. Without one (fail safe), only an
        // existing field may change, and only to a value of the same text/image shape.
        const ok = def
          ? kind !== undefined && CONTENT_KINDS.has(kind)
          : block.fields[key] !== undefined && sameContentShape(block.fields[key], value);
        if (!ok) return deny(`This section is locked: "${key}" is not a text or image field`);
      }
      return allow;
    }
    case "site.update": {
      const paths = patchPaths(op);
      if (paths.some((p) => /^(customCss|headInjection|footerInjection)(\.|$)/.test(p)))
        return deny("Editors can't change custom code");
      if (paths.some((p) => isPathPrefix("footer", p)))
        return deny("Editors change the footer through its blocks");
      if (paths.some((p) => isPathPrefix("header", p)))
        return deny("Editors can't change the header layout; ask a designer");
      return allow;
    }
    case "page.update":
      if (patchPaths(op).some((p) => /^(headInjection|footerInjection)(\.|$)/.test(p)))
        return deny("Editors can't change custom code");
      return allow;
    case "page.create":
      if (op.page.headInjection !== undefined || op.page.footerInjection !== undefined)
        return deny("Editors can't change custom code");
      if (op.page.sections.some((s) => s.locked))
        return deny("Only owners and designers can lock sections");
      if (!op.page.sections.every((s) => isKnownSectionLook(s, context)))
        return deny(
          "Editors build pages from the section gallery; layout and style come from the design",
        );
      return allow;
    case "page.delete": {
      const page = doc?.pages[op.page];
      if (!page) return deny("Can't check this page without the current document");
      if (page.sections.some((s) => s.locked || locked.has(s.id)))
        return deny("This page has locked sections; only owners and designers can delete it");
      return allow;
    }
    default:
      // nav.update, media.*, collection.*, collectionConfig.upsert
      return allow;
  }
}
