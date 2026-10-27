import { checkComponent, componentNameOf } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import {
  designerComponent,
  designerComponentCatalog,
  designerComponents,
  designerSection,
} from "./index";

describe("designer component library", () => {
  it("has 3–5 distinct, valid, opt-in components with editable fields", () => {
    const catalog = designerComponentCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(3);
    expect(catalog.length).toBeLessThanOrEqual(5);
    expect(new Set(catalog.map((c) => c.name)).size).toBe(catalog.length);
    for (const def of designerComponents) {
      expect(checkComponent(def).ok).toBe(true);
      expect(Object.keys(def.fields).length).toBeGreaterThan(2);
      expect(def.ai?.purpose).toBeTruthy();
    }
    expect(catalog.some((c) => c.hasScript)).toBe(true);
  });

  it("returns copies and builds sections with fresh ids", () => {
    const a = designerComponent("bento-grid");
    const b = designerComponent("bento-grid");
    expect(a).not.toBe(b);
    expect(designerComponent("nope")).toBeUndefined();
    const s1 = designerSection(a as never);
    const s2 = designerSection(a as never);
    expect(s1.id).not.toBe(s2.id);
    expect(componentNameOf(s1.blocks[0]?.type ?? "")).toBe("bento-grid");
    expect(s1.preset).toBe("component/bento-grid@1");
  });
});
