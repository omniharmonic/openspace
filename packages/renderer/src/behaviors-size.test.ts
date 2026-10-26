import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { BEHAVIOR_BUDGETS, BEHAVIOR_LOADER, BEHAVIORS } from "./behaviors-manifest";
import { BEHAVIOR_FILES, bundleBehaviors } from "./node";

describe("behavior bundles", () => {
  it("builds every behavior and the loader within its gzip budget", async () => {
    const code = await bundleBehaviors();
    expect(Object.keys(code).sort()).toEqual([...BEHAVIOR_FILES].sort());
    const report: Record<string, number> = {};
    for (const [name, js] of Object.entries(code)) {
      const gz = gzipSync(js, { level: 9 }).length;
      report[name] = gz;
      expect(js.length, `${name} is empty`).toBeGreaterThan(50);
      expect(gz, `${name}: ${gz} B gz`).toBeLessThanOrEqual(
        BEHAVIOR_BUDGETS[name as keyof typeof BEHAVIOR_BUDGETS],
      );
    }
    expect(BEHAVIOR_BUDGETS.cart).toBe(12 * 1024);
    expect(BEHAVIOR_BUDGETS.beacon).toBeLessThanOrEqual(1024);
    expect(BEHAVIOR_BUDGETS.carousel).toBe(3 * 1024);
    // A page using every behavior still stays far below the 30 KB content-page JS budget.
    const total = Object.values(report).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(30 * 1024);
  }, 30_000);

  it("ships plain ES modules with a default init export and no React", async () => {
    const code = await bundleBehaviors({ minify: false, names: [...BEHAVIORS] });
    for (const [name, js] of Object.entries(code)) {
      expect(js, name).toMatch(/export\s*\{[^}]*as default/);
      expect(js, name).not.toMatch(/from\s+["']react/);
    }
    const loader = await bundleBehaviors({ names: [BEHAVIOR_LOADER] });
    expect(loader[BEHAVIOR_LOADER]).toContain("import.meta.url");
  }, 30_000);
});
