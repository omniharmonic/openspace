// Generates Studio's app icons (PWA manifest, Apple touch icon, favicon) as PNGs from the
// OpenSpace mark. Run: `pnpm --filter @omniharmonic/openspace-studio icons` (outputs are committed).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(out, { recursive: true });

const GRAPHITE = "#1b1c1f";
const ACCENT = "#5466ff";

/** The mark (18×18 viewBox) placed at `scale` of the canvas, centred. */
function mark(size, scale) {
  const s = (size * scale) / 18;
  const o = (size - size * scale) / 2;
  return `<g transform="translate(${o} ${o}) scale(${s})">
    <path d="M10 2.75H4.25a1.5 1.5 0 0 0-1.5 1.5v9.5a1.5 1.5 0 0 0 1.5 1.5h9.5a1.5 1.5 0 0 0 1.5-1.5V8" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
    <rect x="12.25" y="2" width="3.75" height="3.75" rx=".9" fill="${ACCENT}"/>
  </g>`;
}

/** "any" icons: a rounded tile; maskable: full bleed with the mark inside the safe zone. */
function svg(size, kind) {
  const bg =
    kind === "maskable"
      ? `<rect width="${size}" height="${size}" fill="${GRAPHITE}"/>`
      : `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${GRAPHITE}"/>`;
  const scale = kind === "maskable" ? 0.5 : kind === "apple" ? 0.56 : 0.62;
  const full =
    kind === "apple" ? `<rect width="${size}" height="${size}" fill="${GRAPHITE}"/>` : bg;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${full}${mark(size, scale)}</svg>`;
}

const icons = [
  ["icon-192.png", 192, "any"],
  ["icon-512.png", 512, "any"],
  ["icon-maskable-512.png", 512, "maskable"],
  ["icon-maskable-192.png", 192, "maskable"],
  ["apple-touch-icon.png", 180, "apple"],
  ["favicon-32.png", 32, "any"],
];
for (const [name, size, kind] of icons) {
  const png = new Resvg(svg(size, kind), { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
  writeFileSync(join(out, name), png);
  console.log(`${name} ${size}×${size} ${png.length} bytes`);
}
