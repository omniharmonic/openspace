/**
 * Public-services container (Task 16): email, Turnstile, rate limiting, analytics storage, DNS
 * and RDAP — each a real implementation when configured and a dev one otherwise (Constraint 8).
 */
import type { HubBindings, HubConfig } from "../env";
import type { FetchLike } from "../github/http";
import { type PublicConfig, readPublicConfig } from "../public-env";
import { AnalyticsEngineStore, type AnalyticsStore, D1AnalyticsStore } from "./analytics";
import {
  DevDnsResolver,
  type DnsResolver,
  DohResolver,
  devPagesHostLookup,
  HttpRdapClient,
  type RdapClient,
} from "./domains";
import {
  CloudflareEmailSender,
  DevOutboxSender,
  PostmarkEmailSender,
  ResendEmailSender,
} from "./email/providers";
import type { EmailSender } from "./email/types";
import { DurableRateLimiter, NoRateLimiter, type RateLimitService } from "./rate-limit";
import { CloudflareTurnstile, DevTurnstile, type TurnstileVerifier } from "./turnstile";

export interface PublicServices {
  config: PublicConfig;
  email: EmailSender;
  turnstile: TurnstileVerifier;
  rateLimit: RateLimitService;
  analytics: AnalyticsStore;
  dns: DnsResolver;
  rdap: RdapClient;
  /** KV cache (analytics salts, forms manifests). */
  cache: KVNamespace | undefined;
  /** Self-hosted quota overrides (`QUOTAS_JSON`). */
  quotaOverrides: string | undefined;
}

export type PublicOverrides = Partial<Omit<PublicServices, "config">>;

export function createPublicServices(
  env: HubBindings,
  config: HubConfig,
  deps: { db: D1Database; fetch: FetchLike; now: () => number },
  overrides: PublicOverrides = {},
): PublicServices {
  const pc = readPublicConfig(env, config);
  const email: EmailSender =
    overrides.email ??
    (pc.emailProvider === "cloudflare" && env.EMAIL
      ? new CloudflareEmailSender(env.EMAIL)
      : pc.emailProvider === "resend" && env.RESEND_API_KEY
        ? new ResendEmailSender(env.RESEND_API_KEY, deps.fetch)
        : pc.emailProvider === "postmark" && env.POSTMARK_TOKEN
          ? new PostmarkEmailSender(env.POSTMARK_TOKEN, deps.fetch)
          : new DevOutboxSender(deps.db, deps.now));
  const doh = new DohResolver(deps.fetch);
  return {
    config: pc,
    email,
    turnstile:
      overrides.turnstile ??
      (pc.turnstile.dev || !pc.turnstile.secret
        ? new DevTurnstile()
        : new CloudflareTurnstile(pc.turnstile.secret, deps.fetch)),
    rateLimit:
      overrides.rateLimit ??
      (env.RATE_LIMITER ? new DurableRateLimiter(env.RATE_LIMITER, deps.now) : new NoRateLimiter()),
    analytics:
      overrides.analytics ??
      (pc.analyticsEngine && env.ANALYTICS && !config.devMode
        ? new AnalyticsEngineStore(env.ANALYTICS, pc.analyticsEngine, deps.fetch)
        : new D1AnalyticsStore(deps.db)),
    dns:
      overrides.dns ??
      (config.devMode ? new DevDnsResolver(devPagesHostLookup(deps.db), doh) : doh),
    rdap: overrides.rdap ?? new HttpRdapClient(deps.fetch),
    cache: overrides.cache ?? env.CACHE,
    quotaOverrides: overrides.quotaOverrides ?? env.QUOTAS_JSON,
  };
}
