import { describe, expect, it } from "vitest";
import { name } from "./index";

describe("@openspace/schema", () => {
  it("exports its package name", () => {
    expect(name).toBe("@openspace/schema");
  });
});
