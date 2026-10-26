import { app } from "./app";
import { consumeCampaignBatch, GROWTH_DAILY_CRON, runGrowthCron } from "./cron/growth";
import { PUBLIC_CRONS, runPublicServicesCron } from "./cron/public-services";
import type { HubBindings } from "./env";
import type { CampaignJob } from "./growth-env";
import { runScheduled } from "./scheduled";

export { RateLimiter } from "./durable/rate-limiter";
export { DraftRoom } from "./room/draft-room";

export default {
  fetch: app.fetch,
  /** Cron triggers are dispatched by schedule string; each task keeps its work in its own module. */
  async scheduled(controller, env, ctx) {
    if (PUBLIC_CRONS.includes(controller.cron))
      ctx.waitUntil(runPublicServicesCron(controller.cron, env));
    else if (controller.cron === GROWTH_DAILY_CRON)
      ctx.waitUntil(runGrowthCron(controller.cron, env));
    else ctx.waitUntil(runScheduled(env, controller.scheduledTime));
  },
  /** Task 18: campaign fan-out (only when the CAMPAIGN_QUEUE binding exists). */
  async queue(batch, env) {
    await consumeCampaignBatch(batch as MessageBatch<CampaignJob>, env);
  },
} satisfies ExportedHandler<HubBindings>;
