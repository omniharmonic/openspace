/** Studio's analytics report (visits, top pages, sources, devices, form conversions) + weekly digest. */
import { renderEmail } from "@omniharmonic/openspace-email-render";
import type { Block } from "@omniharmonic/openspace-schema";
import type { SiteRow } from "../db/sites";
import type { Logger } from "../lib/log";
import {
  type AnalyticsData,
  type Breakdown,
  type Range,
  rangeBounds,
  stripBasePath,
} from "./analytics";
import { emailSite, sendTransactional, siteBaseUrl } from "./email";
import { SPAM_THRESHOLD } from "./forms";
import type { Services } from "./index";
import { type CronSummary, errorKind, notifyAddress } from "./notifications";
import { quotaUsed, siteQuotaLimits } from "./quotas";
import { getSettings } from "./settings";

export interface FormConversion {
  formId: string;
  name: string | null;
  submissions: number;
  /** Submissions per visit (0–1), null when there were no visits. */
  conversionRate: number | null;
}

export interface AnalyticsReport extends AnalyticsData {
  range: { name: Range | "custom"; from: string; to: string };
  forms: FormConversion[];
  /** This month's pageviews exceeded the quota, so new hits are sampled (numbers are estimates). */
  sampled: boolean;
  store: "d1" | "analytics-engine";
}

export async function analyticsReport(
  services: Services,
  site: SiteRow,
  range: Range | { from: number; to: number },
): Promise<AnalyticsReport> {
  const now = services.now();
  const { from, to } = typeof range === "string" ? rangeBounds(range, now) : range;
  const data = await services.pub.analytics.query(site.id, from, to);
  const forms = (
    await services.db
      .prepare(
        `SELECT s.form_id AS formId, f.name AS name, COUNT(*) AS submissions FROM submissions s
         LEFT JOIN forms f ON f.site_id = s.site_id AND f.id = s.form_id
         WHERE s.site_id = ? AND s.created_at >= ? AND s.created_at < ? AND COALESCE(s.spam_score, 0) < ?
         GROUP BY s.form_id ORDER BY submissions DESC`,
      )
      .bind(site.id, from, to, SPAM_THRESHOLD)
      .all<{ formId: string; name: string | null; submissions: number }>()
  ).results.map((f) => ({
    ...f,
    // Entries aren't tied to visits (a direct link, a resubmission), so more entries than
    // visits is possible: a rate is never more than 100%.
    conversionRate: data.totals.visits
      ? Math.round(Math.min(1, f.submissions / data.totals.visits) * 10_000) / 10_000
      : null,
  }));
  // Visits recorded before paths were stored without the GitHub Pages base path.
  const pages = new Map<string, Breakdown>();
  for (const p of data.topPages) {
    const key = stripBasePath(p.key, site.url);
    const prev = pages.get(key);
    pages.set(
      key,
      prev
        ? { key, pageviews: prev.pageviews + p.pageviews, visitors: prev.visitors + p.visitors }
        : { ...p, key },
    );
  }
  data.topPages = [...pages.values()].sort((a, b) => b.pageviews - a.pageviews);
  const limits = await siteQuotaLimits(services.db, site.id, services.pub.quotaOverrides);
  const sampled =
    (await quotaUsed(services.db, site.id, "analyticsPageviews", now)) > limits.analyticsPageviews;
  return {
    ...data,
    range: {
      name: typeof range === "string" ? range : "custom",
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    },
    forms,
    sampled,
    store: services.pub.analytics.kind,
  };
}

/** Block builders for one email; ids are sequential within that email only. */
function blockBuilder() {
  let seq = 0;
  const blk = (type: string, fields: Record<string, unknown>): Block => ({
    id: `blk_dg${(++seq).toString(36).padStart(8, "0")}` as Block["id"],
    type,
    v: 1,
    fields,
  });
  const para = (text: string) =>
    blk("text", {
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
    });
  return { blk, para };
}

/** Weekly analytics summary for owners who opted in (cron, Mondays). */
export async function sendWeeklyDigests(services: Services, log?: Logger): Promise<CronSummary> {
  const { db } = services;
  const rows = (
    await db
      .prepare(
        `SELECT st.* FROM sites st JOIN service_settings ss ON ss.site_id = st.id
         WHERE st.archived_at IS NULL AND json_extract(ss.settings_json, '$.weeklyDigest') = 1`,
      )
      .all<SiteRow>()
  ).results;
  const summary: CronSummary = { sent: 0, failed: 0 };
  for (const site of rows) {
    try {
      const { blk, para } = blockBuilder();
      const settings = await getSettings(db, site.id);
      if (!settings.weeklyDigest || !settings.analyticsEnabled) continue;
      const to = await notifyAddress(services, site, settings);
      if (!to) continue;
      const r = await analyticsReport(services, site, "week");
      const top = r.topPages
        .slice(0, 5)
        .map((p) => `${p.key} — ${p.pageviews}`)
        .join("\n");
      const sources = r.referrers
        .slice(0, 5)
        .map((p) => `${p.key} — ${p.pageviews}`)
        .join("\n");
      const entries = r.forms.reduce((n, f) => n + f.submissions, 0);
      const mail = renderEmail({
        site: emailSite(site),
        baseUrl: siteBaseUrl(site, services.config.hubUrl),
        preheader: `${r.totals.visits} visits this week`,
        title: `Your week on ${site.name}`,
        footerNote: "You get this because the weekly summary is on in your site's settings.",
        blocks: [
          blk("heading", { text: `Your week on ${site.name}`, level: 1 }),
          para(
            `${r.totals.visits} visits · ${r.totals.pageviews} page views · ${entries} form ${entries === 1 ? "entry" : "entries"}${r.sampled ? " (estimated)" : ""}`,
          ),
          ...(top ? [blk("heading", { text: "Top pages", level: 2 }), para(top)] : []),
          ...(sources
            ? [blk("heading", { text: "Where visitors came from", level: 2 }), para(sources)]
            : []),
          blk("button", {
            label: "Open your dashboard",
            link: {
              type: "url",
              url: `${services.config.studioOrigin}/sites/${site.id}/analytics`,
            },
          }),
        ],
      });
      await sendTransactional(services, {
        siteId: site.id,
        to,
        subject: `Your week on ${site.name}: ${r.totals.visits} ${r.totals.visits === 1 ? "visit" : "visits"}`,
        html: mail.html,
        text: mail.text,
        kind: "analytics-digest",
      });
      summary.sent++;
    } catch (err) {
      summary.failed++;
      log?.warn("weekly digest failed", { siteId: site.id, kind: errorKind(err) });
    }
  }
  return summary;
}
