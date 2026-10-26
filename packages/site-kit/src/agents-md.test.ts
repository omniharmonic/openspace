import { blocksRegistry } from "@openspace/blocks";
import { describe, expect, it } from "vitest";
import { generateAgentsMd } from "./agents-md";

describe("generateAgentsMd", () => {
  const md = generateAgentsMd({ siteTitle: "Meadow Yoga" });

  it("documents every registered block with its variants and fields", () => {
    for (const def of blocksRegistry().list()) {
      expect(md).toContain(`### \`${def.type}\` — ${def.meta.label}`);
      expect(md).toContain(def.meta.ai.purpose);
    }
    expect(md).toContain('`role: "primary" | "secondary" | "tertiary"`');
    expect(md).toContain("`note?: text ≤ 120`");
  });

  it("states the architecture §2.3 rules", () => {
    expect(md).toContain("# AGENTS.md — Meadow Yoga");
    expect(md).toMatch(/Content lives in `content\/`/);
    expect(md).toMatch(/Preserve ids/);
    expect(md).toContain("npx openspace check");
    expect(md).toContain("content/styles.json");
    expect(md).toContain("npm run dev");
    expect(md).toContain("npx openspace mcp");
    expect(md).toContain("https://schema.openspace.dev/v1/");
  });

  it("is deterministic", () => {
    expect(generateAgentsMd({ siteTitle: "Meadow Yoga" })).toBe(md);
  });
});
