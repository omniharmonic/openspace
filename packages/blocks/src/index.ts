/**
 * @openspace/blocks — the OpenSpace block library (P1 set). Each block is a `defineBlock`
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
import { buttonBlock } from "./blocks/button";
import { cardBlock, columnsBlock, iconListBlock } from "./blocks/card";
import { lineBlock, shapeBlock, spacerBlock } from "./blocks/decor";
import { embedBlock } from "./blocks/embed";
import { formBlock } from "./blocks/form";
import { galleryBlock } from "./blocks/gallery";
import { imageBlock } from "./blocks/image";
import { logoStripBlock } from "./blocks/logo-strip";
import { mapBlock } from "./blocks/map";
import { newsletterBlock } from "./blocks/newsletter";
import { quoteBlock, testimonialBlock } from "./blocks/quote";
import { shareButtonsBlock, socialLinksBlock } from "./blocks/social";
import { textBlock } from "./blocks/text";
import { videoBlock } from "./blocks/video";

export const name = "@openspace/blocks";

export { accordionBlock } from "./blocks/accordion";
export { buttonBlock } from "./blocks/button";
export { cardBlock, columnsBlock, iconListBlock } from "./blocks/card";
export { lineBlock, shapeBlock, spacerBlock } from "./blocks/decor";
export { CODE_SANDBOX, embedBlock, snippetDocument, URL_SANDBOX } from "./blocks/embed";
export {
  type FormSecurity,
  FormSecurityContext,
  formBlock,
  Honeypot,
  TurnstileSlot,
} from "./blocks/form";
export { galleryBlock } from "./blocks/gallery";
export { imageBlock } from "./blocks/image";
export { logoStripBlock } from "./blocks/logo-strip";
export { mapBlock, planTiles, type TilePlan, tileCoords } from "./blocks/map";
export { newsletterBlock } from "./blocks/newsletter";
export { quoteBlock, testimonialBlock } from "./blocks/quote";
export { shareButtonsBlock, socialLinksBlock } from "./blocks/social";
export { textBlock } from "./blocks/text";
export { parseVideoUrl, type VideoEmbed, videoBlock } from "./blocks/video";
export { BLOCKS_CSS, blocksStyleTag } from "./css";
export { ICON_NAMES, ICON_OPTIONS, Icon, type IconName, type IconProps } from "./icons";
export { DEMO, rt } from "./shared";

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
