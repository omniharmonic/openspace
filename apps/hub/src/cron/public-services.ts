/**
 * Task 16 scheduled work. `index.ts` dispatches by cron string; this module owns:
 * - DAILY  ("0 3 * * *"): retention purge, salt rotation, daily form-entry digests.
 * - WEEKLY ("0 8 * * 1"): weekly analytics digest for owners who opted in.
 */

import type { HubBindings } from "../env";
import { readConfig } from "../env";
import { createLogger } from "../lib/log";
import { createServices, type ServiceOverrides } from "../services";
import { runRetentionPurge } from "../services/data";
import { sendWeeklyDigests } from "../services/insights";
import { errorKind, sendDailyDigests } from "../services/notifications";

export const PUBLIC_DAILY_CRON = "0 3 * * *";
export const PUBLIC_WEEKLY_CRON = "0 8 * * 1";
export const PUBLIC_CRONS = [PUBLIC_DAILY_CRON, PUBLIC_WEEKLY_CRON];

export async function runPublicServicesCron(
  cron: string,
  env: HubBindings,
  overrides: ServiceOverrides = {},
): Promise<Record<string, unknown>> {
  const config = readConfig(env);
  const log = createLogger(config.logLevel, { cron });
  const services = createServices(env, config, overrides);
  const out: Record<string, unknown> = {};
  if (cron === PUBLIC_DAILY_CRON) {
    try {
      out.purged = await runRetentionPurge(services);
    } catch (err) {
      out.purgeFailed = errorKind(err);
      log.error("retention purge failed", { err });
    }
    out.formDigests = await sendDailyDigests(services, log);
  } else if (cron === PUBLIC_WEEKLY_CRON) {
    out.weeklyDigests = await sendWeeklyDigests(services, log);
  }
  const failures = [out.formDigests, out.weeklyDigests].reduce(
    (n: number, s) => n + ((s as { failed?: number } | undefined)?.failed ?? 0),
    out.purgeFailed ? 1 : 0,
  );
  (failures ? log.warn : log.info)("public services cron", { ...out, failures });
  return out;
}
