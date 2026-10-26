/**
 * Task 18 scheduled work and the campaign Queue consumer. `index.ts` dispatches by cron string:
 * - every minute (Task 15's `runScheduled` calls `runDueCampaigns`): due scheduled campaigns,
 *   continuing unfinished sends when there is no Queue.
 * - GROWTH_DAILY_CRON ("0 4 * * *"): update-bot checks, order follow-up / sold-out refund
 *   retries, budget alerts (PRD §7.6) and growth housekeeping.
 */
import type { HubBindings } from "../env";
import { readConfig } from "../env";
import type { CampaignJob } from "../growth-env";
import { createLogger } from "../lib/log";
import { createServices, type ServiceOverrides, type Services } from "../services";
import { checkBudget } from "../services/budget";
import { BATCH_SIZE, runCampaign } from "../services/campaigns";
import { retryOrderFollowups } from "../services/orders";
import { runUpdateChecks } from "../services/updates";

export const GROWTH_DAILY_CRON = "0 4 * * *";

const DAY = 86_400_000;

/** Expired sign-in links, abandoned checkout attempts, old webhook ids and DevStripe objects. */
export async function growthHousekeeping(services: Services): Promise<Record<string, number>> {
  const now = services.now();
  const n = async (sql: string, ...args: unknown[]) =>
    (
      await services.db
        .prepare(sql)
        .bind(...args)
        .run()
    ).meta.changes ?? 0;
  return {
    memberLinks: await n("DELETE FROM member_links WHERE expires_at < ?", now - DAY),
    // Checkout sessions expire after an hour; the order rows are only attempts.
    abandonedOrders: await n(
      "UPDATE orders SET status = 'expired', updated_at = ? WHERE status = 'pending' AND created_at < ?",
      now,
      now - 2 * DAY,
    ),
    stripeEvents: await n("DELETE FROM stripe_events WHERE received_at < ?", now - 90 * DAY),
    devStripe: await n("DELETE FROM dev_stripe_objects WHERE created_at < ?", now - 30 * DAY),
  };
}

export async function runGrowthCron(
  cron: string,
  env: HubBindings,
  overrides: ServiceOverrides = {},
): Promise<Record<string, unknown>> {
  const config = readConfig(env);
  const log = createLogger(config.logLevel, { cron });
  const services = createServices(env, config, overrides);
  const out: Record<string, unknown> = {};
  if (cron === GROWTH_DAILY_CRON) {
    try {
      out.updates = await runUpdateChecks(services, log);
    } catch (err) {
      out.updatesFailed = true;
      log.error("update checks failed", { err });
    }
    try {
      // Paid orders whose follow-ups failed, and sold-out orders whose automatic refund failed.
      out.orders = await retryOrderFollowups(services, log);
    } catch (err) {
      out.ordersFailed = true;
      log.error("order retries failed", { err });
    }
    try {
      // PRD §7.6: alert the operator at 80% of the plan allowances.
      out.budgetAlerts = (await checkBudget(services, log)).map((l) => l.resource);
    } catch (err) {
      out.budgetFailed = true;
      log.error("budget check failed", { err });
    }
    try {
      out.housekeeping = await growthHousekeeping(services);
    } catch (err) {
      out.housekeepingFailed = true;
      log.error("growth housekeeping failed", { err });
    }
  }
  log.info("growth cron", out);
  return out;
}

/** Queue consumer: one message = one batch of a campaign; re-enqueued until it is done. */
export async function consumeCampaignBatch(
  batch: MessageBatch<CampaignJob>,
  env: HubBindings,
  overrides: ServiceOverrides = {},
): Promise<void> {
  const config = readConfig(env);
  const log = createLogger(config.logLevel, { queue: batch.queue });
  const services = createServices(env, config, overrides);
  for (const msg of batch.messages) {
    const job = msg.body;
    if (job?.kind !== "campaign-batch") {
      msg.ack();
      continue;
    }
    try {
      const r = await runCampaign(services, job.siteId, job.campaignId, BATCH_SIZE, log);
      if (!r.done && r.sent + r.failed > 0) await services.growth.queue?.send(job);
      msg.ack();
    } catch (err) {
      log.warn("campaign batch failed", { err, campaign: job.campaignId });
      msg.retry();
    }
  }
}
