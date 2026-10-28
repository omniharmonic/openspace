import { describe, expect, it } from "vitest";
import { sectionStyleVars, stackVars } from "./layout-vars";

describe("phone defaults", () => {
  it("brings big desktop padding down on phones unless the section sets its own", () => {
    const v = sectionStyleVars({ padding: { d: "3xl" } });
    expect(v["--pad"]).toBe("var(--os-space-3xl)");
    expect(v["--tpad"]).toBe("var(--os-space-3xl)");
    expect(v["--mpad"]).toBe("var(--os-space-xl)");
    expect(sectionStyleVars({ padding: { d: "3xl", m: "2xl" } })["--mpad"]).toBe(
      "var(--os-space-2xl)",
    );
    expect(sectionStyleVars({ padding: { d: "md" } })["--mpad"]).toBe("var(--os-space-md)");
  });

  it("stacks columns on phones unless phone columns are set", () => {
    const v = stackVars({ mode: "stack", columns: { d: [6, 6] } });
    expect(v["--cols"]).toBe("minmax(0, 6fr) minmax(0, 6fr)");
    expect(v["--tcols"]).toBe("minmax(0, 6fr) minmax(0, 6fr)");
    expect(v["--mcols"]).toBe("minmax(0, 12fr)");
    expect(stackVars({ mode: "stack", columns: { d: [6, 6], m: [6, 6] } })["--mcols"]).toBe(
      "minmax(0, 6fr) minmax(0, 6fr)",
    );
  });
});
