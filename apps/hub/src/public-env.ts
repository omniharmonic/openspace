/**
 * Environment for the public services (Task 16): optional bindings and secrets. Kept apart from
 * `env.ts` so other tasks can extend the Hub config without touching the same lines.
 *
 * Every external dependency has a dev implementation selected when DEV_MODE=true or the
 * credentials are missing (Global Constraint 8).
 */
import type { HubConfig } from "./env";

export interface PublicServiceEnv {
  /** Cloudflare Email Service binding (`send_email`). */
  EMAIL?: SendEmail;
  /** Analytics Engine dataset (`analytics_engine_datasets`). */
  ANALYTICS?: AnalyticsEngineDataset;
  /** Durable Object namespace for the per-IP+site rate limiter. */
  RATE_LIMITER?: DurableObjectNamespace;

  /** "cloudflare" | "resend" | "postmark" | "dev" — empty: chosen from what's configured. */
  EMAIL_PROVIDER?: string;
  /** Sender for Hub transactional mail, e.g. `OpenSpace <no-reply@hub.example>`. */
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  POSTMARK_TOKEN?: string;

  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;

  /** Cloudflare account + API token (Analytics Engine SQL read) for analytics queries. */
  CF_ACCOUNT_ID?: string;
  CF_ANALYTICS_TOKEN?: string;
  /** Analytics Engine dataset name (for SQL queries). */
  ANALYTICS_DATASET?: string;

  /** HMAC key for unsubscribe links (any long random string). Falls back to TOKEN_ENC_KEY. */
  HUB_SECRET?: string;
  /** JSON overrides for the §8.4 quota defaults on a self-hosted Hub, e.g. {"formSubmissions":5000}. */
  QUOTAS_JSON?: string;
}

export type EmailProviderKind = "cloudflare" | "resend" | "postmark" | "dev";

export interface PublicConfig {
  emailProvider: EmailProviderKind;
  emailFrom: { email: string; name: string };
  turnstile: { siteKey: string | null; secret: string | null; dev: boolean };
  analyticsEngine: { accountId: string; token: string; dataset: string } | null;
  hmacKey: string;
}

/** `Name <addr>` or a bare address. */
export function parseAddress(raw: string): { email: string; name: string } {
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: (m[1] ?? "").replace(/^"|"$/g, ""), email: (m[2] ?? "").trim() };
  return { name: "", email: raw.trim() };
}

export function readPublicConfig(env: PublicServiceEnv, config: HubConfig): PublicConfig {
  const requested = (env.EMAIL_PROVIDER ?? "").toLowerCase();
  let emailProvider: EmailProviderKind = "dev";
  if (!config.devMode) {
    if (requested === "cloudflare" && env.EMAIL) emailProvider = "cloudflare";
    else if (requested === "resend" && env.RESEND_API_KEY) emailProvider = "resend";
    else if (requested === "postmark" && env.POSTMARK_TOKEN) emailProvider = "postmark";
    else if (!requested) {
      if (env.EMAIL) emailProvider = "cloudflare";
      else if (env.RESEND_API_KEY) emailProvider = "resend";
      else if (env.POSTMARK_TOKEN) emailProvider = "postmark";
    }
  }
  const hubHost = (() => {
    try {
      return new URL(config.hubUrl).hostname;
    } catch {
      return "localhost";
    }
  })();
  const from = parseAddress(env.EMAIL_FROM || `OpenSpace <no-reply@${hubHost}>`);
  const turnstileSecret = env.TURNSTILE_SECRET || null;
  return {
    emailProvider,
    emailFrom: { email: from.email, name: from.name || "OpenSpace" },
    turnstile: {
      siteKey: env.TURNSTILE_SITE_KEY || null,
      secret: turnstileSecret,
      dev: config.devMode || !turnstileSecret,
    },
    analyticsEngine:
      env.ANALYTICS && env.CF_ACCOUNT_ID && env.CF_ANALYTICS_TOKEN
        ? {
            accountId: env.CF_ACCOUNT_ID,
            token: env.CF_ANALYTICS_TOKEN,
            dataset: env.ANALYTICS_DATASET || "openspace_analytics",
          }
        : null,
    hmacKey: env.HUB_SECRET || config.tokenEncKey || "openspace-dev-hmac-key",
  };
}
