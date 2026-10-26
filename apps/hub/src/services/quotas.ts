/**
 * Per-site quotas (architecture §8.4). Defaults below; a self-hosted Hub overrides them with
 * `QUOTAS_JSON`, and a single site with `sites.plan_flags = {"quotas": {...}}` ("raise on request").
 *
 * Counters live in `quota_usage` keyed by period (UTC month or day) and are consumed atomically
 * with a conditional upsert, so concurrent requests can't overshoot a limit.
 */
import type { MiddlewareHandler } from "hono";
import { HttpError } from "../lib/errors";
import type { AppEnv } from "../types";

export interface QuotaLimits {
  /** Form submissions per month (spam doesn't count). */
  formSubmissions: number;
  /** Months submissions are kept (owners can choose shorter). */
  storedSubmissionsMonths: number;
  /** Subscribers per site (pending + confirmed). */
  subscribers: number;
  /** Transactional emails per month (confirmations, notifications, magic links, digests). */
  transactionalEmails: number;
  /** Analytics pageviews per month before sampling starts. */
  analyticsPageviews: number;
  /** Total bytes of form file uploads. */
  uploadBytes: number;
  /** MCP operations per day (enforced by Task 17 through `consumeQuota`). */
  mcpOperations: number;
}

export const DEFAULT_QUOTAS: QuotaLimits = {
  formSubmissions: 1_000,
  storedSubmissionsMonths: 12,
  subscribers: 5_000,
  transactionalEmails: 500,
  analyticsPageviews: 300_000,
  uploadBytes: 1024 * 1024 * 1024,
  mcpOperations: 2_000,
};

/** Counter-based resources and the period each resets on. */
export const COUNTED: Record<string, "month" | "day"> = {
  formSubmissions: "month",
  transactionalEmails: "month",
  analyticsPageviews: "month",
  mcpOperations: "day",
};

export type CountedResource =
  | "formSubmissions"
  | "transactionalEmails"
  | "analyticsPageviews"
  | "mcpOperations";

export function periodKey(resource: CountedResource, now: number): string {
  const iso = new Date(now).toISOString();
  return COUNTED[resource] === "day" ? iso.slice(0, 10) : iso.slice(0, 7);
}

function parseObj(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function merge(base: QuotaLimits, over: Record<string, unknown>): QuotaLimits {
  const out = { ...base };
  for (const k of Object.keys(base) as (keyof QuotaLimits)[]) {
    const v = over[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

/** Effective limits for a site: defaults ← QUOTAS_JSON ← site plan_flags.quotas. */
export function quotaLimits(
  hubOverrides: string | undefined,
  planFlags: string | null | undefined,
): QuotaLimits {
  const hub = merge(DEFAULT_QUOTAS, parseObj(hubOverrides));
  const plan = parseObj(planFlags).quotas;
  return plan && typeof plan === "object" ? merge(hub, plan as Record<string, unknown>) : hub;
}

export async function siteQuotaLimits(
  db: D1Database,
  siteId: string,
  hubOverrides?: string,
): Promise<QuotaLimits> {
  const row = await db
    .prepare("SELECT plan_flags FROM sites WHERE id = ?")
    .bind(siteId)
    .first<{ plan_flags: string | null }>();
  return quotaLimits(hubOverrides, row?.plan_flags);
}

export async function quotaUsed(
  db: D1Database,
  siteId: string,
  resource: CountedResource,
  now: number,
): Promise<number> {
  const row = await db
    .prepare("SELECT count FROM quota_usage WHERE site_id = ? AND resource = ? AND period = ?")
    .bind(siteId, resource, periodKey(resource, now))
    .first<{ count: number }>();
  return row?.count ?? 0;
}

/**
 * Atomically add `n` to a counter if it stays within `limit`. Returns the new count, or null
 * when the quota would be exceeded (nothing is consumed then).
 */
export async function consumeQuota(
  db: D1Database,
  siteId: string,
  resource: CountedResource,
  limit: number,
  now: number,
  n = 1,
): Promise<number | null> {
  if (n > limit) return null;
  const row = await db
    .prepare(
      `INSERT INTO quota_usage (site_id, resource, period, count) VALUES (?, ?, ?, ?)
       ON CONFLICT (site_id, resource, period) DO UPDATE SET count = quota_usage.count + excluded.count
       WHERE quota_usage.count + excluded.count <= ?
       RETURNING count`,
    )
    .bind(siteId, resource, periodKey(resource, now), n, limit)
    .first<{ count: number }>();
  return row ? row.count : null;
}

/** Increment without a limit (e.g. pageviews, which are sampled rather than refused). */
export async function addUsage(
  db: D1Database,
  siteId: string,
  resource: CountedResource,
  now: number,
  n = 1,
): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO quota_usage (site_id, resource, period, count) VALUES (?, ?, ?, ?)
       ON CONFLICT (site_id, resource, period) DO UPDATE SET count = quota_usage.count + excluded.count
       RETURNING count`,
    )
    .bind(siteId, resource, periodKey(resource, now), n)
    .first<{ count: number }>();
  return row?.count ?? n;
}

export const quotaExceeded = (what: string) =>
  new HttpError(
    429,
    "quota_exceeded",
    `This site has reached its ${what} limit for now. Please try again later.`,
  );

const LABELS: Record<CountedResource, string> = {
  formSubmissions: "monthly form entry",
  transactionalEmails: "monthly email",
  analyticsPageviews: "monthly pageview",
  mcpOperations: "daily AI edit",
};

/**
 * Enforcement middleware: refuses the request early (429 `quota_exceeded`) when the site
 * (`:siteId` or `:id` param) has already used up `resource` this period. Handlers still consume
 * with `consumeQuota` once the request is known to count (e.g. after spam checks).
 */
export function quotaGuard(resource: CountedResource): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const siteId = c.req.param("siteId") ?? c.req.param("id");
    if (siteId) {
      const { db, now } = c.var.services;
      const limits = await siteQuotaLimits(db, siteId, c.env.QUOTAS_JSON);
      const used = await quotaUsed(db, siteId, resource, now());
      if (used >= limits[resource]) throw quotaExceeded(LABELS[resource]);
    }
    await next();
  };
}

export interface QuotaReport {
  resource: keyof QuotaLimits;
  limit: number;
  used: number;
  period: "month" | "day" | "total" | "retention";
}

/** Usage report for Studio's Settings → Usage. */
export async function quotaReport(
  db: D1Database,
  siteId: string,
  now: number,
  hubOverrides?: string,
): Promise<QuotaReport[]> {
  const limits = await siteQuotaLimits(db, siteId, hubOverrides);
  const counted = await Promise.all(
    (Object.keys(COUNTED) as CountedResource[]).map(async (r) => ({
      resource: r,
      limit: limits[r],
      used: await quotaUsed(db, siteId, r, now),
      period: COUNTED[r] as "month" | "day",
    })),
  );
  const subs = await db
    .prepare("SELECT COUNT(*) AS n FROM subscribers WHERE site_id = ? AND status != 'unsubscribed'")
    .bind(siteId)
    .first<{ n: number }>();
  return [
    ...counted,
    { resource: "subscribers", limit: limits.subscribers, used: subs?.n ?? 0, period: "total" },
    { resource: "uploadBytes", limit: limits.uploadBytes, used: 0, period: "total" },
    {
      resource: "storedSubmissionsMonths",
      limit: limits.storedSubmissionsMonths,
      used: 0,
      period: "retention",
    },
  ];
}
