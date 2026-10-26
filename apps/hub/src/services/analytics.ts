/**
 * Cookieless analytics (architecture §9.3, PRD §7.4).
 *
 * - The beacon posts `{p: path, r: referrer, s: screen class m|t|d, u: utm}`.
 * - Unique visitors use `sha256(dailySalt | siteId | ip | userAgent)`, truncated. The salt
 *   rotates every UTC day and old salts are deleted, so hashes can't be linked across days or
 *   reversed. The raw IP and user agent are never stored.
 * - Datapoints go to Analytics Engine in production; to D1 `analytics_events` in dev (or when the
 *   Analytics Engine SQL credentials are missing, so queries keep working).
 */
import type { FetchLike } from "../github/http";
import { randomToken, sha256Hex } from "../lib/crypto";

export type Device = "mobile" | "tablet" | "desktop";

export interface AnalyticsEvent {
  siteId: string;
  kind: "pageview" | "event";
  path: string;
  referrer: string | null;
  device: Device;
  country: string | null;
  visitor: string;
  utmSource: string | null;
  name: string | null;
  /** Sampling weight (1 = not sampled). */
  weight: number;
  at: number;
}

export interface Breakdown {
  key: string;
  pageviews: number;
  visitors: number;
}

export interface AnalyticsTotals {
  pageviews: number;
  /** Distinct visitor-days (one visitor counted once per day). */
  visits: number;
  /** Distinct visitor hashes in the range (hashes rotate daily, so ≈ visits for ranges > 1 day). */
  uniques: number;
}

export interface AnalyticsData {
  totals: AnalyticsTotals;
  series: Array<{ date: string; pageviews: number; visits: number }>;
  topPages: Breakdown[];
  referrers: Breakdown[];
  devices: Breakdown[];
  countries: Breakdown[];
  sources: Breakdown[];
  events: Breakdown[];
}

export interface AnalyticsStore {
  readonly kind: "d1" | "analytics-engine";
  write(event: AnalyticsEvent): Promise<void>;
  query(siteId: string, from: number, to: number): Promise<AnalyticsData>;
}

const DAY = 86_400_000;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ---- D1 store (dev / fallback) ------------------------------------------------------------------

export class D1AnalyticsStore implements AnalyticsStore {
  readonly kind = "d1" as const;
  constructor(private readonly db: D1Database) {}

  async write(e: AnalyticsEvent): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO analytics_events (site_id, kind, path, referrer, country, device, name, props, at,
          visitor, utm_source, weight) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      )
      .bind(
        e.siteId,
        e.kind,
        e.path,
        e.referrer,
        e.country,
        e.device,
        e.name,
        e.at,
        e.visitor,
        e.utmSource,
        e.weight,
      )
      .run();
  }

  private async breakdown(
    siteId: string,
    from: number,
    to: number,
    col: string,
    fallback: string,
    kind = "pageview",
  ): Promise<Breakdown[]> {
    const res = await this.db
      .prepare(
        `SELECT COALESCE(NULLIF(${col}, ''), ?) AS key, SUM(weight) AS pageviews,
           COUNT(DISTINCT visitor) AS visitors
         FROM analytics_events WHERE site_id = ? AND kind = ? AND at >= ? AND at < ?
         GROUP BY key ORDER BY pageviews DESC LIMIT 10`,
      )
      .bind(fallback, siteId, kind, from, to)
      .all<Breakdown>();
    return res.results;
  }

  async query(siteId: string, from: number, to: number): Promise<AnalyticsData> {
    const totals = await this.db
      .prepare(
        `SELECT COALESCE(SUM(weight), 0) AS pageviews,
           COUNT(DISTINCT visitor || ':' || (at / ${DAY})) AS visits,
           COUNT(DISTINCT visitor) AS uniques
         FROM analytics_events WHERE site_id = ? AND kind = 'pageview' AND at >= ? AND at < ?`,
      )
      .bind(siteId, from, to)
      .first<AnalyticsTotals>();
    const series = await this.db
      .prepare(
        `SELECT (at / ${DAY}) AS d, SUM(weight) AS pageviews, COUNT(DISTINCT visitor) AS visits
         FROM analytics_events WHERE site_id = ? AND kind = 'pageview' AND at >= ? AND at < ?
         GROUP BY d ORDER BY d`,
      )
      .bind(siteId, from, to)
      .all<{ d: number; pageviews: number; visits: number }>();
    const [topPages, referrers, devices, countries, sources, events] = await Promise.all([
      this.breakdown(siteId, from, to, "path", "/"),
      this.breakdown(siteId, from, to, "referrer", "Direct"),
      this.breakdown(siteId, from, to, "device", "desktop"),
      this.breakdown(siteId, from, to, "country", "Unknown"),
      this.breakdown(siteId, from, to, "utm_source", "None"),
      this.breakdown(siteId, from, to, "name", "event", "event"),
    ]);
    return {
      totals: totals ?? { pageviews: 0, visits: 0, uniques: 0 },
      series: fillSeries(
        from,
        to,
        series.results.map((r) => ({
          date: dayKey(r.d * DAY),
          pageviews: r.pageviews,
          visits: r.visits,
        })),
      ),
      topPages,
      referrers,
      devices,
      countries,
      sources,
      events,
    };
  }
}

/** One entry per day in [from, to), zero-filled. */
export function fillSeries(
  from: number,
  to: number,
  rows: Array<{ date: string; pageviews: number; visits: number }>,
): Array<{ date: string; pageviews: number; visits: number }> {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: Array<{ date: string; pageviews: number; visits: number }> = [];
  for (let t = Math.floor(from / DAY) * DAY; t < to; t += DAY) {
    const d = dayKey(t);
    out.push(byDate.get(d) ?? { date: d, pageviews: 0, visits: 0 });
  }
  return out;
}

// ---- Analytics Engine store (production) --------------------------------------------------------

/**
 * Datapoint layout: index1 = siteId; blobs = [kind, path, referrer, device, country, visitor,
 * utmSource, name]; double1 = sampling weight. Queries go through the SQL API (needs an account
 * id and an API token with Analytics read).
 */
export class AnalyticsEngineStore implements AnalyticsStore {
  readonly kind = "analytics-engine" as const;
  constructor(
    private readonly dataset: AnalyticsEngineDataset,
    private readonly sql: { accountId: string; token: string; dataset: string },
    private readonly fetchFn: FetchLike,
  ) {}

  async write(e: AnalyticsEvent): Promise<void> {
    this.dataset.writeDataPoint({
      indexes: [e.siteId],
      blobs: [
        e.kind,
        e.path,
        e.referrer ?? "",
        e.device,
        e.country ?? "",
        e.visitor,
        e.utmSource ?? "",
        e.name ?? "",
      ],
      doubles: [e.weight],
    });
  }

  private async run<T>(query: string): Promise<T[]> {
    const res = await this.fetchFn(
      `https://api.cloudflare.com/client/v4/accounts/${this.sql.accountId}/analytics_engine/sql`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${this.sql.token}` },
        body: `${query} FORMAT JSON`,
      },
    );
    if (!res.ok) throw new Error(`Analytics Engine SQL failed: ${res.status}`);
    const body = (await res.json()) as { data?: T[] };
    return body.data ?? [];
  }

  async query(siteId: string, from: number, to: number): Promise<AnalyticsData> {
    if (!/^st_[0-9a-z]+$/.test(siteId)) throw new Error("bad site id");
    const ds = this.sql.dataset.replace(/[^A-Za-z0-9_]/g, "");
    const where = (kind: string) =>
      `index1 = '${siteId}' AND blob1 = '${kind}' AND timestamp >= toDateTime(${Math.floor(from / 1000)}) AND timestamp < toDateTime(${Math.floor(to / 1000)})`;
    const pv = "SUM(_sample_interval * double1)";
    const breakdown = (blob: string, fallback: string, kind = "pageview") =>
      this.run<{ key: string; pageviews: number; visitors: number }>(
        `SELECT ${blob} AS key, ${pv} AS pageviews, COUNT(DISTINCT blob6) AS visitors FROM ${ds}
         WHERE ${where(kind)} GROUP BY key ORDER BY pageviews DESC LIMIT 10`,
      ).then((rows) =>
        rows.map((r) => ({
          key: r.key || fallback,
          pageviews: Number(r.pageviews),
          visitors: Number(r.visitors),
        })),
      );
    const [totalsRows, seriesRows, topPages, referrers, devices, countries, sources, events] =
      await Promise.all([
        this.run<{ pageviews: number; uniques: number }>(
          `SELECT ${pv} AS pageviews, COUNT(DISTINCT blob6) AS uniques FROM ${ds} WHERE ${where("pageview")}`,
        ),
        this.run<{ d: string; pageviews: number; visits: number }>(
          `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS d, ${pv} AS pageviews,
             COUNT(DISTINCT blob6) AS visits FROM ${ds} WHERE ${where("pageview")} GROUP BY d ORDER BY d`,
        ),
        breakdown("blob2", "/"),
        breakdown("blob3", "Direct"),
        breakdown("blob4", "desktop"),
        breakdown("blob5", "Unknown"),
        breakdown("blob7", "None"),
        breakdown("blob8", "event", "event"),
      ]);
    const series = seriesRows.map((r) => ({
      date: String(r.d).slice(0, 10),
      pageviews: Number(r.pageviews),
      visits: Number(r.visits),
    }));
    const t = totalsRows[0];
    return {
      totals: {
        pageviews: Number(t?.pageviews ?? 0),
        visits: series.reduce((n, r) => n + r.visits, 0),
        uniques: Number(t?.uniques ?? 0),
      },
      series: fillSeries(from, to, series),
      topPages,
      referrers,
      devices,
      countries,
      sources,
      events,
    };
  }
}

// ---- visitor hashing ----------------------------------------------------------------------------

/** Today's salt (UTC), created on first use; cached in KV (one write per day). */
export async function dailySalt(
  db: D1Database,
  cache: KVNamespace | undefined,
  now: number,
): Promise<string> {
  const day = dayKey(now);
  const cacheKey = `analytics-salt:${day}`;
  if (cache) {
    const hit = await cache.get(cacheKey).catch(() => null);
    if (hit) return hit;
  }
  await db
    .prepare("INSERT OR IGNORE INTO analytics_salts (day, salt) VALUES (?, ?)")
    .bind(day, randomToken(32))
    .run();
  const row = await db
    .prepare("SELECT salt FROM analytics_salts WHERE day = ?")
    .bind(day)
    .first<{ salt: string }>();
  const salt = row?.salt ?? randomToken(32);
  if (cache)
    await cache.put(cacheKey, salt, { expirationTtl: 60 * 60 * 26 }).catch(() => undefined);
  return salt;
}

export async function visitorHash(
  salt: string,
  siteId: string,
  ip: string,
  userAgent: string,
): Promise<string> {
  return (await sha256Hex(`${salt}|${siteId}|${ip}|${userAgent}`)).slice(0, 16);
}

/** Delete salts older than yesterday so past hashes can never be recomputed. */
export async function rotateSalts(db: D1Database, now: number): Promise<void> {
  await db
    .prepare("DELETE FROM analytics_salts WHERE day < ?")
    .bind(dayKey(now - DAY))
    .run();
}

// ---- beacon parsing -------------------------------------------------------------------------------

const BOT_RE =
  /bot|crawl|spider|slurp|headless|lighthouse|pingdom|preview|facebookexternalhit|curl|wget|python-requests/i;

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_RE.test(userAgent);
}

export function deviceFrom(screen: unknown, userAgent: string): Device {
  if (screen === "m") return "mobile";
  if (screen === "t") return "tablet";
  if (screen === "d") return "desktop";
  if (/iPad|Tablet/i.test(userAgent)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(userAgent)) return "mobile";
  return "desktop";
}

export function cleanPath(p: unknown): string {
  if (typeof p !== "string" || !p) return "/";
  let path = p.split(/[?#]/)[0] ?? "/";
  if (!path.startsWith("/")) path = `/${path}`;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: strip control characters
  return path.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 300) || "/";
}

/** Referrer reduced to its host; self-referrals (the site's own hosts) become null. */
export function referrerHost(r: unknown, ownHosts: string[]): string | null {
  if (typeof r !== "string" || !r) return null;
  try {
    const host = new URL(r).hostname.replace(/^www\./, "");
    if (!host || ownHosts.some((h) => h.replace(/^www\./, "") === host)) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

export type Range = "day" | "week" | "month";

/** [from, to) for a named range ending now: last 24 h, 7 days, 30 days. */
export function rangeBounds(range: Range, now: number): { from: number; to: number } {
  const days = range === "day" ? 1 : range === "week" ? 7 : 30;
  return { from: now - days * DAY, to: now + 1 };
}
