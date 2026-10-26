/**
 * @openspace/site-kit — the Astro integration and build pipeline for OpenSpace sites.
 *
 * - `openspace()` for `astro.config.mjs`
 * - `@openspace/site-kit/content`: `loadSiteDocument` / `writeSiteDocument`
 * - `@openspace/site-kit/route`: the page route used by `src/pages/[...slug].astro`
 * - pure planners (routes, feeds, sitemap, JSON-LD, manifests) and `generateAgentsMd`
 */
export const name = "@openspace/site-kit";

export * from "./content/index";
export { type AgentsMdOptions, generateAgentsMd } from "./agents-md";
export { type DeployLocation, deployLocation } from "./deploy";
export * from "./feeds";
export { type FeedFormat, type FeedPlan, feedsFor } from "./feeds-plan";
export { contentHash, stableId } from "./ids";
export { openspace, type OpenSpaceOptions } from "./integration";
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
export type { RuntimeOptions } from "./runtime-options";
export * from "./seo";
export { fallbackFormat, IMAGE_WIDTHS, imageWidths, localImageSrcs, resolvedImage } from "./runtime/images";
export { type PostbuildOptions, type PostbuildResult, rawMediaSources, writeSiteOutputs } from "./node/postbuild";
export { resolveFonts } from "./node/fonts";
export { renderOgPng, writeOgImages } from "./node/og";

export { openspace as default } from "./integration";
