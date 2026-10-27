import { COLOR_THEMES, type Styles } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { compileStyles } from "./compile";
import { auditContrast, CONTRAST_PAIRS, contrastRatio, nearestAccessible } from "./contrast";
import { curatedPalettes } from "./palettes";
import { buttonContrastFailures } from "./test-helpers";
import { buildPalette, solveThemes, themeRoles } from "./themes";

const styles = (
  palette: Styles["choices"]["palette"],
  overrides?: Styles["overrides"],
): Styles => ({
  choices: {
    palette,
    pairing: "fraunces-hanken",
    density: "comfortable",
    shape: "soft",
    buttons: "solid",
    motion: "subtle",
    imageTreatment: "none",
  },
  ...(overrides ? { overrides } : {}),
});

describe("nearestAccessible", () => {
  it("moves lightness the minimum amount to pass", () => {
    const fixed = nearestAccessible("#999999", "#ffffff");
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    // Barely darker than needed: #767676 is the classic boundary gray.
    expect(contrastRatio(fixed, "#ffffff")).toBeLessThan(4.7);
  });

  it("goes lighter on dark backgrounds and keeps the hue", () => {
    const fixed = nearestAccessible("oklch(0.4 0.12 250)", "#101010");
    expect(contrastRatio(fixed, "#101010")).toBeGreaterThanOrEqual(4.5);
    const before = contrastRatio("oklch(0.4 0.12 250)", "#ffffff");
    expect(contrastRatio(fixed, "#ffffff")).toBeLessThan(before);
  });

  it("supports a custom minimum", () => {
    const fixed = nearestAccessible("#888888", "#ffffff", 7);
    expect(contrastRatio(fixed, "#ffffff")).toBeGreaterThanOrEqual(7);
  });

  it("returns colors that already pass unchanged", () => {
    expect(nearestAccessible("#000000", "#ffffff")).toBe("#000000");
  });
});

describe("contrast solver", () => {
  it("every curated palette passes in all five themes (standard and high)", () => {
    for (const p of curatedPalettes) {
      for (const contrast of ["standard", "high"] as const) {
        const { themes } = solveThemes(themeRoles(buildPalette(p.brand, p.neutral)), contrast);
        expect(Object.keys(themes).sort()).toEqual([...COLOR_THEMES].sort());
        const failures = auditContrast(themes, { contrast });
        expect(failures, `${p.id} (${contrast})`).toEqual([]);
        const body = contrast === "high" ? 7 : 4.5;
        expect(buttonContrastFailures(themes, body), `${p.id} buttons (${contrast})`).toEqual([]);
      }
    }
  });

  it("every curated palette × neutral tint compiles without failures", () => {
    for (const p of curatedPalettes) {
      for (const neutral of ["warm", "cool", "pure"] as const) {
        const out = compileStyles(styles({ brand: p.brand, neutral, contrast: "standard" }));
        expect(out.contrast.failures, `${p.id}/${neutral}`).toEqual([]);
      }
    }
  });

  it("survives extreme brand colors", () => {
    for (const brand of ["#ffffff", "#000000", "#ffff00", "#00ff00", "#808080", "#0000ff"]) {
      const out = compileStyles(styles({ brand, neutral: "pure", contrast: "high" }));
      expect(out.contrast.failures, brand).toEqual([]);
    }
  });

  it("fixes a deliberately failing override and reports it", () => {
    const failing = styles(
      { brand: "oklch(0.62 0.09 145)", neutral: "warm", contrast: "standard" },
      {
        color: {
          "text-muted": { $value: "#c8c8c8", $type: "color" },
          dark: { text: { $value: "#333333", $type: "color" } },
        },
      },
    );
    // Without the solver the failure is surfaced, with a suggestion.
    const unsolved = compileStyles(failing, { solve: false });
    const muted = unsolved.contrast.failures.find(
      (f) => f.theme === "light" && f.fg === "text-muted" && f.bg === "background",
    );
    expect(muted?.fgColor).toBe("#c8c8c8");
    expect(contrastRatio(muted?.suggestion ?? "", muted?.bgColor ?? "")).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(unsolved.contrast.failures.some((f) => f.theme === "dark" && f.fg === "text")).toBe(
      true,
    );

    // With the solver (default) it ships accessible and says what it changed.
    const solved = compileStyles(failing);
    expect(solved.contrast.failures).toEqual([]);
    const lightMuted = solved.tokens.themes.light["text-muted"];
    expect(lightMuted).not.toBe("#c8c8c8");
    expect(contrastRatio(lightMuted, solved.tokens.themes.light.background)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrastRatio(solved.tokens.themes.dark.text, solved.tokens.themes.dark.background),
    ).toBeGreaterThanOrEqual(4.5);
    const adjusted = solved.warnings
      .filter((w) => w.code === "contrast-adjusted")
      .map((w) => w.path);
    expect(adjusted).toContain("color.text-muted");
    expect(adjusted).toContain("color.dark.text");
  });

  it("re-solves accent-text when an accent override changes", () => {
    const out = compileStyles(
      styles(
        { brand: "oklch(0.62 0.09 145)", neutral: "warm", contrast: "standard" },
        { color: { accent: { $value: "oklch(0.95 0.05 90)" } } },
      ),
    );
    const t = out.tokens.themes.light;
    expect(contrastRatio(t.accent, t.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(t["accent-text"], t.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it("checks accent on surface-raised and the hover/pressed fills", () => {
    const pairs = CONTRAST_PAIRS.map((p) => `${p.fg}/${p.bg}`);
    expect(pairs).toContain("accent/surface-raised");
    expect(pairs).toContain("accent-text/accent-hover");
    expect(pairs).toContain("accent-text/accent-pressed");
  });

  it("keeps text-muted no stronger than text (brand theme on a mid-tone brand)", () => {
    for (const brand of ["oklch(0.62 0.09 145)", "oklch(0.6 0.2 30)", "#808080"]) {
      const { themes } = solveThemes(themeRoles(buildPalette(brand, "warm")));
      const t = themes.brand;
      expect(contrastRatio(t["text-muted"], t.background)).toBeLessThanOrEqual(
        contrastRatio(t.text, t.background),
      );
    }
  });

  it("auditContrast lists failing pairs with ratios", () => {
    const { themes } = solveThemes(themeRoles(buildPalette("#3355ff", "cool")));
    const broken = { ...themes, light: { ...themes.light, text: "#eeeeee" } };
    const failures = auditContrast(broken);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.every((f) => f.theme === "light" && f.fg === "text")).toBe(true);
    expect(failures[0]?.required).toBe(4.5);
    expect(failures[0]?.ratio).toBeLessThan(4.5);
  });
});
