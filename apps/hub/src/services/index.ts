import { mintUserAccessToken } from "../auth/github-tokens";
import type { HubBindings, HubConfig } from "../env";
import { type GitHubContext, selectGitHubAccess } from "../github";
import type { FetchLike } from "../github/http";
import type { GitHubAccess } from "../github/types";
import { createGrowthServices, type GrowthOverrides, type GrowthServices } from "./growth";
import { createPublicServices, type PublicOverrides, type PublicServices } from "./public";
import { type PageRenderer, PlaceholderRenderer } from "./renderer";
import { BuiltinTemplateSource, type TemplateSource } from "./templates";

/** Per-request service container (no module-level request state). */
export interface Services {
  db: D1Database;
  /** R2: form uploads, exports, pending site-setup assets (logos). */
  uploads: R2Bucket;
  config: HubConfig;
  templates: TemplateSource;
  renderer: PageRenderer;
  github(ctx?: GitHubContext): GitHubAccess;
  /** Outbound fetch (GitHub OAuth etc.); injectable for tests. */
  fetch: FetchLike;
  now(): number;
  /** Public services (Task 16): email, Turnstile, rate limits, analytics, DNS, RDAP. */
  pub: PublicServices;
  /** Growth + commerce (Task 18): Stripe, campaign queue, update source. */
  growth: GrowthServices;
}

export interface ServiceOverrides {
  templates?: TemplateSource;
  renderer?: PageRenderer;
  github?: (ctx: GitHubContext, services: Services) => GitHubAccess;
  fetch?: FetchLike;
  now?: () => number;
  public?: PublicOverrides;
  growth?: GrowthOverrides;
}

export function createServices(
  env: HubBindings,
  config: HubConfig,
  overrides: ServiceOverrides = {},
): Services {
  const fetchFn: FetchLike = overrides.fetch ?? ((input, init) => fetch(input, init));
  const now = overrides.now ?? Date.now;
  const services: Services = {
    db: env.HUB_DB,
    uploads: env.UPLOADS,
    config,
    templates: overrides.templates ?? new BuiltinTemplateSource(),
    // TODO(renderer): swap for an adapter over @openspace/renderer's renderPageHtml (ADR-3).
    renderer: overrides.renderer ?? new PlaceholderRenderer(),
    fetch: fetchFn,
    now,
    pub: createPublicServices(
      env,
      config,
      { db: env.HUB_DB, fetch: fetchFn, now },
      overrides.public,
    ),
    growth: createGrowthServices(
      env,
      config,
      { db: env.HUB_DB, fetch: fetchFn, now },
      overrides.growth,
    ),
    github: (ctx = {}) =>
      overrides.github
        ? overrides.github(ctx, services)
        : selectGitHubAccess(
            {
              config,
              db: env.HUB_DB,
              fetch: fetchFn,
              now,
              userToken: async (userId) =>
                (await mintUserAccessToken({ db: env.HUB_DB, config, fetch: fetchFn, now }, userId))
                  ?.token ?? null,
            },
            ctx,
          ),
  };
  return services;
}
