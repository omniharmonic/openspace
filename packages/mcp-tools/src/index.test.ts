import { describe, expect, it } from "vitest";
import { name } from "./index";

describe("@openspace/mcp-tools", () => {
  it("exports its package name", () => {
    expect(name).toBe("@openspace/mcp-tools");
  });
});
