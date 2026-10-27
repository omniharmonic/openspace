import {
  autoMobileLayout,
  mobileHeight,
  mobileRowCount,
  readingOrder,
} from "@omniharmonic/openspace-lint";
import {
  type Block,
  GRID_COLUMNS,
  type GridLayout,
  type GridRect,
  type Section,
  type StackLayout,
} from "@omniharmonic/openspace-schema";
import { ROW_PX } from "./model";

/**
 * Stack ⇄ grid conversion that keeps what people see in the same order.
 *
 * - Stack → grid: each stack column becomes a band of grid columns (twelfths → 24ths), blocks
 *   keep their order top to bottom with heights from the canvas. The phone layout is
 *   `autoMobileLayout` (so it stays automatic), unless the stack had its own phone stacking
 *   order (`layout.order.m`, else tablet's, which phones inherit) — then the columns stack in
 *   that order, sized like `autoMobileLayout` sizes them.
 * - Grid → stack: one column in visual reading order (`@omniharmonic/openspace-lint` `readingOrder`: bands,
 *   then columns left to right), not insertion order.
 */

/** Blocks of a stack section grouped by desktop column (out-of-range columns go last). */
function stackColumns(layout: StackLayout, blocks: readonly Block[]): Block[][] {
  const count = layout.columns.d.length;
  const cols: Block[][] = Array.from({ length: count }, () => []);
  for (const b of blocks) cols[Math.min(Math.max(b.column ?? 0, 0), count - 1)]?.push(b);
  return cols;
}

export function stackToGrid(
  section: Section,
  measure?: (blockId: string) => number | undefined,
): GridLayout {
  const layout = section.layout as StackLayout;
  const spans = layout.columns.d;
  const cols = stackColumns(layout, section.blocks);
  const rowsFor = (id: string) =>
    Math.max(2, Math.ceil((measure?.(id) ?? 4 * ROW_PX.d) / ROW_PX.d));
  const items: GridLayout["items"] = {};
  let maxY = 1;
  cols.forEach((blocks, c) => {
    const x = 1 + 2 * spans.slice(0, c).reduce((a, n) => a + n, 0);
    const w = 2 * (spans[c] ?? 12);
    let y = 1;
    for (const blk of blocks) {
      const h = rowsFor(blk.id);
      items[blk.id as keyof GridLayout["items"]] = { d: { x, y, w, h } };
      y += h;
      maxY = Math.max(maxY, y - 1);
    }
  });
  // Phone, no stacking order set: the automatic layout (so phones stay "automatic" and follow
  // later desktop edits).
  const stacking = layout.order?.m ?? layout.order?.t ?? [];
  if (!stacking.length) {
    const grid: GridLayout = {
      mode: "grid",
      rows: { d: Math.max(maxY, 1) },
      items,
      ...(layout.width ? { width: layout.width } : {}),
    };
    const auto = autoMobileLayout({ ...section, layout: grid }, { reset: true }) ?? items;
    return { ...grid, rows: { d: grid.rows.d, m: mobileRowCount(auto) }, items: auto };
  }
  // Phone, with a stacking order (`order.m`, else tablet's, which phones inherit): stack the
  // columns in that order, one row apart.
  const order = [
    ...stacking.filter((i) => i < cols.length),
    ...cols.map((_, i) => i).filter((i) => !stacking.includes(i)),
  ];
  let my = 1;
  for (const c of order) {
    for (const blk of cols[c] ?? []) {
      const item = items[blk.id as keyof GridLayout["items"]];
      if (!item) continue;
      const h = mobileHeight(blk, item.d);
      item.m = { x: 1, y: my, w: GRID_COLUMNS.m, h };
      my += h + 1;
    }
  }
  return {
    mode: "grid",
    rows: { d: Math.max(maxY, 1), m: Math.max(my - 2, 1) },
    items,
    ...(layout.width ? { width: layout.width } : {}),
  };
}

/** A grid section's blocks in visual reading order (desktop placements). */
export function gridReadingOrder(section: Section): Block[] {
  if (section.layout.mode !== "grid") return [...section.blocks];
  const items = section.layout.items;
  const placed = section.blocks
    .filter((b) => items[b.id])
    .map((b) => ({ id: b.id as string, rect: items[b.id]?.d as GridRect, block: b }));
  const ordered = readingOrder(placed).map((p) => p.block);
  // Unplaced blocks (shouldn't happen) keep their list position at the end.
  return [...ordered, ...section.blocks.filter((b) => !items[b.id])];
}
