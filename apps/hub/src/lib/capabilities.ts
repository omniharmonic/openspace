/**
 * What this Hub can actually do for visitors and owners — so Studio (and the Hub's own public
 * pages) never promise an email, a payment or a challenge the deployment can't deliver.
 * Exposed on `GET /api/me` (`capabilities`) and `GET /api/capabilities`.
 */
import type { Services } from "../services";

export interface HubCapabilities {
  /**
   * Transactional email (invitations, sign-in links, newsletter confirmations). `configured`:
   * a real provider; `devOutbox`: DEV_MODE keeps mail in `/dev/outbox` instead of sending it.
   */
  email: { configured: boolean; devOutbox: boolean };
  /** Platform Stripe (Connect) checkout: a STRIPE_SECRET_KEY, or DevStripe in DEV_MODE. */
  payments: { configured: boolean; dev: boolean };
  /** Cloudflare Turnstile on public forms, sign-up and sign-in. */
  turnstile: { configured: boolean };
  /**
   * Hosting targets a site can switch to. Cloudflare needs the owner's own token and account id
   * (per site); stores, donations, member areas and password pages only work there.
   */
  hosting: { githubPages: true; cloudflare: true };
}

export function hubCapabilities(services: Services): HubCapabilities {
  const pub = services.pub.config;
  const growth = services.growth.config;
  const dev = services.config.devMode;
  return {
    email: { configured: pub.emailProvider !== "dev", devOutbox: dev },
    payments: {
      configured: growth.stripeDev || growth.stripeSecretKey !== null,
      dev: growth.stripeDev,
    },
    turnstile: { configured: !pub.turnstile.dev && pub.turnstile.secret !== null },
    hosting: { githubPages: true, cloudflare: true },
  };
}

/** Mail the Hub sends reaches someone: a real provider, or the dev outbox in DEV_MODE. */
export function emailDeliverable(services: Services): boolean {
  return services.pub.config.emailProvider !== "dev" || services.config.devMode;
}
