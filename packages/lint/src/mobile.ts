import type { Op, SiteDocument } from "@omniharmonic/openspace-ops";
import { findSection } from "@omniharmonic/openspace-ops";
import {
  type Block,
  GRID_COLUMNS,
  type GridItem,
  type GridRect,
  type Section,
} from "@omniharmonic/openspace-schema";
import { CONTENT_WIDTHS, isTextBlock, rectWidth } from "./content";
import { type CheckOptions, opMeta } from "./issue";

/**
 * Mobile auto-layout (arch §3.3): when a grid section has no mobile placements, generate them by
 * visual reading order — top-to-bottom, then left-to-right on the desktop grid — not insertion
 * order. Items stack full width on the 8-column mobile grid with a one-row gap between them;
 * heights are scaled (media keeps its desktop proportions, text keeps its pixel height and grows
 * to fit). Items layered *on* another item on desktop (a caption card over a photo, a shape
 * behind a portrait) stay layered on it on mobile.
 */

/** Row unit heights (CSS px) on desktop and mobile, and the mobile content width at 390px. */
export const ROW_UNIT = { d: 24, m: 20 } as const;
export const MOBILE_WIDTH = 350;

export interface AutoMobileOptions {
  /** Regenerate every placement, discarding stored `m` rects (default: keep them). */
  reset?: boolean;
}

/** Share of `a`'s area covered by `b`. */
function coverage(a: GridRect, b: GridRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / (a.w * a.h);
}

/**
 * Visual reading order of desktop rects.
 *
 * 1. Bands: walking top to bottom, an item joins the current band while it starts above the
 *    band's bottom edge (it overlaps the band vertically); otherwise it starts a new band.
 * 2. Columns: inside a band, items whose horizontal extents overlap (transitively) form a
 *    column. Columns are read left to right, each top to bottom.
 *
 * So an eyebrow, heading and button stacked beside a tall photo read eyebrow → heading →
 * button → photo, even when the photo starts higher; a row of cards reads left to right; and
 * staggered columns read column by column.
 *
 * Note: the renderer's DOM order (and `fallbackMobileRects`) still sorts by each rect's top-left
 * corner only. Stored `m` placements from `autoMobileLayout` are what make mobile follow this
 * order; the DOM order for assistive tech is unchanged.
 */
export function readingOrder<T extends { id: string; rect: GridRect }>(items: readonly T[]): T[] {
  const sorted = [...items].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  const bands: T[][] = [];
  let bottom = 0;
  for (const it of sorted) {
    const band = bands[bands.length - 1];
    if (band && it.rect.y < bottom) {
      band.push(it);
      bottom = Math.max(bottom, it.rect.y + it.rect.h);
    } else {
      bands.push([it]);
      bottom = it.rect.y + it.rect.h;
    }
  }
  return bands.flatMap(columnsOf);
}

/** Group a band into columns of horizontally overlapping items; read columns left to right. */
function columnsOf<T extends { rect: GridRect }>(band: T[]): T[] {
  const parent = band.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] as number;
    return root;
  };
  for (let i = 0; i < band.length; i++)
    for (let j = i + 1; j < band.length; j++) {
      const a = (band[i] as T).rect;
      const b = (band[j] as T).rect;
      if (a.x < b.x + b.w && b.x < a.x + a.w) parent[find(i)] = find(j);
    }
  const groups = new Map<number, T[]>();
  band.forEach((it, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), it]);
  });
  return [...groups.values()]
    .sort((a, b) => Math.min(...a.map((i) => i.rect.x)) - Math.min(...b.map((i) => i.rect.x)))
    .flatMap((col) => col.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x));
}

/** Mobile row span for a desktop rect: media keeps its aspect ratio, text its pixel height. */
export function mobileHeight(
  block: Block | undefined,
  d: GridRect,
  width: number = CONTENT_WIDTHS.content,
): number {
  const pxHeight = d.h * ROW_UNIT.d;
  if (block && !isTextBlock(block)) {
    const pxWidth = rectWidth(d, width);
    const scaled = (pxHeight * MOBILE_WIDTH) / Math.max(1, pxWidth);
    return Math.max(4, Math.round(scaled / ROW_UNIT.m));
  }
  return Math.max(1, Math.round(pxHeight / ROW_UNIT.m));
}

/**
 * Grid items with `m` placements for every block of a grid section. Returns `undefined` for
 * stack sections (they stack by column order instead).
 */
export function autoMobileLayout(
  section: Section,
  options: AutoMobileOptions = {},
): Record<string, GridItem> | undefined {
  const layout = section.layout;
  if (layout.mode !== "grid") return undefined;
  const width = CONTENT_WIDTHS[layout.width ?? "content"];
  const blocks = new Map(section.blocks.map((b) => [b.id as string, b]));
  const out: Record<string, GridItem> = {};
  const placed: { id: string; d: GridRect; m: GridRect }[] = [];

  let cursor = 1;
  for (const [id, item] of Object.entries(layout.items)) {
    out[id] = structuredClone(item);
    if (!options.reset && item.m) {
      placed.push({ id, d: item.d, m: item.m });
      cursor = Math.max(cursor, item.m.y + item.m.h + 1);
    }
  }
  const pending = Object.entries(layout.items)
    .filter(([, item]) => options.reset || !item.m)
    .map(([id, item]) => ({ id, rect: item.d }));
  const cols = GRID_COLUMNS.m;

  // An item is layered on a larger item that covers at least half of it (a caption card on a
  // photo, a shape behind a portrait). Those follow their host; everything else stacks.
  const area = (r: GridRect) => r.w * r.h;
  const all = Object.entries(layout.items).map(([id, item]) => ({ id, d: item.d }));
  const hostOf = new Map<string, string>();
  for (const { id, rect } of pending) {
    const host = all
      .filter((o) => {
        const hb = blocks.get(o.id);
        return (
          o.id !== id &&
          !!hb &&
          !isTextBlock(hb) &&
          area(o.d) > area(rect) &&
          coverage(rect, o.d) >= 0.5
        );
      })
      .sort((x, y) => coverage(rect, y.d) - coverage(rect, x.d) || area(y.d) - area(x.d))[0];
    if (host) hostOf.set(id, host.id);
  }
  const placedById = new Map(placed.map((pl) => [pl.id, pl]));
  const place = (id: string, d: GridRect, m: GridRect) => {
    out[id] = { ...out[id], d, m } as GridItem;
    const entry = { id, d, m };
    placed.push(entry);
    placedById.set(id, entry);
    cursor = Math.max(cursor, m.y + m.h + 1);
  };

  const layer = (it: { id: string; rect: GridRect }, host: { d: GridRect; m: GridRect }) => {
    const d = it.rect;
    const block = blocks.get(it.id);
    const z = d.z !== undefined ? { z: d.z } : {};
    const ratio = Math.max(0, (d.y - host.d.y) / host.d.h);
    let m: GridRect;
    if (!block || isTextBlock(block)) {
      // Text panels sit on the lower part of their photo, full width of it.
      const offset = Math.min(
        host.m.h - 1,
        Math.max(Math.ceil(host.m.h * 0.6), Math.round(ratio * host.m.h)),
      );
      m = {
        x: host.m.x,
        y: host.m.y + offset,
        w: host.m.w,
        h: mobileHeight(block, d, width),
        ...z,
      };
    } else {
      const w = Math.min(cols, Math.max(2, Math.round((d.w / host.d.w) * host.m.w)));
      const x = host.m.x + Math.round(((d.x - host.d.x) / host.d.w) * host.m.w);
      m = {
        x: Math.min(Math.max(1, x), cols - w + 1),
        y: host.m.y + Math.round(ratio * host.m.h),
        w,
        h: Math.max(2, Math.round((d.h / host.d.h) * host.m.h)),
        ...z,
      };
    }
    place(it.id, d, m);
    return m;
  };
  /** Place everything layered on `hostId` (recursively), right after the host. */
  const placeLayered = (hostId: string, depth = 0) => {
    const host = placedById.get(hostId);
    if (!host || depth > 4) return;
    for (const it of pending) {
      if (hostOf.get(it.id) !== hostId || placedById.has(it.id)) continue;
      layer(it, host);
      placeLayered(it.id, depth + 1);
    }
  };

  // Items layered on stored (kept) placements.
  for (const pl of [...placed]) placeLayered(pl.id);
  // Stack the items that aren't layered on anything in reading order, each followed by its layers.
  // Reading order is computed over the items that stack, so a panel layered across two columns
  // doesn't merge them.
  for (const { id, rect: d } of readingOrder(pending.filter((it) => !hostOf.has(it.id)))) {
    if (placedById.has(id)) continue;
    const block = blocks.get(id);
    const m: GridRect = { x: 1, y: cursor, w: cols, h: mobileHeight(block, d, width) };
    if (d.z !== undefined) m.z = d.z;
    if (block && !isTextBlock(block) && d.bleed) m.bleed = "both";
    place(id, d, m);
    placeLayered(id);
  }
  // Anything left (layered on an item that is itself unplaced): stack it.
  for (const it of pending) {
    if (placedById.has(it.id)) continue;
    const block = blocks.get(it.id);
    place(it.id, it.rect, { x: 1, y: cursor, w: cols, h: mobileHeight(block, it.rect, width) });
  }
  return out;
}

/** Rows needed to hold every mobile placement. */
export function mobileRowCount(items: Record<string, GridItem>): number {
  let rows = 1;
  for (const item of Object.values(items))
    if (item.m) rows = Math.max(rows, item.m.y + item.m.h - 1);
  return rows;
}

/**
 * `grid.place` operations that store the generated mobile placements of a section (for Studio's
 * "Reset mobile layout" and the MCP tool). `page` is a page id or `"footer"`.
 */
export function autoMobileLayoutOps(
  doc: SiteDocument,
  page: string,
  sectionId: string,
  options: AutoMobileOptions & CheckOptions = {},
): Op[] {
  const section = findSection(doc, page as never, sectionId)?.section;
  if (!section) throw new Error(`Section ${sectionId} not found on ${page}`);
  const items = autoMobileLayout(section, options);
  if (!items) return [];
  const meta = opMeta(options);
  const layout = section.layout as Extract<Section["layout"], { mode: "grid" }>;
  const ops: Op[] = [];
  for (const [block, item] of Object.entries(items)) {
    if (!item.m) continue;
    const before = layout.items[block as keyof typeof layout.items]?.m;
    if (before && JSON.stringify(before) === JSON.stringify(item.m)) continue;
    ops.push({
      op: "grid.place",
      ...meta(),
      page: page as never,
      section: sectionId as never,
      block: block as never,
      bp: "m",
      rect: item.m,
    });
  }
  return ops;
}
