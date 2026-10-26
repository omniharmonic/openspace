/** Shared spam/abuse gate for public POST endpoints: rate limits and Turnstile. */
import type { Context } from "hono";
import type { SiteRow } from "../../db/sites";
import { sha256Hex } from "../../lib/crypto";
import {
  clientIp,
  type PublicFailure,
  rateKeyIp,
  siteHostnames,
  warnMissingTurnstile,
} from "../../lib/public";
import { requireHmacKey } from "../../public-env";
import { RATE_RULES, type RateRule } from "../../services/rate-limit";
import type { AppEnv } from "../../types";

export async function gate(
  c: Context<AppEnv>,
  site: SiteRow,
  kind: "form" | "subscribe" | "login" | "checkout" | "upload",
  turnstileToken: string | null,
  opts: { turnstile?: boolean } = {},
): Promise<PublicFailure | null> {
  const { services } = c.var;
  warnMissingTurnstile(c);
  const ip = clientIp(c);
  const key = requireHmacKey(services.pub.config);
  const who = (await sha256Hex(`${key}|${rateKeyIp(ip)}`)).slice(0, 24);
  const [visitorRule, siteRule] = (
    {
      form: [RATE_RULES.form, RATE_RULES.formSite],
      subscribe: [RATE_RULES.subscribe, RATE_RULES.subscribeSite],
      login: [RATE_RULES.login, RATE_RULES.loginSite],
      checkout: [RATE_RULES.checkout, RATE_RULES.checkoutSite],
      upload: [RATE_RULES.upload, RATE_RULES.uploadSite],
    } satisfies Record<string, [RateRule, RateRule]>
  )[kind];
  const what = {
    form: "messages",
    subscribe: "signups",
    login: "sign-in requests",
    checkout: "checkout attempts",
    upload: "file uploads",
  }[kind];
  for (const [k, rule, message] of [
    [
      `${site.id}|${who}`,
      visitorRule,
      `Too many ${what} from your connection. Please try again in a few minutes.`,
    ],
    [
      `${site.id}|*`,
      siteRule,
      `This site is receiving too many ${what} right now. Please try again in a few minutes.`,
    ],
  ] as const) {
    const rate = await services.pub.rateLimit.hit(k, rule);
    if (!rate.ok) {
      c.header("Retry-After", String(rate.retryAfter));
      return { status: 429, code: "rate_limited", message };
    }
  }
  // Checkout skips Turnstile (the cart posts from a script; Stripe runs its own fraud checks).
  if (opts.turnstile === false) return null;
  const turnstile = await services.pub.turnstile.verify(
    turnstileToken,
    ip,
    siteHostnames(site, c.var.config),
  );
  if (!turnstile.ok)
    return {
      status: 403,
      code: "spam_suspected",
      message: "We couldn't verify you're a person. Please try again.",
    };
  return null;
}
