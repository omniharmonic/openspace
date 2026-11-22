import { describe, expect, it } from "vitest";
import { measureLines } from "./Measure";

describe("measure (Alt redlines)", () => {
  it("measures the vertical gap between stacked boxes", () => {
    const lines = measureLines({ x: 0, y: 0, w: 100, h: 40 }, { x: 20, y: 64, w: 100, h: 20 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ axis: "y", from: 40, to: 64 });
  });

  it("measures horizontal and vertical gaps for diagonal boxes", () => {
    const lines = measureLines({ x: 0, y: 0, w: 10, h: 10 }, { x: 30, y: 50, w: 10, h: 10 });
    expect(lines.map((l) => [l.axis, l.to - l.from])).toEqual([
      ["y", 40],
      ["x", 20],
    ]);
  });

  it("measures insets to a containing box", () => {
    const lines = measureLines({ x: 40, y: 120, w: 200, h: 100 }, { x: 0, y: 0, w: 1440, h: 400 });
    expect(lines.map((l) => Math.round(l.to - l.from)).sort((a, b) => a - b)).toEqual([
      40, 120, 180, 1200,
    ]);
  });
});
