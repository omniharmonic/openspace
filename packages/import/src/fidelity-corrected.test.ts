import { describe, expect, it } from "vitest";
import {
  compareLooks,
  fidelityMarkdown,
  fidelityReport,
  SCORER,
  withVisual,
} from "./fidelity/compare";
import type { LookProbe, ProbeSection, ProbeText } from "./fidelity/probe";

const t = (family: string, size: number, extra: Partial<ProbeText> = {}): ProbeText => ({
  family,
  size,
  lineHeight: 1.2,
  letterSpacing: 0,
  case: "none",
  weight: 400,
  italic: false,
  ...extra,
});

const section = (heading: string | null, extra: Partial<ProbeSection> = {}): ProbeSection => ({
  index: 0,
  top: 0,
  height: 600,
  background: "#ffffff",
  ...(heading ? { heading: { ...t("Inter", 40), text: heading, tag: "h2", left: 120 } } : {}),
  body: t("Inter", 18),
  columns: 1,
  italicLines: 0,
  text: heading ?? "",
  ...extra,
});

const probe = (viewport: number, extra: Partial<LookProbe> = {}): LookProbe => ({
  url: "https://example.org/",
  viewport,
  title: "Example",
  presets: {
    h1: t("Inter", 56),
    h2: t("Inter", 40),
    body: t("Inter", 18),
    nav: t("Inter", 15),
  },
  layout: { contentWidth: 1200, left: 120, sectionPadding: 96 },
  sections: [section("Welcome"), section("What we do")],
  height: 3000,
  ...extra,
});

const check = (p: ReturnType<typeof compareLooks>, what: string) =>
  [...p.checks, ...p.sections.flatMap((s) => s.checks)].filter((c) => c.what === what);

describe("corrected scorer, reported beside strict v3", () => {
  it("reads navigation in a header whose colour theme is named brand", () => {
    const original = probe(1440);
    // The new site's sidebar header carries os-theme-brand: the strict probe saw no navigation,
    // the corrected measurement did.
    const { nav, ...presets } = original.presets;
    const imported = probe(1440, { presets, corrections: { nav: t("Inter", 15) } });
    const cmp = compareLooks(original, imported, "/");
    expect(check(cmp, "Navigation: present")).toEqual([]);
    expect(check(cmp, "Navigation size")[0]?.ok).toBe(true);
    expect(cmp.score).toBe(100);
    expect(cmp.strict?.score).toBeLessThan(100);
    expect(cmp.corrections?.join(" ")).toMatch(/os-theme-brand/);
  });

  it("doesn't count off-screen slides as columns", () => {
    const original = probe(1440, {
      sections: [section("Welcome"), section("Lookbook", { columns: 3, columnsOnScreen: 1 })],
    });
    const imported = probe(1440, { sections: [section("Welcome"), section("Lookbook")] });
    const cmp = compareLooks(original, imported, "/lookbook");
    expect(check(cmp, "Columns").every((c) => c.ok)).toBe(true);
    expect(cmp.score).toBe(100);
    expect(cmp.strict?.score).toBeLessThan(100);
    expect(cmp.corrections?.join(" ")).toMatch(/Section 2: columns counted on screen only/);
    // Columns that really differ still differ.
    const real = compareLooks(
      probe(1440, { sections: [section("Welcome"), section("Lookbook", { columns: 3 })] }),
      imported,
      "/lookbook",
    );
    expect(check(real, "Columns").some((c) => !c.ok)).toBe(true);
  });

  it("finds a picture-only band on a phone in the section holding the picture with its words", () => {
    const photo = { side: "center" as const, widthShare: 1, top: 0, aspect: 1.5 };
    const original = probe(390, {
      sections: [
        section("Welcome", { top: 0 }),
        section(null, { top: 700, height: 300, image: photo }),
        section("Our partners", { top: 1000 }),
        section("Visit", { top: 1800 }),
      ],
    });
    const imported = probe(390, {
      sections: [
        section("Welcome", { top: 0 }),
        section("Our partners", { top: 700, image: { ...photo, aspect: 1.45 } }),
        section("Visit", { top: 1800 }),
      ],
    });
    const cmp = compareLooks(original, imported, "/partners");
    const band = cmp.sections[1];
    expect(band?.importedIndex).toBe(1);
    expect(band?.checks.find((c) => c.what === "Present")).toMatchObject({ ok: true, weight: 4 });
    expect(band?.checks.find((c) => c.what === "Image crop")?.ok).toBe(true);
    expect(cmp.strict?.score).toBeLessThan(cmp.score);
    expect(cmp.corrections?.join(" ")).toMatch(/Section 2 \(a picture alone on a phone\)/);
    // On a computer, or with words of its own, a missing section is still missing.
    const desktop = compareLooks(
      { ...original, viewport: 1440 },
      { ...imported, viewport: 1440 },
      "/partners",
    );
    expect(desktop.sections[1]?.checks[0]).toMatchObject({ what: "Present", ok: false });
  });

  it("reports both scores in the report, the Markdown and after the picture comparison", () => {
    const original = probe(1440, {
      sections: [section("Welcome"), section("Lookbook", { columns: 3, columnsOnScreen: 1 })],
    });
    const imported = probe(1440, { sections: [section("Welcome"), section("Lookbook")] });
    const page = withVisual(compareLooks(original, imported, "/"), 0.8);
    expect(page.score).toBe(Math.round(0.75 * 100 + 25 * 0.8));
    expect(page.strict?.score).toBe(Math.round(0.75 * (page.strict?.checks ?? 0) + 25 * 0.8));
    const report = fidelityReport([page]);
    expect(report.scorer).toBe(SCORER);
    expect(report.strict?.score).toBe(page.strict?.score);
    expect(report.score).toBeGreaterThan(report.strict?.score ?? 100);
    const md = fidelityMarkdown(report);
    expect(md).toContain(
      `**${report.score}/100 corrected**, ${report.strict?.score}/100 by the strict v3 scorer`,
    );
    expect(md).toContain(`(strict v3: ${page.strict?.score}/100)`);
    expect(md).toContain("columns counted on screen only");
    // Same measurements, nothing to correct: both scores agree.
    const same = fidelityReport([compareLooks(original, original, "/")]);
    expect(same.strict?.score).toBe(same.score);
  });
});
