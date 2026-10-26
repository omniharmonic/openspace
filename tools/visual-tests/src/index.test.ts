import { describe, expect, it } from "vitest";
import { name } from "./index";

describe("@openspace/visual-tests", () => {
  it("exports its package name", () => {
    expect(name).toBe("@openspace/visual-tests");
  });
});
