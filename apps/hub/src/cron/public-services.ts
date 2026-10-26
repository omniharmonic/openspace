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
import { sendDailyDigests } from "../services/notifications";

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
    out.purged = await runRetentionPurge(services);
    out.formDigests = await sendDailyDigests(services);
  } else if (cron === PUBLIC_WEEKLY_CRON) {
    out.weeklyDigests = await sendWeeklyDigests(services);
  }
  log.info("public services cron", out);
  return out;
}
