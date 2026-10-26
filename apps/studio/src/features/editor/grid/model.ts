import { autoMobileLayout, isTextBlock } from "@openspace/lint";
import {
  type Block,
  fallbackMobileRects,
  GRID_COLUMNS,
  type GridItem,
  type GridLayout,
  type GridRect,
  MAX_GRID_ROWS,
  pinnedRect,
  resolve,
  type Section,
} from "@openspace/schema";

/**
 * Pure grid-editing math (arch §3.3): breakpoints, effective placements, measured track
 * geometry, snapping, resizing, smart guides, overlap and stacking order. Everything here works
 * on plain numbers so it is unit-tested without a browser; the drag controller feeds it
 * measured canvas geometry.
 */

export type GridBp = "d" | "t" | "m";
export type GridSection = Section & { layout: GridLayout };
export type Device = "desktop" | "tablet" | "mobile";

export const isGridSection = (s: Section | undefined): s is GridSection =>
  s?.layout.mode === "grid";

/** Row unit (CSS px) per breakpoint, matching `os.css` (1.5rem from tablet up, 1.25rem phone). */
export const ROW_PX: Record<GridBp, number> = { d: 24, t: 24, m: 20 };

/** The breakpoint the canvas shows for a device preview. */
export const VIEW_BP: Record<Device, GridBp> = { desktop: "d", tablet: "t", mobile: "m" };

/** Has anyone customized the tablet layout (any item with its own `t` rect)? */
export const tabletCustomized = (layout: GridLayout) =>
  Object.values(layout.items).some((i) => Boolean(i.t));

/**
 * Which placement an edit at `device` writes: desktop writes `d`; tablet writes `t` only once
 * the tablet layout is customized (it inherits desktop otherwise); phone writes `m` only.
 */
export function editBp(device: Device, layout: GridLayout): GridBp {
  if (device === "mobile") return "m";
  if (device === "tablet" && tabletCustomized(layout)) return "t";
  return "d";
}

/** Explicit rows at `view` as the renderer counts them (phones include fallback rows). */
export function rowsAt(layout: GridLayout, view: GridBp): number {
  const rows = resolve(layout.rows, view);
  if (view !== "m") return rows;
  let out = rows;
  for (const r of Object.values(fallbackMobileRects(layout))) out = Math.max(out, r.y + r.h - 1);
  return out;
}

/**
 * Placements as the canvas draws them at `view`: tablet inherits desktop, phones fall back,
 * and pinned placements sit on the first/last row (`pinnedRect`).
 */
export function displayRects(layout: GridLayout, view: GridBp): Map<string, GridRect> {
  const out = new Map<string, GridRect>();
  const fallback = view === "m" ? fallbackMobileRects(layout) : {};
  const rows = rowsAt(layout, view);
  for (const [id, item] of Object.entries(layout.items)) {
    const r = view === "d" ? item.d : view === "t" ? (item.t ?? item.d) : (item.m ?? fallback[id]);
    if (r) out.set(id, pinnedRect(view === "m" ? clampRect(r, GRID_COLUMNS.m) : r, rows));
  }
  return out;
}

/** The section with every stored pinned placement moved to the row it is drawn on. */
export function resolvePins(section: GridSection): GridSection {
  const layout = section.layout;
  if (!Object.values(layout.items).some((i) => i.d.pin || i.t?.pin || i.m?.pin)) return section;
  const items: GridLayout["items"] = {};
  for (const [id, item] of Object.entries(layout.items)) {
    const next: GridItem = { d: pinnedRect(item.d, resolve(layout.rows, "d")) };
    if (item.t) next.t = pinnedRect(item.t, resolve(layout.rows, "t"));
    if (item.m) next.m = pinnedRect(item.m, rowsAt(layout, "m"));
    items[id as keyof GridLayout["items"]] = next;
  }
  return { ...section, layout: { ...layout, items } };
}

/** The current placement an edit at `bp` starts from (what the person sees). */
export function rectAt(layout: GridLayout, id: string, bp: GridBp): GridRect | undefined {
  return displayRects(layout, bp).get(id);
}

export const columnsFor = (bp: GridBp) => GRID_COLUMNS[bp];

export function clampRect(r: GridRect, cols: number): GridRect {
  const w = Math.min(Math.max(1, r.w), cols);
  const x = Math.min(Math.max(1, r.x), cols - w + 1);
  return x === r.x && w === r.w ? r : { ...r, x, w };
}

export const sameRect = (a: GridRect | undefined, b: GridRect | undefined) =>
  Boolean(a && b) &&
  a?.x === b?.x &&
  a?.y === b?.y &&
  a?.w === b?.w &&
  a?.h === b?.h &&
  (a?.z ?? undefined) === (b?.z ?? undefined) &&
  (a?.bleed ?? undefined) === (b?.bleed ?? undefined) &&
  (a?.pin ?? undefined) === (b?.pin ?? undefined);

/** Rows needed to hold every rect (as placed). */
export const rowsNeeded = (rects: Iterable<GridRect>) => {
  let rows = 1;
  for (const r of rects) rows = Math.max(rows, r.y + r.h - 1);
  return rows;
};

/**
 * Rows a section needs once empty rows are trimmed, given placements as drawn. Bottom-pinned
 * items move with the last row: one that sits below the content it shares columns with stays
 * below it; one layered over content (a caption pinned to a photo's foot) only needs its height.
 */
export function rowsToKeep(rects: ReadonlyMap<string, GridRect>): number {
  const free = [...rects.values()].filter((r) => r.pin !== "bottom");
  let need = rowsNeeded(free);
  for (const p of rects.values()) {
    if (p.pin !== "bottom") continue;
    const under = free.filter((r) => r.x < p.x + p.w && p.x < r.x + r.w);
    const above = under.length ? Math.max(...under.map((r) => r.y + r.h - 1)) : 0;
    need = Math.max(need, p.h, p.y > above ? above + p.h : 0);
  }
  return need;
}

/** Media and decoration may bleed to the viewport edge; text never does. */
export const canBleed = (block: Block | undefined) => Boolean(block && !isTextBlock(block));

/**
 * Is the phone layout still automatic? True when nothing has a stored `m` rect, or the stored
 * rects are exactly what `autoMobileLayout` generates from the desktop layout. Once someone
 * edits the phone layout (or a preset ships a hand-made one) it is kept as is.
 */
export function isMobileAuto(section: GridSection): boolean {
  const items = Object.values(section.layout.items);
  if (!items.some((i) => i.m)) return true;
  const auto = autoMobileLayout(resolvePins(section), { reset: true });
  if (!auto) return false;
  return Object.entries(section.layout.items).every(([id, item]) => sameRect(item.m, auto[id]?.m));
}

// --- measured geometry ---------------------------------------------------------------------

/**
 * Track geometry of one grid section, in page pixels (the canvas document's coordinates,
 * scroll included). Content columns are `1..cols`; `fullStart`/`fullEnd` are the bleed edges.
 */
export interface GridMetrics {
  cols: number;
  colStarts: number[];
  colEnds: number[];
  fullStart: number;
  fullEnd: number;
  /** Explicit row tracks (they can be taller than the unit when content grows them). */
  rowStarts: number[];
  rowEnds: number[];
  rowGap: number;
  /** Height of rows past the last explicit one. */
  rowUnit: number;
  top: number;
}

export interface TrackInput {
  left: number;
  top: number;
  width: number;
  cols: number;
  /** Every column track including the two gutters, in px (`getComputedStyle` resolves these). */
  columns: number[];
  columnGap: number;
  rows: number[];
  rowGap: number;
  rowUnit: number;
  /** Row count, used when `rows` couldn't be measured. */
  rowCount: number;
}

/** Parse a computed `grid-template-*` value ("12px 40px …") into track sizes. */
export function parseTracks(value: string | null | undefined): number[] {
  if (!value || value === "none") return [];
  return value
    .replace(/\[[^\]]*\]/g, " ")
    .trim()
    .split(/\s+/)
    .map((t) => Number.parseFloat(t))
    .filter((n) => Number.isFinite(n));
}

export function metricsFromTracks(t: TrackInput): GridMetrics {
  let columns = t.columns;
  if (columns.length !== t.cols + 2) {
    // Not laid out (or unexpected template): assume a small gutter and even columns.
    const gutter = Math.min(24, t.width * 0.05);
    const inner = Math.max(t.cols, t.width - 2 * gutter - (t.cols + 1) * t.columnGap);
    columns = [gutter, ...Array.from({ length: t.cols }, () => inner / t.cols), gutter];
  }
  const starts: number[] = [];
  const ends: number[] = [];
  let x = t.left;
  for (const w of columns) {
    starts.push(x);
    ends.push(x + w);
    x += w + t.columnGap;
  }
  const rows = t.rows.length ? t.rows : Array.from({ length: t.rowCount }, () => t.rowUnit);
  const rowStarts: number[] = [];
  const rowEnds: number[] = [];
  let y = t.top;
  for (const h of rows) {
    rowStarts.push(y);
    rowEnds.push(y + h);
    y += h + t.rowGap;
  }
  return {
    cols: t.cols,
    colStarts: starts.slice(1, -1),
    colEnds: ends.slice(1, -1),
    fullStart: t.left,
    fullEnd: ends[ends.length - 1] ?? t.left + t.width,
    rowStarts,
    rowEnds,
    rowGap: t.rowGap,
    rowUnit: t.rowUnit,
    top: t.top,
  };
}

/** Even metrics for tests and fallbacks. */
export function uniformMetrics(o: {
  cols: number;
  colWidth: number;
  gap?: number;
  gutter?: number;
  rows: number;
  rowUnit: number;
  left?: number;
  top?: number;
}): GridMetrics {
  const gap = o.gap ?? 0;
  const gutter = o.gutter ?? 0;
  return metricsFromTracks({
    left: o.left ?? 0,
    top: o.top ?? 0,
    width: 0,
    cols: o.cols,
    columns: [gutter, ...Array.from({ length: o.cols }, () => o.colWidth), gutter],
    columnGap: gap,
    rows: Array.from({ length: o.rows }, () => o.rowUnit),
    rowGap: 0,
    rowUnit: o.rowUnit,
    rowCount: o.rows,
  });
}

export const colStart = (m: GridMetrics, x: number) =>
  m.colStarts[Math.min(Math.max(x, 1), m.cols) - 1] as number;
export const colEnd = (m: GridMetrics, x: number) =>
  m.colEnds[Math.min(Math.max(x, 1), m.cols) - 1] as number;
/** Column pitch (one column plus its gap). */
export const pitch = (m: GridMetrics) =>
  m.cols > 1
    ? ((m.colStarts[m.cols - 1] as number) - (m.colStarts[0] as number)) / (m.cols - 1)
    : (m.colEnds[0] as number) - (m.colStarts[0] as number);

export function rowStart(m: GridMetrics, y: number): number {
  const n = m.rowStarts.length;
  if (y <= n) return m.rowStarts[Math.max(1, y) - 1] as number;
  const last = n ? (m.rowEnds[n - 1] as number) + m.rowGap : m.top;
  return last + (y - n - 1) * (m.rowUnit + m.rowGap);
}
export function rowEnd(m: GridMetrics, y: number): number {
  const n = m.rowStarts.length;
  if (y >= 1 && y <= n) return m.rowEnds[y - 1] as number;
  return rowStart(m, y) + m.rowUnit;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A placement's box in page pixels. */
export function rectBox(m: GridMetrics, r: GridRect): Box {
  const left = r.bleed === "left" || r.bleed === "both" ? m.fullStart : colStart(m, r.x);
  const right = r.bleed === "right" || r.bleed === "both" ? m.fullEnd : colEnd(m, r.x + r.w - 1);
  const top = rowStart(m, r.y);
  const bottom = rowEnd(m, r.y + r.h - 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** How far past the content edge a media edge must go to bleed (¾ column, or most of the gutter). */
export const bleedThreshold = (m: GridMetrics) =>
  Math.max(24, Math.min(pitch(m) * 0.75, (colStart(m, 1) - m.fullStart) * 0.6));

/** The index in `[lo, hi]` whose `at(i)` is closest to `target` (ties go to the lower index). */
function nearest(lo: number, hi: number, at: (i: number) => number, target: number): number {
  let best = lo;
  let bestD = Number.POSITIVE_INFINITY;
  for (let i = lo; i <= hi; i++) {
    const d = Math.abs(at(i) - target);
    if (d < bestD - 0.001) {
      best = i;
      bestD = d;
    } else if (at(i) > target && d > bestD) break;
  }
  return best;
}

const bleedOf = (left: boolean, right: boolean): GridRect["bleed"] =>
  left && right ? "both" : left ? "left" : right ? "right" : undefined;

function withBleed(r: GridRect, bleed: GridRect["bleed"]): GridRect {
  const out = { ...r };
  if (bleed) out.bleed = bleed;
  else delete out.bleed;
  return out;
}

// --- moving --------------------------------------------------------------------------------

export interface MovePlan {
  rects: GridRect[];
  dc: number;
  dr: number;
}

/**
 * Move a group of placements by a pointer delta (page px). The grabbed item (`primary`) snaps
 * to the nearest cell; every item moves by the same cell delta, clamped so the group stays on
 * the grid. A single media item dragged half a column past the content edge bleeds to it.
 */
export function planMove(
  m: GridMetrics,
  rects: readonly GridRect[],
  primary: number,
  dx: number,
  dy: number,
  options: { bleed?: readonly boolean[] } = {},
): MovePlan {
  const p = rects[primary] as GridRect;
  const box = rectBox(m, p);
  const left = box.x + dx;
  const top = box.y + dy;
  // Pinned items keep their row (they stay on the edge they're pinned to); the rest move.
  const free = rects.filter((r) => !r.pin);
  const minX = Math.min(...rects.map((r) => r.x));
  const maxRight = Math.max(...rects.map((r) => r.x + r.w - 1));
  const minY = free.length ? Math.min(...free.map((r) => r.y)) : 1;
  const maxBottom = free.length ? Math.max(...free.map((r) => r.y + r.h - 1)) : 1;
  const x = nearest(1, m.cols, (i) => colStart(m, i), left);
  const y = nearest(1, MAX_GRID_ROWS, (i) => rowStart(m, i), top);
  const dc = Math.min(Math.max(x - p.x, 1 - minX), m.cols - maxRight);
  // Grabbing a pinned item moves the group sideways only.
  const dr = p.pin ? 0 : Math.min(Math.max(y - p.y, 1 - minY), MAX_GRID_ROWS - maxBottom);
  const half = bleedThreshold(m);
  const single = rects.length === 1 && options.bleed?.[0];
  const out = rects.map((r) => {
    const moved = { ...r, x: r.x + dc, y: r.pin ? r.y : r.y + dr };
    if (!single) return withBleed(moved, dc === 0 ? r.bleed : undefined);
    const bl = moved.x === 1 && left < colStart(m, 1) - half;
    const br = moved.x + moved.w - 1 === m.cols && left + box.w > colEnd(m, m.cols) + half;
    return withBleed(moved, bleedOf(bl, br));
  });
  return { rects: out, dc, dr };
}

/** Lock a drag to its dominant axis (⇧). */
export function constrainAxis(dx: number, dy: number): { dx: number; dy: number } {
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy };
}

// --- resizing ------------------------------------------------------------------------------

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/**
 * Resize a placement from one of its 8 handles by a pointer delta (page px). Edges snap to the
 * nearest column/row line and never cross the opposite edge (minimum one cell). With `bleed`
 * (media), pulling the west/east edge half a column past the content edge bleeds that side.
 */
export function resizeRect(
  m: GridMetrics,
  r: GridRect,
  handle: Handle,
  dx: number,
  dy: number,
  options: { bleed?: boolean; keepAspect?: boolean } = {},
): GridRect {
  const box = rectBox(m, r);
  // A pinned edge doesn't move: bottom-pinned keeps its bottom, top-pinned its top.
  const lockS = r.pin === "bottom";
  const lockN = r.pin === "top";
  if (options.keepAspect && box.w > 0 && box.h > 0) {
    ({ handle, dx, dy } = aspectDrag(box, handle, dx, dy, lockS ? "n" : "s"));
  }
  if (lockS) handle = handle.replace("s", "") as Handle;
  if (lockN) handle = handle.replace("n", "") as Handle;
  if (!handle) return r;
  let x1 = r.x;
  let x2 = r.x + r.w - 1;
  let y1 = r.y;
  let y2 = r.y + r.h - 1;
  let bl = r.bleed === "left" || r.bleed === "both";
  let br = r.bleed === "right" || r.bleed === "both";
  const half = bleedThreshold(m);
  if (handle.includes("e")) {
    const target = box.x + box.w + dx;
    if (options.bleed && target > colEnd(m, m.cols) + half) {
      x2 = m.cols;
      br = true;
    } else {
      x2 = nearest(x1, m.cols, (i) => colEnd(m, i), target);
      br = false;
    }
  }
  if (handle.includes("w")) {
    const target = box.x + dx;
    if (options.bleed && target < colStart(m, 1) - half) {
      x1 = 1;
      bl = true;
    } else {
      x1 = nearest(1, x2, (i) => colStart(m, i), target);
      bl = false;
    }
  }
  if (handle.includes("s")) {
    y2 = nearest(y1, MAX_GRID_ROWS, (i) => rowEnd(m, i), box.y + box.h + dy);
  }
  if (handle.includes("n")) {
    y1 = nearest(1, y2, (i) => rowStart(m, i), box.y + dy);
  }
  return withBleed({ ...r, x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 }, bleedOf(bl, br));
}

/**
 * ⇧ on a resize handle: keep the box's proportions. Corners scale by the larger relative
 * change; side handles also move the perpendicular edge (`vertical` says which one).
 */
function aspectDrag(
  box: Box,
  handle: Handle,
  dx: number,
  dy: number,
  vertical: "n" | "s",
): { handle: Handle; dx: number; dy: number } {
  const sx = handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0;
  const sy = handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0;
  const kx = sx ? (box.w + sx * dx) / box.w : 1;
  const ky = sy ? (box.h + sy * dy) / box.h : 1;
  const k = Math.max(0.01, !sy ? kx : !sx ? ky : Math.abs(kx - 1) >= Math.abs(ky - 1) ? kx : ky);
  const ex = sx || 1;
  const ey = sy || (vertical === "s" ? 1 : -1);
  const h = (sy ? "" : vertical) + handle + (sx ? "" : "e");
  const name =
    (h.includes("n") ? "n" : h.includes("s") ? "s" : "") +
    (h.includes("e") ? "e" : h.includes("w") ? "w" : "");
  return { handle: name as Handle, dx: ex * (box.w * k - box.w), dy: ey * (box.h * k - box.h) };
}

// --- smart guides --------------------------------------------------------------------------

export interface Guide {
  axis: "x" | "y";
  /** Position of the line (x for vertical lines, y for horizontal ones). */
  pos: number;
  from: number;
  to: number;
  kind: "edge" | "center" | "section";
}

export interface Distance {
  axis: "x" | "y";
  from: number;
  to: number;
  /** Cross-axis position of the measurement line. */
  at: number;
  value: number;
}

const TOL = 1;

/**
 * Figma-style alignment guides for a box being moved: lines where its edges or center line up
 * with a sibling's edges or center (or the section's center), plus the gap to the nearest
 * sibling on each side.
 */
export function smartGuides(
  moving: Box,
  others: readonly Box[],
  section: Box,
): { guides: Guide[]; distances: Distance[] } {
  const guides: Guide[] = [];
  const seen = new Set<string>();
  const add = (g: Guide) => {
    const key = `${g.axis}:${Math.round(g.pos)}:${g.kind}`;
    if (seen.has(key)) {
      const prev = guides.find((o) => `${o.axis}:${Math.round(o.pos)}:${o.kind}` === key);
      if (prev) {
        prev.from = Math.min(prev.from, g.from);
        prev.to = Math.max(prev.to, g.to);
      }
      return;
    }
    seen.add(key);
    guides.push(g);
  };
  const xs = (b: Box) => [b.x, b.x + b.w / 2, b.x + b.w];
  const ys = (b: Box) => [b.y, b.y + b.h / 2, b.y + b.h];
  for (const o of others) {
    xs(moving).forEach((a, i) => {
      for (const [j, b] of xs(o).entries()) {
        if (Math.abs(a - b) > TOL) continue;
        add({
          axis: "x",
          pos: b,
          from: Math.min(moving.y, o.y),
          to: Math.max(moving.y + moving.h, o.y + o.h),
          kind: i === 1 && j === 1 ? "center" : "edge",
        });
      }
    });
    ys(moving).forEach((a, i) => {
      for (const [j, b] of ys(o).entries()) {
        if (Math.abs(a - b) > TOL) continue;
        add({
          axis: "y",
          pos: b,
          from: Math.min(moving.x, o.x),
          to: Math.max(moving.x + moving.w, o.x + o.w),
          kind: i === 1 && j === 1 ? "center" : "edge",
        });
      }
    });
  }
  const cx = section.x + section.w / 2;
  if (Math.abs(moving.x + moving.w / 2 - cx) <= TOL)
    add({ axis: "x", pos: cx, from: section.y, to: section.y + section.h, kind: "section" });

  const distances: Distance[] = [];
  const overlapY = (o: Box) => Math.min(moving.y + moving.h, o.y + o.h) - Math.max(moving.y, o.y);
  const overlapX = (o: Box) => Math.min(moving.x + moving.w, o.x + o.w) - Math.max(moving.x, o.x);
  const best = (pick: (o: Box) => number | null, cross: (o: Box) => number, axis: "x" | "y") => {
    let found: { gap: number; o: Box } | null = null;
    for (const o of others) {
      const gap = pick(o);
      if (gap === null || gap <= 0) continue;
      if (!found || gap < found.gap) found = { gap, o };
    }
    return found ? { ...found, at: cross(found.o), axis } : null;
  };
  const midY = (o: Box) => (Math.max(moving.y, o.y) + Math.min(moving.y + moving.h, o.y + o.h)) / 2;
  const midX = (o: Box) => (Math.max(moving.x, o.x) + Math.min(moving.x + moving.w, o.x + o.w)) / 2;
  const left = best((o) => (overlapY(o) > 0 ? moving.x - (o.x + o.w) : null), midY, "x");
  const right = best((o) => (overlapY(o) > 0 ? o.x - (moving.x + moving.w) : null), midY, "x");
  const up = best((o) => (overlapX(o) > 0 ? moving.y - (o.y + o.h) : null), midX, "y");
  const down = best((o) => (overlapX(o) > 0 ? o.y - (moving.y + moving.h) : null), midX, "y");
  if (left)
    distances.push({
      axis: "x",
      from: left.o.x + left.o.w,
      to: moving.x,
      at: left.at,
      value: left.gap,
    });
  if (right)
    distances.push({
      axis: "x",
      from: moving.x + moving.w,
      to: right.o.x,
      at: right.at,
      value: right.gap,
    });
  if (up)
    distances.push({ axis: "y", from: up.o.y + up.o.h, to: moving.y, at: up.at, value: up.gap });
  if (down)
    distances.push({
      axis: "y",
      from: moving.y + moving.h,
      to: down.o.y,
      at: down.at,
      value: down.gap,
    });
  return { guides, distances };
}

// --- overlap -------------------------------------------------------------------------------

/** Do two placements share any cell? (Same rule as the Design check's `overlapping-text`.) */
export function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Pairs of text blocks that would overlap with `rects` (placements at one breakpoint), counting
 * only pairs that involve one of `ids` when given. Mirrors `@openspace/lint`'s rule: overlap is
 * allowed, but text over text can't be read.
 */
export function textOverlaps(
  section: Section,
  rects: ReadonlyMap<string, GridRect>,
  ids?: readonly string[],
): Array<[string, string]> {
  const text = section.blocks.filter((b) => isTextBlock(b) && rects.has(b.id));
  const out: Array<[string, string]> = [];
  for (let i = 0; i < text.length; i++)
    for (let j = i + 1; j < text.length; j++) {
      const a = (text[i] as Block).id;
      const b = (text[j] as Block).id;
      if (ids && !ids.includes(a) && !ids.includes(b)) continue;
      if (rectsOverlap(rects.get(a) as GridRect, rects.get(b) as GridRect)) out.push([a, b]);
    }
  return out;
}

// --- stacking order ------------------------------------------------------------------------

/** DOM order of a grid section's items: the renderer sorts by desktop row, then column. */
export function domOrder(section: GridSection): string[] {
  const items = section.layout.items;
  return section.blocks
    .filter((b) => items[b.id])
    .map((b, i) => ({ id: b.id as string, d: (items[b.id] as GridItem).d, i }))
    .sort((a, b) => a.d.y - b.d.y || a.d.x - b.d.x || a.i - b.i)
    .map((e) => e.id);
}

/** Bottom-to-top paint order: `z` (default 1), then DOM order. */
export function stackOrder(
  rects: ReadonlyMap<string, GridRect>,
  dom: readonly string[],
  override?: ReadonlyMap<string, number>,
): string[] {
  const z = (id: string) => override?.get(id) ?? rects.get(id)?.z ?? 1;
  return dom
    .filter((id) => rects.has(id))
    .map((id, i) => ({ id, i }))
    .sort((a, b) => z(a.id) - z(b.id) || a.i - b.i)
    .map((e) => e.id);
}

export type ZAction = "forward" | "backward" | "front" | "back";

/**
 * New `z` values that move `id` one step (past the next item it overlaps) or all the way to the
 * front/back. Only the moved item changes when that is enough; otherwise the whole section is
 * renumbered. Returns only the values that change (empty when there is nothing to do).
 */
export function zOrderPlan(
  rects: ReadonlyMap<string, GridRect>,
  dom: readonly string[],
  id: string,
  action: ZAction,
): Map<string, number> {
  const order = stackOrder(rects, dom);
  const at = order.indexOf(id);
  if (at < 0) return new Map();
  const me = rects.get(id) as GridRect;
  const rest = order.filter((o) => o !== id);
  let index: number;
  if (action === "front") index = rest.length;
  else if (action === "back") index = 0;
  else if (action === "forward") {
    const next = order.slice(at + 1).find((o) => rectsOverlap(me, rects.get(o) as GridRect));
    if (!next) return new Map();
    index = rest.indexOf(next) + 1;
  } else {
    const prev = order
      .slice(0, at)
      .reverse()
      .find((o) => rectsOverlap(me, rects.get(o) as GridRect));
    if (!prev) return new Map();
    index = rest.indexOf(prev);
  }
  const target = [...rest.slice(0, index), id, ...rest.slice(index)];
  if (target.every((o, i) => o === order[i])) return new Map();
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((o, i) => o === b[i]);
  const zOf = (o: string | undefined) => (o ? (rects.get(o)?.z ?? 1) : undefined);
  const below = zOf(target[index - 1]);
  const above = zOf(target[index + 1]);
  const candidates = [
    below,
    below !== undefined ? below + 1 : undefined,
    above,
    above !== undefined ? above - 1 : undefined,
  ].filter((z): z is number => z !== undefined && z >= 0 && z <= 100);
  for (const z of candidates) {
    if (same(stackOrder(rects, dom, new Map([[id, z]])), target))
      return z === (me.z ?? 1) ? new Map() : new Map([[id, z]]);
  }
  // Renumber everything bottom to top.
  const out = new Map<string, number>();
  target.forEach((o, i) => {
    const z = Math.min(100, i + 1);
    if ((rects.get(o)?.z ?? 1) !== z) out.set(o, z);
  });
  return out;
}
