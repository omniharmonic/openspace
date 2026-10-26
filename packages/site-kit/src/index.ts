/**
 * @openspace/site-kit — the Astro integration and build pipeline for OpenSpace sites.
 *
 * - `openspace()` for `astro.config.mjs`
 * - `@openspace/site-kit/content`: `loadSiteDocument` / `writeSiteDocument`
 * - `@openspace/site-kit/route`: the page route used by `src/pages/[...slug].astro`
 * - pure planners (routes, feeds, sitemap, JSON-LD, manifests) and `generateAgentsMd`
 */
export const name = "@openspace/site-kit";

export { type AgentsMdOptions, generateAgentsMd } from "./agents-md";
export * from "./content/index";
export { type DeployLocation, deployLocation } from "./deploy";
export * from "./feeds";
export { type FeedFormat, type FeedPlan, feedsFor } from "./feeds-plan";
export { contentHash, stableId } from "./ids";
export { type OpenSpaceOptions, openspace, openspace as default } from "./integration";
export * from "./manifests";
export {
  blockFromTag,
  linkFromString,
  type MarkdocIssue,
  type MarkdocResult,
  markdocPlainText,
  markdocToBlocks,
  requiredDefaults,
} from "./markdoc";
export { resolveFonts } from "./node/fonts";
export { renderOgPng, writeOgImages } from "./node/og";
export {
  type PostbuildOptions,
  type PostbuildResult,
  rawMediaSources,
  writeSiteOutputs,
} from "./node/postbuild";
export {
  cardRows,
  formatDate,
  formatEventWhen,
  formatMoney,
  ItemBodyError,
  isLive,
  itemPage,
  itemPageId,
  listPage,
  notFoundPage,
  sortItems,
  tagSlug,
} from "./pages";
export * from "./render";
export * from "./routes";
export {
  fallbackFormat,
  IMAGE_WIDTHS,
  imageWidths,
  localImageSrcs,
  pageImageSrcs,
  resolvedImage,
} from "./runtime/images";
export type { RuntimeOptions } from "./runtime-options";
export * from "./seo";
