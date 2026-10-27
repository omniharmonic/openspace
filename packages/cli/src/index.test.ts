import { describe, expect, it } from "vitest";
import { name } from "./index";

describe("@omniharmonic/openspace-cli", () => {
  it("exports its package name", () => {
    expect(name).toBe("@omniharmonic/openspace-cli");
  });
});
