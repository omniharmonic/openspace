/**
 * Growth + commerce container (Task 18): Stripe client factory, the campaign queue, the owner
 * sender factory and the update-bot version source — each with a dev implementation.
 */
import type { HubBindings, HubConfig } from "../env";
import type { FetchLike } from "../github/http";
import {
  type CampaignJob,
  type GrowthConfig,
  notConfigured,
  readGrowthConfig,
} from "../growth-env";
import { DevStripe, HttpStripe, type StripeApi } from "./stripe";
import { NpmUpdateSource, StaticUpdateSource, type UpdateSource } from "./updates-source";

/** Where a Stripe call goes: a connected account (Connect), the owner's own key, or the platform. */
export type StripeTarget =
  | { mode: "connect"; account: string | null }
  | { mode: "sovereign"; secretKey: string; account: string | null };

export interface CampaignQueue {
  send(job: CampaignJob): Promise<void>;
}

export interface GrowthServices {
  config: GrowthConfig;
  stripe(target: StripeTarget): StripeApi;
  /** Campaign fan-out queue; null = send inline in batches (dev, or no Queue binding). */
  queue: CampaignQueue | null;
  updates: UpdateSource;
}

export type GrowthOverrides = Partial<Omit<GrowthServices, "config">>;

export function createGrowthServices(
  env: HubBindings,
  config: HubConfig,
  deps: { db: D1Database; fetch: FetchLike; now: () => number },
  overrides: GrowthOverrides = {},
): GrowthServices {
  const gc = readGrowthConfig(env, config);
  return {
    config: gc,
    stripe:
      overrides.stripe ??
      ((target) => {
        if (gc.stripeDev)
          return new DevStripe(deps.db, config.hubUrl, deps.now, target.account ?? null);
        if (target.mode === "sovereign") return new HttpStripe(target.secretKey, deps.fetch, null);
        if (!gc.stripeSecretKey) throw notConfigured("Payments (STRIPE_SECRET_KEY)");
        return new HttpStripe(gc.stripeSecretKey, deps.fetch, target.account);
      }),
    queue:
      overrides.queue !== undefined
        ? overrides.queue
        : env.CAMPAIGN_QUEUE && !config.devMode
          ? { send: async (job) => void (await env.CAMPAIGN_QUEUE?.send(job)) }
          : null,
    updates:
      overrides.updates ??
      (env.SITE_KIT_LATEST || config.devMode
        ? new StaticUpdateSource(env.SITE_KIT_LATEST, env.SITE_KIT_CHANGELOG)
        : new NpmUpdateSource(deps.fetch, env.NPM_REGISTRY)),
  };
}
