import type { HubBindings } from "./env";
import { readConfig } from "./env";
import { createLogger } from "./lib/log";
import { roomStub } from "./room";
import { runDueCampaigns } from "./services/campaigns";
import { expireInvitations } from "./services/collaborators";
import { createServices, type Services } from "./services/index";
import { runDueSchedules } from "./services/publishing";
import { deleteSetupAssets, expireTransfers } from "./services/sites";

/** Per-site Hub data deleted when an archived site's retention ends (arch §8.3, FR-4). */
const SITE_TABLES = [
  "forms",
  "submissions",
  "subscribers",
  "campaigns",
  "analytics_events",
  "member_tokens",
  "members",
  "products",
  "inventory",
  "orders",
  "schedules",
  // Task 16 public-services tables.
  "service_settings",
  "quota_usage",
  "domains",
  // Task 18 growth + commerce tables (campaign_clicks has no site_id; see below).
  "sender_connections",
  "member_links",
  "order_refunds",
  "campaign_recipients",
  "member_tiers",
  "page_passwords",
  "commerce_settings",
  "discount_codes",
  "site_updates",
  "stripe_events",
];

/** Purge archived sites past `purge_at`: setup uploads in R2, room storage, Hub rows. */
export async function purgeArchivedSites(
  env: HubBindings,
  services: Services,
  now: number,
): Promise<number> {
  const due = await services.db
    .prepare("SELECT id FROM sites WHERE purge_at IS NOT NULL AND purge_at <= ? LIMIT 20")
    .bind(now)
    .all<{ id: string }>();
  for (const { id } of due.results) {
    await deleteSetupAssets(services, id);
    try {
      await roomStub(env, id).purge(id);
    } catch {
      /* the room may never have existed */
    }
    // Task 18: digital product files.
    for (let cursor: string | undefined; ; ) {
      const list = await services.uploads.list({ prefix: `digital/${id}/`, cursor });
      if (list.objects.length) await services.uploads.delete(list.objects.map((o) => o.key));
      if (!list.truncated) break;
      cursor = list.cursor;
    }
    await services.db.batch([
      services.db
        .prepare(
          "DELETE FROM campaign_clicks WHERE campaign_id IN (SELECT id FROM campaigns WHERE site_id = ?)",
        )
        .bind(id),
      ...SITE_TABLES.map((t) => services.db.prepare(`DELETE FROM ${t} WHERE site_id = ?`).bind(id)),
      services.db.prepare("DELETE FROM sites WHERE id = ?").bind(id),
    ]);
  }
  return due.results.length;
}

/** Cron trigger (every minute): scheduled publishes, expiries, purges. */
export async function runScheduled(env: HubBindings, scheduledTime = Date.now()): Promise<void> {
  const config = readConfig(env);
  const log = createLogger(config.logLevel, { cron: true });
  const services = createServices(env, config);
  const jobs: Array<[string, () => Promise<unknown>]> = [
    ["schedules", () => runDueSchedules(env, services, scheduledTime, log)],
    ["transfers", () => expireTransfers(services, scheduledTime)],
    ["invitations", () => expireInvitations(services, scheduledTime)],
    ["purge", () => purgeArchivedSites(env, services, scheduledTime)],
    // Task 18: start due scheduled campaigns; continue sends when there is no Queue.
    ["campaigns", () => runDueCampaigns(services, scheduledTime, log)],
  ];
  for (const [name, job] of jobs) {
    try {
      const result = await job();
      log.debug("cron job done", { job: name, result });
    } catch (err) {
      log.error("cron job failed", { job: name, err });
    }
  }
}
