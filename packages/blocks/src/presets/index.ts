import type { ColorTheme, Section } from "@omniharmonic/openspace-schema";
import { aboutPresets } from "./categories/about";
import { contactPresets, ctaPresets, newsletterPresets } from "./categories/action";
import { footerPresets, headerPresets as headers } from "./categories/chrome";
import { blogPresets, eventsPresets, productsPresets } from "./categories/collections";
import { featuresPresets } from "./categories/features";
import { galleryPresets } from "./categories/gallery";
import { heroPresets } from "./categories/hero";
import { heroMorePresets } from "./categories/hero-more";
import { impactPresets } from "./categories/impact";
import { menuPresets } from "./categories/menu";
import { faqPresets, logosPresets, statsPresets, teamPresets } from "./categories/people";
import { portfolioPresets } from "./categories/portfolio";
import { pricingPresets } from "./categories/pricing";
import { processPresets } from "./categories/process";
import { servicesPresets } from "./categories/services";
import { testimonialsPresets } from "./categories/testimonials";
import type { HeaderPreset, Preset, PresetCategory, PresetMeta, SectionPreset } from "./types";

/**
 * Section presets (doc 04 §6): pre-composed, designed sections that render in whatever Site
 * Styles the site has. `build()` returns a fresh section (new ids every call); `presetCatalog`
 * is the JSON-serializable metadata for Studio's "Add section" menu and MCP.
 */

export * from "./copy";
export { type StarterLook, starterLook, starterRef, starterSection } from "./starter";

import { starterLook, starterSection } from "./starter";

export {
  type CropAspect,
  type DemoPhoto,
  type ImageCredit,
  PHOTOS,
  type PhotoKey,
  PRESET_IMAGE_CREDITS,
  photo,
} from "./images";
export { rectsOverlap } from "./kit";
export * from "./types";

/** Every section and footer preset, in menu order. */
export const sectionPresets: readonly SectionPreset[] = [
  ...heroPresets,
  ...heroMorePresets,
  ...aboutPresets,
  ...servicesPresets,
  ...featuresPresets,
  ...processPresets,
  ...galleryPresets,
  ...portfolioPresets,
  ...testimonialsPresets,
  ...pricingPresets,
  ...menuPresets,
  ...faqPresets,
  ...teamPresets,
  ...statsPresets,
  ...impactPresets,
  ...logosPresets,
  ...ctaPresets,
  ...contactPresets,
  ...newsletterPresets,
  ...blogPresets,
  ...eventsPresets,
  ...productsPresets,
  ...footerPresets,
];

/** Site header presets (they set `site.header`, they are not sections). */
export const headerPresets: readonly HeaderPreset[] = headers;

/** All presets: headers, sections and footers. */
export const allPresets: readonly Preset[] = [...headerPresets, ...sectionPresets];

const byId = new Map<string, Preset>(allPresets.map((p) => [p.id, p]));

/** A preset by id (`hero/split-image@1`). */
export function getPreset(id: string): Preset | undefined {
  return byId.get(id);
}

/** Presets in a category. */
export function presetsIn(category: PresetCategory): Preset[] {
  return allPresets.filter((p) => p.category === category);
}

/** Metadata only (no functions): Studio thumbnails, MCP resources, AGENTS.md. */
export const presetCatalog: readonly PresetMeta[] = allPresets.map(
  ({ build: _build, ...meta }) => meta,
);

/**
 * The section a page/footer preset (or a Studio starter look, `starter/…`) builds in a color
 * theme, or undefined for an unknown preset or a header preset. `transformForRole` uses it to check
 * that Editors only insert sections whose layout and style come from the design.
 */
export function presetSection(ref: string, colorTheme?: ColorTheme): Section | undefined {
  const starter = starterLook(ref);
  if (starter)
    return starterSection("", [], {
      columns: starter.columns,
      theme: colorTheme ?? "light",
      ...(starter.layout.align ? { align: starter.layout.align as "center" | "start" } : {}),
    });
  const preset = getPreset(ref);
  if (!preset || preset.target === "header") return undefined;
  return preset.build(colorTheme ? { colorTheme } : {});
}
