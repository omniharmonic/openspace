import { type Styles, StylesSchema } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { compileStyles } from "./compile";
import { googleFontsUrl } from "./pairings";
import { mobileSize } from "./type-scale";

const BASE: Styles = {
  choices: {
    palette: { brand: "#8E4A30", neutral: "warm", contrast: "standard" },
    pairing: "cormorant-jost",
    density: "comfortable",
    shape: "sharp",
    buttons: "solid",
    motion: "subtle",
    imageTreatment: "none",
  },
};

/** A site's own typography, as an import of a Cormorant / EB Garamond / Montserrat site sets it. */
const SITE: Styles = StylesSchema.parse({
  choices: {
    ...BASE.choices,
    typography: {
      heading: { family: "Cormorant Garamond", category: "serif", weights: [500], italic: true },
      body: { family: "EB Garamond", category: "serif", weights: [400], italic: true },
      label: { family: "Montserrat", category: "sans-serif", weights: [300, 400] },
      scale: {
        display: { size: 96, sizeMobile: 58, lineHeight: 1 },
        h2: { size: 60, sizeMobile: 40, lineHeight: 1.08, weight: 500 },
        body: { size: 21, sizeMobile: 19, lineHeight: 1.5 },
        eyebrow: { size: 12, sizeMobile: 11, letterSpacing: 0.3, case: "uppercase" },
        nav: { size: 12, letterSpacing: 0.22, case: "uppercase", font: "label" },
      },
      eyebrowColor: "muted",
    },
    layout: { contentWidth: 1200, sectionPadding: 112, sectionPaddingMobile: 56, gutter: 32 },
  },
});

describe("typography and layout choices", () => {
  it("leaves sites without them unchanged", () => {
    const plain = compileStyles(BASE);
    expect(plain.tokens.pairing.id).toBe("cormorant-jost");
    expect(plain.tokens.pairing.label).toBeUndefined();
    expect(plain.tokens.vars.root["--os-font-label"]).toBe("var(--os-font-body)");
    expect(plain.tokens.vars.root["--os-type-eyebrow-font-family"]).toBe("var(--os-font-label)");
    expect(plain.tokens.vars.themed["--os-eyebrow-color"]).toBe("var(--os-color-link)");
  });

  it("uses the site's Google Fonts per role, loaded like a pairing", () => {
    const out = compileStyles(SITE);
    expect(out.warnings).toEqual([]);
    const root = out.tokens.vars.root;
    expect(root["--os-font-heading"]).toMatch(/^"Cormorant Garamond", /);
    expect(root["--os-font-body"]).toMatch(/^"EB Garamond", /);
    expect(root["--os-font-label"]).toMatch(/^"Montserrat", /);
    expect(root["--os-font-weight-heading"]).toBe("500");
    const url = googleFontsUrl(out.tokens.pairing);
    expect(url).toContain("family=Cormorant+Garamond:ital,wght@0,500;1,500");
    expect(url).toContain("family=EB+Garamond:ital,wght@0,400;1,400");
    expect(url).toContain("family=Montserrat:wght@300;400");
    expect(out.tokens.fonts.fontsource).toContain("@fontsource/montserrat/300.css");
  });

  it("tunes the type scale: sizes, line height, tracking, case and font role", () => {
    const root = compileStyles(SITE).tokens.vars.root;
    expect(root["--os-type-display-font-size"]).toBe("clamp(3.625rem, 2.8333rem + 3.5185vw, 6rem)");
    expect(root["--os-type-display-line-height"]).toBe("1");
    expect(root["--os-type-h2-font-weight"]).toBe("500");
    expect(root["--os-type-body-font-size"]).toMatch(/1\.3125rem\)$/);
    expect(root["--os-type-eyebrow-letter-spacing"]).toBe("0.3em");
    expect(root["--os-type-eyebrow-text-transform"]).toBe("uppercase");
    expect(root["--os-type-eyebrow-font-size"]).toMatch(/^clamp\(0\.6875rem/);
    expect(root["--os-type-nav-text-transform"]).toBe("uppercase");
    expect(root["--os-type-nav-font-family"]).toBe("var(--os-font-label)");
    // Untuned presets keep the pairing's scale.
    expect(root["--os-type-h1-font-size"]).toBe(
      compileStyles(BASE).tokens.vars.root["--os-type-h1-font-size"],
    );
  });

  it("sets the page rhythm and the eyebrow color", () => {
    const out = compileStyles(SITE);
    expect(out.tokens.vars.root["--os-width-content"]).toBe("1200px");
    expect(out.tokens.vars.root["--os-section-pad-y"]).toBe(
      "clamp(3.5rem, 2.3333rem + 5.1852vw, 7rem)",
    );
    expect(out.tokens.vars.root["--os-section-gutter"]).toMatch(/2rem\)$/);
    expect(out.tokens.vars.themed["--os-eyebrow-color"]).toBe("var(--os-color-text-muted)");
    expect(out.css).toContain("--os-eyebrow-color: var(--os-color-text-muted);");
  });

  it("lets Designer overrides still win over tuned presets", () => {
    const out = compileStyles({
      ...SITE,
      overrides: { type: { display: { fontSize: { $value: "5rem" } } } },
    });
    expect(out.tokens.vars.root["--os-type-display-font-size"]).toBe("5rem");
  });

  it("derives phone sizes like the default scale", () => {
    expect(mobileSize(96)).toBeCloseTo(56.2, 0);
    expect(mobileSize(60)).toBeCloseTo(39.5, 0);
    expect(mobileSize(16)).toBe(15);
  });

  it("rejects fonts that aren't family names and out-of-range sizes", () => {
    const bad = (choices: unknown) =>
      StylesSchema.safeParse({ choices: { ...BASE.choices, ...(choices as object) } }).success;
    expect(bad({ typography: { heading: { family: "x;}<style>", category: "serif" } } })).toBe(
      false,
    );
    expect(bad({ typography: { scale: { h1: { size: 999 } } } })).toBe(false);
    expect(bad({ typography: { scale: { caption: { size: 14 } } } })).toBe(false);
    expect(bad({ layout: { contentWidth: 1200 } })).toBe(true);
  });
});
