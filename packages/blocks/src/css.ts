import { accordionCss } from "./blocks/accordion";
import { audioCss } from "./blocks/audio";
import { bookingCss } from "./blocks/booking";
import { businessCss } from "./blocks/business";
import { buttonCss } from "./blocks/button";
import { cardCss } from "./blocks/card";
import { chartCss } from "./blocks/chart";
import { collectionsCss } from "./blocks/collections";
import { commerceCss } from "./blocks/commerce";
import { compareCss } from "./blocks/compare";
import { countdownCss } from "./blocks/countdown";
import { dataCss } from "./blocks/data";
import { decorCss } from "./blocks/decor";
import { embedCss } from "./blocks/embed";
import { formCss } from "./blocks/form";
import { galleryCss } from "./blocks/gallery";
import { headingCss } from "./blocks/heading";
import { imageCss } from "./blocks/image";
import { linkListCss } from "./blocks/link-list";
import { logoStripCss } from "./blocks/logo-strip";
import { mapCss } from "./blocks/map";
import { marqueeCss } from "./blocks/marquee";
import { membersCss } from "./blocks/members";
import { newsletterCss } from "./blocks/newsletter";
import { pricingCss } from "./blocks/pricing";
import { quoteCss } from "./blocks/quote";
import { quoteCarouselCss } from "./blocks/quote-carousel";
import { restaurantMenuCss } from "./blocks/restaurant-menu";
import { searchCss } from "./blocks/search";
import { socialCss } from "./blocks/social";
import { socialFeedCss } from "./blocks/social-feed";
import { tableCss } from "./blocks/table";
import { tabsCss } from "./blocks/tabs";
import { teamCss } from "./blocks/team";
import { textCss } from "./blocks/text";
import { videoCss } from "./blocks/video";

/**
 * Stylesheet for the block library. It builds on `os.css` (renderer) and references design
 * tokens only through the documented `--os-*` names; per-instance values are short private
 * custom properties set inline (`--g-cols`, `--line-c`, `--ar` …).
 *
 * Everything lives in the `os.blocks` cascade layer, ordered after the renderer's layers and
 * before `os.utilities`, so the site's own (unlayered) custom CSS always wins.
 */
export const BLOCKS_CSS = `/* OpenSpace block library (@omniharmonic/openspace-blocks). Tokens: --os-* from @omniharmonic/openspace-theme. */
@layer os.reset, os.base, os.layout, os.components, os.behaviors, os.blocks, os.utilities;
@layer os.blocks {
/* Phones: small standalone links inside blocks get a 44px-tall tap area. */
@media (max-width:767.98px){:where(.os-audio__link,.os-booking__fallback,.os-product__details,.os-events__register,.os-product__link){display:inline-flex;align-items:center;min-height:2.75rem}}
${[
  textCss,
  imageCss,
  buttonCss,
  galleryCss,
  videoCss,
  quoteCss,
  decorCss,
  formCss,
  newsletterCss,
  mapCss,
  socialCss,
  accordionCss,
  embedCss,
  logoStripCss,
  cardCss,
  headingCss,
  marqueeCss,
  tabsCss,
  quoteCarouselCss,
  dataCss,
  chartCss,
  countdownCss,
  pricingCss,
  tableCss,
  teamCss,
  restaurantMenuCss,
  businessCss,
  compareCss,
  audioCss,
  bookingCss,
  linkListCss,
  socialFeedCss,
  collectionsCss,
  searchCss,
  commerceCss,
  membersCss,
  `.os-unavailable{margin:0;padding:var(--os-space-xs) var(--os-space-sm);border-inline-start:3px solid var(--os-color-text-muted);background:var(--os-color-surface);border-radius:var(--os-radius-sm);color:var(--os-color-text);max-inline-size:var(--os-measure)}`,
  `.os-soon{display:flex;gap:var(--os-space-sm);align-items:flex-start;padding:var(--os-space-md);border-radius:var(--os-radius-card);background:color-mix(in srgb,var(--os-color-accent) 7%,var(--os-color-surface));border:1px solid color-mix(in srgb,var(--os-color-accent) 24%,transparent);color:var(--os-color-text);max-inline-size:var(--os-measure);text-align:start}`,
  `.os-soon__mark{flex:none;display:grid;place-items:center;inline-size:2.5rem;block-size:2.5rem;border-radius:var(--os-radius-full);background:var(--os-color-accent);color:var(--os-color-accent-text)}`,
  `.os-soon__body{min-inline-size:0}`,
  `.os-soon .os-soon__title{margin:0;padding:0;border:0;background:none;font-family:var(--os-type-h4-font-family);font-weight:var(--os-type-h4-font-weight);letter-spacing:var(--os-type-h4-letter-spacing);color:var(--os-color-heading)}`,
  `.os-soon__text{margin:var(--os-space-3xs) 0 0;color:var(--os-color-text-muted);font-size:var(--os-type-small-font-size);line-height:var(--os-type-small-line-height)}`,
  `.os-soon__link{margin-block-start:var(--os-space-sm)}`,
  `.os-soon.os-soon--compact{display:block;padding:var(--os-space-xs) var(--os-space-sm);border-radius:var(--os-radius-full);font-weight:var(--os-type-h4-font-weight)}`,
  `.os-empty{margin:0;padding:var(--os-space-xs) var(--os-space-sm);border:1px dashed var(--os-color-text-muted);border-radius:var(--os-radius-sm);font-size:var(--os-type-small-font-size);color:var(--os-color-text-muted)}`,
]
  .map((s) => s.trim())
  .join("\n")}
}
`;

/** `<style>` tag for `renderPageHtml({ extraHead })` and the Studio canvas. */
export function blocksStyleTag(): string {
  return `<style data-os="blocks">${BLOCKS_CSS}</style>`;
}
