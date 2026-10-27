import {
  type Block,
  type Breakpoint,
  GRID_COLUMNS,
  type GridItem,
  type GridLayout,
  type GridRect,
  type Page,
  resolve,
  type Section,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { type ContainerId, FOOTER, type Position, type Rows } from "./ops";

/** A precondition failure while applying an op (missing target, bad position…). */
export class OpError extends Error {
  readonly path: (string | number)[];
  constructor(message: string, path: (string | number)[] = []) {
    super(message);
    this.name = "OpError";
    this.path = path;
  }
}

/** Document path of a container's sections (for error paths). */
export function containerPath(container: ContainerId): (string | number)[] {
  return container === FOOTER ? ["site", "footer"] : ["pages", container];
}

/** The sections of a page, or `[footer]`. Undefined if the page does not exist. */
export function sectionsOf(doc: SiteDocument, container: ContainerId): Section[] | undefined {
  if (container === FOOTER) return [doc.site.footer];
  return doc.pages[container]?.sections;
}

export function getPage(doc: SiteDocument, id: string): Page | undefined {
  return Object.hasOwn(doc.pages, id) ? doc.pages[id as Page["id"]] : undefined;
}

export interface SectionLoc {
  section: Section;
  index: number;
}

export function findSection(
  doc: SiteDocument,
  container: ContainerId,
  sectionId: string,
): SectionLoc | undefined {
  const sections = sectionsOf(doc, container);
  if (!sections) return undefined;
  const index = sections.findIndex((s) => s.id === sectionId);
  if (index < 0) return undefined;
  return { section: sections[index] as Section, index };
}

export interface BlockLoc {
  section: Section;
  sectionIndex: number;
  block: Block;
  index: number;
}

export function findBlock(
  doc: SiteDocument,
  container: ContainerId,
  blockId: string,
): BlockLoc | undefined {
  const sections = sectionsOf(doc, container);
  if (!sections) return undefined;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i] as Section;
    const index = section.blocks.findIndex((b) => b.id === blockId);
    if (index >= 0)
      return { section, sectionIndex: i, block: section.blocks[index] as Block, index };
  }
  return undefined;
}

/** Where a section lives anywhere in the document. */
export function locateSection(
  doc: SiteDocument,
  sectionId: string,
): { container: ContainerId; index: number; section: Section } | undefined {
  if (doc.site.footer.id === sectionId)
    return { container: FOOTER, index: 0, section: doc.site.footer };
  for (const page of Object.values(doc.pages)) {
    const index = page.sections.findIndex((s) => s.id === sectionId);
    if (index >= 0) return { container: page.id, index, section: page.sections[index] as Section };
  }
  return undefined;
}

/** Where a block lives anywhere in the document. */
export function locateBlock(
  doc: SiteDocument,
  blockId: string,
): ({ container: ContainerId } & BlockLoc) | undefined {
  const inFooter = findBlock(doc, FOOTER, blockId);
  if (inFooter) return { container: FOOTER, ...inFooter };
  for (const page of Object.values(doc.pages)) {
    const loc = findBlock(doc, page.id, blockId);
    if (loc) return { container: page.id, ...loc };
  }
  return undefined;
}

/** Every section and block id in the document (pages + footer), mapped to its container. */
export function indexIds(doc: SiteDocument): {
  sections: Map<string, ContainerId>;
  blocks: Map<string, ContainerId>;
} {
  const sections = new Map<string, ContainerId>();
  const blocks = new Map<string, ContainerId>();
  const add = (container: ContainerId, s: Section) => {
    sections.set(s.id, container);
    for (const b of s.blocks) blocks.set(b.id, container);
  };
  add(FOOTER, doc.site.footer);
  for (const page of Object.values(doc.pages)) for (const s of page.sections) add(page.id, s);
  return { sections, blocks };
}

/** Resolve a position against a list of sibling ids. Throws `OpError` if out of range. */
export function resolvePosition(
  ids: readonly string[],
  at: Position,
  path: (string | number)[],
): number {
  if (typeof at === "number") {
    if (at > ids.length)
      throw new OpError(`Position ${at} is out of range (0–${ids.length})`, [...path, "at"]);
    return at;
  }
  if (at === "start") return 0;
  if (at === "end") return ids.length;
  const anchor = "before" in at ? at.before : at.after;
  const i = ids.indexOf(anchor);
  if (i < 0) throw new OpError(`Position anchor ${anchor} is not a sibling here`, [...path, "at"]);
  return "before" in at ? i : i + 1;
}

// --- grid helpers ---------------------------------------------------------------------------

/** The placement that applies at a breakpoint (tablet inherits desktop; mobile is independent). */
export function effectiveRect(item: GridItem, bp: Breakpoint): GridRect | undefined {
  if (bp === "t") return item.t ?? item.d;
  return item[bp];
}

/** The last row used by any placement at a breakpoint (0 when empty). */
export function usedRows(layout: GridLayout, bp: Breakpoint): number {
  let max = 0;
  for (const item of Object.values(layout.items)) {
    const r = effectiveRect(item, bp);
    if (r) max = Math.max(max, r.y + r.h - 1);
  }
  return max;
}

/** Raise `rows` (mutably) wherever a placement extends past the last row. Never shrinks. */
export function raiseRows(layout: GridLayout): void {
  for (const bp of ["d", "t", "m"] as const) {
    const need = usedRows(layout, bp);
    if (need > resolve(layout.rows, bp)) layout.rows[bp] = need;
  }
}

export const AUTO_PLACE = { w: 12, h: 4 } as const;

/** A placement below everything else: desktop always, mobile when other items have one. */
export function autoPlace(layout: GridLayout): GridItem {
  const item: GridItem = {
    d: {
      x: 1,
      y: usedRows(layout, "d") + 1,
      w: Math.min(AUTO_PLACE.w, GRID_COLUMNS.d),
      h: AUTO_PLACE.h,
    },
  };
  if (Object.values(layout.items).some((i) => i.m !== undefined)) {
    item.m = { x: 1, y: usedRows(layout, "m") + 1, w: GRID_COLUMNS.m, h: AUTO_PLACE.h };
  }
  return item;
}

export function copyRows(rows: Rows): Rows {
  const out: Rows = { d: rows.d };
  if (rows.t !== undefined) out.t = rows.t;
  if (rows.m !== undefined) out.m = rows.m;
  return out;
}
