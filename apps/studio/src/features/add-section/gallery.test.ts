import { allPresets } from "@omniharmonic/openspace-blocks";
import { describe, expect, it } from "vitest";
import { filterPresets, matchesPreset, PRESET_TRAITS } from "./PresetGallery";

describe("section gallery filters", () => {
  it("lists the whole library with no filters", () => {
    expect(filterPresets("", "all")).toHaveLength(allPresets.length);
    expect(allPresets.length).toBeGreaterThanOrEqual(250);
  });

  it("searches AI guidance too, so a kind of business finds its sections", () => {
    const restaurant = filterPresets("restaurant", "all");
    expect(restaurant.some((p) => p.category === "menu")).toBe(true);
    expect(filterPresets("nonprofit", "all").some((p) => p.category === "impact")).toBe(true);
    // every word must match
    expect(filterPresets("restaurant zzzz", "all")).toEqual([]);
  });

  it("narrows by category and by quick filter", () => {
    const heroes = filterPresets("", "hero");
    expect(heroes.every((p) => p.category === "hero")).toBe(true);
    const photo = filterPresets("", "hero", "photo");
    const text = filterPresets("", "hero", "text");
    expect(photo.length + text.length).toBe(heroes.length);
    expect(photo.every((p) => p.images.length > 0)).toBe(true);
    const layered = filterPresets("", "all", "layered");
    expect(layered.length).toBeGreaterThan(15);
    expect(layered.every((p) => p.overlap)).toBe(true);
    for (const t of PRESET_TRAITS) expect(filterPresets("", "all", t.id).length).toBeGreaterThan(0);
  });

  it("ranks direct matches above matches found only in AI guidance", async () => {
    const { presetScore } = await import("./PresetGallery");
    const pricing = allPresets.filter((p) => p.category === "pricing");
    expect(pricing.every((p) => presetScore(p, "pricing") === 2)).toBe(true);
    const viaAi = allPresets.filter((p) => presetScore(p, "restaurant") === 1);
    expect(viaAi.length).toBeGreaterThan(0);
  });

  it("matches labels case-insensitively", () => {
    const p = allPresets.find((x) => x.id === "pricing/billing-toggle@1");
    if (!p) throw new Error("missing preset");
    expect(matchesPreset(p, "  BILLING toggle ")).toBe(true);
  });
});
