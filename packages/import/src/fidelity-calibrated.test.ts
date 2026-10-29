/**
 * The calibrated score (v4) means what a person would think it means: an unrelated or broken page
 * is near 0, a recognisable but rough move is mid-range, 90+ only when near-identical. Checked on
 * real measurements of the fixture pages (`__fixtures__/fidelity/measured.json`: look probes and
 * screenshot similarity from Chromium) and on authored probes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALIBRATION,
  calibratedScore,
  compareLooks,
  fidelityMarkdown,
  fidelityReport,
  nextStep,
  type PageComparison,
  SCORER,
  siteScore,
  withVisual,
} from "./fidelity/compare";
import type { LookProbe, ProbeSection, ProbeText } from "./fidelity/probe";

interface Pair {
  kind: "unrelated" | "close" | "rough" | "broken" | "importer";
  original: string;
  imported: string;
  width: number;
  visual: number;
}
const measured = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__", "fidelity", "measured.json"), "utf8"),
) as { probes: Record<string, LookProbe>; pairs: Pair[] };

const probe = (name: string, width: number) => {
  const p = measured.probes[`${name}@${width}`];
  if (!p) throw new Error(`no probe ${name}@${width}`);
  return p;
};
const scored = (pair: Pair): PageComparison =>
  withVisual(
    compareLooks(probe(pair.original, pair.width), probe(pair.imported, pair.width), "/"),
    pair.visual,
  );
const of = (kind: Pair["kind"]) => measured.pairs.filter((p) => p.kind === kind);
const find = (original: string, imported: string, width: number) =>
  measured.pairs.find(
    (p) => p.original === original && p.imported === imported && p.width === width,
  ) as Pair;

describe("the calibrated score, on pages measured in a browser", () => {
  it("scores a page against itself 100", () => {
    for (const name of ["bakery", "foodshed", "studio", "htmlsite", "juniper", "tidewater"])
      for (const width of [1440, 390]) {
        const p = probe(name, width);
        expect(withVisual(compareLooks(p, p, "/"), 1).score, `${name}@${width}`).toBe(100);
      }
  });

  it("scores two unrelated pages near 0 (the uncalibrated v3.1 score gave them 14–56)", () => {
    const pairs = of("unrelated");
    expect(pairs.length).toBe(60);
    const rows = pairs.map(scored);
    for (const [k, r] of rows.entries())
      expect(r.score, `${pairs[k]?.original} vs ${pairs[k]?.imported}`).toBeLessThanOrEqual(15);
    // The root cause, kept visible: shared defaults pass checks, and two unrelated screenshots
    // compare at 0.38–0.89, so the old blend never went near 0.
    expect(Math.max(...rows.map((r) => r.raw ?? 0))).toBeGreaterThan(50);
    expect(Math.min(...rows.map((r) => r.raw ?? 100))).toBeGreaterThan(10);
  });

  it("scores a page whose design didn't come across (its CSS removed) as broken", () => {
    for (const pair of of("broken")) expect(scored(pair).score).toBeLessThanOrEqual(15);
  });

  it("puts a recognisable but rough copy mid-range, and a near-identical one at 90+", () => {
    for (const pair of of("rough")) {
      const s = scored(pair).score;
      expect(s).toBeGreaterThanOrEqual(25);
      expect(s).toBeLessThanOrEqual(70);
    }
    for (const pair of of("close")) expect(scored(pair).score).toBeGreaterThanOrEqual(90);
  });

  it("ranks what the automatic importer made the way a person would", () => {
    const site = (original: string, imported: string) =>
      fidelityReport([
        scored(find(original, imported, 1440)),
        scored(find(original, imported, 390)),
      ]).score;
    // Foodshed: the single-file importer keeps its cards and fonts; the generic one loses them.
    // Uncalibrated, the generic copy scored higher (85 vs 82).
    const generic = site("foodshed", "foodshed-imported-generic");
    const html = site("foodshed", "foodshed-imported-html");
    expect(html).toBeGreaterThan(generic);
    expect(generic).toBeGreaterThanOrEqual(40);
    expect(html).toBeLessThan(90);
    // Studio: the hero picture and the product grid didn't come across; v3.1 said 60.
    expect(site("studio", "studio-imported-generic")).toBeLessThanOrEqual(25);
    // Nothing the automatic importer made of these pages reads as near-identical.
    for (const pair of of("importer")) expect(scored(pair).score).toBeLessThan(90);
  });
});

const t = (family: string, size: number, extra: Partial<ProbeText> = {}): ProbeText => ({
  family,
  size,
  lineHeight: 1.3,
  letterSpacing: 0,
  case: "none",
  weight: 400,
  italic: false,
  ...extra,
});
const section = (heading: string, text: string, extra: Partial<ProbeSection> = {}) =>
  ({
    index: 0,
    top: 0,
    height: 600,
    background: "#ffffff",
    heading: { ...t("Inter", 40), text: heading, tag: "h2", left: 120 },
    body: t("Inter", 18),
    columns: 1,
    italicLines: 0,
    text,
    ...extra,
  }) as ProbeSection;
const page = (viewport: number, extra: Partial<LookProbe>): LookProbe => ({
  url: "https://example.org/",
  viewport,
  title: "Example",
  presets: { h1: t("Inter", 56), h2: t("Inter", 40), body: t("Inter", 18) },
  layout: { contentWidth: 1200, left: 120, sectionPadding: 96 },
  sections: [],
  height: 3000,
  ...extra,
});

describe("the calibrated score, on authored pages", () => {
  const bakery = page(1440, {
    presets: { h1: t("Fraunces", 64), h2: t("Fraunces", 40), body: t("Work Sans", 17) },
    sections: [
      section("Bread worth waking up for", "Slow-fermented sourdough and pastries", {
        background: "#8f8072",
      }),
      section("Made slowly, by hand", "Everything starts the night before", { columns: 3 }),
      section("Come say hello", "Great Junction Street, Leith", { background: "#3b2416" }),
    ],
  });
  const studio = page(1440, {
    presets: { h1: t("Inter", 56), h2: t("Inter", 40), body: t("Inter", 18) },
    sections: [
      section("Pots for slow mornings", "Hand-thrown stoneware in Valencia"),
      section("Recent work", "Speckled mugs, serving bowls and bud vases", { columns: 3 }),
    ],
  });

  it("two clearly unrelated pages score ≤ 15; a page against itself 100", () => {
    // 0.48 is how the two fixtures' screenshots compare in a browser.
    expect(withVisual(compareLooks(bakery, studio, "/"), 0.48).score).toBeLessThanOrEqual(15);
    expect(compareLooks(bakery, studio, "/").score).toBeLessThanOrEqual(15);
    expect(withVisual(compareLooks(bakery, bakery, "/"), 1).score).toBe(100);
    expect(compareLooks(bakery, bakery, "/").score).toBe(100);
  });

  it("doesn't let the right fonts hide a layout that fell apart", () => {
    // Every check passes but the screenshots look as alike as unrelated pages do.
    const same = withVisual(compareLooks(bakery, bakery, "/"), CALIBRATION.visual.desktop);
    expect(same.structure).toBe(100);
    expect(same.score).toBe(25);
    // Uncalibrated it read 89.
    expect(Math.round(same.raw ?? 0)).toBe(89);
  });

  it("caps a page at the share of its sections that came across", () => {
    const half = { ...bakery, sections: bakery.sections.slice(0, 1) };
    const cmp = withVisual(compareLooks(bakery, half, "/"), 1);
    expect(cmp.present).toBeCloseTo(1 / 3);
    expect(cmp.score).toBeLessThanOrEqual(34);
  });

  it("is 0 below the zero points and 100 at identical, in between linear per signal", () => {
    expect(calibratedScore({ checks: 30, viewport: 1440 })).toBe(0);
    expect(calibratedScore({ checks: 100, visual: 1, viewport: 390 })).toBe(100);
    expect(calibratedScore({ checks: 65, viewport: 1440 })).toBeCloseTo(50);
    // A phone's screenshots are compared from a higher zero point (mostly white, narrow).
    expect(calibratedScore({ checks: 100, visual: 0.65, viewport: 390 })).toBe(25);
    expect(calibratedScore({ checks: 100, visual: 0.65, viewport: 1440 })).toBeGreaterThan(25);
  });
});

describe("the site score", () => {
  it("doesn't let a good phone score hide a broken computer page", () => {
    const s = siteScore([
      { path: "/", score: 95 },
      { path: "/", score: 10 },
    ]);
    expect(s).toBeCloseTo(0.5 * 52.5 + 0.5 * 10);
    expect(s).toBeLessThan(35);
  });

  it("sits halfway between the average page and the weakest page", () => {
    const pages = ["/", "/about", "/menu", "/visit"].flatMap((path, k) => [
      { path, score: k === 3 ? 20 : 90 },
      { path, score: k === 3 ? 20 : 90 },
    ]);
    expect(siteScore(pages)).toBeCloseTo(0.5 * ((90 * 3 + 20) / 4) + 0.5 * 20);
    expect(siteScore([])).toBe(100);
  });

  it("names the calibrated scorer, and keeps the uncalibrated number for auto-tuning", () => {
    const p = withVisual(
      compareLooks(page(1440, { sections: [section("A", "a b c")] }), page(1440, {}), "/"),
      0.9,
    );
    const r = fidelityReport([p]);
    expect(r.scorer).toBe(SCORER);
    expect(SCORER).toBe("v4-calibrated");
    expect(r.raw).toBeGreaterThan(r.score);
  });

  it("names the next step in plain words: finishing with Claude unless it's near-identical", () => {
    expect(nextStep(92)).toBeUndefined();
    expect(nextStep(72)).toMatch(/^The automatic move got the basics \(72\/100\)\. Claude can/);
    expect(nextStep(12)).toMatch(/^The automatic move is rough \(12\/100\)/);
    expect(nextStep(12)).toContain("finish-a-move");
    const md = fidelityMarkdown(
      fidelityReport([scored(find("studio", "studio-imported-generic", 1440))]),
    );
    expect(md).toContain("**Next step:** The automatic move is rough");
    const same = probe("bakery", 1440);
    expect(fidelityMarkdown(fidelityReport([compareLooks(same, same, "/")]))).not.toContain(
      "Next step",
    );
  });
});
