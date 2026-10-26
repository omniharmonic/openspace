/**
 * Environment for growth + commerce (Task 18): optional bindings and secrets. Kept apart from
 * `env.ts` / `public-env.ts` so tasks extend the Hub config without touching the same lines.
 *
 * Every external dependency has a dev implementation, selected when DEV_MODE=true or the
 * credentials are missing (Global Constraint 8): DevStripe (Hub-hosted fake checkout), the dev
 * outbox for owner senders, a built-in update source for the update bot.
 */
import type { HubConfig } from "./env";
import { HttpError } from "./lib/errors";

/** One unit of campaign fan-out work (a slice of recipients of one campaign). */
export interface CampaignJob {
  kind: "campaign-batch";
  campaignId: string;
  siteId: string;
}

export interface GrowthEnv {
  /** Platform Stripe secret key (Connect: sessions on connected Standard accounts, no fee). */
  STRIPE_SECRET_KEY?: string;
  /** Signing secret of the Connect webhook endpoint `POST /c/stripe/webhook`. */
  STRIPE_WEBHOOK_SECRET?: string;
  /**
   * Optional ES256 private key (JWK JSON with `kid`) for member tokens. Without it the Hub
   * generates a key and stores it sealed with TOKEN_ENC_KEY.
   */
  MEMBER_JWT_PRIVATE_KEY?: string;
  /** Queue for campaign fan-out (optional; without it batches are sent inline / by cron). */
  CAMPAIGN_QUEUE?: Queue<CampaignJob>;
  /** Update bot: npm registry base (default https://registry.npmjs.org). */
  NPM_REGISTRY?: string;
  /** Update bot (dev / self-hosted pin): latest site-kit version and its changelog (JSON array). */
  SITE_KIT_LATEST?: string;
  SITE_KIT_CHANGELOG?: string;
}

export interface GrowthConfig {
  /** DevStripe (fake checkout on the Hub) instead of api.stripe.com — DEV_MODE only. */
  stripeDev: boolean;
  stripeSecretKey: string | null;
  /** Secrets accepted on `/c/stripe/webhook` (dev adds the DevStripe secret). */
  connectWebhookSecrets: string[];
  memberJwtKey: string | null;
}

/** Signing secret DevStripe uses for the events it fires through the webhook path (not secret). */
export const DEV_STRIPE_WEBHOOK_SECRET = "openspace-dev-stripe-webhook-signing";

export function readGrowthConfig(env: GrowthEnv, config: HubConfig): GrowthConfig {
  const key = env.STRIPE_SECRET_KEY || null;
  // DevStripe only in DEV_MODE: a production Hub must never mark orders paid through a fake
  // checkout. Without a platform key there, Connect checkout answers 503 (sovereign still works).
  const stripeDev = config.devMode;
  const secrets = [env.STRIPE_WEBHOOK_SECRET].filter((s): s is string => !!s);
  if (stripeDev) secrets.push(DEV_STRIPE_WEBHOOK_SECRET);
  return {
    stripeDev,
    stripeSecretKey: stripeDev ? null : key,
    connectWebhookSecrets: secrets,
    memberJwtKey: env.MEMBER_JWT_PRIVATE_KEY || null,
  };
}

export const notConfigured = (what: string) =>
  new HttpError(503, "not_configured", `${what} isn't set up on this Hub yet.`);
