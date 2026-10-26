import { describe, expect, it } from "vitest";
import { name } from "./index";

describe("@openspace/claude-plugin", () => {
  it("exports its package name", () => {
    expect(name).toBe("@openspace/claude-plugin");
  });
});
