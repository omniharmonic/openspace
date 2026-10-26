import type { DeployLocation } from "./deploy";
import type { SiteAssets } from "./render";

/** Options the integration hands to the page route (via `virtual:openspace/site`). */
export interface RuntimeOptions {
  /** Build time (ISO); decides scheduled items. */
  now: string;
  location: DeployLocation;
  assets: SiteAssets;
  /** Self-hosted font stylesheet hrefs (undefined: Google Fonts). */
  fontStylesheets?: string[] | undefined;
  hubUrl?: string | undefined;
  turnstileSiteKey?: string | undefined;
  ogImages: boolean;
  /** Build-time social feed posts keyed by `feedKey(network, handle)`. */
  socialFeeds?: Record<string, unknown[]> | undefined;
}
