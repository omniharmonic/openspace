import { describe, expect, it } from "vitest";
import { name } from "./index";

describe("@omniharmonic/openspace-visual-tests", () => {
  it("exports its package name", () => {
    expect(name).toBe("@omniharmonic/openspace-visual-tests");
  });
});
