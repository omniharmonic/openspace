import {
  type Block,
  type Breakpoint,
  GRID_COLUMNS,
  type GridLayout,
  type GridRect,
  type Responsive,
  resolve,
  type SectionStyle,
  type StackLayout,
} from "@openspace/schema";
import { colorVar, TOKEN_VARS } from "@openspace/theme";
import type { CssVars } from "./cx";

/**
 * Layout → inline custom properties. The base stylesheet is shared and cacheable; every
 * per-instance value travels as an inline custom property (arch §3.3). Responsive values are
 * resolved with `m ← t ← d` inheritance here, so the CSS never has to guess.
 *
 * Prefix convention (desktop / tablet / mobile): `--x` / `--tx` / `--mx`.
 */
const PREFIX: Record<Breakpoint, string> = { d: "", t: "t", m: "m" };
const BPS: readonly Breakpoint[] = ["d", "t", "m"];

/** Emit `--{p}{name}` for each breakpoint from a responsive value (inheritance applied). */
export function responsiveVars<T>(
  name: string,
  value: Responsive<T> | undefined,
  map: (v: T) => string | number,
): CssVars {
  const out: CssVars = {};
  if (!value) return out;
  for (const bp of BPS) out[`--${PREFIX[bp]}${name}`] = map(resolve(value, bp));
  return out;
}

const spaceVar = (token: string) =>
  `var(${TOKEN_VARS.space[token as keyof typeof TOKEN_VARS.space] ?? TOKEN_VARS.space.md})`;

/** Section-level vars: padding, min height. */
export function sectionStyleVars(style: SectionStyle): CssVars {
  return {
    ...responsiveVars("pad", style.padding, spaceVar),
    ...responsiveVars("minh", style.minHeight, (v) => v),
  };
}

const fr = (cols: readonly number[]) => cols.map((c) => `minmax(0, ${c}fr)`).join(" ");

/** Stack-mode container vars: column templates per breakpoint. */
export function stackVars(layout: StackLayout): CssVars {
  return {
    ...responsiveVars("cols", layout.columns, fr),
    ...(layout.gap ? { "--gap": spaceVar(layout.gap) } : {}),
  };
}

/**
 * Per-column stacking order at tablet/mobile (`layout.order`, FR-13). Mobile inherits the
 * tablet order. Returns `{ "--to": n, "--mo": n }` for desktop column `index`.
 */
export function stackColumnVars(layout: StackLayout, index: number): CssVars {
  const out: CssVars = {};
  const t = layout.order?.t;
  const m = layout.order?.m ?? t;
  if (t) out["--to"] = t.includes(index) ? t.indexOf(index) : t.length + index;
  if (m) out["--mo"] = m.includes(index) ? m.indexOf(index) : m.length + index;
  return out;
}

/** Group a stack section's blocks by desktop column (out-of-range columns land in the last). */
export function blocksByColumn(layout: StackLayout, blocks: readonly Block[]): Block[][] {
  const count = layout.columns.d.length;
  const cols: Block[][] = Array.from({ length: count }, () => []);
  for (const b of blocks) {
    const i = Math.min(Math.max(b.column ?? 0, 0), count - 1);
    cols[i]?.push(b);
  }
  return cols;
}

/** Grid container vars: row counts per breakpoint. */
export function gridVars(layout: GridLayout): CssVars {
  return responsiveVars("rows", layout.rows, (v) => v);
}

function rectVars(rect: GridRect, bp: Breakpoint): CssVars {
  const p = PREFIX[bp];
  const out: CssVars = {
    [`--${p}x`]: rect.x,
    [`--${p}y`]: rect.y,
    [`--${p}w`]: rect.w,
    [`--${p}h`]: rect.h,
  };
  if (rect.z !== undefined) out[`--${p}z`] = rect.z;
  if (rect.bleed === "left" || rect.bleed === "both") out[`--${p}cs`] = "full-start";
  if (rect.bleed === "right" || rect.bleed === "both") out[`--${p}ce`] = "full-end";
  return out;
}

/**
 * Mobile placements for items without an `m` rect: stack in visual reading order (top-to-bottom,
 * then left-to-right on the desktop grid), full width. Studio normally stores real `m` rects;
 * this keeps unedited sections readable.
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

/** Inline vars for one grid item: `--x/--y/--w/--h/--z`, `--tx…`, `--mx…`, bleed lines. */
export function gridItemVars(
  layout: GridLayout,
  id: string,
  mobileFallback?: Record<string, GridRect>,
): CssVars {
  const item = layout.items[id as keyof GridLayout["items"]];
  if (!item) return {};
  const m = item.m ?? mobileFallback?.[id] ?? { ...item.d, x: 1, w: GRID_COLUMNS.m };
  return {
    ...rectVars(item.d, "d"),
    ...rectVars(item.t ?? item.d, "t"),
    ...rectVars(clampRect(m, GRID_COLUMNS.m), "m"),
  };
}

/** Keep a rect inside the column count (a `t` rect reused on mobile can be wider than 8). */
function clampRect(rect: GridRect, cols: number): GridRect {
  if (rect.x + rect.w - 1 <= cols) return rect;
  const x = Math.min(rect.x, cols);
  return { ...rect, x, w: Math.max(1, cols - x + 1) };
}

/** Total rows actually needed for mobile when fallback rects extend past the stored count. */
export function mobileRows(layout: GridLayout, fallback: Record<string, GridRect>): number {
  let rows = resolve(layout.rows, "m");
  for (const r of Object.values(fallback)) rows = Math.max(rows, r.y + r.h - 1);
  return rows;
}

/** CSS value for a color value: token → `var(--os-color-…)`, exact colors pass through. */
export function colorValue(value: string): string {
  return /^[a-z]/.test(value) && !/^(?:oklch|oklab|rgb|rgba|hsl|hsla|lab|lch)\(/.test(value)
    ? `var(${colorVar(value)})`
    : value;
}
