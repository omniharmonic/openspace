import { describe, expect, it } from "vitest";
import { hexToRgb, parseColor } from "./color";
import { extractPalette } from "./extract";

function image(regions: [string, number][], alphaHole = 0): Uint8ClampedArray {
  const total = regions.reduce((n, [, count]) => n + count, 0) + alphaHole;
  const px = new Uint8ClampedArray(total * 4);
  let i = 0;
  for (const [hex, count] of regions) {
    const { r, g, b } = hexToRgb(hex);
    for (let k = 0; k < count; k++, i++) {
      px.set([Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255], i * 4);
    }
  }
  for (let k = 0; k < alphaHole; k++, i++) px.set([255, 0, 255, 0], i * 4);
  return px;
}

describe("extractPalette", () => {
  it("ranks the chromatic brand color above large white/black areas", () => {
    // A logo: mostly white background, black wordmark, a small green mark.
    const px = image([
      ["#ffffff", 6000],
      ["#111111", 2500],
      ["#2e8b57", 900],
      ["#e9e9e9", 600],
    ]);
    const [top] = extractPalette(px);
    expect(top).toBeDefined();
    const c = parseColor(top?.hex ?? "#000");
    expect(Math.abs(c.h - parseColor("#2e8b57").h)).toBeLessThan(3);
    expect(top?.population).toBeCloseTo(0.09, 2);
  });

  it("skips transparent pixels and is deterministic", () => {
    const px = image(
      [
        ["#d94f2b", 3000],
        ["#1f4fd1", 1500],
        ["#f4efe6", 5000],
      ],
      4000,
    );
    const a = extractPalette(px);
    const b = extractPalette(px);
    expect(a).toEqual(b);
    expect(a.some((c) => c.hex === "#ff00ff")).toBe(false);
    expect(a[0]?.hex).toBe("#d94f2b");
    expect(a[1]?.hex).toBe("#1f4fd1");
  });

  it("returns grays for an achromatic image and nothing for an empty one", () => {
    const gray = extractPalette(image([["#777777", 100]]));
    expect(gray[0]?.hex).toBe("#777777");
    expect(extractPalette(new Uint8ClampedArray(0))).toEqual([]);
  });

  it("supports RGB input", () => {
    const rgb = new Uint8ClampedArray([200, 30, 30, 200, 30, 30, 10, 10, 10]);
    expect(extractPalette(rgb, { channels: 3 })[0]?.hex).toBe("#c81e1e");
  });
});
