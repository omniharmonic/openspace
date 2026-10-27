import { describe, expect, it } from "vitest";
import { name } from "./index";

describe("@omniharmonic/openspace-mcp-tools", () => {
  it("exports its package name", () => {
    expect(name).toBe("@omniharmonic/openspace-mcp-tools");
  });
});
