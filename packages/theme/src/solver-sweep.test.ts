import { describe, expect, it } from "vitest";
import { formatOklch } from "./color";
import { auditContrast } from "./contrast";
import { buildPalette, solveThemes, themeRoles } from "./themes";

/** A deterministic sweep of brand colors across OKLCH space. */
function brands(): string[] {
  const out: string[] = [];
  for (const l of [0.15, 0.3, 0.45, 0.55, 0.62, 0.7, 0.8, 0.9, 0.97])
    for (const c of [0, 0.05, 0.12, 0.25])
      for (let h = 0; h < 360; h += 45) out.push(formatOklch({ l, c, h }));
  return out;
}

describe("contrast solver sweep", () => {
  it("guarantees every pair in every theme for any brand, tint and contrast mode", () => {
    const failing: string[] = [];
    for (const brand of brands()) {
      for (const neutral of ["warm", "cool", "pure"] as const) {
        for (const contrast of ["standard", "high"] as const) {
          const { themes } = solveThemes(themeRoles(buildPalette(brand, neutral)), contrast);
          const failures = auditContrast(themes, { contrast });
          if (failures.length) failing.push(`${brand}/${neutral}/${contrast}: ${failures.length}`);
        }
      }
    }
    expect(failing).toEqual([]);
  }, 60_000);
});
