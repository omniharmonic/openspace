/**
 * Data export, deletion and retention (architecture §12 GDPR/CCPA row, PRD §7.4, FR-32).
 */
import { strToU8, zipSync } from "fflate";
import type { SiteRow } from "../db/sites";
import { toCsv } from "../lib/csv";
import { rotateSalts } from "./analytics";
import { allSubmissions, type SubmissionData, toSubmissionView } from "./forms";
import type { Services } from "./index";
import { allSubscribers, parseTags } from "./newsletter";

// ---- CSV builders ---------------------------------------------------------------------------------

export async function submissionsCsv(
  db: D1Database,
  siteId: string,
  formId?: string,
): Promise<string> {
  const rows = (await allSubmissions(db, siteId, formId)).map(toSubmissionView);
  const keys: string[] = [];
  for (const r of rows) for (const k of Object.keys(r.data)) if (!keys.includes(k)) keys.push(k);
  const fmt = (v: SubmissionData[string] | undefined) =>
    v === undefined
      ? ""
      : typeof v === "boolean"
        ? v
          ? "yes"
          : "no"
        : Array.isArray(v)
          ? v.join("; ")
          : v;
  return toCsv(
    ["id", "form_id", "form_name", "created_at", "read", "spam", "source", ...keys],
    rows.map((r) => [
      r.id,
      r.formId,
      r.formName ?? "",
      r.createdAt,
      r.read ? "yes" : "no",
      r.spam ? "yes" : "no",
      r.source ?? "",
      ...keys.map((k) => fmt(r.data[k])),
    ]),
  );
}

export async function subscribersCsv(db: D1Database, siteId: string): Promise<string> {
  const rows = await allSubscribers(db, siteId);
  const iso = (n: number | null) => (n ? new Date(n).toISOString() : "");
  return toCsv(
    [
      "email",
      "first_name",
      "status",
      "tags",
      "source",
      "created_at",
      "confirmed_at",
      "unsubscribed_at",
    ],
    rows.map((r) => [
      r.email,
      r.first_name ?? "",
      r.status,
      parseTags(r.tags).join("; "),
      r.source ?? "",
      iso(r.created_at),
      iso(r.confirmed_at),
      iso(r.unsubscribed_at),
    ]),
  );
}

export async function ordersCsv(db: D1Database, siteId: string): Promise<string> {
  const rows = (
    await db
      .prepare("SELECT * FROM orders WHERE site_id = ? ORDER BY created_at")
      .bind(siteId)
      .all<{
        id: string;
        status: string;
        total: number | null;
        currency: string | null;
        items_json: string | null;
        shipping_json: string | null;
        created_at: number;
      }>()
  ).results;
  return toCsv(
    ["id", "status", "total_minor_units", "currency", "items", "shipping", "created_at"],
    rows.map((r) => [
      r.id,
      r.status,
      r.total ?? "",
      r.currency ?? "",
      r.items_json ?? "",
      r.shipping_json ?? "",
      new Date(r.created_at).toISOString(),
    ]),
  );
}

/** ZIP of everything the Hub stores for a site (not the site content — that's in the repo). */
export async function exportSiteZip(services: Services, site: SiteRow): Promise<Uint8Array> {
  const { db } = services;
  const forms = (
    await db
      .prepare("SELECT DISTINCT form_id FROM submissions WHERE site_id = ?")
      .bind(site.id)
      .all<{ form_id: string }>()
  ).results;
  const files: Record<string, Uint8Array> = {
    "README.txt": strToU8(
      [
        `Data export for ${site.name} (${site.id})`,
        `Created ${new Date(services.now()).toISOString()}`,
        "",
        "submissions.csv  every form entry (one column per field)",
        "forms/<id>.csv   entries per form",
        "subscribers.csv  newsletter subscribers and their status",
        "orders.csv       shop orders",
        "",
        "Your pages, images and settings live in your site's GitHub repository.",
      ].join("\n"),
    ),
    "submissions.csv": strToU8(await submissionsCsv(db, site.id)),
    "subscribers.csv": strToU8(await subscribersCsv(db, site.id)),
    "orders.csv": strToU8(await ordersCsv(db, site.id)),
  };
  for (const f of forms)
    files[`forms/${f.form_id.replace(/[^A-Za-z0-9_-]/g, "_")}.csv`] = strToU8(
      await submissionsCsv(db, site.id, f.form_id),
    );
  return zipSync(files, { level: 6 });
}

// ---- deletion -------------------------------------------------------------------------------------

export const DATA_SCOPES = ["submissions", "subscribers", "analytics", "orders"] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

export async function deleteSiteData(
  db: D1Database,
  siteId: string,
  scopes: readonly DataScope[],
): Promise<Record<DataScope, number>> {
  const out = { submissions: 0, subscribers: 0, analytics: 0, orders: 0 } as Record<
    DataScope,
    number
  >;
  const tables: Record<DataScope, string[]> = {
    submissions: ["submissions"],
    subscribers: ["subscribers"],
    analytics: ["analytics_events"],
    orders: ["orders"],
  };
  for (const scope of scopes) {
    for (const t of tables[scope]) {
      const r = await db.prepare(`DELETE FROM ${t} WHERE site_id = ?`).bind(siteId).run();
      out[scope] += r.meta.changes ?? 0;
    }
  }
  return out;
}

/** Data-subject request: remove one person (by email) from a site's Hub data. */
export async function erasePerson(
  db: D1Database,
  siteId: string,
  email: string,
): Promise<{ subscribers: number; submissions: number; members: number }> {
  const e = email.trim().toLowerCase();
  const subs = await db
    .prepare("DELETE FROM subscribers WHERE site_id = ? AND lower(email) = ?")
    .bind(siteId, e)
    .run();
  const entries = await db
    .prepare(
      `DELETE FROM submissions WHERE site_id = ? AND EXISTS (
         SELECT 1 FROM json_each(submissions.data_json) WHERE lower(trim(json_each.value)) = ?)`,
    )
    .bind(siteId, e)
    .run();
  const members = await db
    .prepare("DELETE FROM members WHERE site_id = ? AND lower(email) = ?")
    .bind(siteId, e)
    .run();
  return {
    subscribers: subs.meta.changes ?? 0,
    submissions: entries.meta.changes ?? 0,
    members: members.meta.changes ?? 0,
  };
}

// ---- retention ------------------------------------------------------------------------------------

const DAY = 86_400_000;

/** Daily retention purge (cron). Returns per-table counts for the log. */
export async function runRetentionPurge(services: Services): Promise<Record<string, number>> {
  const { db } = services;
  const now = services.now();
  const n = async (sql: string, ...args: unknown[]) =>
    (
      await db
        .prepare(sql)
        .bind(...args)
        .run()
    ).meta.changes ?? 0;
  const counts: Record<string, number> = {
    submissions: await n(
      "DELETE FROM submissions WHERE purge_at IS NOT NULL AND purge_at < ?",
      now,
    ),
    // Never-confirmed signups are forgotten 30 days after their link expired.
    pendingSubscribers: await n(
      "DELETE FROM subscribers WHERE status = 'pending' AND confirm_expires_at IS NOT NULL AND confirm_expires_at < ?",
      now - 30 * DAY,
    ),
    analyticsEvents: await n("DELETE FROM analytics_events WHERE at < ?", now - 400 * DAY),
    outbox: await n("DELETE FROM outbox WHERE created_at < ?", now - 30 * DAY),
    quotaUsage: await n(
      "DELETE FROM quota_usage WHERE period < ?",
      new Date(now - 400 * DAY).toISOString().slice(0, 7),
    ),
    archivedSites: 0,
  };
  await rotateSalts(db, now);
  // Archived sites past their 30-day retention: remove everything the Hub holds for them.
  const expired = (
    await db
      .prepare(
        "SELECT id FROM sites WHERE archived_at IS NOT NULL AND purge_at IS NOT NULL AND purge_at < ?",
      )
      .bind(now)
      .all<{ id: string }>()
  ).results;
  for (const { id } of expired) {
    await db.batch(
      [
        "submissions",
        "subscribers",
        "analytics_events",
        "forms",
        "campaigns",
        "members",
        "member_tokens",
        "orders",
        "products",
        "inventory",
        "schedules",
        "domains",
        "invitations",
        "mcp_grants",
        "service_settings",
        "quota_usage",
        "site_roles",
      ].map((t) => db.prepare(`DELETE FROM ${t} WHERE site_id = ?`).bind(id)),
    );
    await db.prepare("DELETE FROM sites WHERE id = ?").bind(id).run();
    counts.archivedSites = (counts.archivedSites ?? 0) + 1;
  }
  return counts;
}
