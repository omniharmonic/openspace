import { describe, expect, it } from "vitest";
import { name } from "./index";

describe("@openspace/renderer", () => {
  it("exports its package name", () => {
    expect(name).toBe("@openspace/renderer");
  });
});
