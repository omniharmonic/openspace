import { describe, expect, it } from "vitest";
import { name } from "./index";

describe("@openspace/cli", () => {
  it("exports its package name", () => {
    expect(name).toBe("@openspace/cli");
  });
});
