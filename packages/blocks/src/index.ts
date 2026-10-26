/**
 * @openspace/blocks — the OpenSpace block library (the P1 set plus the Squarespace-parity set). Each block is a `defineBlock`
 * definition (fields, variants, style slots, defaults, AI guidance, icon) whose `render` is a
 * React component built from `@openspace/renderer` primitives. Rendered to static HTML; any
 * interactivity comes from the renderer's vanilla `data-os-behavior` modules.
 */
import { registerBlocks } from "@openspace/renderer";
import {
  type AnyBlockDefinition,
  type BlockRegistry,
  createBlockRegistry,
} from "@openspace/schema";
import { accordionBlock } from "./blocks/accordion";
import { audioBlock } from "./blocks/audio";
import { bookingBlock } from "./blocks/booking";
import { contactInfoBlock, hoursBlock } from "./blocks/business";
import { buttonBlock } from "./blocks/button";
import { cardBlock, columnsBlock, iconListBlock } from "./blocks/card";
import { chartBlock } from "./blocks/chart";
import { eventsBlock, summaryBlock } from "./blocks/collections";
import { donationBlock, productBlock } from "./blocks/commerce";
import { beforeAfterBlock } from "./blocks/compare";
import { countdownBlock } from "./blocks/countdown";
import { statsBlock, timelineBlock } from "./blocks/data";
import { lineBlock, shapeBlock, spacerBlock } from "./blocks/decor";
import { embedBlock } from "./blocks/embed";
import { formBlock } from "./blocks/form";
import { galleryBlock } from "./blocks/gallery";
import { dividerBlock, headingBlock } from "./blocks/heading";
import { imageBlock } from "./blocks/image";
import { linkListBlock } from "./blocks/link-list";
import { logoStripBlock } from "./blocks/logo-strip";
import { mapBlock } from "./blocks/map";
import { marqueeBlock } from "./blocks/marquee";
import { memberLoginBlock } from "./blocks/members";
import { newsletterBlock } from "./blocks/newsletter";
import { pricingBlock } from "./blocks/pricing";
import { quoteBlock, testimonialBlock } from "./blocks/quote";
import { quoteCarouselBlock } from "./blocks/quote-carousel";
import { restaurantMenuBlock } from "./blocks/restaurant-menu";
import { searchBlock } from "./blocks/search";
import { shareButtonsBlock, socialLinksBlock } from "./blocks/social";
import { socialFeedBlock } from "./blocks/social-feed";
import { tabsBlock } from "./blocks/tabs";
import { teamBlock } from "./blocks/team";
import { textBlock } from "./blocks/text";
import { videoBlock } from "./blocks/video";

export const name = "@openspace/blocks";

export { accordionBlock } from "./blocks/accordion";
export { audioBlock, audioMime } from "./blocks/audio";
export { type BookingEmbed, bookingBlock, parseBookingUrl } from "./blocks/booking";
export { contactInfoBlock, formatTime, groupHours, hoursBlock } from "./blocks/business";
export { buttonBlock } from "./blocks/button";
export { cardBlock, columnsBlock, iconListBlock } from "./blocks/card";
export { chartBlock, niceScale } from "./blocks/chart";
export {
  calendarMonths,
  eventsBlock,
  eventWhen,
  itemImage,
  productPrice,
  summaryBlock,
} from "./blocks/collections";
export { donationBlock, type ProductOption, productBlock } from "./blocks/commerce";
export { beforeAfterBlock } from "./blocks/compare";
export { countdownBlock } from "./blocks/countdown";
export { statsBlock, timelineBlock } from "./blocks/data";
export { lineBlock, shapeBlock, spacerBlock } from "./blocks/decor";
export {
  CODE_SANDBOX,
  EMBED_PLACEHOLDER,
  embedBlock,
  SAME_ORIGIN_URL_SANDBOX,
  type SnippetColors,
  snippetColors,
  snippetDocument,
  URL_SANDBOX,
} from "./blocks/embed";
export {
  type FormSecurity,
  FormSecurityContext,
  formBlock,
  Honeypot,
  TurnstileSlot,
} from "./blocks/form";
export { galleryBlock } from "./blocks/gallery";
export { dividerBlock, headingBlock } from "./blocks/heading";
export { imageBlock } from "./blocks/image";
export { linkListBlock } from "./blocks/link-list";
export { logoStripBlock } from "./blocks/logo-strip";
export {
  mapBlock,
  OSM_TILE_URL,
  planTiles,
  type TilePlan,
  tileCoords,
  tileUrlTemplate,
} from "./blocks/map";
export { marqueeBlock } from "./blocks/marquee";
export { memberLoginBlock } from "./blocks/members";
export { newsletterBlock } from "./blocks/newsletter";
export { pricingBlock } from "./blocks/pricing";
export { quoteBlock, testimonialBlock } from "./blocks/quote";
export { quoteCarouselBlock } from "./blocks/quote-carousel";
export { DIETARY, restaurantMenuBlock } from "./blocks/restaurant-menu";
export { searchBlock, siteSearchFallback } from "./blocks/search";
export { shareButtonsBlock, socialLinksBlock } from "./blocks/social";
export { profileUrl, socialFeedBlock } from "./blocks/social-feed";
export { tabsBlock } from "./blocks/tabs";
export { teamBlock } from "./blocks/team";
export { textBlock } from "./blocks/text";
export { parseVideoUrl, type VideoEmbed, videoBlock } from "./blocks/video";
export { BLOCKS_CSS, blocksStyleTag } from "./css";
export { ICON_NAMES, ICON_OPTIONS, Icon, type IconName, type IconProps } from "./icons";
export { DEMO, formatDate, formatMoney, rt } from "./shared";

/** Every block in the library, in insert-menu order. */
export const allBlocks: readonly AnyBlockDefinition[] = [
  textBlock,
  imageBlock,
  buttonBlock,
  galleryBlock,
  videoBlock,
  quoteBlock,
  testimonialBlock,
  cardBlock,
  columnsBlock,
  iconListBlock,
  accordionBlock,
  formBlock,
  newsletterBlock,
  mapBlock,
  socialLinksBlock,
  shareButtonsBlock,
  logoStripBlock,
  lineBlock,
  spacerBlock,
  shapeBlock,
  embedBlock,
  // Library B (parity set)
  headingBlock,
  dividerBlock,
  marqueeBlock,
  tabsBlock,
  quoteCarouselBlock,
  statsBlock,
  timelineBlock,
  chartBlock,
  countdownBlock,
  pricingBlock,
  teamBlock,
  restaurantMenuBlock,
  hoursBlock,
  contactInfoBlock,
  beforeAfterBlock,
  audioBlock,
  bookingBlock,
  linkListBlock,
  socialFeedBlock,
  summaryBlock,
  eventsBlock,
  searchBlock,
  productBlock,
  donationBlock,
  memberLoginBlock,
];

/** Register the whole library with the renderer's global registry (idempotent). */
export function registerAll(): void {
  registerBlocks(allBlocks);
}

let registry: BlockRegistry | undefined;
/** A schema `BlockRegistry` over the library (validation, migration, metadata for Studio/MCP). */
export function blocksRegistry(): BlockRegistry {
  registry ??= createBlockRegistry(allBlocks);
  return registry;
}
