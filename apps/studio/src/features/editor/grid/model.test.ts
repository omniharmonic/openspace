import type { GridRect } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import {
  type Box,
  colStart,
  constrainAxis,
  displayRects,
  editBp,
  HANDLES,
  metricsFromTracks,
  parseTracks,
  planMove,
  rectBox,
  rectsOverlap,
  resizeRect,
  rowStart,
  rowsAt,
  rowsToKeep,
  smartGuides,
  stackOrder,
  uniformMetrics,
  zOrderPlan,
} from "./model";

// 24 columns of 40px with 10px gaps and an 80px gutter on each side; 20 rows of 24px.
const M = uniformMetrics({ cols: 24, colWidth: 40, gap: 10, gutter: 80, rows: 20, rowUnit: 24 });
const P = 50; // column pitch
const left = (x: number) => 80 + 10 + (x - 1) * P;

describe("grid metrics", () => {
  it("parses computed track lists, ignoring line names", () => {
    expect(parseTracks("[full-start] 80px [content-start] 40px 40.5px")).toEqual([80, 40, 40.5]);
    expect(parseTracks("none")).toEqual([]);
    expect(parseTracks("")).toEqual([]);
  });

  it("derives content columns, bleed edges and rows from measured tracks", () => {
    expect(M.colStarts).toHaveLength(24);
    expect(colStart(M, 1)).toBe(left(1));
    expect(M.fullStart).toBe(0);
    expect(M.fullEnd).toBe(left(24) + 40 + 10 + 80);
    expect(rowStart(M, 3)).toBe(48);
    // Rows past the explicit ones extrapolate at the row unit (rows grow when dragged below).
    expect(rowStart(M, 25)).toBe(24 * 24);
  });

  it("falls back to even columns when the template can't be read", () => {
    const m = metricsFromTracks({
      left: 0,
      top: 0,
      width: 1000,
      cols: 8,
      columns: [],
      columnGap: 0,
      rows: [],
      rowGap: 0,
      rowUnit: 20,
      rowCount: 4,
    });
    expect(m.colStarts).toHaveLength(8);
    expect(m.rowStarts).toHaveLength(4);
  });

  it("maps a placement (with bleed) to page pixels", () => {
    expect(rectBox(M, { x: 2, y: 2, w: 2, h: 3 })).toEqual({ x: left(2), y: 24, w: 90, h: 72 });
    const bled = rectBox(M, { x: 1, y: 1, w: 24, h: 1, bleed: "both" });
    expect(bled.x).toBe(M.fullStart);
    expect(bled.x + bled.w).toBe(M.fullEnd);
  });
});

describe("snapping a move", () => {
  const r: GridRect = { x: 3, y: 2, w: 4, h: 3 };

  it("snaps to the nearest cell", () => {
    expect(planMove(M, [r], 0, P * 2 + 20, 24 + 5).rects[0]).toEqual({ ...r, x: 5, y: 3 });
    // Less than half a cell stays put.
    expect(planMove(M, [r], 0, 24, 11).rects[0]).toEqual(r);
    expect(planMove(M, [r], 0, 26, 13).rects[0]).toEqual({ ...r, x: 4, y: 3 });
  });

  it("clamps to the grid's columns and the first row; rows grow downward", () => {
    expect(planMove(M, [r], 0, -1000, -1000).rects[0]).toEqual({ ...r, x: 1, y: 1 });
    expect(planMove(M, [r], 0, 5000, 0).rects[0]).toEqual({ ...r, x: 21 });
    // Below the last explicit row: the placement grows the grid.
    expect(planMove(M, [r], 0, 0, 24 * 30).rects[0]?.y).toBe(32);
  });

  it("moves a group by one delta, clamped so every item stays on the grid", () => {
    const a: GridRect = { x: 1, y: 1, w: 4, h: 2 };
    const b: GridRect = { x: 10, y: 4, w: 6, h: 2 };
    const plan = planMove(M, [a, b], 1, P * 20, 0);
    expect(plan.dc).toBe(24 - 15);
    expect(plan.rects).toEqual([
      { ...a, x: 10 },
      { ...b, x: 19 },
    ]);
    expect(planMove(M, [a, b], 1, -P * 5, -24 * 3).rects[1]).toEqual({ ...b, x: 10, y: 4 });
  });

  it("bleeds a media item dragged past the content edge, and un-bleeds it when moved back", () => {
    const img: GridRect = { x: 2, y: 1, w: 6, h: 4 };
    const out = planMove(M, [img], 0, -P - 60, 0, { bleed: [true] }).rects[0];
    expect(out).toEqual({ ...img, x: 1, bleed: "left" });
    // Text never bleeds.
    expect(planMove(M, [img], 0, -P - 60, 0, { bleed: [false] }).rects[0]).toEqual({
      ...img,
      x: 1,
    });
    // A bled image stays bled while moved vertically, and loses it when dragged inwards.
    const bled = out as GridRect;
    expect(planMove(M, [bled], 0, 0, 48, { bleed: [true] }).rects[0]).toMatchObject({
      y: 3,
      bleed: "left",
    });
    expect(planMove(M, [bled], 0, 80 + P * 3, 0, { bleed: [true] }).rects[0]?.bleed).toBe(
      undefined,
    );
    const wide: GridRect = { x: 19, y: 1, w: 6, h: 2 };
    expect(planMove(M, [wide], 0, 70, 0, { bleed: [true] }).rects[0]?.bleed).toBe("right");
  });

  it("⇧ locks to the dominant axis", () => {
    expect(constrainAxis(30, 10)).toEqual({ dx: 30, dy: 0 });
    expect(constrainAxis(-5, -40)).toEqual({ dx: 0, dy: -40 });
  });
});

describe("resizing from each of the 8 handles", () => {
  const r: GridRect = { x: 5, y: 5, w: 4, h: 4 };
  const cases: Record<string, [number, number, Partial<GridRect>]> = {
    e: [P * 2, 0, { x: 5, w: 6 }],
    w: [-P * 2, 0, { x: 3, w: 6 }],
    s: [0, 24 * 3, { y: 5, h: 7 }],
    n: [0, -24 * 2, { y: 3, h: 6 }],
    se: [P, 24, { x: 5, y: 5, w: 5, h: 5 }],
    sw: [-P, 24, { x: 4, y: 5, w: 5, h: 5 }],
    ne: [P, -24, { x: 5, y: 4, w: 5, h: 5 }],
    nw: [-P, -24, { x: 4, y: 4, w: 5, h: 5 }],
  };
  for (const h of HANDLES) {
    it(`snaps the ${h} edge(s) to grid lines`, () => {
      const [dx, dy, want] = cases[h] as [number, number, Partial<GridRect>];
      expect(resizeRect(M, r, h, dx, dy)).toMatchObject(want);
    });
  }

  it("never crosses the opposite edge (minimum one cell) or leaves the grid", () => {
    expect(resizeRect(M, r, "e", -P * 10, 0)).toMatchObject({ x: 5, w: 1 });
    expect(resizeRect(M, r, "n", 0, 24 * 10)).toMatchObject({ y: 8, h: 1 });
    expect(resizeRect(M, r, "w", -P * 30, 0)).toMatchObject({ x: 1, w: 8 });
    expect(resizeRect(M, r, "e", P * 30, 0)).toMatchObject({ x: 5, w: 20 });
  });

  it("bleeds media past the content edge from the side handles", () => {
    const img: GridRect = { x: 1, y: 1, w: 10, h: 4 };
    expect(resizeRect(M, img, "w", -60, 0, { bleed: true })).toMatchObject({
      x: 1,
      w: 10,
      bleed: "left",
    });
    expect(resizeRect(M, img, "w", -60, 0, { bleed: false }).bleed).toBeUndefined();
    const right = resizeRect(M, { x: 15, y: 1, w: 10, h: 4 }, "e", 60, 0, { bleed: true });
    expect(right).toMatchObject({ x: 15, w: 10, bleed: "right" });
    expect(resizeRect(M, { ...img, bleed: "left" }, "e", 60, 0, { bleed: true }).bleed).toBe(
      "left",
    );
  });
});

describe("smart guides", () => {
  const section: Box = { x: 90, y: 0, w: 24 * P - 10, h: 480 };
  it("shows edge and center alignment with siblings, and the section center", () => {
    const moving: Box = { x: 100, y: 200, w: 100, h: 50 };
    const other: Box = { x: 100, y: 20, w: 200, h: 100 };
    const { guides } = smartGuides(moving, [other], section);
    expect(guides).toContainEqual({ axis: "x", pos: 100, from: 20, to: 250, kind: "edge" });
    const centered: Box = { x: section.x + section.w / 2 - 50, y: 300, w: 100, h: 40 };
    expect(smartGuides(centered, [], section).guides).toContainEqual(
      expect.objectContaining({ axis: "x", kind: "section" }),
    );
    const mid: Box = { x: 400, y: 45, w: 60, h: 50 };
    expect(smartGuides(mid, [other], section).guides).toContainEqual(
      expect.objectContaining({ axis: "y", pos: 70, kind: "center" }),
    );
  });

  it("measures the gap to the nearest sibling on each side", () => {
    const moving: Box = { x: 300, y: 100, w: 100, h: 100 };
    const others: Box[] = [
      { x: 100, y: 120, w: 150, h: 40 }, // 50px to the left
      { x: 0, y: 120, w: 20, h: 40 }, // further left: ignored
      { x: 450, y: 150, w: 50, h: 50 }, // 50px to the right
      { x: 320, y: 260, w: 40, h: 40 }, // 60px below
    ];
    const { distances } = smartGuides(moving, others, section);
    expect(distances).toContainEqual(
      expect.objectContaining({ axis: "x", from: 250, to: 300, value: 50 }),
    );
    expect(distances).toContainEqual(
      expect.objectContaining({ axis: "x", from: 400, to: 450, value: 50 }),
    );
    expect(distances).toContainEqual(
      expect.objectContaining({ axis: "y", from: 200, to: 260, value: 60 }),
    );
    expect(distances.filter((d) => d.axis === "y")).toHaveLength(1);
  });
});

describe("stacking order", () => {
  const rects = new Map<string, GridRect>([
    ["a", { x: 1, y: 1, w: 6, h: 6 }],
    ["b", { x: 3, y: 3, w: 6, h: 6 }],
    ["c", { x: 5, y: 5, w: 6, h: 6, z: 3 }],
    ["far", { x: 20, y: 1, w: 2, h: 2 }],
  ]);
  const dom = ["a", "far", "b", "c"];

  it("paints by z, then DOM order", () => {
    expect(stackOrder(rects, dom)).toEqual(["a", "far", "b", "c"]);
  });

  it("brings forward past the next overlapping item only", () => {
    const plan = zOrderPlan(rects, dom, "a", "forward");
    const next = new Map([...rects].map(([k, r]) => [k, { ...r, z: plan.get(k) ?? r.z }]));
    const order = stackOrder(next, dom);
    expect(order.indexOf("a")).toBeGreaterThan(order.indexOf("b"));
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("c"));
  });

  it("brings to front / sends to back, changing as few items as possible", () => {
    const front = zOrderPlan(rects, dom, "a", "front");
    expect([...front.keys()]).toEqual(["a"]);
    expect(front.get("a")).toBeGreaterThan(3);
    const back = zOrderPlan(rects, dom, "c", "back");
    const next = new Map([...rects].map(([k, r]) => [k, { ...r, z: back.get(k) ?? r.z }]));
    expect(stackOrder(next, dom)[0]).toBe("c");
    // Already at the front: nothing to do.
    expect(zOrderPlan(rects, dom, "c", "front").size).toBe(0);
    expect(zOrderPlan(rects, dom, "far", "forward").size).toBe(0);
  });

  it("detects overlap the way the Design check does", () => {
    expect(rectsOverlap({ x: 1, y: 1, w: 2, h: 2 }, { x: 3, y: 1, w: 2, h: 2 })).toBe(false);
    expect(rectsOverlap({ x: 1, y: 1, w: 3, h: 2 }, { x: 3, y: 2, w: 2, h: 2 })).toBe(true);
  });
});

describe("which breakpoint an edit writes", () => {
  const layout = {
    mode: "grid" as const,
    rows: { d: 4 },
    items: { blk_a: { d: { x: 1, y: 1, w: 4, h: 2 } } },
  };
  it("desktop → d, phone → m, tablet → d until customized, then t", () => {
    expect(editBp("desktop", layout as never)).toBe("d");
    expect(editBp("mobile", layout as never)).toBe("m");
    expect(editBp("tablet", layout as never)).toBe("d");
    const custom = {
      ...layout,
      items: { blk_a: { ...layout.items.blk_a, t: layout.items.blk_a.d } },
    };
    expect(editBp("tablet", custom as never)).toBe("t");
  });
});

describe("pinned placements", () => {
  it("draw on the first/last row whatever their stored row", () => {
    const layout = {
      mode: "grid" as const,
      rows: { d: 20 },
      items: {
        blk_a: { d: { x: 1, y: 3, w: 4, h: 2, pin: "bottom" as const } },
        blk_b: { d: { x: 5, y: 6, w: 4, h: 2, pin: "top" as const } },
        blk_c: { d: { x: 9, y: 6, w: 4, h: 2 } },
      },
    };
    const r = displayRects(layout as never, "d");
    expect(r.get("blk_a")?.y).toBe(19);
    expect(r.get("blk_b")?.y).toBe(1);
    expect(r.get("blk_c")?.y).toBe(6);
    expect(rowsAt(layout as never, "d")).toBe(20);
  });

  it("keep their row while dragged (sideways only) and lock the pinned edge on resize", () => {
    const pinned: GridRect = { x: 3, y: 17, w: 4, h: 4, pin: "bottom" };
    expect(planMove(M, [pinned], 0, P * 2, 24 * 5).rects[0]).toEqual({ ...pinned, x: 5 });
    // A group grabbed by a free item: the free one moves vertically, the pinned one doesn't.
    const free: GridRect = { x: 10, y: 2, w: 2, h: 2 };
    const plan = planMove(M, [free, pinned], 0, 0, 48);
    expect(plan.rects).toEqual([{ ...free, y: 4 }, pinned]);
    // Bottom-pinned: the bottom edge stays; the top edge still resizes.
    expect(resizeRect(M, pinned, "s", 0, 48)).toEqual(pinned);
    expect(resizeRect(M, pinned, "n", 0, -48)).toEqual({ ...pinned, y: 15, h: 6 });
    const top: GridRect = { x: 3, y: 1, w: 4, h: 4, pin: "top" };
    expect(resizeRect(M, top, "nw", -P, -48)).toEqual({ ...top, x: 2, w: 5 });
  });

  it("trimming keeps a bottom-pinned block below the content it sits under", () => {
    const rects = new Map<string, GridRect>([
      ["a", { x: 1, y: 1, w: 12, h: 6 }],
      ["foot", { x: 1, y: 17, w: 12, h: 2, pin: "bottom" }],
      ["caption", { x: 14, y: 15, w: 4, h: 4, pin: "bottom" }],
      ["photo", { x: 13, y: 1, w: 12, h: 18 }],
    ]);
    // "foot" sits under "a" (needs 6 + 2); the caption is layered on the photo (needs nothing more).
    expect(rowsToKeep(rects)).toBe(18);
    rects.delete("photo");
    expect(rowsToKeep(rects)).toBe(8);
  });
});

describe("⇧ resize keeps the proportions", () => {
  const r: GridRect = { x: 1, y: 1, w: 8, h: 8 }; // 390 × 192 px: ratio ≈ 2
  it("corner handles scale both sides by the larger change", () => {
    const out = resizeRect(M, r, "se", P * 8, 0, { keepAspect: true });
    expect(out.w).toBe(16);
    expect(out.h).toBeGreaterThanOrEqual(15);
    expect(out.h).toBeLessThanOrEqual(17);
  });
  it("side handles move the perpendicular edge too", () => {
    const out = resizeRect(M, r, "e", P * 8, 0, { keepAspect: true });
    expect(out.w).toBe(16);
    expect(out.h).toBeGreaterThan(8);
    const tall = resizeRect(M, r, "s", 0, 24 * 8, { keepAspect: true });
    expect(tall.h).toBe(16);
    expect(tall.w).toBeGreaterThan(8);
  });
});
