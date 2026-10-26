import { describe, expect, it } from "vitest";
import * as api from "./index";

describe("@openspace/ops", () => {
  it("exports its package name and public API", () => {
    expect(api.name).toBe("@openspace/ops");
    const exports: Record<string, unknown> = { ...api };
    for (const fn of [
      "apply",
      "applyAll",
      "invert",
      "invertAll",
      "validate",
      "validateAll",
      "validateDocument",
      "transformForRole",
      "rebase",
      "summarize",
      "stats",
      "diff",
      "parseOp",
    ])
      expect(typeof exports[fn]).toBe("function");
  });
});
