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
import { RATE_RULES } from "../../services/rate-limit";
import type { AppEnv } from "../../types";

export async function gate(
  c: Context<AppEnv>,
  site: SiteRow,
  kind: "form" | "subscribe",
  turnstileToken: string | null,
): Promise<PublicFailure | null> {
  const { services } = c.var;
  warnMissingTurnstile(c);
  const ip = clientIp(c);
  const key = requireHmacKey(services.pub.config);
  const who = (await sha256Hex(`${key}|${rateKeyIp(ip)}`)).slice(0, 24);
  const [visitorRule, siteRule] =
    kind === "form"
      ? [RATE_RULES.form, RATE_RULES.formSite]
      : [RATE_RULES.subscribe, RATE_RULES.subscribeSite];
  const what = kind === "form" ? "messages" : "signups";
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
