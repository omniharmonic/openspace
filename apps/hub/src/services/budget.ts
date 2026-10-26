/**
 * Budget alerts (PRD §7.6: "Budget alerts at 80% of plan allowances"). A daily cron measures the
 * Hub's month-to-date usage from its own counters and compares it with the operator's plan
 * allowances (`PLAN_ALLOWANCES_JSON`, defaults: Cloudflare Workers Paid base plan + the email
 * provider's volume). At 80% of any allowance it records an alert (once per resource and month)
 * and emails `ALERT_EMAIL`.
 *
 * The counters are lower bounds for Cloudflare's billing meters: `requests` counts the requests
 * the Hub can attribute (analytics beacons, form posts, emails, MCP operations), not static asset
 * hits served by sites themselves (those are free and never touch the Hub).
 */

import type { Logger } from "../lib/log";
import type { PlanAllowances } from "../operator-env";
import type { Services } from "./index";

export const ALERT_THRESHOLD = 0.8;

export type BudgetResource = keyof PlanAllowances;

export interface BudgetLine {
  resource: BudgetResource;
  used: number;
  allowance: number;
  /** used / allowance. */
  ratio: number;
}

const LABELS: Record<BudgetResource, string> = {
  requests: "Hub requests",
  analyticsEvents: "Analytics events",
  emails: "Emails sent",
  storageBytes: "File storage",
};

const monthStart = (now: number) => {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

async function sumQuota(db: D1Database, resource: string, periodLike: string): Promise<number> {
  const r = await db
    .prepare(
      "SELECT COALESCE(SUM(count), 0) AS n FROM quota_usage WHERE resource = ? AND period LIKE ?",
    )
    .bind(resource, periodLike)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

/** Bytes stored in the Hub's R2 bucket (form uploads, digital products, setup assets). */
async function storedBytes(bucket: R2Bucket): Promise<number> {
  let total = 0;
  let cursor: string | undefined;
  for (let page = 0; page < 200; page++) {
    const list = await bucket.list({ cursor, limit: 1000 });
    for (const o of list.objects) total += o.size;
    if (!list.truncated) break;
    cursor = list.cursor;
  }
  return total;
}

/** Month-to-date Hub usage against the plan allowances. */
export async function hubUsage(services: Services): Promise<BudgetLine[]> {
  const now = services.now();
  const month = new Date(now).toISOString().slice(0, 7);
  const db = services.db;
  const [pageviews, submissions, transactional, mcp, campaign, storage] = await Promise.all([
    sumQuota(db, "analyticsPageviews", month),
    sumQuota(db, "formSubmissions", month),
    sumQuota(db, "transactionalEmails", month),
    sumQuota(db, "mcpOperations", `${month}-%`),
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM campaign_recipients WHERE sent_at >= ? AND status IN ('sent', 'bounced', 'complained')",
      )
      .bind(monthStart(now))
      .first<{ n: number }>(),
    storedBytes(services.uploads),
  ]);
  const emails = transactional + (campaign?.n ?? 0);
  const used: Record<BudgetResource, number> = {
    requests: pageviews + submissions + mcp + emails,
    analyticsEvents: pageviews,
    emails,
    storageBytes: storage,
  };
  const allowances = services.operator.allowances;
  return (Object.keys(allowances) as BudgetResource[]).map((resource) => ({
    resource,
    used: used[resource],
    allowance: allowances[resource],
    ratio: allowances[resource] > 0 ? used[resource] / allowances[resource] : 0,
  }));
}

const fmt = (r: BudgetResource, n: number) =>
  r === "storageBytes" ? `${(n / 1024 ** 3).toFixed(2)} GB` : n.toLocaleString("en-US");

/**
 * Record (and email) an alert for every resource at or above 80% of its allowance that hasn't
 * alerted this month. Returns the new alerts.
 */
export async function checkBudget(services: Services, log?: Logger): Promise<BudgetLine[]> {
  const now = services.now();
  const period = new Date(now).toISOString().slice(0, 7);
  const lines = await hubUsage(services);
  const fresh: BudgetLine[] = [];
  for (const line of lines) {
    if (line.ratio < ALERT_THRESHOLD) continue;
    const inserted = await services.db
      .prepare(
        `INSERT INTO budget_alerts (resource, period, used, allowance, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (resource, period) DO NOTHING`,
      )
      .bind(line.resource, period, line.used, line.allowance, now)
      .run();
    if ((inserted.meta.changes ?? 0) === 0) continue;
    fresh.push(line);
  }
  if (!fresh.length) return fresh;
  log?.warn("hub usage above 80% of plan allowances", {
    resources: fresh.map((l) => l.resource),
  });
  const to = services.operator.alertEmail;
  if (!to) return fresh;
  const rows = fresh.map(
    (l) =>
      `${LABELS[l.resource]}: ${fmt(l.resource, l.used)} of ${fmt(l.resource, l.allowance)} (${Math.round(l.ratio * 100)}%)`,
  );
  const text = [
    `Your OpenSpace Hub (${services.config.hubUrl}) has used 80% or more of these monthly allowances in ${period}:`,
    "",
    ...rows.map((r) => `- ${r}`),
    "",
    "Raise the allowances (PLAN_ALLOWANCES_JSON) if your plan covers more, or lower per-site quotas (QUOTAS_JSON). You get one alert per resource per month.",
  ].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<p>Your OpenSpace Hub (${esc(services.config.hubUrl)}) has used 80% or more of these monthly allowances in ${period}:</p><ul>${rows.map((r) => `<li>${esc(r)}</li>`).join("")}</ul><p>Raise the allowances (<code>PLAN_ALLOWANCES_JSON</code>) if your plan covers more, or lower per-site quotas (<code>QUOTAS_JSON</code>). You get one alert per resource per month.</p>`;
  try {
    await services.pub.email.send({
      to,
      from: services.pub.config.emailFrom,
      subject: `OpenSpace Hub budget alert: ${fresh.map((l) => LABELS[l.resource]).join(", ")} at 80%`,
      html,
      text,
      kind: "budget-alert",
      siteId: null,
    });
    await services.db
      .prepare(
        `UPDATE budget_alerts SET emailed_at = ? WHERE period = ? AND resource IN (${fresh.map(() => "?").join(", ")})`,
      )
      .bind(now, period, ...fresh.map((l) => l.resource))
      .run();
  } catch (err) {
    log?.error("budget alert email failed", { err });
  }
  return fresh;
}
