import type { CustomFont, Styles } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { compileStyles } from "./compile";
import { customFontFaces, customFontPreloads, nearestWeight } from "./custom-fonts";

const GROTESK: CustomFont = {
  family: "Studio Grotesk",
  category: "sans-serif",
  files: [
    { src: "media/fonts/studio-grotesk-400-1a2b3c4d.woff2", weight: 400, style: "normal" },
    { src: "media/fonts/studio-grotesk-400i-2b3c4d5e.woff2", weight: 400, style: "italic" },
    { src: "media/fonts/studio-grotesk-700-5e6f7a8b.otf", weight: 700, style: "normal" },
  ],
  license: { webUse: true },
};

const styles = (choices: Partial<Styles["choices"]> = {}): Styles => ({
  choices: {
    palette: { brand: "#3a6ea5", neutral: "cool", contrast: "standard" },
    pairing: "fraunces-hanken",
    density: "comfortable",
    shape: "soft",
    buttons: "solid",
    motion: "subtle",
    imageTreatment: "none",
    ...choices,
  },
  fonts: [GROTESK],
});

describe("uploaded fonts (PRD 5.1)", () => {
  it("uses an uploaded family for headings with its nearest weight", () => {
    const out = compileStyles(styles({ headingFont: "Studio Grotesk" }));
    expect(out.css).toMatch(/--os-font-heading: "Studio Grotesk", ui-sans-serif/);
    expect(out.css).toMatch(/--os-font-weight-heading: (400|700);/);
    // Body stays on the pairing.
    expect(out.css).toMatch(/--os-font-body: "Hanken Grotesk"/);
  });

  it("emits @font-face only for fonts in use, with formats and font-display swap", () => {
    const url = (src: string) => `/base/${src}`;
    expect(customFontFaces(styles(), url)).toBe("");
    const css = customFontFaces(styles({ bodyFont: "Studio Grotesk" }), url);
    expect(css.match(/@font-face/g)).toHaveLength(3);
    expect(css).toContain(
      'src:url("/base/media/fonts/studio-grotesk-400-1a2b3c4d.woff2") format("woff2");font-weight:400;font-style:normal;font-display:swap',
    );
    expect(css).toContain('format("opentype");font-weight:700');
    expect(customFontFaces(styles(), url, { all: true })).toContain("@font-face");
  });

  it("preloads the upright WOFF2 nearest each chosen weight", () => {
    expect(
      customFontPreloads(styles({ bodyFont: "Studio Grotesk" }), { heading: 600, body: 400 }),
    ).toEqual(["media/fonts/studio-grotesk-400-1a2b3c4d.woff2"]);
    expect(nearestWeight(GROTESK, 549)).toBe(400);
    expect(nearestWeight(GROTESK, 551)).toBe(700);
  });
});
