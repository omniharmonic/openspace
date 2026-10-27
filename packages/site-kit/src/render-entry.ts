/**
 * `@omniharmonic/openspace-site-kit/render` — the Workers-safe part of the publishing pipeline (no Node, no
 * Astro): plan a site's routes and render a route exactly as a published build does. The Hub's
 * dev preview uses it so previews look exactly like the published site.
 */
export { type DeployLocation, deployLocation } from "./deploy";
export {
  collectionsContextValue,
  collectionsContextValueFor,
  ensureBlocks,
  type RenderDocumentOptions,
  type RenderRouteOptions,
  renderDocument,
  renderRoute,
} from "./render";
export { gatedPages, planSite, publishableDoc, type SitePlan, type SiteRoute } from "./routes";
