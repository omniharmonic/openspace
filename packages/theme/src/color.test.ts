import { describe, expect, it } from "vitest";
import {
  deltaEOK,
  formatOklch,
  gamutMap,
  hexToOklch,
  hexToRgb,
  inSrgbGamut,
  linearSrgbToOklab,
  linearToSrgb,
  mixHue,
  oklabToLinearSrgb,
  oklabToOklch,
  oklchToHex,
  oklchToOklab,
  parseColor,
  srgbToLinear,
  toHex,
} from "./color";
import { contrastRatio, relativeLuminance } from "./contrast";

/** A deterministic grid of sRGB colors. */
function grid(step = 17): string[] {
  const out: string[] = [];
  for (let r = 0; r <= 255; r += step)
    for (let g = 0; g <= 255; g += step)
      for (let b = 0; b <= 255; b += step) {
        out.push(`#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
      }
  return out;
}

describe("conversions", () => {
  it("round-trips hex → OKLCH → hex exactly across the sRGB cube", () => {
    for (const hex of grid()) expect(oklchToHex(hexToOklch(hex))).toBe(hex);
  });

  it("round-trips sRGB ⇄ linear ⇄ OKLab ⇄ OKLCH numerically", () => {
    for (const hex of grid(51)) {
      const rgb = hexToRgb(hex);
      const lin = srgbToLinear(rgb);
      const lab = linearSrgbToOklab(lin);
      const back = oklabToLinearSrgb(oklchToOklab(oklabToOklch(lab)));
      const enc = linearToSrgb(back);
      expect(enc.r).toBeCloseTo(rgb.r, 5);
      expect(enc.g).toBeCloseTo(rgb.g, 5);
      expect(enc.b).toBeCloseTo(rgb.b, 5);
    }
  });

  it("matches reference OKLCH values", () => {
    const white = hexToOklch("#ffffff");
    expect(white.l).toBeCloseTo(1, 4);
    expect(white.c).toBeCloseTo(0, 4);
    expect(hexToOklch("#000000").l).toBeCloseTo(0, 6);
    const red = hexToOklch("#ff0000");
    expect(red.l).toBeCloseTo(0.628, 3);
    expect(red.c).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
  });

  it("parses every CSS color syntax the schema allows", () => {
    expect(toHex("#abc")).toBe("#aabbcc");
    expect(toHex("#AABBCCDD")).toBe("#aabbcc");
    expect(toHex("rgb(255, 0, 0)")).toBe("#ff0000");
    expect(toHex("rgb(100% 0% 0% / 0.5)")).toBe("#ff0000");
    expect(toHex("rgba(0,128,255,1)")).toBe("#0080ff");
    expect(toHex("hsl(120 100% 50%)")).toBe("#00ff00");
    expect(toHex("hsl(210deg 50% 40%)")).toBe("#336699");
    expect(toHex("hsla(0, 100%, 50%, 1)")).toBe("#ff0000");
    expect(toHex("oklch(62.8% 0.2577 29.23)")).toBe("#ff0000");
    expect(toHex("oklch(0.628 0.2577 0.0812turn)")).toBe("#ff0000");
    expect(toHex("oklab(0.628 0.2249 0.1258)")).toBe("#ff0000");
    // CIELAB / LCH (D50): lab(50 40 30) and its polar form agree, white is white.
    expect(toHex("lab(100 0 0)")).toBe("#ffffff");
    expect(toHex("lch(50 50 36.8699)")).toBe(toHex("lab(50 40 30)"));
    expect(() => parseColor("papayawhip")).toThrow();
  });

  it("formats OKLCH compactly", () => {
    expect(formatOklch({ l: 0.62, c: 0.09, h: 145 })).toBe("oklch(0.62 0.09 145)");
    expect(formatOklch({ l: 0.5, c: 0, h: 200 })).toBe("oklch(0.5 0 0)");
  });

  it("interpolates hue along the shortest arc", () => {
    expect(mixHue(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(mixHue(10, 350, 0.25)).toBeCloseTo(5, 6);
  });
});

describe("gamut mapping", () => {
  it("reduces chroma only, keeping lightness and hue", () => {
    const wild = { l: 0.7, c: 0.4, h: 150 };
    expect(inSrgbGamut(wild)).toBe(false);
    const mapped = gamutMap(wild);
    expect(inSrgbGamut(mapped)).toBe(true);
    expect(mapped.l).toBe(0.7);
    expect(mapped.h).toBe(150);
    expect(mapped.c).toBeLessThan(0.4);
    expect(mapped.c).toBeGreaterThan(0.15);
  });

  it("leaves in-gamut colors untouched", () => {
    const c = { l: 0.6, c: 0.05, h: 40 };
    expect(gamutMap(c)).toEqual(c);
  });

  it("maps the extremes to black and white", () => {
    expect(oklchToHex({ l: 1.2, c: 0.3, h: 20 })).toBe("#ffffff");
    expect(oklchToHex({ l: -0.1, c: 0.3, h: 20 })).toBe("#000000");
  });

  it("measures ΔE_OK", () => {
    expect(deltaEOK(parseColor("#ffffff"), parseColor("#000000"))).toBeCloseTo(1, 3);
  });
});

describe("WCAG contrast", () => {
  it("computes relative luminance and ratio", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
    expect(relativeLuminance("#000000")).toBe(0);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 6);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 6);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("oklch(1 0 0)", "#000")).toBeCloseTo(21, 6);
  });
});
