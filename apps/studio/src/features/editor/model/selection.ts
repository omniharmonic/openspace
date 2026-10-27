import { type ContainerId, FOOTER } from "@omniharmonic/openspace-ops";
import type { Block, Section, SiteDocument } from "@omniharmonic/openspace-schema";
import { studioRegistry } from "./registry";

/** One selected (or hovered) thing on the canvas. */
export interface SelItem {
  kind: "section" | "block";
  id: string;
}

export const sameItem = (a: SelItem | null | undefined, b: SelItem | null | undefined) =>
  Boolean(a && b && a.kind === b.kind && a.id === b.id);

/** The sections the canvas shows for a page, footer last. */
export function canvasSections(doc: SiteDocument, pageId: string): Section[] {
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  return [...(page?.sections ?? []), doc.site.footer];
}

export interface Located {
  container: ContainerId;
  section: Section;
  sectionIndex: number;
  block?: Block;
  blockIndex?: number;
}

/** Find a section or block among the page's sections and the footer. */
export function locate(doc: SiteDocument, pageId: string, item: SelItem): Located | undefined {
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  const lists: Array<[ContainerId, Section[]]> = [
    [pageId as ContainerId, page?.sections ?? []],
    [FOOTER, [doc.site.footer]],
  ];
  for (const [container, sections] of lists) {
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i] as Section;
      if (item.kind === "section" && section.id === item.id)
        return { container, section, sectionIndex: i };
      if (item.kind === "block") {
        const j = section.blocks.findIndex((b) => b.id === item.id);
        if (j >= 0)
          return {
            container,
            section,
            sectionIndex: i,
            block: section.blocks[j] as Block,
            blockIndex: j,
          };
      }
    }
  }
  return undefined;
}

/** Blocks in visual reading order: stack by column then list order; grid by row then column. */
export function readingOrder(section: Section): Block[] {
  if (section.layout.mode === "stack") {
    return section.blocks
      .map((b, i) => ({ b, i }))
      .sort((x, y) => (x.b.column ?? 0) - (y.b.column ?? 0) || x.i - y.i)
      .map((x) => x.b);
  }
  const items = section.layout.items;
  return [...section.blocks].sort((a, b) => {
    const ra = items[a.id]?.d;
    const rb = items[b.id]?.d;
    return (ra?.y ?? 0) - (rb?.y ?? 0) || (ra?.x ?? 0) - (rb?.x ?? 0);
  });
}

/** Previous/next item at the same level (blocks within their section; sections within the page). */
export function siblingOf(
  doc: SiteDocument,
  pageId: string,
  item: SelItem,
  dir: -1 | 1,
): SelItem | undefined {
  const loc = locate(doc, pageId, item);
  if (!loc) return undefined;
  if (item.kind === "block") {
    const order = readingOrder(loc.section);
    const i = order.findIndex((b) => b.id === item.id);
    const next = order[i + dir];
    if (next) return { kind: "block", id: next.id };
    // Cross into the neighbouring section's first/last block.
    const sections = canvasSections(doc, pageId);
    const si = sections.findIndex((s) => s.id === loc.section.id);
    for (let k = si + dir; k >= 0 && k < sections.length; k += dir) {
      const o = readingOrder(sections[k] as Section);
      const b = dir === 1 ? o[0] : o[o.length - 1];
      if (b) return { kind: "block", id: b.id };
    }
    return undefined;
  }
  const sections = canvasSections(doc, pageId);
  const si = sections.findIndex((s) => s.id === item.id);
  const next = sections[si + dir];
  return next ? { kind: "section", id: next.id } : undefined;
}

/** Esc: a block's parent is its section; a section has none. */
export function parentOf(doc: SiteDocument, pageId: string, item: SelItem): SelItem | undefined {
  if (item.kind === "section") return undefined;
  const loc = locate(doc, pageId, item);
  return loc ? { kind: "section", id: loc.section.id } : undefined;
}

/** Enter: a section's first child block. */
export function firstChildOf(
  doc: SiteDocument,
  pageId: string,
  item: SelItem,
): SelItem | undefined {
  if (item.kind !== "section") return undefined;
  const loc = locate(doc, pageId, item);
  const first = loc ? readingOrder(loc.section)[0] : undefined;
  return first ? { kind: "block", id: first.id } : undefined;
}

/** Human label for a block type ("Text", "Image"). */
export function blockLabel(type: string): string {
  return (
    studioRegistry().get(type)?.label ??
    type.replace(/(^|-)([a-z])/g, (_m, sep, c) => (sep ? " " : "") + c.toUpperCase())
  );
}

/** A block's name in layers and on the canvas: its own label, else its type's. */
export function blockName(block: Pick<Block, "type" | "label">): string {
  return block.label?.trim() || blockLabel(block.type);
}

/** Human label for a section: its own label, its preset, or its position. */
export function sectionLabel(doc: SiteDocument, section: Section, index?: number): string {
  if (section.id === doc.site.footer.id) return section.label ?? "Footer";
  if (section.label) return section.label;
  if (section.preset) {
    const name = section.preset.split("@")[0]?.split("/")[0] ?? "";
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return index !== undefined ? `Section ${index + 1}` : "Section";
}

export function itemLabel(doc: SiteDocument, pageId: string, item: SelItem): string {
  const loc = locate(doc, pageId, item);
  if (!loc) return "";
  if (loc.block) return blockName(loc.block);
  return sectionLabel(doc, loc.section, loc.sectionIndex);
}
