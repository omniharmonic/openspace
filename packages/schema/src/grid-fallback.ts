import { GRID_COLUMNS, type GridLayout, type GridRect } from "./section";

/**
 * Mobile placements the renderer uses for grid items that have no stored `m` rect: stack full
 * width in desktop order (top-to-bottom, then left-to-right by each rect's top-left corner),
 * below every item that does have one. Pure; shared by the renderer (CSS vars) and
 * `@omniharmonic/openspace-lint` (overlap checks) so neither depends on the other.
 *
 * Studio and MCP should store real placements from `@omniharmonic/openspace-lint`'s `autoMobileLayout`,
 * which reads banded columns and keeps layered items on their photos; this fallback only keeps
 * unedited sections readable.
 */
export function fallbackMobileRects(layout: GridLayout): Record<string, GridRect> {
  const entries = Object.entries(layout.items).sort(
    ([, a], [, b]) => a.d.y - b.d.y || a.d.x - b.d.x,
  );
  const out: Record<string, GridRect> = {};
  // Items without a stored mobile rect go below every item that has one.
  let y = 1;
  for (const item of Object.values(layout.items)) if (item.m) y = Math.max(y, item.m.y + item.m.h);
  for (const [id, item] of entries) {
    if (item.m) continue;
    const h = Math.max(1, item.d.h);
    out[id] = { x: 1, y, w: GRID_COLUMNS.m, h, ...(item.d.z !== undefined ? { z: item.d.z } : {}) };
    y += h;
  }
  return out;
}

/**
 * Where a placement actually sits given its breakpoint's row count: pinned placements derive
 * their row from the edge they are pinned to (`top` → row 1, `bottom` → the last `h` rows).
 */
export function pinnedRect(rect: GridRect, rows: number): GridRect {
  if (rect.pin === "top") return rect.y === 1 ? rect : { ...rect, y: 1 };
  if (rect.pin === "bottom") {
    const y = Math.max(1, rows - rect.h + 1);
    return rect.y === y ? rect : { ...rect, y };
  }
  return rect;
}
