import { allTokenVars, compileStyles } from "@openspace/theme";
import { describe, expect, it } from "vitest";
import { siteFixture } from "./__fixtures__/site";
import { BASE_CSS } from "./styles/base-css";

describe("os.css", () => {
  it("references only documented --os-* token variables", () => {
    const known = new Set(allTokenVars());
    const used = new Set([...BASE_CSS.matchAll(/--os-[a-z0-9-]+/g)].map((m) => m[0]));
    const unknown = [...used].filter((v) => !known.has(v));
    expect(unknown).toEqual([]);
    expect(used.size).toBeGreaterThan(60);
  });

  it("never declares --os-* variables (those belong to the theme)", () => {
    expect(BASE_CSS).not.toMatch(/(?:^|[;{\s])--os-[a-z0-9-]+\s*:/);
  });

  it("every --os-* var it uses is emitted by the compiled theme", () => {
    const css = compileStyles(siteFixture().styles).css;
    const emitted = new Set([...css.matchAll(/(--os-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    const used = new Set([...BASE_CSS.matchAll(/--os-[a-z0-9-]+/g)].map((m) => m[0]));
    expect([...used].filter((v) => !emitted.has(v))).toEqual([]);
  });

  it("has balanced braces and the expected layers", () => {
    const open = BASE_CSS.split("{").length;
    const close = BASE_CSS.split("}").length;
    expect(open).toBe(close);
    expect(BASE_CSS).toContain("@layer os.reset, os.base, os.layout, os.components, os.behaviors, os.utilities;");
  });

  it("implements the §3.3 grid, breakpoints, container queries and reduced motion", () => {
    expect(BASE_CSS).toContain("[content-start] repeat(24,");
    expect(BASE_CSS).toContain("repeat(8,minmax(0,1fr))");
    expect(BASE_CSS).toContain("grid-auto-rows:minmax(var(--row-unit),auto)");
    expect(BASE_CSS).toContain("@media (min-width:768px)");
    expect(BASE_CSS).toContain("@media (min-width:1200px)");
    expect(BASE_CSS).toContain("container-type:inline-size");
    expect(BASE_CSS).toContain("@container block");
    expect(BASE_CSS).toContain("@media (prefers-reduced-motion:reduce)");
    expect(BASE_CSS).toContain("@media (prefers-reduced-motion:no-preference)");
  });

  it("draws input outlines with text-muted, never the decorative border role", () => {
    const input = /\.os-input,\.os-textarea,\.os-select\{[^}]*\}/.exec(BASE_CSS)?.[0] ?? "";
    expect(input).toContain("border:1px solid var(--os-color-text-muted)");
    expect(input).not.toContain("--os-color-border");
  });
});
