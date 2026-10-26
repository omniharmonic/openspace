import type { SocialFeedPost } from "@openspace/renderer";
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
  /** Self-hosted font files preloaded on every page (Latin, upright, one per family). */
  fontPreloads?: string[] | undefined;
  hubUrl?: string | undefined;
  turnstileSiteKey?: string | undefined;
  ogImages: boolean;
  /** `astro dev` (not a build): gated pages may fall back to the working copy's content. */
  dev?: boolean | undefined;
  /** Build-time social feed posts keyed by `feedKey(network, handle)`. */
  socialFeeds?: Record<string, SocialFeedPost[]> | undefined;
}
