import { describe, expect, it } from "vitest";
import { name } from "./index";

describe("@openspace/template-starter", () => {
  it("exports its package name", () => {
    expect(name).toBe("@openspace/template-starter");
  });
});
