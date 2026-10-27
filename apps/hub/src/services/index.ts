import { mintUserAccessToken } from "../auth/github-tokens";
import type { HubBindings, HubConfig } from "../env";
import { type GitHubContext, selectGitHubAccess } from "../github";
import type { FetchLike } from "../github/http";
import type { GitHubAccess } from "../github/types";
import { type OperatorConfig, readOperatorConfig } from "../operator-env";
import { basicTemplate } from "../templates/basic";
import { createGrowthServices, type GrowthOverrides, type GrowthServices } from "./growth";
import { createPublicServices, type PublicOverrides, type PublicServices } from "./public";
import { type PageRenderer, SiteKitRenderer } from "./renderer";
import { type BrowserBackend, selectBrowserBackend } from "./screenshots";
import { RegistryTemplateSource, type TemplateSource } from "./templates";

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
  /** Operator settings: abuse address, budget alerts, campaign warm-up. */
  operator: OperatorConfig;
  /** Browser for MCP screenshots: Browser Rendering, the dev placeholder, or none. */
  screenshots: BrowserBackend | null;
}

export interface ServiceOverrides {
  templates?: TemplateSource;
  renderer?: PageRenderer;
  github?: (ctx: GitHubContext, services: Services) => GitHubAccess;
  fetch?: FetchLike;
  now?: () => number;
  public?: PublicOverrides;
  growth?: GrowthOverrides;
  operator?: Partial<OperatorConfig>;
  /** Screenshot browser (tests inject a fake); `null` turns screenshots off. */
  screenshots?: BrowserBackend | null;
}

/**
 * The 12 launch templates; the small "basic" fixture stays loadable (never listed) for tests.
 * One instance per isolate: template data is immutable, and routes cache what they derive from it.
 */
const defaultTemplates: TemplateSource = new RegistryTemplateSource([basicTemplate]);

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
    templates: overrides.templates ?? defaultTemplates,
    // The one renderer (ADR-3) through site-kit's publishing pipeline.
    renderer: overrides.renderer ?? new SiteKitRenderer(),
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
    operator: { ...readOperatorConfig(env), ...overrides.operator },
    screenshots:
      overrides.screenshots !== undefined
        ? overrides.screenshots
        : selectBrowserBackend(env, config),
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
