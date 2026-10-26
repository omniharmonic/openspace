import { describe, expect, it } from "vitest";
import {
  fontStack,
  fontsourceCss,
  fontsourcePackages,
  getPairing,
  googleFontsUrl,
  pairingFamilies,
  TYPE_PAIRINGS,
} from "./pairings";

/** The twelve launch-template pairings (doc 04 §7). */
const TEMPLATE_PAIRINGS: [string, string, string][] = [
  ["meadow", "Fraunces", "Hanken Grotesk"],
  ["harbor", "Newsreader", "Public Sans"],
  ["atelier", "Instrument Serif", "Instrument Sans"],
  ["ledger", "Source Serif 4", "IBM Plex Sans"],
  ["hearth", "Young Serif", "Work Sans"],
  ["signal", "Bricolage Grotesque", "Geist"],
  ["field-notes", "Literata", "Manrope"],
  ["encore", "Syne", "DM Sans"],
  ["kiln", "Gloock", "Albert Sans"],
  ["commons", "Spectral", "Epilogue"],
  ["vow", "Cormorant Garamond", "Jost"],
  ["link", "Outfit", "Outfit"],
];

describe("type pairings registry", () => {
  it("has at least 30 pairings with unique slug ids", () => {
    expect(TYPE_PAIRINGS.length).toBeGreaterThanOrEqual(30);
    const ids = TYPE_PAIRINGS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("includes every launch-template pairing", () => {
    for (const [template, heading, body] of TEMPLATE_PAIRINGS) {
      const p = TYPE_PAIRINGS.find((x) => x.template === template);
      expect(p, template).toBeDefined();
      expect(p?.heading.family).toBe(heading);
      expect(p?.body.family).toBe(body);
    }
  });

  it("defines weights, tracking and fallbacks for every pairing", () => {
    for (const p of TYPE_PAIRINGS) {
      for (const spec of [p.heading, p.body]) {
        expect(spec.weights.length).toBeGreaterThan(0);
        expect([...spec.weights].sort((a, b) => a - b)).toEqual(spec.weights);
      }
      expect(p.heading.weights).toContain(p.headingWeight);
      expect(p.body.weights).toContain(p.bodyWeight);
      expect(p.headingTracking).toMatch(/^-?\d*\.?\d+em$/);
      expect(fontStack(p.body)).toMatch(/(sans-serif|serif|monospace)$/);
    }
  });

  it("builds a fallback stack", () => {
    const p = getPairing("fraunces-hanken");
    expect(p && fontStack(p.heading)).toBe(
      '"Fraunces", ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    );
  });
});

describe("font URL builders", () => {
  it("builds a Google Fonts css2 URL with italics and merged families", () => {
    const meadow = getPairing("fraunces-hanken");
    expect(meadow && googleFontsUrl(meadow)).toBe(
      "https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Hanken+Grotesk:wght@400;500;600&display=swap",
    );
    const link = getPairing("outfit");
    expect(link && pairingFamilies(link)).toHaveLength(1);
    expect(link && googleFontsUrl(link)).toBe(
      "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap",
    );
  });

  it("lists Fontsource packages and CSS entry points", () => {
    const ledger = getPairing("source-serif-plex");
    expect(ledger && fontsourcePackages(ledger)).toEqual([
      "@fontsource/source-serif-4",
      "@fontsource/ibm-plex-sans",
    ]);
    const signal = getPairing("bricolage-geist");
    expect(signal && fontsourceCss(signal)).toContain("@fontsource/geist/400.css");
    expect(signal && fontsourceCss(signal, { cdn: true })[0]).toBe(
      "https://cdn.jsdelivr.net/npm/@fontsource/bricolage-grotesque@5/500.css",
    );
    const vow = getPairing("cormorant-jost");
    expect(vow && fontsourceCss(vow)).toContain("@fontsource/cormorant-garamond/400-italic.css");
  });
});
