import { autoMobileLayout } from "@openspace/lint";
import type { ContainerId, OpBody } from "@openspace/ops";
import {
  type Block,
  fallbackMobileRects,
  type GridItem,
  type GridLayout,
  type GridRect,
  type SiteDocument,
} from "@openspace/schema";
import { type Command, cloneBlock, OpBuilder } from "../model/actions";
import { locate, type SelItem } from "../model/selection";
import {
  clampRect,
  columnsFor,
  displayRects,
  domOrder,
  type GridBp,
  type GridSection,
  isGridSection,
  isMobileAuto,
  rowsNeeded,
  sameRect,
  type ZAction,
  zOrderPlan,
} from "./model";

/**
 * Grid commands. Each returns one `Command` (one undo step) made of `grid.place` /
 * `block.insert` / `section.update` ops, built on a scratch copy so later ops see earlier ones.
 */

export interface GridEdit {
  id: string;
  rect: GridRect;
}

interface Located {
  container: ContainerId;
  section: GridSection;
}

function gridSectionOf(doc: SiteDocument, pageId: string, item: SelItem): Located | undefined {
  const loc = locate(doc, pageId, item);
  if (!loc || !isGridSection(loc.section)) return undefined;
  return { container: loc.container, section: loc.section };
}

const sectionNow = (b: OpBuilder, pageId: string, sectionId: string) =>
  gridSectionOf(b.doc, pageId, { kind: "section", id: sectionId })?.section;

const place = (
  container: ContainerId,
  section: string,
  block: string,
  bp: GridBp,
  rect: GridRect | null,
): OpBody => ({ op: "grid.place", page: container, section, block, bp, rect }) as unknown as OpBody;

/**
 * Before a phone edit: store the placements the canvas shows for items that have no `m` rect
 * yet (the renderer's fallback), so editing one item never makes the others jump.
 */
function materializeMobile(b: OpBuilder, loc: Located, except: ReadonlySet<string>) {
  const layout = loc.section.layout;
  if (Object.values(layout.items).every((i) => i.m)) return;
  const fallback = fallbackMobileRects(layout);
  for (const [id, item] of Object.entries(layout.items)) {
    const r = fallback[id];
    if (item.m || except.has(id) || !r) continue;
    b.push(place(loc.container, loc.section.id, id, "m", r));
  }
}

/** After a desktop edit: regenerate the phone layout while it is still automatic. */
function regenerateMobile(b: OpBuilder, pageId: string, loc: Located, wasAuto: boolean) {
  if (!wasAuto) return;
  const after = sectionNow(b, pageId, loc.section.id);
  if (!after) return;
  const auto = autoMobileLayout(after, { reset: true });
  if (!auto) return;
  for (const [id, item] of Object.entries(auto)) {
    if (!item.m) continue;
    const before = after.layout.items[id as keyof GridLayout["items"]]?.m;
    if (!sameRect(before, item.m)) b.push(place(loc.container, after.id, id, "m", item.m));
  }
}

/** Write new placements at `bp` for blocks of one grid section (move, resize, nudge). */
export function placeCommand(
  doc: SiteDocument,
  pageId: string,
  sectionId: string,
  edits: readonly GridEdit[],
  bp: GridBp,
  label = "Move on grid",
): Command | null {
  const loc = gridSectionOf(doc, pageId, { kind: "section", id: sectionId });
  if (!loc || !edits.length) return null;
  const layout = loc.section.layout;
  const cols = columnsFor(bp);
  const b = new OpBuilder(doc);
  const wasAuto = bp === "d" && isMobileAuto(loc.section);
  if (bp === "m") materializeMobile(b, loc, new Set(edits.map((e) => e.id)));
  for (const e of edits) {
    if (!layout.items[e.id as keyof GridLayout["items"]]) continue;
    const rect = clampRect(e.rect, cols);
    const stored = layout.items[e.id as keyof GridLayout["items"]]?.[bp];
    if (sameRect(stored, rect)) continue;
    b.push(place(loc.container, sectionId, e.id, bp, rect));
  }
  if (!b.bodies.length) return null;
  if (bp === "d") regenerateMobile(b, pageId, loc, wasAuto);
  return {
    bodies: b.bodies,
    label,
    select: edits.map((e) => ({ kind: "block", id: e.id })),
  };
}

/**
 * ⌥-drag: copies of the blocks at the dropped placements; the originals stay put. Copies get
 * fresh ids (and fresh form ids) and inherit the original's other breakpoints.
 */
export function duplicateCommand(
  doc: SiteDocument,
  pageId: string,
  sectionId: string,
  edits: readonly GridEdit[],
  bp: GridBp,
): Command | null {
  const loc = gridSectionOf(doc, pageId, { kind: "section", id: sectionId });
  if (!loc || !edits.length) return null;
  const layout = loc.section.layout;
  const wasAuto = isMobileAuto(loc.section);
  const b = new OpBuilder(doc);
  if (bp === "m") materializeMobile(b, loc, new Set());
  const cols = columnsFor(bp);
  const copies: string[] = [];
  let mobileBottom = rowsNeeded(displayRects(layout, "m").values());
  for (const e of edits) {
    const block = loc.section.blocks.find((x) => x.id === e.id);
    const item = layout.items[e.id as keyof GridLayout["items"]];
    if (!block || !item) continue;
    const copy: Block = cloneBlock(block);
    const rect = clampRect(e.rect, cols);
    const next: GridItem = structuredClone(item);
    next[bp] = rect;
    if (bp !== "m" && !wasAuto && next.m) {
      // A hand-made phone layout gets the copy below everything.
      next.m = { ...next.m, y: mobileBottom + 2 };
      mobileBottom = next.m.y + next.m.h - 1;
    }
    if (bp === "d" && wasAuto) delete next.m;
    b.push({
      op: "block.insert",
      page: loc.container,
      section: sectionId,
      at: { after: e.id },
      block: copy,
      place: next,
    } as unknown as OpBody);
    copies.push(copy.id);
  }
  if (!copies.length) return null;
  if (bp === "d") regenerateMobile(b, pageId, loc, wasAuto);
  return {
    bodies: b.bodies,
    label: copies.length > 1 ? "Duplicate blocks" : "Duplicate block",
    select: copies.map((id) => ({ kind: "block", id })),
  };
}

/** Selected grid blocks that share one grid section (the first one's). */
export function gridSelection(
  doc: SiteDocument,
  pageId: string,
  selection: readonly SelItem[],
): { container: ContainerId; section: GridSection; ids: string[] } | null {
  let found: Located | undefined;
  const ids: string[] = [];
  for (const item of selection) {
    if (item.kind !== "block") continue;
    const loc = gridSectionOf(doc, pageId, item);
    if (!loc) continue;
    if (found && loc.section.id !== found.section.id) continue;
    found = loc;
    ids.push(item.id);
  }
  return found && ids.length ? { ...found, ids } : null;
}

/** Arrow-key nudge: move the selected grid blocks by whole cells, clamped to the grid. */
export function nudgeCommand(
  doc: SiteDocument,
  pageId: string,
  selection: readonly SelItem[],
  dc: number,
  dr: number,
  bp: GridBp,
): Command | null {
  const sel = gridSelection(doc, pageId, selection);
  if (!sel) return null;
  const rects = displayRects(sel.section.layout, bp);
  const moving = sel.ids.map((id) => rects.get(id)).filter((r): r is GridRect => Boolean(r));
  if (!moving.length) return null;
  const cols = columnsFor(bp);
  const minX = Math.min(...moving.map((r) => r.x));
  const maxRight = Math.max(...moving.map((r) => r.x + r.w - 1));
  const minY = Math.min(...moving.map((r) => r.y));
  const cdc = Math.min(Math.max(dc, 1 - minX), cols - maxRight);
  const cdr = Math.max(dr, 1 - minY);
  if (!cdc && !cdr) return null;
  const edits = sel.ids.flatMap((id) => {
    const r = rects.get(id);
    if (!r) return [];
    const next: GridRect = { ...r, x: r.x + cdc, y: r.y + cdr };
    if (cdc) delete next.bleed;
    return [{ id, rect: next }];
  });
  return placeCommand(doc, pageId, sel.section.id, edits, bp, "Nudge");
}

/** Bring forward / send backward / to front / to back (⌘] ⌘[ ⌥⌘] ⌥⌘[). */
export function zOrderCommand(
  doc: SiteDocument,
  pageId: string,
  selection: readonly SelItem[],
  action: ZAction,
  bp: GridBp,
): Command | null {
  const sel = gridSelection(doc, pageId, selection);
  if (!sel) return null;
  let rects = new Map(displayRects(sel.section.layout, bp));
  const dom = domOrder(sel.section);
  // Several selected: apply in an order that keeps their relative stacking.
  const ids = [...sel.ids];
  const order = dom.filter((id) => ids.includes(id));
  if (action === "forward" || action === "front") order.reverse();
  const changes = new Map<string, number>();
  for (const id of order) {
    const plan = zOrderPlan(rects, dom, id, action);
    for (const [k, z] of plan) {
      changes.set(k, z);
      const r = rects.get(k);
      if (r) rects.set(k, { ...r, z });
    }
    rects = new Map(rects);
  }
  if (!changes.size) return null;
  const labels: Record<ZAction, string> = {
    forward: "Bring forward",
    backward: "Send backward",
    front: "Bring to front",
    back: "Send to back",
  };
  const edits = [...changes.keys()].map((id) => ({ id, rect: rects.get(id) as GridRect }));
  const cmd = placeCommand(doc, pageId, sel.section.id, edits, bp, labels[action]);
  return cmd ? { ...cmd, select: sel.ids.map((id) => ({ kind: "block", id })) } : null;
}

/** Throw away the phone layout and regenerate it from desktop (`autoMobileLayout`). */
export function resetMobileCommand(
  doc: SiteDocument,
  pageId: string,
  sectionId: string,
): Command | null {
  const loc = gridSectionOf(doc, pageId, { kind: "section", id: sectionId });
  if (!loc) return null;
  const auto = autoMobileLayout(loc.section, { reset: true });
  if (!auto) return null;
  const b = new OpBuilder(doc);
  for (const [id, item] of Object.entries(auto)) {
    const before = loc.section.layout.items[id as keyof GridLayout["items"]]?.m;
    if (item.m && !sameRect(before, item.m))
      b.push(place(loc.container, sectionId, id, "m", item.m));
  }
  const after = sectionNow(b, pageId, sectionId);
  if (after) {
    const need = rowsNeeded(displayRects(after.layout, "m").values());
    if (after.layout.rows.m !== undefined && after.layout.rows.m !== need)
      b.push(rowsPatch(loc.container, sectionId, { ...after.layout.rows, m: need }));
  }
  if (!b.bodies.length) return null;
  return { bodies: b.bodies, label: "Reset mobile layout" };
}

const rowsPatch = (container: ContainerId, section: string, rows: GridLayout["rows"]): OpBody =>
  ({
    op: "section.update",
    page: container,
    section,
    set: { "layout.rows": rows },
  }) as unknown as OpBody;

/**
 * "Customize tablet": on copies every desktop placement to `t` so the tablet layout can be
 * edited on its own; off removes the `t` placements so tablet follows desktop again.
 */
export function customizeTabletCommand(
  doc: SiteDocument,
  pageId: string,
  sectionId: string,
  on: boolean,
): Command | null {
  const loc = gridSectionOf(doc, pageId, { kind: "section", id: sectionId });
  if (!loc) return null;
  const b = new OpBuilder(doc);
  for (const [id, item] of Object.entries(loc.section.layout.items)) {
    if (on && !item.t) b.push(place(loc.container, sectionId, id, "t", item.d));
    if (!on && item.t) b.push(place(loc.container, sectionId, id, "t", null));
  }
  if (!on && loc.section.layout.rows.t !== undefined) {
    b.push({
      op: "section.update",
      page: loc.container,
      section: sectionId,
      unset: ["layout.rows.t"],
    } as unknown as OpBody);
  }
  if (!b.bodies.length) return null;
  return {
    bodies: b.bodies,
    label: on ? "Customize tablet" : "Tablet follows desktop",
  };
}

/** Remove empty rows below the last block at every breakpoint. */
export function trimRowsCommand(
  doc: SiteDocument,
  pageId: string,
  sectionId: string,
): Command | null {
  const loc = gridSectionOf(doc, pageId, { kind: "section", id: sectionId });
  if (!loc) return null;
  const layout = loc.section.layout;
  const rows = layout.rows;
  const next: GridLayout["rows"] = { d: rowsNeeded(displayRects(layout, "d").values()) };
  if (rows.t !== undefined) next.t = rowsNeeded(displayRects(layout, "t").values());
  if (rows.m !== undefined) next.m = rowsNeeded(displayRects(layout, "m").values());
  if (next.d === rows.d && next.t === rows.t && next.m === rows.m) return null;
  return {
    bodies: [rowsPatch(loc.container, sectionId, next)],
    label: "Trim empty rows",
  };
}

/** Empty trailing rows at `bp` (for the "Trim" affordance). */
export function emptyTrailingRows(layout: GridLayout, bp: GridBp): number {
  const rows =
    bp === "d"
      ? layout.rows.d
      : bp === "t"
        ? (layout.rows.t ?? layout.rows.d)
        : (layout.rows.m ?? layout.rows.t ?? layout.rows.d);
  return Math.max(0, rows - rowsNeeded(displayRects(layout, bp).values()));
}

/**
 * Phones' simplified reorder view: restack the phone layout in `order`, keeping each block's
 * width and height and leaving a one-row gap.
 */
export function mobileReorderCommand(
  doc: SiteDocument,
  pageId: string,
  sectionId: string,
  order: readonly string[],
): Command | null {
  const loc = gridSectionOf(doc, pageId, { kind: "section", id: sectionId });
  if (!loc) return null;
  const rects = displayRects(loc.section.layout, "m");
  let y = 1;
  const edits: GridEdit[] = [];
  for (const id of order) {
    const r = rects.get(id);
    if (!r) continue;
    edits.push({ id, rect: { ...r, y } });
    y += r.h + 1;
  }
  const cmd = placeCommand(doc, pageId, sectionId, edits, "m", "Reorder on phones");
  return cmd ? { ...cmd, select: undefined } : null;
}

/** Blocks in phone order (top to bottom, then left to right on the phone grid). */
export function mobileOrder(section: GridSection): string[] {
  const rects = displayRects(section.layout, "m");
  return [...rects.entries()].sort(([, a], [, b]) => a.y - b.y || a.x - b.x).map(([id]) => id);
}
