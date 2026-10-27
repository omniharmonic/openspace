#!/usr/bin/env node
/**
 * Regenerates src/fidelity/font-metrics.ts: x-height, cap height and average lowercase width
 * (em) of open-licence Google Fonts families, measured in Chromium exactly the way the look
 * probe measures a live site's fonts (canvas, 100px, weight 400). The importer uses the table
 * to pick the nearest open-licence match for a licensed font it may not copy.
 *
 *   node packages/import/scripts/font-metrics.mjs   (needs Playwright + Chromium and the network)
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, "../../cli/package.json"));
const { chromium } = require("playwright");

/** [family, category, small caps?] — open licence (OFL / Apache / UFL) on Google Fonts. */
const FAMILIES = [
  // serif
  ...[
    "EB Garamond",
    "Cormorant Garamond",
    "Cormorant",
    "Crimson Pro",
    "Crimson Text",
    "Libre Baskerville",
    "Baskervville",
    "Lora",
    "Merriweather",
    "Playfair Display",
    "Source Serif 4",
    "PT Serif",
    "Noto Serif",
    "Gelasio",
    "Tinos",
    "Spectral",
    "Cardo",
    "Libre Caslon Text",
    "Old Standard TT",
    "Vollkorn",
    "Alegreya",
    "Domine",
    "Fraunces",
    "Newsreader",
    "Literata",
    "IBM Plex Serif",
    "DM Serif Display",
    "DM Serif Text",
    "Bodoni Moda",
    "Libre Bodoni",
    "Prata",
    "Sorts Mill Goudy",
    "Rosarivo",
    "Petrona",
    "Instrument Serif",
    "Young Serif",
    "Gloock",
    "Marcellus",
    "Frank Ruhl Libre",
    "Noticia Text",
    "Brygada 1918",
    "Besley",
    "Castoro",
    "Cormorant Infant",
    "Gilda Display",
    "Italiana",
    "Bellefair",
    "Forum",
  ].map((f) => [f, "serif"]),
  ...["Zilla Slab", "Roboto Slab", "Arvo", "Josefin Slab", "Bitter", "Aleo"].map((f) => [
    f,
    "serif",
  ]),
  ...[
    "Cormorant SC",
    "Alegreya SC",
    "Playfair Display SC",
    "Marcellus SC",
    "Vollkorn SC",
    "Cinzel",
    "Spectral SC",
    "Cormorant Unicase",
  ].map((f) => [f, "serif", true]),
  // sans
  ...[
    "Inter",
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Poppins",
    "Nunito Sans",
    "Nunito",
    "Work Sans",
    "Raleway",
    "Source Sans 3",
    "PT Sans",
    "Noto Sans",
    "Arimo",
    "Figtree",
    "Manrope",
    "DM Sans",
    "Karla",
    "Rubik",
    "Mulish",
    "Jost",
    "Josefin Sans",
    "Outfit",
    "Plus Jakarta Sans",
    "Lexend",
    "Barlow",
    "Fira Sans",
    "IBM Plex Sans",
    "Hanken Grotesk",
    "Space Grotesk",
    "Archivo",
    "Public Sans",
    "Red Hat Display",
    "Red Hat Text",
    "Sora",
    "Urbanist",
    "Albert Sans",
    "Schibsted Grotesk",
    "Instrument Sans",
    "Libre Franklin",
    "Questrial",
    "Quicksand",
    "Mukta",
    "Hind",
    "Heebo",
    "Assistant",
    "Cabin",
    "League Spartan",
    "Kumbh Sans",
    "Be Vietnam Pro",
    "Onest",
    "Epilogue",
    "Tenor Sans",
    "Didact Gothic",
    "Varela Round",
    "Overpass",
    "Commissioner",
    "Proza Libre",
    "Alegreya Sans",
    "Encode Sans",
    "Titillium Web",
    "Sofia Sans",
    "Gantari",
    "Afacad",
    "Rethink Sans",
    "Bricolage Grotesque",
    "Syne",
    "Spline Sans",
    "Wix Madefor Text",
    "Golos Text",
    "Gothic A1",
    "Poiret One",
    "Josefin Sans",
    "Montserrat Alternates",
    "Cantarell",
    "Ubuntu",
    "Oxygen",
    "Asap",
    "Catamaran",
    "Maven Pro",
    "Exo 2",
    "Prompt",
  ].map((f) => [f, "sans-serif"]),
  ...[
    "Oswald",
    "Bebas Neue",
    "Anton",
    "Archivo Narrow",
    "PT Sans Narrow",
    "Roboto Condensed",
    "Fira Sans Condensed",
    "IBM Plex Sans Condensed",
    "Barlow Condensed",
    "Barlow Semi Condensed",
    "Sofia Sans Condensed",
    "Saira Condensed",
    "Big Shoulders Text",
  ].map((f) => [f, "sans-serif"]),
  // monospace
  ...[
    "IBM Plex Mono",
    "JetBrains Mono",
    "Fira Code",
    "Source Code Pro",
    "Roboto Mono",
    "Space Mono",
    "Cousine",
    "Inconsolata",
    "DM Mono",
    "Courier Prime",
  ].map((f) => [f, "monospace"]),
];

const unique = [...new Map(FAMILIES.map((f) => [f[0], f])).values()];
const css = (batch) =>
  `https://fonts.googleapis.com/css2?${batch.map(([f]) => `family=${f.replace(/ /g, "+")}`).join("&")}&display=block`;

const browser = await chromium.launch();
const page = await browser.newPage();
const out = [];
for (let i = 0; i < unique.length; i += 12) {
  const batch = unique.slice(i, i + 12);
  await page.setContent(
    `<!doctype html><link rel="stylesheet" href="${css(batch)}">${batch.map(([f]) => `<p style="font-family:'${f}';font-weight:400">abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>`).join("")}`,
    { waitUntil: "networkidle" },
  );
  const got = await page.evaluate(async (fams) => {
    await document.fonts.ready;
    const c = document.createElement("canvas").getContext("2d");
    return fams.map(([family]) => {
      if (!document.fonts.check(`400 100px "${family}"`)) return null;
      c.font = `400 100px "${family}", monospace`;
      const m = (s) => c.measureText(s);
      return {
        family,
        xHeight: Math.round((m("x").actualBoundingBoxAscent / 100) * 1000) / 1000,
        capHeight: Math.round((m("H").actualBoundingBoxAscent / 100) * 1000) / 1000,
        width: Math.round((m("abcdefghijklmnopqrstuvwxyz").width / 2600) * 1000) / 1000,
      };
    });
  }, batch);
  for (const [k, g] of got.entries()) {
    const [family, category, sc] = batch[k];
    if (!g) {
      console.error(`skipped ${family} (didn't load)`);
      continue;
    }
    out.push({ ...g, category, ...(sc ? { smallCaps: true } : {}) });
  }
}
await browser.close();

const rows = out
  .sort((a, b) => a.family.localeCompare(b.family))
  .map(
    (m) =>
      `  [${JSON.stringify(m.family)}, ${JSON.stringify(m.category)}, ${m.xHeight}, ${m.capHeight}, ${m.width}${m.smallCaps ? ", true" : ""}],`,
  );
const file = `// biome-ignore-all lint/suspicious/noApproximativeNumericConstant: measured values, not constants
// Generated by packages/import/scripts/font-metrics.mjs — do not edit by hand.
/**
 * Open-licence Google Fonts families measured in Chromium the way the look probe measures a live
 * site (canvas, 100px, weight 400): [family, category, x-height, cap height, average lowercase
 * width (em), small caps].
 */
export const OPEN_FONT_METRICS: readonly (readonly [
  string,
  "serif" | "sans-serif" | "monospace",
  number,
  number,
  number,
  true?,
])[] = [
${rows.join("\n")}
];
`;
writeFileSync(join(here, "../src/fidelity/font-metrics.ts"), file);
console.log(`${out.length} families measured.`);
