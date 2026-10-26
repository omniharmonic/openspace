import { type Styles, StylesSchema } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { compileStyles } from "./compile";
import { contrastRatio } from "./contrast";
import { buttonContrastFailures } from "./test-helpers";
import { allTokenVars, THEME_CLASSES, TOKEN_VARS } from "./vars";

/** The doc 04 §2.1 example (Meadow). */
const MEADOW: Styles = StylesSchema.parse({
  $schema: "https://schema.openspace.dev/v1/styles.json",
  choices: {
    palette: { brand: "oklch(0.62 0.09 145)", neutral: "warm", contrast: "standard" },
    pairing: "fraunces-hanken",
    density: "airy",
    shape: "soft",
    buttons: "pill-solid",
    motion: "subtle",
    imageTreatment: "arch",
  },
  overrides: {
    color: { accent: { $value: "oklch(0.58 0.12 40)", $type: "color" } },
    type: { display: { letterSpacing: { $value: "-0.02em" } } },
  },
});

const base = (
  choices: Partial<Styles["choices"]> = {},
  overrides?: Styles["overrides"],
): Styles => ({
  choices: { ...MEADOW.choices, ...choices },
  ...(overrides ? { overrides } : {}),
});

/** Custom properties declared in a CSS string, by selector block. */
function declared(css: string): Set<string> {
  return new Set([...css.matchAll(/(--os-[a-z0-9-]+):/g)].map((m) => m[1] as string));
}

describe("compileStyles", () => {
  it("matches the CSS snapshot for the Meadow example", async () => {
    const out = compileStyles(MEADOW);
    expect(out.warnings).toEqual([]);
    await expect(out.css).toMatchFileSnapshot("./__snapshots__/meadow.css.snap");
  });

  it("is deterministic", () => {
    const a = compileStyles(MEADOW);
    const b = compileStyles(structuredClone(MEADOW));
    expect(b.css).toBe(a.css);
    expect(b.tokens).toEqual(a.tokens);
    // Override key order doesn't change the output.
    const reordered = base({}, {
      type: MEADOW.overrides?.type,
      color: MEADOW.overrides?.color,
    } as Styles["overrides"]);
    expect(compileStyles(reordered).css).toBe(a.css);
  });

  it("defines :root, every .os-theme-* class and every image treatment class", () => {
    const { css } = compileStyles(MEADOW);
    expect(css).toMatch(/^:root \{/m);
    expect(css).toMatch(/^:root,\n\.os-theme-light \{/m);
    for (const cls of THEME_CLASSES) expect(css).toContain(`.${cls} {`);
    for (const t of ["none", "rounded", "arch", "circle", "blob", "duotone", "grain", "frame"]) {
      expect(css).toContain(`.os-image-${t} {`);
    }
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("declares exactly the TOKEN_VARS contract", () => {
    for (const choices of [
      MEADOW.choices,
      {
        ...MEADOW.choices,
        buttons: "text-arrow",
        motion: "none",
        imageTreatment: "frame",
      } as const,
    ]) {
      const vars = declared(compileStyles({ choices }).css);
      const contract = new Set(allTokenVars());
      expect([...contract].filter((v) => !vars.has(v))).toEqual([]);
      expect([...vars].filter((v) => !contract.has(v))).toEqual([]);
    }
    expect(TOKEN_VARS.color["text-muted"]).toBe("--os-color-text-muted");
    expect(TOKEN_VARS.accent[500]).toBe("--os-color-accent-500");
    expect(TOKEN_VARS.type.display["letter-spacing"]).toBe("--os-type-display-letter-spacing");
    expect(TOKEN_VARS.button.primary["bg-hover"]).toBe("--os-button-primary-bg-hover");
    expect(TOKEN_VARS.space["3xl"]).toBe("--os-space-3xl");
  });

  it("applies DTCG overrides", () => {
    const out = compileStyles(MEADOW);
    expect(out.tokens.vars.root["--os-type-display-letter-spacing"]).toBe("-0.02em");
    const light = out.tokens.themes.light;
    expect(light.accent).toBe("#b55f40");
    expect(contrastRatio(light["accent-text"], light.accent)).toBeGreaterThanOrEqual(4.5);
    // Only the light theme gets a bare `color.<role>` override.
    expect(out.tokens.themes.dark.accent).not.toBe("#b55f40");
  });

  it("derives solver-checked hover/pressed fills (Meadow accent override regression)", () => {
    const out = compileStyles(MEADOW);
    const t = out.tokens.themes.light;
    expect(t.accent).toBe("#b55f40");
    for (const state of ["accent-hover", "accent-pressed"] as const) {
      expect(t[state]).not.toBe(t.accent);
      expect(contrastRatio(t["accent-text"], t[state])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t[state], t.background)).toBeGreaterThanOrEqual(3);
    }
    expect(out.tokens.vars.themed["--os-button-primary-bg-hover"]).toBe(
      "var(--os-color-accent-hover)",
    );
    expect(out.tokens.vars.themed["--os-button-primary-bg-active"]).toBe(
      "var(--os-color-accent-pressed)",
    );
    expect(out.css).not.toContain("color-mix");
    expect(buttonContrastFailures(out.tokens.themes)).toEqual([]);
  });

  it("applies color.all.<role> to every theme with theme > light > all precedence", () => {
    const out = compileStyles(
      base(
        {},
        {
          color: {
            all: { link: { $value: "#2255aa" } },
            link: { $value: "#1144aa" },
            dark: { link: { $value: "#99bbff" } },
          },
        },
      ),
    );
    const { themes } = out.tokens;
    expect(themes.light.link).toBe("#1144aa");
    expect(themes.dark.link).toBe("#99bbff");
    expect(themes["light-accent"].link).toBe("#2255aa");
    // Where #2255aa can't pass (dark accent), the solver adjusts it and says so.
    expect(
      contrastRatio(themes["dark-accent"].link, themes["dark-accent"].background),
    ).toBeGreaterThanOrEqual(4.5);
    expect(out.warnings).toContainEqual(
      expect.objectContaining({ code: "contrast-adjusted", path: "color.all.link" }),
    );
    expect(out.contrast.failures).toEqual([]);
  });

  it("handles aliases, scale overrides, dimensions, durations, composites and theme overrides", () => {
    const out = compileStyles(
      base(
        {},
        {
          button: { primary: { radius: { $value: "{radius.md}" } } },
          color: {
            "accent-500": { $value: "#336699", $type: "color" },
            dark: { accent: { $value: "{color.accent-300}" } },
          },
          space: { md: { $value: 28, $type: "dimension" } },
          motion: {
            "duration-base": { $value: { value: 300, unit: "ms" }, $type: "duration" },
            ease: { $value: [0.4, 0, 0.2, 1], $type: "cubicBezier" },
          },
          font: { heading: { $value: ["Playfair Display", "serif"], $type: "fontFamily" } },
          type: {
            h1: {
              $value: { fontSize: "3rem", lineHeight: 1.05, fontWeight: 700 },
              $type: "typography",
            },
          },
        },
      ),
    );
    const { root, themed } = out.tokens.vars;
    expect(themed["--os-button-primary-radius"]).toBe("var(--os-radius-md)");
    expect(root["--os-color-accent-500"]).toBe("#336699");
    expect(root["--os-space-md"]).toBe("28px");
    expect(root["--os-motion-duration-base"]).toBe("300ms");
    expect(root["--os-motion-ease"]).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
    expect(root["--os-font-heading"]).toBe('"Playfair Display", serif');
    expect(root["--os-type-h1-font-size"]).toBe("3rem");
    expect(root["--os-type-h1-line-height"]).toBe("1.05");
    expect(root["--os-type-h1-font-weight"]).toBe("700");
    expect(out.tokens.themes.dark.accent).toBe(out.tokens.palette.accent[300]);
    expect(out.warnings).toEqual([]);
  });

  it("rejects unsafe or invalid override values", () => {
    const out = compileStyles(
      base(
        {},
        {
          radius: {
            md: { $value: "4px; } body { display: none" },
            lg: { $value: "url(https://tracker.example/x.png)" },
          },
          color: { text: { $value: "not-a-color" } },
        },
      ),
    );
    expect(out.css).not.toContain("display: none");
    expect(out.css).not.toContain("tracker.example");
    expect(out.tokens.vars.root["--os-radius-md"]).toBe("8px");
    const paths = out.warnings.filter((w) => w.code === "invalid-override").map((w) => w.path);
    expect(paths.sort()).toEqual(["color.text", "radius.lg", "radius.md"]);
  });

  it("emits unknown override paths as custom properties with a warning", () => {
    const out = compileStyles(base({}, { brandStripe: { width: { $value: "6px" } } }));
    expect(out.tokens.vars.root["--os-brand-stripe-width"]).toBe("6px");
    expect(out.warnings).toEqual([expect.objectContaining({ code: "custom-token" })]);
  });

  it("falls back on unknown pairings and unreadable brands", () => {
    const out = compileStyles(
      base({
        pairing: "comic-sans",
        palette: { brand: "rgb(a b c)", neutral: "cool", contrast: "standard" },
      }),
    );
    expect(out.warnings.map((w) => w.code).sort()).toEqual(["invalid-brand", "unknown-pairing"]);
    expect(out.tokens.pairing.id).toBe("fraunces-hanken");
    expect(out.contrast.failures).toEqual([]);
  });

  it("compiles every choice combination accessibly", () => {
    for (const density of ["compact", "comfortable", "airy"] as const)
      for (const shape of ["sharp", "soft", "round"] as const)
        for (const buttons of [
          "solid",
          "outline",
          "underline",
          "pill-solid",
          "pill-outline",
          "text-arrow",
        ] as const) {
          const out = compileStyles(base({ density, shape, buttons, motion: "expressive" }));
          expect(out.contrast.failures).toEqual([]);
        }
  });

  it("density, shape, motion and high contrast change the right tokens", () => {
    const compact = compileStyles(base({ density: "compact" })).tokens.vars.root;
    const airy = compileStyles(base({ density: "airy" })).tokens.vars.root;
    expect(compact["--os-space-3xl"]).toBe("4rem");
    expect(airy["--os-space-3xl"]).toBe("8rem");
    expect(compileStyles(base({ shape: "sharp" })).tokens.vars.root["--os-radius-card"]).toBe("0");
    expect(
      compileStyles(base({ motion: "none" })).tokens.vars.root["--os-motion-duration-base"],
    ).toBe("0ms");
    const high = compileStyles(base({ palette: { ...MEADOW.choices.palette, contrast: "high" } }));
    expect(high.contrast.mode).toBe("high");
    const t = high.tokens.themes.light;
    expect(contrastRatio(t["text-muted"], t.background)).toBeGreaterThanOrEqual(7);
    expect(high.contrast.failures).toEqual([]);
  });

  it("exposes font loading info", () => {
    const { fonts } = compileStyles(MEADOW).tokens;
    expect(fonts.googleFontsUrl).toContain("family=Fraunces");
    expect(fonts.fontsource).toContain("@fontsource/hanken-grotesk/400.css");
  });
});
