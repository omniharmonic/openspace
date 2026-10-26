import {
  apply,
  type ContainerId,
  FOOTER,
  type Op,
  type OpBody,
  type Position,
  stamp,
} from "@openspace/ops";
import {
  type Block,
  type ColorTheme,
  type GridItem,
  type GridLayout,
  newId,
  type Section,
  type SiteDocument,
  type StackLayout,
} from "@openspace/schema";
import { canvasSections, locate, readingOrder, type SelItem } from "./selection";

/**
 * Op builders for editor commands. Each builder works on a scratch copy of the document,
 * applying every op as it emits it, so later ops in the same command see earlier ones
 * (e.g. deleting two blocks, or moving a block past another selected one).
 */
export class OpBuilder {
  readonly bodies: OpBody[] = [];
  constructor(public doc: SiteDocument) {}
  push(body: OpBody): this {
    this.doc = apply(
      this.doc,
      stamp(body as OpBody<Op>, { id: "scratch", actor: "scratch", ts: 0 }),
    );
    this.bodies.push(body);
    return this;
  }
}

export interface Command {
  bodies: OpBody[];
  /** Selection to show once the command has been applied. */
  select?: SelItem[];
  label: string;
}

// --- cloning with fresh ids ------------------------------------------------------------------

/** Replace any form id (`frm_…`) inside a block's fields so copies never share an inbox. */
function freshFormIds(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(freshFormIds);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] =
        k === "id" && typeof v === "string" && v.startsWith("frm_")
          ? newId("frm")
          : freshFormIds(v);
    }
    return out;
  }
  return value;
}

export function cloneBlock(block: Block): Block {
  const copy = structuredClone(block);
  copy.id = newId("blk");
  copy.fields = freshFormIds(copy.fields) as Block["fields"];
  return copy;
}

export function cloneSection(section: Section): Section {
  const copy = structuredClone(section);
  copy.id = newId("sec");
  delete copy.anchor;
  const map = new Map<string, string>();
  copy.blocks = copy.blocks.map((b) => {
    const c = cloneBlock(b);
    map.set(b.id, c.id);
    return c;
  });
  if (copy.layout.mode === "grid") {
    const items: GridLayout["items"] = {};
    for (const [id, item] of Object.entries(copy.layout.items)) {
      const to = map.get(id);
      if (to) items[to as keyof GridLayout["items"]] = item;
    }
    copy.layout.items = items;
  }
  return copy;
}

// --- helpers ---------------------------------------------------------------------------------

const isBlock = (i: SelItem) => i.kind === "block";

function stackColumns(section: Section): number {
  return section.layout.mode === "stack" ? section.layout.columns.d.length : 1;
}

/** Grid placement shifted down by its own height (duplicates appear just below the original). */
function shiftedItem(item: GridItem): GridItem {
  const out: GridItem = { d: { ...item.d, y: item.d.y + item.d.h } };
  if (item.t) out.t = { ...item.t, y: item.t.y + item.t.h };
  if (item.m) out.m = { ...item.m, y: item.m.y + item.m.h };
  return out;
}

/** Insert body for a block copy into `section`, keeping placement/column sensible. */
function insertBlockBody(
  container: ContainerId,
  section: Section,
  block: Block,
  at: Position,
  place?: GridItem,
): OpBody {
  const b = structuredClone(block);
  if (section.layout.mode === "stack") {
    const cols = stackColumns(section);
    if (b.column !== undefined && b.column >= cols) b.column = cols - 1;
    if (b.column === 0) delete b.column;
  } else {
    delete b.column;
  }
  return {
    op: "block.insert",
    page: container,
    section: section.id,
    at,
    block: b,
    ...(section.layout.mode === "grid" && place ? { place } : {}),
  } as OpBody;
}

// --- commands --------------------------------------------------------------------------------

export function deleteItems(doc: SiteDocument, pageId: string, items: SelItem[]): Command | null {
  const b = new OpBuilder(doc);
  let next: SelItem | undefined;
  const ordered = [...items.filter(isBlock), ...items.filter((i) => !isBlock(i))];
  for (const item of ordered) {
    const loc = locate(b.doc, pageId, item);
    if (!loc) continue;
    if (item.kind === "block") {
      next ??= { kind: "section", id: loc.section.id };
      b.push({ op: "block.delete", page: loc.container, block: item.id } as OpBody);
    } else if (loc.container !== FOOTER) {
      b.push({ op: "section.delete", page: pageId, section: item.id } as OpBody);
      next = undefined;
    }
  }
  if (!b.bodies.length) return null;
  const n = b.bodies.length;
  return {
    bodies: b.bodies,
    select: next && locate(b.doc, pageId, next) ? [next] : [],
    label: n > 1 ? `Delete ${n} items` : "Delete",
  };
}

export function duplicateItems(
  doc: SiteDocument,
  pageId: string,
  items: SelItem[],
): Command | null {
  const b = new OpBuilder(doc);
  const select: SelItem[] = [];
  for (const item of items) {
    const loc = locate(b.doc, pageId, item);
    if (!loc) continue;
    if (item.kind === "block" && loc.block) {
      const copy = cloneBlock(loc.block);
      const place =
        loc.section.layout.mode === "grid"
          ? (() => {
              const it = (loc.section.layout as GridLayout).items[loc.block.id as never];
              return it ? shiftedItem(it) : undefined;
            })()
          : undefined;
      b.push(insertBlockBody(loc.container, loc.section, copy, { after: loc.block.id }, place));
      select.push({ kind: "block", id: copy.id });
    } else if (item.kind === "section" && loc.container !== FOOTER) {
      const copy = cloneSection(loc.section);
      b.push({
        op: "section.insert",
        page: pageId,
        at: { after: item.id },
        section: copy,
      } as OpBody);
      select.push({ kind: "section", id: copy.id });
    }
  }
  if (!b.bodies.length) return null;
  return { bodies: b.bodies, select, label: "Duplicate" };
}

/** ⌥↑ / ⌥↓: move blocks within their column (crossing into the next section at the edge), or sections within the page. */
export function moveItems(
  doc: SiteDocument,
  pageId: string,
  items: SelItem[],
  dir: -1 | 1,
): Command | null {
  const b = new OpBuilder(doc);
  // Move the leading item first so selected neighbours don't leapfrog each other.
  const index = (i: SelItem) => {
    const loc = locate(doc, pageId, i);
    return loc ? loc.sectionIndex * 1000 + (loc.blockIndex ?? 0) : 0;
  };
  const ordered = [...items].sort((x, y) => (index(x) - index(y)) * -dir);
  for (const item of ordered) {
    const loc = locate(b.doc, pageId, item);
    if (!loc) continue;
    if (item.kind === "section") {
      if (loc.container === FOOTER) continue;
      const sections = canvasSections(b.doc, pageId).slice(0, -1);
      const neighbour = sections[loc.sectionIndex + dir];
      if (!neighbour) continue;
      b.push({
        op: "section.move",
        page: pageId,
        section: item.id,
        at: dir === -1 ? { before: neighbour.id } : { after: neighbour.id },
      } as OpBody);
      continue;
    }
    const block = loc.block as Block;
    const column = block.column ?? 0;
    const peers =
      loc.section.layout.mode === "stack"
        ? loc.section.blocks.filter((x) => (x.column ?? 0) === column)
        : loc.section.blocks;
    const pi = peers.findIndex((x) => x.id === block.id);
    const neighbour = peers[pi + dir];
    if (neighbour) {
      b.push({
        op: "block.move",
        page: loc.container,
        block: block.id,
        to: {
          section: loc.section.id,
          at: dir === -1 ? { before: neighbour.id } : { after: neighbour.id },
        },
      } as OpBody);
      continue;
    }
    // At the edge of the section: hop into the neighbouring section (same page only).
    if (loc.container === FOOTER) continue;
    const sections = canvasSections(b.doc, pageId).slice(0, -1);
    const target = sections[loc.sectionIndex + dir];
    if (!target) continue;
    const cols = stackColumns(target);
    const to: Record<string, unknown> = { section: target.id, at: dir === -1 ? "end" : "start" };
    if (target.layout.mode === "stack") to.column = Math.min(column, cols - 1) || null;
    b.push({ op: "block.move", page: loc.container, block: block.id, to } as OpBody);
  }
  if (!b.bodies.length) return null;
  return { bodies: b.bodies, select: items, label: dir === -1 ? "Move up" : "Move down" };
}

/** Insert blocks/sections from the clipboard next to the current selection. */
export function pasteItems(
  doc: SiteDocument,
  pageId: string,
  selection: SelItem[],
  clip: ClipPayload,
): Command | null {
  const b = new OpBuilder(doc);
  const select: SelItem[] = [];
  const anchor = selection[selection.length - 1];
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  if (!page) return null;

  const sections = clip.items.filter((i) => i.kind === "section").map((i) => i.data as Section);
  const blocks = clip.items.filter((i) => i.kind === "block").map((i) => i.data as Block);

  if (sections.length) {
    // After the selected section (or the section holding the selected block), else at the end.
    const anchorLoc = anchor ? locate(b.doc, pageId, anchor) : undefined;
    let at: Position =
      anchorLoc && anchorLoc.container !== FOOTER ? { after: anchorLoc.section.id } : "end";
    for (const s of sections) {
      const copy = cloneSection(s);
      b.push({ op: "section.insert", page: pageId, at, section: copy } as OpBody);
      at = { after: copy.id };
      select.push({ kind: "section", id: copy.id });
    }
  }
  if (blocks.length) {
    const anchorLoc = anchor ? locate(b.doc, pageId, anchor) : undefined;
    let container: ContainerId;
    let section: Section | undefined;
    let at: Position = "end";
    let column: number | undefined;
    if (anchorLoc?.block) {
      container = anchorLoc.container;
      section = anchorLoc.section;
      at = { after: anchorLoc.block.id };
      column = anchorLoc.block.column;
    } else if (anchorLoc) {
      container = anchorLoc.container;
      section = anchorLoc.section;
    } else {
      container = pageId as ContainerId;
      section = b.doc.pages[pageId as keyof SiteDocument["pages"]]?.sections.at(-1);
    }
    if (!section) return b.bodies.length ? { bodies: b.bodies, select, label: "Paste" } : null;
    for (const blk of blocks) {
      const copy = cloneBlock(blk);
      if (column !== undefined) copy.column = column;
      else delete copy.column;
      const fresh = locate(b.doc, pageId, { kind: "section", id: section.id })?.section ?? section;
      b.push(insertBlockBody(container, fresh, copy, at));
      at = { after: copy.id };
      select.push({ kind: "block", id: copy.id });
    }
  }
  if (!b.bodies.length) return null;
  return { bodies: b.bodies, select, label: "Paste" };
}

export function sectionPatch(
  doc: SiteDocument,
  pageId: string,
  sectionId: string,
  patch: { set?: Record<string, unknown>; unset?: string[] },
  label: string,
): Command | null {
  const loc = locate(doc, pageId, { kind: "section", id: sectionId });
  if (!loc) return null;
  return {
    bodies: [{ op: "section.update", page: loc.container, section: sectionId, ...patch } as OpBody],
    label,
  };
}

export const toggleHidden = (doc: SiteDocument, pageId: string, s: Section) =>
  sectionPatch(
    doc,
    pageId,
    s.id,
    s.hidden ? { unset: ["hidden"] } : { set: { hidden: true } },
    s.hidden ? "Show section" : "Hide section",
  );

export const toggleLocked = (doc: SiteDocument, pageId: string, s: Section) =>
  sectionPatch(
    doc,
    pageId,
    s.id,
    s.locked ? { unset: ["locked"] } : { set: { locked: true } },
    s.locked ? "Unlock section" : "Lock section",
  );

export const renameSection = (doc: SiteDocument, pageId: string, s: Section, label: string) => {
  const name = label.trim().slice(0, 80);
  return sectionPatch(
    doc,
    pageId,
    s.id,
    name ? { set: { label: name } } : { unset: ["label"] },
    "Rename section",
  );
};

export const setSectionTheme = (doc: SiteDocument, pageId: string, s: Section, theme: ColorTheme) =>
  sectionPatch(doc, pageId, s.id, { set: { "style.colorTheme": theme } }, "Change color theme");

/** Rows per pixel for converting measured heights into grid rows (desktop row unit = 1.5rem). */
const ROW_PX = 24;

/**
 * Switch a section between stack and grid. Stack → grid lays each column out as a vertical run
 * on the 24-column grid (heights from `measure`, in CSS px, when available) with a full-width
 * mobile stack in reading order; grid → stack puts the blocks in one column in reading order.
 */
export function setLayoutMode(
  doc: SiteDocument,
  pageId: string,
  sectionId: string,
  mode: "stack" | "grid",
  measure?: (blockId: string) => number | undefined,
): Command | null {
  const loc = locate(doc, pageId, { kind: "section", id: sectionId });
  if (!loc || loc.section.layout.mode === mode) return null;
  const section = loc.section;
  const b = new OpBuilder(doc);
  const rowsFor = (id: string) => Math.max(2, Math.ceil((measure?.(id) ?? 4 * ROW_PX) / ROW_PX));
  if (mode === "grid") {
    const layout = section.layout as StackLayout;
    const spans = layout.columns.d;
    const items: GridLayout["items"] = {};
    const colY = spans.map(() => 1);
    let my = 1;
    let maxY = 1;
    for (const blk of readingOrder(section)) {
      const c = Math.min(blk.column ?? 0, spans.length - 1);
      const x = 1 + 2 * spans.slice(0, c).reduce((a, n) => a + n, 0);
      const w = 2 * (spans[c] ?? 12);
      const h = rowsFor(blk.id);
      const y = colY[c] ?? 1;
      items[blk.id as keyof GridLayout["items"]] = {
        d: { x, y, w, h },
        m: { x: 1, y: my, w: 8, h },
      };
      colY[c] = y + h;
      my += h;
      maxY = Math.max(maxY, y + h - 1);
    }
    b.push({
      op: "section.update",
      page: loc.container,
      section: sectionId,
      set: {
        layout: {
          mode: "grid",
          rows: { d: Math.max(maxY, 1), m: Math.max(my - 1, 1) },
          items,
          ...(layout.width ? { width: layout.width } : {}),
        },
      },
    } as OpBody);
    for (const blk of section.blocks)
      if (blk.column !== undefined)
        b.push({ op: "block.update", page: loc.container, block: blk.id, column: null } as OpBody);
  } else {
    const layout = section.layout as GridLayout;
    for (const blk of section.blocks)
      if (blk.column !== undefined)
        b.push({ op: "block.update", page: loc.container, block: blk.id, column: null } as OpBody);
    b.push({
      op: "section.update",
      page: loc.container,
      section: sectionId,
      set: {
        layout: {
          mode: "stack",
          columns: { d: [12] },
          ...(layout.width ? { width: layout.width } : {}),
        },
      },
    } as OpBody);
    // Keep the grid's visual reading order as the stack order.
    let prev: string | undefined;
    for (const blk of readingOrder(section)) {
      b.push({
        op: "block.move",
        page: loc.container,
        block: blk.id,
        to: { section: sectionId, at: prev ? { after: prev } : "start" },
      } as OpBody);
      prev = blk.id;
    }
  }
  return {
    bodies: b.bodies,
    select: [{ kind: "section", id: sectionId }],
    label: mode === "grid" ? "Switch to grid" : "Switch to stack",
  };
}

export function insertSection(pageId: string, section: Section, at: Position): Command {
  return {
    bodies: [{ op: "section.insert", page: pageId, at, section } as OpBody],
    select: [{ kind: "section", id: section.id }],
    label: "Add section",
  };
}

/** Reorder from the layers panel: a block dropped before/after another block or into a section. */
export function moveBlockTo(
  doc: SiteDocument,
  pageId: string,
  blockId: string,
  target: { section: string; at: Position },
): Command | null {
  const loc = locate(doc, pageId, { kind: "block", id: blockId });
  const dest = locate(doc, pageId, { kind: "section", id: target.section });
  if (!loc || !dest || loc.container !== dest.container) return null;
  const to: Record<string, unknown> = { section: target.section, at: target.at };
  if (dest.section.layout.mode === "stack" && dest.section.id !== loc.section.id) {
    const anchorId =
      typeof target.at === "object"
        ? "before" in target.at
          ? target.at.before
          : target.at.after
        : undefined;
    const anchor = anchorId ? dest.section.blocks.find((x) => x.id === anchorId) : undefined;
    to.column = anchor?.column ?? null;
  }
  if (dest.section.layout.mode === "stack" && dest.section.id === loc.section.id) {
    const anchorId =
      typeof target.at === "object"
        ? "before" in target.at
          ? target.at.before
          : target.at.after
        : undefined;
    const anchor = anchorId ? dest.section.blocks.find((x) => x.id === anchorId) : undefined;
    if (anchor && (anchor.column ?? 0) !== (loc.block?.column ?? 0))
      to.column = anchor.column ?? null;
  }
  return {
    bodies: [{ op: "block.move", page: loc.container, block: blockId, to } as OpBody],
    select: [{ kind: "block", id: blockId }],
    label: "Move block",
  };
}

export function moveSectionTo(pageId: string, sectionId: string, at: Position): Command {
  return {
    bodies: [{ op: "section.move", page: pageId, section: sectionId, at } as OpBody],
    select: [{ kind: "section", id: sectionId }],
    label: "Move section",
  };
}

// --- clipboard -------------------------------------------------------------------------------

export const CLIP_KIND = "openspace/clipboard@1";

export interface ClipPayload {
  kind: typeof CLIP_KIND;
  items: Array<{ kind: "section"; data: Section } | { kind: "block"; data: Block }>;
}

export function copyItems(doc: SiteDocument, pageId: string, items: SelItem[]): ClipPayload | null {
  const out: ClipPayload["items"] = [];
  for (const item of items) {
    const loc = locate(doc, pageId, item);
    if (!loc) continue;
    if (item.kind === "block" && loc.block)
      out.push({ kind: "block", data: structuredClone(loc.block) });
    else if (item.kind === "section" && loc.container !== FOOTER)
      out.push({ kind: "section", data: structuredClone(loc.section) });
  }
  return out.length ? { kind: CLIP_KIND, items: out } : null;
}

export function parseClip(text: string | null | undefined): ClipPayload | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as ClipPayload;
    return v && v.kind === CLIP_KIND && Array.isArray(v.items) ? v : null;
  } catch {
    return null;
  }
}
