import { describe, expect, it } from "vitest";
import { name } from "./index";

describe("@openspace/site-kit", () => {
  it("exports its package name", () => {
    expect(name).toBe("@openspace/site-kit");
  });
});
