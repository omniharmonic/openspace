import { describe, expect, it } from "vitest";
import { name } from "./index";

describe("@openspace/ops", () => {
  it("exports its package name", () => {
    expect(name).toBe("@openspace/ops");
  });
});
