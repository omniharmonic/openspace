import { aboutPresets } from "./categories/about";
import { contactPresets, ctaPresets, newsletterPresets } from "./categories/action";
import { footerPresets, headerPresets as headers } from "./categories/chrome";
import { blogPresets, eventsPresets, productsPresets } from "./categories/collections";
import { featuresPresets } from "./categories/features";
import { galleryPresets } from "./categories/gallery";
import { heroPresets } from "./categories/hero";
import { faqPresets, logosPresets, statsPresets, teamPresets } from "./categories/people";
import { pricingPresets } from "./categories/pricing";
import { servicesPresets } from "./categories/services";
import { testimonialsPresets } from "./categories/testimonials";
import type { Preset, PresetCategory, PresetMeta, SectionPreset, HeaderPreset } from "./types";

/**
 * Section presets (doc 04 §6): pre-composed, designed sections that render in whatever Site
 * Styles the site has. `build()` returns a fresh section (new ids every call); `presetCatalog`
 * is the JSON-serializable metadata for Studio's "Add section" menu and MCP.
 */

export * from "./copy";
export {
  type CropAspect,
  type DemoPhoto,
  type ImageCredit,
  PHOTOS,
  PRESET_IMAGE_CREDITS,
  type PhotoKey,
  photo,
} from "./images";
export { rectsOverlap } from "./kit";
export * from "./types";

/** Every section and footer preset, in menu order. */
export const sectionPresets: readonly SectionPreset[] = [
  ...heroPresets,
  ...aboutPresets,
  ...servicesPresets,
  ...featuresPresets,
  ...galleryPresets,
  ...testimonialsPresets,
  ...pricingPresets,
  ...faqPresets,
  ...teamPresets,
  ...statsPresets,
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
