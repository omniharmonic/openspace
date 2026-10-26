import { describe, expect, it } from "vitest";
import { getPairing } from "./pairings";
import { fluidClamp, stepSizes, TYPE_PRESET_NAMES, typeScale } from "./type-scale";

describe("fluid type scale", () => {
  it("interpolates between the 1.2 mobile and 1.333 desktop ratios", () => {
    const h1 = stepSizes(4);
    expect(h1.min).toBeCloseTo(16 * 1.2 ** 4, 6);
    expect(h1.max).toBeCloseTo(18 * 1.333 ** 4, 6);
  });

  it("emits clamp() that hits the endpoints at 360px and 1440px", () => {
    const css = fluidClamp(32, 64);
    const m = /^clamp\(([\d.]+)rem, (-?[\d.]+)rem \+ ([\d.]+)vw, ([\d.]+)rem\)$/.exec(css);
    expect(m).not.toBeNull();
    const [, lo, intercept, slope, hi] = (m ?? []).map(Number);
    expect(lo).toBe(2);
    expect(hi).toBe(4);
    const at = (vw: number) => (intercept as number) * 16 + ((slope as number) / 100) * vw;
    expect(at(360)).toBeCloseTo(32, 1);
    expect(at(1440)).toBeCloseTo(64, 1);
    expect(fluidClamp(16, 16)).toBe("1rem");
  });

  it("produces every preset with a descending size order", () => {
    const pairing = getPairing("fraunces-hanken");
    if (!pairing) throw new Error("missing pairing");
    const scale = typeScale(pairing);
    expect(Object.keys(scale)).toEqual([...TYPE_PRESET_NAMES]);
    expect(scale.display["letter-spacing"]).toBe("-0.02em");
    expect(scale.h3["letter-spacing"]).toBe("-0.01em");
    expect(scale.eyebrow["text-transform"]).toBe("uppercase");
    expect(scale.h1["font-family"]).toBe("var(--os-font-heading)");
    expect(scale.body["font-family"]).toBe("var(--os-font-body)");
    const order = ["display", "h1", "h2", "h3", "h4", "lead", "body", "small"] as const;
    const max = order.map(
      (p) => stepSizes([5.5, 4, 3, 2, 1, 0.5, 0, -1][order.indexOf(p)] as number).max,
    );
    for (let i = 1; i < max.length; i++) expect(max[i]).toBeLessThan(max[i - 1] as number);
  });
});
