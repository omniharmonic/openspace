import { describe, expect, it } from "vitest";
import { autoSpacing, describeSpace, snapPx, spacePx, valueForPx } from "./spacing";

describe("spacing: steps are the magnet, pixels are exact", () => {
  it("stores a typed value as a step when it matches one, else as pixels", () => {
    expect(valueForPx(24, "comfortable")).toBe("md");
    expect(valueForPx(0, "comfortable")).toBe("none");
    expect(valueForPx(26, "comfortable")).toBe(26);
    expect(valueForPx(9999, "comfortable")).toBe(480);
    expect(valueForPx(-3, "airy")).toBe("none");
  });

  it("snaps drags to the nearest step unless Alt (free) is held", () => {
    expect(snapPx(29, "comfortable")).toEqual({ px: 32, value: "lg", step: "lg" });
    expect(snapPx(29, "comfortable", { free: true })).toEqual({ px: 29, value: 29 });
    // Far from any step: exact pixels even without Alt.
    expect(snapPx(80, "comfortable")).toEqual({ px: 80, value: 80 });
  });

  it("reads steps and pixels in px, per density", () => {
    expect(spacePx("lg", "airy")).toBe(48);
    expect(spacePx(13, "airy")).toBe(13);
    expect(describeSpace("md", "comfortable")).toBe("MD · 24px");
    expect(describeSpace(undefined, "comfortable")).toBe("Auto");
  });

  it("knows what Auto is on each device", () => {
    expect(autoSpacing("comfortable", "d").sectionPad).toBe(120);
    // 390px phone: 64 + (120 − 64) × 30/1080 ≈ 66.
    expect(autoSpacing("comfortable", "m").sectionPad).toBe(66);
    expect(autoSpacing("comfortable", "d").blockGap).toBe(19);
  });
});
