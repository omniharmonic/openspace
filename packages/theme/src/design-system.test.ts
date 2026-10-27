import { type Styles, StylesSchema } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { compileStyles } from "./compile";
import { contrastRatio } from "./contrast";
import {
  designSystemStyles,
  firstFamily,
  readDesignTokens,
  tokensFromStyles,
} from "./design-system";

const BASE: Styles = {
  choices: {
    palette: {
      brand: "oklch(0.55 0.12 250)",
      neutral: "warm",
      contrast: "standard",
      source: "curated",
    },
    pairing: "fraunces-hanken",
    density: "comfortable",
    shape: "soft",
    buttons: "solid",
    motion: "subtle",
    imageTreatment: "none",
  },
};

/** The powerwith site's own hand-written token file (docs/handoff/design-tokens.json). */
const POWERWITH = {
  color: { ink: "#141210", paper: "#f4efe6", rust: "#a4502e", moss: "#3d4a33" },
  grounds: {
    ink: { background: "ink", text: "paper", label: "rust", rule: "rust" },
    paper: { background: "paper", text: "ink", label: "moss", rule: "rust" },
    rust: { background: "rust", text: "paper", label: "paper", rule: "paper" },
  },
  font: {
    display: "'Playfair Display', Georgia, serif",
    body: "'Lora', Georgia, serif",
    label: "'Freight Sans Pro', Arial, sans-serif",
    weights: { display: 500, body: 400, label: 500 },
  },
  type: {
    "display-xl": { desktop: "88px", mobile: "52px", lineHeight: 1.0, font: "display" },
    "display-md": { desktop: "56px", mobile: "38px", lineHeight: 1.1, font: "display" },
    quote: { desktop: "28px", mobile: "22px", lineHeight: 1.25, font: "display" },
    "body-lg": { desktop: "20px", mobile: "18px", lineHeight: 1.5, font: "body" },
    label: {
      desktop: "12px",
      mobile: "11px",
      letterSpacing: "0.28em",
      transform: "uppercase",
      font: "label",
    },
  },
  space: {
    contentMax: "1100px",
    sectionPadDesktop: "104px",
    sectionPadMobile: "56px",
    gutterDesktop: "32px",
    gutterMobile: "20px",
  },
  radius: "0",
};

describe("readDesignTokens", () => {
  it("reads a plain hand-written token file (powerwith)", () => {
    const r = readDesignTokens(POWERWITH);
    expect(r.format).toBe("plain");
    const c = r.tokens.colors ?? {};
    expect(c.paper).toEqual({ value: "#f4efe6", role: "background" });
    expect(c.ink).toEqual({ value: "#141210", role: "text" });
    expect(c.rust?.role).toBe("brand");
    expect(r.tokens.fonts?.heading?.family).toBe("Playfair Display");
    expect(r.tokens.fonts?.body?.family).toBe("Lora");
    expect(r.tokens.fonts?.label?.family).toBe("Freight Sans Pro");
    expect(r.tokens.type?.display).toMatchObject({ size: 88, sizeMobile: 52, lineHeight: 1 });
    expect(r.tokens.type?.eyebrow).toMatchObject({
      size: 12,
      letterSpacing: 0.28,
      case: "uppercase",
      font: "label",
    });
    expect(r.tokens.space).toMatchObject({
      contentWidth: 1100,
      sectionPadding: 104,
      sectionPaddingMobile: 56,
      gutter: 32,
    });
    expect(r.tokens.radius?.base).toBe(0);
    expect(r.rules.join(" ")).toContain("On the paper ground");
  });

  it("reads W3C design tokens (DTCG) with aliases and composite typography", () => {
    const r = readDesignTokens({
      color: {
        $type: "color",
        base: {
          forest: { $value: "#1f4d3a" },
          cream: { $value: "#fbf7ef" },
          charcoal: { $value: "#222222" },
        },
        background: { $value: "{color.base.cream}" },
        text: { default: { $value: "{color.base.charcoal}" } },
        primary: { $value: "{color.base.forest}" },
      },
      font: {
        family: {
          heading: { $type: "fontFamily", $value: ["Fraunces", "serif"] },
          body: { $type: "fontFamily", $value: ["Inter", "sans-serif"] },
        },
      },
      typography: {
        h1: {
          $type: "typography",
          $value: {
            fontFamily: "{font.family.heading}",
            fontSize: "3.5rem",
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          },
        },
        body: {
          $type: "typography",
          $value: { fontFamily: "{font.family.body}", fontSize: "18px", lineHeight: 1.6 },
        },
      },
      radius: { md: { $type: "dimension", $value: "8px" } },
    });
    expect(r.format).toBe("dtcg");
    const c = r.tokens.colors ?? {};
    expect(Object.values(c).find((x) => x.role === "background")?.value).toBe("#fbf7ef");
    expect(Object.values(c).find((x) => x.role === "text")?.value).toBe("#222222");
    expect(Object.values(c).find((x) => x.role === "brand")?.value).toBe("#1f4d3a");
    expect(r.tokens.fonts?.heading?.family).toBe("Fraunces");
    expect(r.tokens.fonts?.body?.family).toBe("Inter");
    expect(r.tokens.type?.h1).toMatchObject({
      size: 56,
      weight: 600,
      lineHeight: 1.1,
      letterSpacing: -0.02,
    });
    expect(r.tokens.type?.body).toMatchObject({ size: 18 });
    expect(r.tokens.radius?.md).toBe(8);
  });

  it("reads Style Dictionary and Tokens Studio files", () => {
    const sd = readDesignTokens({
      color: {
        brand: { primary: { value: "#d6336c" } },
        neutral: { "100": { value: "#ffffff" }, "900": { value: "#111111" } },
      },
      size: { font: { sm: { value: "14px" }, base: { value: "16px" }, "4xl": { value: "48px" } } },
    });
    expect(sd.format).toBe("style-dictionary");
    expect(Object.values(sd.tokens.colors ?? {}).find((x) => x.role === "brand")?.value).toBe(
      "#d6336c",
    );
    expect(sd.tokens.type?.body?.size).toBe(16);
    expect(sd.tokens.type?.h1?.size).toBe(48);
    const studio = readDesignTokens({
      global: {
        colors: {
          accent: { value: "#0b7285", type: "color" },
          bg: { value: "#f8f9fa", type: "color" },
        },
        fontFamilies: { heading: { value: "Space Grotesk", type: "fontFamilies" } },
        borderRadius: { pill: { value: "999px", type: "borderRadius" } },
      },
      $themes: [],
      $metadata: { tokenSetOrder: ["global"] },
    });
    expect(studio.format).toBe("tokens-studio");
    expect(studio.tokens.fonts?.heading?.family).toBe("Space Grotesk");
    expect(studio.tokens.radius?.pill).toBe(999);
  });

  it("reads a brand kit (colour list and fonts)", () => {
    const r = readDesignTokens({
      name: "Bloom Bakery",
      colors: [
        { name: "Blush", hex: "#F4C7C3" },
        { name: "Cocoa", hex: "#4A2C2A" },
        { name: "Cream", hex: "#FFF8F0" },
      ],
      fonts: [
        { usage: "Heading", family: "Abril Fatface" },
        { usage: "Body", family: "Work Sans" },
      ],
    });
    expect(r.format).toBe("canva");
    expect(r.tokens.fonts?.heading?.family).toBe("Abril Fatface");
    expect(r.tokens.fonts?.body?.family).toBe("Work Sans");
    const c = Object.values(r.tokens.colors ?? {});
    expect(c.find((x) => x.role === "background")?.value).toBe("#fff8f0");
    expect(c.find((x) => x.role === "text")?.value).toBe("#4a2c2a");
  });

  it("explains files without tokens", () => {
    expect(() => readDesignTokens("not json")).toThrow(/valid JSON/);
    expect(() => readDesignTokens({ hello: "world" })).toThrow(/couldn't find/);
  });

  it("first family skips generic fallbacks", () => {
    expect(firstFamily("-apple-system, 'Inter Tight', sans-serif")).toBe("Inter Tight");
  });
});

describe("designSystemStyles", () => {
  it("maps powerwith's tokens onto valid Site Styles with readable contrast", () => {
    const { tokens } = readDesignTokens(POWERWITH);
    const r = designSystemStyles(tokens, BASE, { isGoogleFont: (f) => /playfair|lora/i.test(f) });
    expect(StylesSchema.safeParse(r.styles).success).toBe(true);
    const ch = r.styles.choices;
    expect(ch.palette.brand).toBe("#a4502e");
    expect(ch.shape).toBe("sharp");
    expect(ch.density).toBe("airy");
    expect(ch.typography?.heading?.family).toBe("Playfair Display");
    expect(ch.typography?.body?.family).toBe("Lora");
    expect(ch.typography?.label).toBeUndefined();
    expect(ch.typography?.scale?.display?.size).toBe(88);
    expect(ch.layout).toMatchObject({
      contentWidth: 1100,
      sectionPadding: 104,
      sectionPaddingMobile: 56,
    });
    const compiled = compileStyles(r.styles);
    const light = compiled.tokens.themes.light;
    expect(light.background).toBe("#f4efe6");
    expect(contrastRatio(light.text, light.background)).toBeGreaterThan(4.5);
    expect(compiled.contrast.failures).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/Freight Sans Pro isn't a free web font/);
  });

  it("nudges a too-light brand colour and says so", () => {
    const { tokens } = readDesignTokens({
      color: { primary: "#ffd43b", background: "#ffffff", text: "#333333" },
    });
    const r = designSystemStyles(tokens, BASE);
    expect(compileStyles(r.styles).contrast.failures).toEqual([]);
    expect(r.contrast.length).toBeGreaterThan(0);
    expect(r.notes.join(" ")).toMatch(/nudged/);
  });

  it("tokensFromStyles describes a template look", () => {
    const t = tokensFromStyles(BASE);
    expect(t.fonts?.heading?.family).toBe("Fraunces");
    expect(t.colors?.background?.role).toBe("background");
    expect(t.type?.body?.size).toBeGreaterThan(10);
  });
});
