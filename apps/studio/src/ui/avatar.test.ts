import { describe, expect, it } from "vitest";
import { initialsColor } from "./Avatar";

describe("avatar initials color", () => {
  it("keeps white only where it reaches 4.5:1", () => {
    expect(initialsColor("#3e63dd")).toBe("#fff");
    expect(initialsColor("#8e4ec6")).toBe("#fff");
    expect(initialsColor("#2f7d32")).toBe("#fff");
    for (const light of ["#f76b15", "#e5484d", "#0d9488", "#d6409f", "#b0710c"])
      expect(initialsColor(light)).toBe("#111113");
    expect(initialsColor("tomato")).toBe("#fff");
  });
});
