import type { SiteDocument } from "@openspace/schema";
import { findBlock, findSection, getPage } from "./doc";
import { FOOTER, type Op, type Position } from "./ops";
import { patchPaths, splitPath } from "./paths";
import { validate } from "./validate";

/**
 * Merging concurrent edits (arch §5.3 "Conflict handling").
 *
 * Every op is described by the document locations it touches. Ops whose locations are disjoint
 * commute and pass through untouched. When a local (pending) op and a remote (already ordered)
 * op touch the same location:
 *
 * - **Deletes win.** A remote delete of a page/section/block/item drops local edits to it; a
 *   local delete survives remote edits (the remote author gets a conflict entry).
 * - **Same-field edits are last-writer-wins** by `(ts, actor)`. If the local op wins it is kept
 *   (applied after the remote op, it overwrites); if the remote op wins the overlapping fields
 *   are stripped from the local op (dropped entirely when nothing is left).
 *
 * The DraftRoom must run the same function for an incoming op against the ops its sender had not
 * seen, so both sides converge.
 */

/**
 * `edit`/`create`/`delete` drive conflict detection. `order` marks state an op affects that
 * merges deterministically (a list's order, a grid's rows) — never a conflict, but it means the
 * op does not strictly commute with another op touching the same place (see `independent`).
 */
export type TouchKind = "edit" | "create" | "delete" | "order";

export interface Touch {
  path: string[];
  kind: TouchKind;
}

export interface OpFootprint {
  touches: Touch[];
  /** Locations that must still exist for the op to apply (its page, its target section). */
  requires: string[][];
}

const edit = (...path: string[]): Touch => ({ path, kind: "edit" });
const order = (...path: string[]): Touch => ({ path, kind: "order" });
/** A section's block list and grid layout (rows/items) are affected. */
const sectionContent = (section: string) => [
  order("section", section, "blocks"),
  order("section", section, "props", "layout"),
];

function pageReq(page: string): string[][] {
  return page === FOOTER ? [] : [["page", page]];
}

/**
 * Locations an op touches and depends on. With `doc` (the document the op applies to), ops that
 * only name a block also record the section the block currently sits in.
 */
export function footprint(op: Op, doc?: SiteDocument): OpFootprint {
  const fp = baseFootprint(op);
  if (doc && (op.op === "block.move" || op.op === "block.delete")) {
    const loc = findBlock(doc, op.page, op.block);
    if (loc) fp.touches.push(...sectionContent(loc.section.id));
  }
  if (op.op === "section.delete") fp.touches.push(order("page", op.page, "sections"));
  return fp;
}

function baseFootprint(op: Op): OpFootprint {
  switch (op.op) {
    case "block.update": {
      const t: Touch[] = [];
      for (const k of [...(op.unset ?? []), ...Object.keys(op.set ?? {})])
        t.push(edit("block", op.block, "fields", k));
      if (op.variant !== undefined) t.push(edit("block", op.block, "variant"));
      if (op.style !== undefined) t.push(edit("block", op.block, "style"));
      if (op.column !== undefined) t.push(edit("block", op.block, "column"));
      return { touches: t, requires: pageReq(op.page) };
    }
    case "block.insert":
      return {
        touches: [{ path: ["block", op.block.id], kind: "create" }, ...sectionContent(op.section)],
        requires: [...pageReq(op.page), ["section", op.section]],
      };
    case "block.move": {
      const t: Touch[] = [
        edit("block", op.block, "position"),
        ...sectionContent(op.to.section),
        order("block", op.block, "section"),
      ];
      if (op.to.column !== undefined) t.push(edit("block", op.block, "column"));
      if (op.to.place) t.push(edit("block", op.block, "grid"));
      return { touches: t, requires: [...pageReq(op.page), ["section", op.to.section]] };
    }
    case "block.delete":
      return {
        touches: [
          { path: ["block", op.block], kind: "delete" },
          order("block", op.block, "section"),
        ],
        requires: pageReq(op.page),
      };
    case "grid.place":
      return {
        touches: [
          edit("block", op.block, "grid", op.bp),
          order("section", op.section, "props", "layout", "rows"),
          order("section", op.section, "props", "layout", "items", op.block, op.bp),
        ],
        requires: [...pageReq(op.page), ["section", op.section]],
      };
    case "section.insert":
      return {
        touches: [
          { path: ["section", op.section.id], kind: "create" },
          order("page", op.page, "sections"),
        ],
        requires: pageReq(op.page),
      };
    case "section.move":
      return {
        touches: [edit("section", op.section, "position"), order("page", op.page, "sections")],
        requires: pageReq(op.page),
      };
    case "section.delete":
      return {
        touches: [{ path: ["section", op.section], kind: "delete" }],
        requires: pageReq(op.page),
      };
    case "section.update":
      return {
        touches: patchPaths(op).map((p) => edit("section", op.section, "props", ...splitPath(p))),
        requires: pageReq(op.page),
      };
    case "styles.patch":
      return {
        touches: patchPaths(op.patch).map((p) => edit("styles", ...splitPath(p))),
        requires: [],
      };
    case "page.create":
      return {
        touches: [{ path: ["page", op.page.id], kind: "create" }, ...(op.nav ? [edit("nav")] : [])],
        requires: [],
      };
    case "page.update":
      return {
        touches: patchPaths(op).map((p) => edit("page", op.page, "props", ...splitPath(p))),
        requires: [],
      };
    case "page.delete":
      return {
        touches: [{ path: ["page", op.page], kind: "delete" }, ...(op.nav ? [edit("nav")] : [])],
        requires: [],
      };
    case "nav.update":
      return { touches: [edit("nav")], requires: [] };
    case "site.update":
      return { touches: patchPaths(op).map((p) => edit("site", ...splitPath(p))), requires: [] };
    case "media.add":
      return { touches: [edit("media", op.path)], requires: [] };
    case "media.remove":
      return { touches: [{ path: ["media", op.path], kind: "delete" }], requires: [] };
    case "collection.upsert":
      return { touches: [edit("item", op.collection, op.item.slug)], requires: [] };
    case "collection.delete":
      return {
        touches: [{ path: ["item", op.collection, op.slug], kind: "delete" }],
        requires: [],
      };
    case "collectionConfig.upsert":
      return { touches: [edit("collectionConfig", op.collection)], requires: [] };
  }
}

function isPrefix(a: readonly string[], b: readonly string[]): boolean {
  if (a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const overlaps = (a: readonly string[], b: readonly string[]) => isPrefix(a, b) || isPrefix(b, a);

/** True if `a` was written after `b` under last-writer-wins: later `ts`, then greater actor. */
export function wins(a: { ts: number; actor: string }, b: { ts: number; actor: string }): boolean {
  if (a.ts !== b.ts) return a.ts > b.ts;
  return a.actor >= b.actor;
}

/**
 * True if two ops touch disjoint locations, so applying them in either order gives the same
 * document. Pass the document they both apply to for precise block-level footprints.
 */
export function independent(a: Op, b: Op, doc?: SiteDocument): boolean {
  const fa = footprint(a, doc);
  const fb = footprint(b, doc);
  for (const ta of fa.touches)
    for (const tb of fb.touches) if (overlaps(ta.path, tb.path)) return false;
  for (const r of fa.requires)
    for (const tb of fb.touches) if (tb.kind === "delete" && isPrefix(tb.path, r)) return false;
  for (const r of fb.requires)
    for (const ta of fa.touches) if (ta.kind === "delete" && isPrefix(ta.path, r)) return false;
  return true;
}

export type ConflictReason = "concurrent-edit" | "deleted" | "duplicate" | "invalid";

export interface Conflict {
  /** The local op as submitted. */
  local: Op;
  /** The remote op it collided with (absent for `invalid`). */
  remote?: Op;
  /** Which side's value is kept. */
  winner: "local" | "remote";
  reason: ConflictReason;
  /** Touched locations in conflict, e.g. `block/blk_…/fields/title`. */
  paths: string[];
  /** Toast copy, e.g. "Ana changed this too". */
  message: string;
}

export interface RebaseResult {
  /** Local ops transformed to apply after the remote ops (dropped ones removed). */
  ops: Op[];
  conflicts: Conflict[];
  /** Local ops removed entirely. */
  dropped: Op[];
}

export interface RebaseOptions {
  /**
   * The document after the remote ops. When given, rebased ops are re-validated in order against
   * it (numeric positions are clamped, missing anchors fall back to the end) and ops that no
   * longer apply are dropped with an `invalid` conflict.
   */
  doc?: SiteDocument;
}

/** Remove the parts of `op` that touch any of `paths`; `null` when nothing is left. */
function strip(op: Op, paths: readonly string[][]): Op | null {
  const hit = (p: string[]) => paths.some((q) => overlaps(p, q));
  const stripPatch = <T extends { set?: Record<string, unknown>; unset?: string[] }>(
    patch: T,
    base: string[],
  ): T | null => {
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch.set ?? {}))
      if (!hit([...base, ...splitPath(k)])) set[k] = v;
    const unset = (patch.unset ?? []).filter((k) => !hit([...base, ...splitPath(k)]));
    if (Object.keys(set).length === 0 && unset.length === 0) return null;
    const out = { ...patch };
    if (Object.keys(set).length) out.set = set;
    else delete out.set;
    if (unset.length) out.unset = unset;
    else delete out.unset;
    return out;
  };
  switch (op.op) {
    case "block.update": {
      const base = ["block", op.block];
      const fields = stripPatch({ set: op.set, unset: op.unset }, [...base, "fields"]);
      const next: Op & { op: "block.update" } = { ...op };
      delete next.set;
      delete next.unset;
      if (fields?.set) next.set = fields.set;
      if (fields?.unset) next.unset = fields.unset;
      for (const prop of ["variant", "style", "column"] as const)
        if (next[prop] !== undefined && hit([...base, prop])) delete next[prop];
      const empty =
        next.set === undefined &&
        next.unset === undefined &&
        next.variant === undefined &&
        next.style === undefined &&
        next.column === undefined;
      return empty ? null : next;
    }
    case "styles.patch": {
      const patch = stripPatch(op.patch, ["styles"]);
      return patch ? { ...op, patch } : null;
    }
    case "site.update":
      return stripPatch(op, ["site"]);
    case "page.update":
      return stripPatch(op, ["page", op.page, "props"]);
    case "section.update":
      return stripPatch(op, ["section", op.section, "props"]);
    case "page.create":
    case "page.delete": {
      // Losing the nav race keeps the page change but not the navigation rewrite.
      const own = op.op === "page.create" ? op.page.id : op.page;
      if (hit(["page", own])) return null;
      const { nav: _nav, ...rest } = op;
      return rest as Op;
    }
    default:
      return null;
  }
}

const key = (p: string[]) => p.join("/");

/**
 * Transform `localPending` (ops not yet acknowledged) so they apply after `remoteOps` (ops the
 * authority ordered first). Returns the surviving ops plus conflicts for "X changed this too"
 * toasts.
 */
export function rebase(
  localPending: readonly Op[],
  remoteOps: readonly Op[],
  options: RebaseOptions = {},
): RebaseResult {
  const conflicts: Conflict[] = [];
  const dropped: Op[] = [];
  const kept: Op[] = [];
  const remotes = remoteOps.map((r) => ({ op: r, fp: footprint(r) }));

  for (const local of localPending) {
    let cur: Op | null = local;
    for (const { op: remote, fp: rfp } of remotes) {
      if (!cur) break;
      const lfp = footprint(cur);
      // 1. Remote deleted something this op edits or depends on.
      const deletedHits: string[][] = [];
      for (const rt of rfp.touches) {
        if (rt.kind !== "delete") continue;
        const dependent =
          lfp.requires.some((r) => isPrefix(rt.path, r)) ||
          lfp.touches.some((lt) => isPrefix(rt.path, lt.path) && lt.kind !== "create");
        if (dependent) deletedHits.push(rt.path);
      }
      if (deletedHits.length) {
        const bothDelete = lfp.touches
          .filter((lt) => lt.kind !== "order")
          .every((lt) => lt.kind === "delete" && deletedHits.some((d) => isPrefix(d, lt.path)));
        if (!bothDelete)
          conflicts.push({
            local,
            remote,
            winner: "remote",
            reason: "deleted",
            paths: deletedHits.map(key),
            message: `${remote.actor} deleted this`,
          });
        dropped.push(local);
        cur = null;
        break;
      }
      // 2. Overlapping touches.
      const pairs: { l: Touch; r: Touch }[] = [];
      for (const lt of lfp.touches) {
        if (lt.kind === "order") continue;
        for (const rt of rfp.touches)
          if (rt.kind !== "order" && overlaps(lt.path, rt.path)) pairs.push({ l: lt, r: rt });
      }
      if (pairs.length === 0) continue;
      const paths = [
        ...new Set(pairs.map((p) => key(p.l.path.length >= p.r.path.length ? p.l.path : p.r.path))),
      ];
      if (pairs.some((p) => p.l.kind === "create" && p.r.kind === "create")) {
        conflicts.push({
          local,
          remote,
          winner: "remote",
          reason: "duplicate",
          paths,
          message: `${remote.actor} already added this`,
        });
        dropped.push(local);
        cur = null;
        break;
      }
      const localDeletes = pairs.some((p) => p.l.kind === "delete");
      if (localDeletes || wins(cur, remote)) {
        conflicts.push({
          local,
          remote,
          winner: "local",
          reason: "concurrent-edit",
          paths,
          message: `${remote.actor} changed this too`,
        });
        continue;
      }
      conflicts.push({
        local,
        remote,
        winner: "remote",
        reason: "concurrent-edit",
        paths,
        message: `${remote.actor} changed this too`,
      });
      cur = strip(
        cur,
        pairs.map((p) => p.r.path),
      );
      if (!cur) dropped.push(local);
    }
    if (cur) kept.push(cur);
  }

  if (!options.doc) return { ops: kept, conflicts, dropped };

  // Re-validate in order against the merged document.
  const ops: Op[] = [];
  let doc = options.doc;
  for (const op of kept) {
    const fixed = normalizePositions(doc, op);
    const r = validate(doc, fixed, { trusted: true });
    if (r.ok) {
      ops.push(fixed);
      doc = r.doc;
    } else {
      dropped.push(op);
      conflicts.push({
        local: op,
        winner: "remote",
        reason: "invalid",
        paths: [],
        message: r.errors[0]?.message ?? "This change no longer applies",
      });
    }
  }
  return { ops, conflicts, dropped };
}

/** Clamp numeric positions and replace vanished anchors with "end". */
function normalizePositions(doc: SiteDocument, op: Op): Op {
  const fix = (ids: string[] | undefined, at: Position): Position => {
    if (!ids) return at;
    if (typeof at === "number") return at > ids.length ? "end" : at;
    if (typeof at === "string") return at;
    const anchor = "before" in at ? at.before : at.after;
    return ids.includes(anchor) ? at : "end";
  };
  switch (op.op) {
    case "block.insert": {
      const s = findSection(doc, op.page, op.section)?.section;
      return {
        ...op,
        at: fix(
          s?.blocks.map((b) => b.id),
          op.at,
        ),
      };
    }
    case "block.move": {
      const s = findSection(doc, op.page, op.to.section)?.section;
      const ids = s?.blocks.map((b) => b.id).filter((id) => id !== op.block);
      return { ...op, to: { ...op.to, at: fix(ids, op.to.at) } };
    }
    case "section.insert": {
      const p = getPage(doc, op.page);
      return {
        ...op,
        at: fix(
          p?.sections.map((s) => s.id),
          op.at,
        ),
      };
    }
    case "section.move": {
      const p = getPage(doc, op.page);
      return {
        ...op,
        at: fix(
          p?.sections.map((s) => s.id).filter((id) => id !== op.section),
          op.at,
        ),
      };
    }
    default:
      return op;
  }
}
