import { describe, expect, it } from "vitest";
import { safeNext } from "./SignInPage";

const ORIGIN = "https://studio.openspace.dev";

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/sites/st_1?welcome=1#top", ORIGIN)).toBe("/sites/st_1?welcome=1#top");
    expect(safeNext("/new/meadow", ORIGIN)).toBe("/new/meadow");
  });

  it("rejects anything that could leave the app", () => {
    for (const bad of [
      null,
      "",
      "sites",
      "//evil.example",
      "/\\evil.example",
      "/\\/evil.example",
      "\\\\evil.example",
      "https://evil.example/sites",
      "javascript:alert(1)",
    ]) {
      expect(safeNext(bad, ORIGIN)).toBe("/sites");
    }
  });
});
