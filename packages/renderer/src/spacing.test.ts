import { BlockSchema, SectionStyleSchema, StackLayoutSchema } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { sectionStyleVars, spaceBelowVars, spaceVar, stackVars } from "./layout-vars";
import { BASE_CSS } from "./styles/base-css";

describe("exact spacing (steps or pixels)", () => {
  it("emits pixels for numbers and the token for steps", () => {
    expect(spaceVar(24)).toBe("24px");
    expect(spaceVar(0)).toBe("0px");
    expect(spaceVar("lg")).toMatch(/^var\(--os-space-lg\)$/);
  });

  it("sets top and bottom padding on their own, with phone defaults", () => {
    const style = SectionStyleSchema.parse({
      padding: { d: "xl" },
      paddingTop: { d: 120 },
      paddingBottom: { d: 40, m: 24 },
    });
    const vars = sectionStyleVars(style);
    expect(vars["--padt"]).toBe("120px");
    expect(vars["--tpadt"]).toBe("120px");
    // Big desktop pixels come down on phones; an explicit phone value wins.
    expect(vars["--mpadt"]).toBe("72px");
    expect(vars["--padb"]).toBe("40px");
    expect(vars["--mpadb"]).toBe("24px");
    expect(vars["--pad"]).toMatch(/--os-space-xl/);
  });

  it("spaces blocks in a column, and one block's space below", () => {
    const layout = StackLayoutSchema.parse({
      mode: "stack",
      columns: { d: [12] },
      blockGap: { d: 16, m: "xs" },
      gap: 40,
    });
    const vars = stackVars(layout);
    expect(vars["--bgap"]).toBe("16px");
    expect(vars["--mbgap"]).toMatch(/--os-space-xs/);
    expect(vars["--gap"]).toBe("40px");
    const block = BlockSchema.parse({
      id: "blk_0000000001",
      type: "text",
      v: 1,
      fields: {},
      spaceBelow: { d: 8 },
    });
    expect(spaceBelowVars(block)).toMatchObject({ "--sb": "8px", "--msb": "8px" });
  });

  it("the stylesheet reads top/bottom padding, block gap and space below", () => {
    expect(BASE_CSS).toContain("var(--padt,var(--pad,");
    expect(BASE_CSS).toContain("var(--mpadb,var(--mpad,");
    expect(BASE_CSS).toContain("--colgap:var(--bgap,");
    expect(BASE_CSS).toContain(
      ".os-col>.has-sb:not(:last-child){margin-block-end:calc(var(--sb) - var(--colgap))}",
    );
  });

  it("rejects fractional or negative pixels", () => {
    expect(SectionStyleSchema.safeParse({ padding: { d: 12.5 } }).success).toBe(false);
    expect(SectionStyleSchema.safeParse({ padding: { d: -4 } }).success).toBe(false);
    expect(SectionStyleSchema.safeParse({ padding: { d: 481 } }).success).toBe(false);
  });
});
