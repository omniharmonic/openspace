import { COLOR_SCALE_STEPS } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { inSrgbGamut, oklchToHex, parseColor } from "./color";
import { relativeLuminance } from "./contrast";
import { accentScale, nearestStep, neutralScale } from "./scales";

const BRANDS = ["oklch(0.62 0.09 145)", "#ff0000", "oklch(0.9 0.17 100)", "#1a1a1a", "#3355ff"];

describe("accentScale", () => {
  it("has 11 in-gamut steps that get monotonically darker", () => {
    for (const brand of BRANDS) {
      const scale = accentScale(brand);
      expect(Object.keys(scale)).toHaveLength(11);
      let prev = Number.POSITIVE_INFINITY;
      for (const step of COLOR_SCALE_STEPS) {
        expect(inSrgbGamut(scale[step])).toBe(true);
        const lum = relativeLuminance(oklchToHex(scale[step]));
        expect(lum).toBeLessThan(prev);
        prev = lum;
      }
    }
  });

  it("keeps the brand hue", () => {
    const brand = parseColor("oklch(0.62 0.09 145)");
    const scale = accentScale(brand);
    expect(scale[500].h).toBeCloseTo(145, 6);
    expect(scale[500].c).toBeCloseTo(0.09, 6);
    expect(scale[50].c).toBeLessThan(scale[500].c);
  });

  it("finds the step the brand sits on", () => {
    expect(nearestStep("oklch(0.62 0.09 145)")).toBe(500);
    expect(nearestStep("oklch(0.3 0.09 145)")).toBe(900);
  });
});

describe("neutralScale", () => {
  it("pure is achromatic", () => {
    const scale = neutralScale("#ff0000", "pure");
    for (const step of COLOR_SCALE_STEPS) expect(scale[step].c).toBe(0);
  });

  it("warm leans amber and cool leans blue, both lightly tinted", () => {
    const warm = neutralScale("oklch(0.62 0.09 145)", "warm");
    const cool = neutralScale("oklch(0.62 0.09 145)", "cool");
    expect(warm[500].h).toBeGreaterThan(70);
    expect(warm[500].h).toBeLessThan(145);
    expect(cool[500].h).toBeGreaterThan(145);
    expect(cool[500].h).toBeLessThan(250);
    for (const step of COLOR_SCALE_STEPS) {
      expect(warm[step].c).toBeLessThanOrEqual(0.018);
      expect(warm[step].c).toBeGreaterThan(0);
    }
  });

  it("falls back to the target hue for a gray brand", () => {
    expect(neutralScale("#808080", "cool")[500].h).toBe(250);
  });
});
