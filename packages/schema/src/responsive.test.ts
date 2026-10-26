import { describe, expect, it } from "vitest";
import { z } from "zod";
import { isOverridden, resolve, resolveAll, responsive } from "./responsive";

describe("responsive", () => {
  it("inherits m ← t ← d", () => {
    expect(resolveAll({ d: 1 })).toEqual({ d: 1, t: 1, m: 1 });
    expect(resolveAll({ d: 1, t: 2 })).toEqual({ d: 1, t: 2, m: 2 });
    expect(resolveAll({ d: 1, m: 3 })).toEqual({ d: 1, t: 1, m: 3 });
    expect(resolveAll({ d: 1, t: 2, m: 3 })).toEqual({ d: 1, t: 2, m: 3 });
  });

  it("keeps falsy overrides instead of inheriting", () => {
    expect(resolve({ d: true, m: false }, "m")).toBe(false);
    expect(resolve({ d: 5, t: 0 }, "m")).toBe(0);
    expect(resolve(undefined, "d")).toBeUndefined();
  });

  it("reports overrides", () => {
    expect(isOverridden({ d: 1, m: 2 }, "m")).toBe(true);
    expect(isOverridden({ d: 1, m: 2 }, "t")).toBe(false);
  });

  it("builds a zod schema requiring desktop", () => {
    const s = responsive(z.number());
    expect(s.safeParse({ d: 1, m: 2 }).success).toBe(true);
    expect(s.safeParse({ m: 2 }).success).toBe(false);
    expect(s.safeParse({ d: 1, x: 2 }).success).toBe(false);
    expect(s.safeParse({ d: "1" }).success).toBe(false);
  });
});
