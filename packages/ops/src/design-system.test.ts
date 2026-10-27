import { createBlockRegistry, type DesignSystem } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { stampOp } from "./__fixtures__/arbitrary";
import { siteFixture } from "./__fixtures__/site";
import { apply } from "./apply";
import { diff } from "./diff";
import { invert } from "./invert";
import { OpSchema } from "./ops";
import { deepEqual } from "./paths";
import { transformForRole } from "./roles";
import { summarize } from "./summarize";
import { validate } from "./validate";

const record: DesignSystem = {
  version: 1,
  brief: { about: "A neighbourhood bakery", feeling: ["warm", "playful"] },
  tokens: { colors: { cream: { value: "#fff8f0", role: "background" } } },
  rules: ["Cream grounds, cocoa text."],
};

describe("designSystem.set", () => {
  it("sets, replaces and removes the record, invertibly", () => {
    const doc = siteFixture();
    const registry = createBlockRegistry([]);
    const op = stampOp({ op: "designSystem.set", designSystem: record });
    const r = validate(doc, op, { registry });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.doc.designSystem?.brief?.about).toBe("A neighbourhood bakery");
    expect(deepEqual(apply(r.doc, invert(doc, op)), doc)).toBe(true);
    const off = stampOp({ op: "designSystem.set", designSystem: null });
    const cleared = apply(r.doc, off);
    expect(cleared.designSystem).toBeUndefined();
    expect(deepEqual(apply(cleared, invert(r.doc, off)), r.doc)).toBe(true);
    expect(summarize([op], doc)).toBe("Updated the design system");
  });

  it("diff emits it and roles keep it to owners and designers", () => {
    const doc = siteFixture();
    const after = { ...doc, designSystem: record };
    const ops = diff(doc, after);
    expect(ops.map((o) => o.op)).toEqual(["designSystem.set"]);
    const op = stampOp({ op: "designSystem.set", designSystem: record });
    expect(transformForRole(op, "designer", []).allowed).toBe(true);
    expect(transformForRole(op, "editor", []).allowed).toBe(false);
  });

  it("refuses a malformed record", () => {
    expect(
      OpSchema.safeParse({
        ...stampOp({ op: "designSystem.set", designSystem: null }),
        designSystem: { version: 2 },
      }).success,
    ).toBe(false);
  });
});
