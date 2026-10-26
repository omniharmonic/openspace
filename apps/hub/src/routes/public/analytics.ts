/**
 * `POST /a/:siteId` — cookieless analytics beacon (architecture §9.3). Body (sent with
 * `navigator.sendBeacon`, so usually `text/plain`): `{ p: path, r: referrer, s: "m"|"t"|"d",
 * u: { source, medium, campaign, … }, e?: eventName }`. Always answers 204 for accepted or
 * dropped hits (bots, analytics off, sampled out).
 */
import { Hono } from "hono";
import { HttpError } from "../../lib/errors";
import {
  clientIp,
  originAllowed,
  publicErrors,
  publicSite,
  publicSiteCors,
} from "../../lib/public";
import {
  cleanPath,
  dailySalt,
  deviceFrom,
  isBot,
  referrerHost,
  visitorHash,
} from "../../services/analytics";
import { addUsage, siteQuotaLimits } from "../../services/quotas";
import { getSettings } from "../../services/settings";
import type { AppEnv } from "../../types";

export const publicAnalyticsRoutes = new Hono<AppEnv>();

/** Above the monthly pageview quota, keep 1 in SAMPLE_RATE hits with weight SAMPLE_RATE. */
export const SAMPLE_RATE = 10;

publicAnalyticsRoutes.use("/a/:siteId", publicSiteCors(), publicErrors());

publicAnalyticsRoutes.post("/a/:siteId", async (c) => {
  const { services } = c.var;
  const site = await publicSite(services.db, c.req.param("siteId"));
  if (!originAllowed(c.req.header("origin"), site, c.var.config))
    throw new HttpError(403, "forbidden_origin", "Not accepted from this website.");
  const ua = c.req.header("user-agent") ?? "";
  const noContent = () => c.body(null, 204);
  if (isBot(ua)) return noContent();
  const settings = await getSettings(services.db, site.id);
  if (!settings.analyticsEnabled) return noContent();

  const text = await c.req.text();
  if (text.length > 4096) return noContent();
  let body: Record<string, unknown> = {};
  try {
    const parsed = text ? (JSON.parse(text) as unknown) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      body = parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid_request", "Expected a JSON beacon.");
  }
  const now = services.now();
  const name = typeof body.e === "string" ? body.e.trim().slice(0, 60) : "";
  const kind = name ? "event" : "pageview";
  let weight = 1;
  if (kind === "pageview") {
    const limits = await siteQuotaLimits(services.db, site.id, services.pub.quotaOverrides);
    const used = await addUsage(services.db, site.id, "analyticsPageviews", now);
    if (used > limits.analyticsPageviews) {
      if (Math.random() >= 1 / SAMPLE_RATE) return noContent();
      weight = SAMPLE_RATE;
    }
  }
  const salt = await dailySalt(services.db, services.pub.cache, now);
  const hosts = [site.domain, site.url ? new URL(site.url).hostname : null].filter(
    (h): h is string => !!h,
  );
  const utm = body.u && typeof body.u === "object" ? (body.u as Record<string, unknown>) : {};
  const cf = (c.req.raw as Request & { cf?: { country?: string } }).cf;
  await services.pub.analytics.write({
    siteId: site.id,
    kind,
    path: cleanPath(body.p),
    referrer: referrerHost(body.r, hosts),
    device: deviceFrom(body.s, ua),
    country: typeof cf?.country === "string" ? cf.country : null,
    visitor: await visitorHash(salt, site.id, clientIp(c), ua),
    utmSource: typeof utm.source === "string" ? utm.source.slice(0, 60).toLowerCase() : null,
    name: name || null,
    weight,
    at: now,
  });
  return noContent();
});
