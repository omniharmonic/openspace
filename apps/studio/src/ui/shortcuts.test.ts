import { describe, expect, it } from "vitest";
import { evaluateExpression } from "./math";
import { hexToHsv, hsvToHex, luminance, normalizeHex } from "./color";
import { formatShortcut, matchesShortcut, shortcutKeys } from "./shortcuts";

const ev = (key: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}, code?: string) => ({
  key,
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe("shortcuts", () => {
  it("formats with Apple symbols in canonical order", () => {
    expect(formatShortcut("mod+shift+z", "mac")).toBe("⇧⌘Z");
    expect(shortcutKeys("alt+arrowup", "mac")).toEqual(["⌥", "↑"]);
    expect(formatShortcut("mod+backslash", "mac")).toBe("⌘\\");
  });

  it("formats with words elsewhere", () => {
    expect(formatShortcut("mod+k", "other")).toBe("Ctrl+K");
    expect(formatShortcut("shift+mod+z", "other")).toBe("Shift+Ctrl+Z");
  });

  it("matches mod to ⌘ on mac and Ctrl elsewhere", () => {
    expect(matchesShortcut(ev("k", { metaKey: true }), "mod+k", "mac")).toBe(true);
    expect(matchesShortcut(ev("k", { ctrlKey: true }), "mod+k", "mac")).toBe(false);
    expect(matchesShortcut(ev("k", { ctrlKey: true }), "mod+k", "other")).toBe(true);
    expect(matchesShortcut(ev("K", { metaKey: true, shiftKey: true }), "mod+k", "mac")).toBe(false);
    expect(matchesShortcut(ev("z", { metaKey: true, shiftKey: true }), "shift+mod+z", "mac")).toBe(true);
  });

  it("matches by physical key when the option key changes the character", () => {
    expect(matchesShortcut(ev("¡", { altKey: true }, "Digit1"), "alt+1", "mac")).toBe(true);
    expect(matchesShortcut(ev("!", { shiftKey: true }, "Digit1"), "shift+1", "mac")).toBe(true);
    expect(matchesShortcut(ev("\\", { metaKey: true }), "mod+backslash", "mac")).toBe(true);
  });

  it("treats shifted symbols like ? without requiring shift in the shortcut", () => {
    expect(matchesShortcut(ev("?", { shiftKey: true }), "?", "mac")).toBe(true);
  });
});

describe("number math", () => {
  it("evaluates simple arithmetic", () => {
    expect(evaluateExpression("24*2")).toBe(48);
    expect(evaluateExpression("(100 - 8) / 4")).toBe(23);
    expect(evaluateExpression("-3.5")).toBe(-3.5);
    expect(evaluateExpression("2+3*4")).toBe(14);
  });

  it("rejects anything else", () => {
    expect(evaluateExpression("alert(1)")).toBeNull();
    expect(evaluateExpression("2**3")).toBeNull();
    expect(evaluateExpression("1/0")).toBeNull();
    expect(evaluateExpression("")).toBeNull();
    expect(evaluateExpression("(1+2")).toBeNull();
  });
});

describe("color", () => {
  it("normalizes hex", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("3347E6")).toBe("#3347e6");
    expect(normalizeHex("nope")).toBeNull();
  });

  it("round-trips through HSV", () => {
    for (const hex of ["#3347e6", "#000000", "#ffffff", "#b0603f", "#6f8461"]) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it("computes WCAG luminance", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1);
    expect(luminance("#000000")).toBeCloseTo(0);
  });
});
