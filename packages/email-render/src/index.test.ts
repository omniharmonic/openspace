import { describe, expect, it } from "vitest";
import { name } from "./index";

describe("@openspace/email-render", () => {
  it("exports its package name", () => {
    expect(name).toBe("@openspace/email-render");
  });
});
