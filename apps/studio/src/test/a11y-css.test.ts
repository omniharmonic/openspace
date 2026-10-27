import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "@omniharmonic/openspace-theme";
import { describe, expect, it } from "vitest";

const src = join(__dirname, "..");
const css = (path: string) => readFileSync(join(src, path), "utf8");

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(text: string, selector: string): string {
  const at = text.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`no rule ${selector}`);
  return text.slice(at, text.indexOf("}", at));
}
const px = (decls: string, prop: string) =>
  Number(new RegExp(`(?:^|\\s)${prop}:\\s*(\\d+)px`).exec(decls)?.[1] ?? Number.NaN);

/** `rgb(r g b / a)` over a solid hex, as a hex. */
function over(rgba: string, base: string): string {
  const m = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(rgba);
  if (!m) throw new Error(rgba);
  const a = Number(m[4]);
  const b = [1, 3, 5].map((i) => Number.parseInt(base.slice(i, i + 2), 16));
  return `#${[1, 2, 3]
    .map((i, k) => Math.round(Number(m[i]) * a + (b[k] as number) * (1 - a)))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

describe("accessibility of Studio's own CSS", () => {
  it("look swatches are at least 24×24 (WCAG 2.5.8)", () => {
    const item = rule(css("features/templates/LookPicker.css"), ".st-looks__item");
    expect(px(item, "height")).toBeGreaterThanOrEqual(24);
    expect(px(item, "min-width")).toBeGreaterThanOrEqual(24);
  });

  it("the 'Setting up' badge text is at least 4.5:1 on its tint, over every light surface", () => {
    const tokens = css("styles/tokens.css");
    const light = tokens.slice(0, tokens.indexOf("}"));
    const token = (name: string) =>
      new RegExp(`--st-${name}:\\s*([^;]+);`).exec(light)?.[1]?.trim() ?? "";
    const text = token("pending");
    const tint = token("pending-soft");
    for (const surface of ["bg", "panel", "canvas"]) {
      const bg = over(tint, token(surface));
      expect(contrastRatio(text, bg), `${text} on ${bg} (${surface})`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
