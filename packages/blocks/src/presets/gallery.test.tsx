import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderPageHtml, unregisterBlocks } from "@omniharmonic/openspace-renderer";
import { COLOR_THEMES, type Section } from "@omniharmonic/openspace-schema";
import { afterAll, beforeAll, it } from "vitest";
import { page, siteWith } from "../__fixtures__/site";
import { blocksStyleTag, registerAll } from "../index";
import { PRESET_CATEGORIES, presetsIn, sectionPresets } from "./index";

/**
 * Visual review harness (not part of the normal test run). With `OS_PRESET_GALLERY=<dir>` it
 * writes one HTML page per preset category (every preset in its default theme) plus one page
 * per theme (every preset in that theme) for screenshots at 1440 and 390.
 *
 *   OS_PRESET_GALLERY=/tmp/gallery OS_BEHAVIORS=file:///…/renderer/dist/behaviors pnpm vitest run gallery
 *
 * `OS_PRESET_ONLY=hero/bento,process/` limits it to presets whose id starts with one of the
 * prefixes, written to a single `only.html` (in `OS_PRESET_THEME`, default each preset's own).
 */
const OUT = process.env.OS_PRESET_GALLERY;
const LOOK = process.env.OS_PRESET_LOOK ?? "a";

beforeAll(() => registerAll());
afterAll(() => unregisterBlocks());

const LOOKS = {
  a: {
    palette: { brand: "oklch(0.62 0.09 145)", neutral: "warm", contrast: "standard" },
    pairing: "fraunces-hanken",
    density: "comfortable",
    shape: "soft",
    buttons: "pill-solid",
    motion: "none",
    imageTreatment: "rounded",
  },
  b: {
    palette: { brand: "oklch(0.55 0.2 265)", neutral: "cool", contrast: "standard" },
    pairing: "bricolage-geist",
    density: "compact",
    shape: "sharp",
    buttons: "outline",
    motion: "none",
    imageTreatment: "none",
  },
} as const;

it.skipIf(!OUT)("writes the preset gallery", () => {
  const dir = OUT as string;
  mkdirSync(dir, { recursive: true });
  const only = process.env.OS_PRESET_ONLY?.split(",").filter(Boolean);
  const theme = process.env.OS_PRESET_THEME as Section["style"]["colorTheme"] | undefined;
  const pages = only
    ? [
        page(
          "only",
          "only",
          sectionPresets
            .filter((p) => only.some((o) => p.id.startsWith(o)))
            .map((p) => p.build(theme && p.themes.includes(theme) ? { colorTheme: theme } : {})),
        ),
      ]
    : [
        ...PRESET_CATEGORIES.filter((c) => c !== "header").map((c) =>
          page(
            c,
            c,
            presetsIn(c).map((p) => (p as (typeof sectionPresets)[number]).build()),
          ),
        ),
        ...COLOR_THEMES.map((t) =>
          page(
            `theme-${t}`,
            `theme-${t}`,
            sectionPresets.map((p): Section => p.build({ colorTheme: t })),
          ),
        ),
      ];
  const nonEmpty = pages.filter((p) => p.sections.length > 0);
  const doc = siteWith(nonEmpty);
  // biome-ignore lint/suspicious/noExplicitAny: test harness
  (doc.styles as any).choices = LOOKS[LOOK as keyof typeof LOOKS];
  doc.site.header.sticky = false;
  for (const p of nonEmpty) {
    const html = renderPageHtml({
      doc,
      pageId: p.id,
      mode: "production",
      extraHead: blocksStyleTag(),
      ...(process.env.OS_BEHAVIORS ? { behaviorsUrl: process.env.OS_BEHAVIORS } : {}),
    });
    writeFileSync(join(dir, `${p.slug}.html`), html);
    writeFileSync(join(dir, `${p.slug}.ids.txt`), p.sections.map((s) => s.preset).join("\n"));
  }
});
