import type { BlockRegistry, SiteDocument } from "@openspace/schema";
import { findBlock, locateBlock } from "./doc";
import type { Op } from "./ops";
import { isPathPrefix, isPlainObject, patchPaths } from "./paths";

/**
 * Collaborator roles (arch §6.4, PRD). The Hub enforces them on every op it accepts.
 *
 * - **owner**, **designer**: every op.
 * - **editor**: content, pages, navigation, media and collections — but no `styles.patch`, no
 *   `grid.place`, no section layout/style/lock changes, no code injection; and on locked
 *   sections only text/image field updates.
 * - **contributor**: only `collection.upsert` of a draft item (never over a non-draft item).
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
  /** Field kinds come from block definitions when given; otherwise from value shapes. */
  registry?: BlockRegistry;
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

/** Shape-based guess: a string, a rich-text doc, an image, or a list of images. */
export function isTextOrImageValue(v: unknown): boolean {
  if (typeof v === "string") return true;
  if (isPlainObject(v) && v.type === "doc" && Array.isArray(v.content)) return true;
  if (isImageValue(v)) return true;
  return Array.isArray(v) && v.length > 0 && v.every(isImageValue);
}

const deny = (reason: string): RoleDecision => ({ allowed: false, reason });

/**
 * Decide whether `role` may submit `op`. Allowed ops are returned unchanged (ops are never
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
    const existing = doc?.collections[op.collection]?.[op.item.slug];
    if (existing && existing.frontmatter.status !== "draft")
      return deny("This item is already published or scheduled; only editors can change it");
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
      return allow;
    case "block.insert":
      if (locked.has(op.section)) return deny("This section is locked");
      return allow;
    case "block.delete":
      if (isLocked(sectionOfBlock(op.page, op.block))) return deny("This section is locked");
      return allow;
    case "block.move":
      if (isLocked(sectionOfBlock(op.page, op.block)) || locked.has(op.to.section))
        return deny("This section is locked");
      return allow;
    case "block.update": {
      const section = sectionOfBlock(op.page, op.block);
      if (!isLocked(section)) return allow;
      if (op.variant !== undefined || op.style !== undefined || op.column !== undefined)
        return deny("This section is locked: only its text and images can change");
      if (op.unset?.length) return deny("This section is locked: fields can't be removed");
      const block = doc ? findBlock(doc, op.page, op.block)?.block : undefined;
      const def = block && registry ? registry.get(block.type) : undefined;
      for (const [key, value] of Object.entries(op.set ?? {})) {
        const kind = def?.meta.fields[key]?.kind;
        const ok = kind
          ? CONTENT_KINDS.has(kind)
          : isTextOrImageValue(value) &&
            (block?.fields[key] === undefined || isTextOrImageValue(block.fields[key]));
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
      return allow;
    }
    default:
      // page.*, nav.update, media.*, collection.*, collectionConfig.upsert
      return allow;
  }
}
