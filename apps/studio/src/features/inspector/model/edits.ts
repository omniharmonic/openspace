import type { OpBody } from "@omniharmonic/openspace-ops";
import type {
  Block,
  BlockStyle,
  Section,
  SectionLayout,
  SiteDocument,
  StackLayout,
} from "@omniharmonic/openspace-schema";
import { locate } from "../../editor/model/selection";
import type { CommitOptions, CommitResult, EditorDocState } from "../../editor/model/store";

/**
 * Op builders for inspector edits. Each returns plain op bodies for `store.commit`, so every
 * change is validated, undoable and synced like any other edit.
 */

type Store = Pick<EditorDocState, "doc" | "pageId" | "commit">;

/** Remove keys whose value is `undefined` (and empty nested objects) from a style object. */
export function compact<T extends Record<string, unknown>>(style: T): T | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) {
    if (v === undefined) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner = compact(v as Record<string, unknown>);
      if (inner === undefined) continue;
      out[k] = inner;
    } else out[k] = v;
  }
  return Object.keys(out).length ? (out as T) : undefined;
}

/** `block.update` that sets field values (top-level keys). */
export function fieldsOp(container: string, block: Block, set: Record<string, unknown>): OpBody {
  const unset = Object.entries(set)
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);
  const values = Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined));
  return {
    op: "block.update",
    page: container,
    block: block.id,
    ...(Object.keys(values).length ? { set: values } : {}),
    ...(unset.length ? { unset } : {}),
  } as OpBody;
}

/** `block.update` that replaces the block's style with `next` (removing it when empty). */
export function blockStyleOp(container: string, block: Block, next: BlockStyle): OpBody {
  const style = compact(next as Record<string, unknown>) as BlockStyle | undefined;
  return { op: "block.update", page: container, block: block.id, style: style ?? null } as OpBody;
}

/** Merge one style key into a block's style (`undefined` removes it). */
export function withStyle<K extends keyof BlockStyle>(
  block: Block,
  key: K,
  value: BlockStyle[K] | undefined,
): BlockStyle {
  return { ...(block.style ?? {}), [key]: value } as BlockStyle;
}

/** `section.update` for dotted paths inside the section (`style.padding`, `layout`). */
export function sectionOp(
  container: string,
  section: Section,
  set: Record<string, unknown>,
): OpBody {
  const values = Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined));
  const unset = Object.entries(set)
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);
  return {
    op: "section.update",
    page: container,
    section: section.id,
    ...(Object.keys(values).length ? { set: values } : {}),
    ...(unset.length ? { unset } : {}),
  } as OpBody;
}

/** `styles.patch` for dotted paths inside `styles` (`choices.density`, `overrides.color.x`). */
export function stylesOp(set: Record<string, unknown>): OpBody {
  const values = Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined));
  const unset = Object.entries(set)
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);
  return {
    op: "styles.patch",
    patch: {
      ...(Object.keys(values).length ? { set: values } : {}),
      ...(unset.length ? { unset } : {}),
    },
  } as OpBody;
}

// --- stack layout ---------------------------------------------------------------------------

/** Ratio presets per column count, in twelfths (FR-13). */
export const RATIO_PRESETS: Record<number, Array<{ spans: number[]; label: string }>> = {
  1: [{ spans: [12], label: "Full" }],
  2: [
    { spans: [6, 6], label: "1 : 1" },
    { spans: [7, 5], label: "7 : 5" },
    { spans: [5, 7], label: "5 : 7" },
    { spans: [8, 4], label: "2 : 1" },
    { spans: [4, 8], label: "1 : 2" },
    { spans: [9, 3], label: "3 : 1" },
    { spans: [3, 9], label: "1 : 3" },
  ],
  3: [
    { spans: [4, 4, 4], label: "1 : 1 : 1" },
    { spans: [6, 3, 3], label: "2 : 1 : 1" },
    { spans: [3, 6, 3], label: "1 : 2 : 1" },
    { spans: [3, 3, 6], label: "1 : 1 : 2" },
  ],
  4: [
    { spans: [3, 3, 3, 3], label: "Equal" },
    { spans: [6, 2, 2, 2], label: "Wide first" },
    { spans: [2, 4, 4, 2], label: "Wide middle" },
  ],
};

/**
 * Change the number of stack columns. Blocks in columns that no longer exist move into the
 * last remaining column (in order), stacking orders are trimmed, and per-breakpoint ratios that
 * no longer fit are dropped.
 */
export function setStackColumns(
  section: Section,
  count: number,
): {
  layout: StackLayout;
  moves: Array<{ block: Block; column: number | null }>;
} {
  const layout = section.layout as StackLayout;
  const spans = RATIO_PRESETS[count]?.[0]?.spans ?? [12];
  // Tablet/phone overrides survive: "stacked" ([12]) always fits; multi-column ratios only
  // when they still have one span per column.
  const columns: StackLayout["columns"] = { d: spans };
  for (const bp of ["t", "m"] as const) {
    const v = layout.columns[bp];
    if (v && (v.length === 1 || v.length === count)) columns[bp] = [...v];
  }
  const next: StackLayout = { ...layout, columns };
  const keepOrder = (o: number[] | undefined) =>
    o
      ? normaliseOrder(
          o.filter((c) => c < count),
          count,
        )
      : undefined;
  const t = keepOrder(layout.order?.t);
  const m = keepOrder(layout.order?.m);
  if (t || m) next.order = { ...(t ? { t } : {}), ...(m ? { m } : {}) };
  else delete next.order;
  const moves: Array<{ block: Block; column: number | null }> = [];
  for (const b of section.blocks) {
    const c = b.column ?? 0;
    if (c >= count) moves.push({ block: b, column: count - 1 === 0 ? null : count - 1 });
  }
  return { layout: next, moves };
}

/** Op bodies for {@link setStackColumns}: block moves first, then the layout. */
export function stackColumnsOps(container: string, section: Section, count: number): OpBody[] {
  const { layout, moves } = setStackColumns(section, count);
  const bodies: OpBody[] = moves.map(
    ({ block, column }) =>
      ({ op: "block.update", page: container, block: block.id, column }) as OpBody,
  );
  bodies.push(sectionOp(container, section, { layout }));
  return bodies;
}

/** Normalise a stacking order: a permutation of `0..count-1`, or undefined for natural order. */
export function normaliseOrder(order: number[], count: number): number[] | undefined {
  const seen = new Set<number>();
  const out = order.filter((c) => c >= 0 && c < count && !seen.has(c) && seen.add(c));
  for (let c = 0; c < count; c++) if (!seen.has(c)) out.push(c);
  return out.every((c, i) => c === i) ? undefined : out;
}

/** Layout with a stacking order set for tablet or phone (FR-13). */
export function withStackOrder(layout: StackLayout, bp: "t" | "m", order: number[]): StackLayout {
  const count = layout.columns.d.length;
  const norm = normaliseOrder(order, count);
  const nextOrder = { ...(layout.order ?? {}) };
  if (norm) nextOrder[bp] = norm;
  else delete nextOrder[bp];
  const out: StackLayout = { ...layout };
  if (nextOrder.t || nextOrder.m) out.order = nextOrder;
  else delete out.order;
  return out;
}

// --- running ----------------------------------------------------------------------------------

/** Commit op bodies for the selected block/section; returns the store's result. */
export function commitBodies(
  store: Store,
  bodies: OpBody[],
  options: CommitOptions = {},
): CommitResult {
  return store.commit(bodies, options);
}

/** Locate a block on the current page (or footer). */
export function findBlock(doc: SiteDocument, pageId: string, id: string) {
  return locate(doc, pageId, { kind: "block", id });
}

export type { SectionLayout };
