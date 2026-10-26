import { app } from "./app";
import { PUBLIC_CRONS, runPublicServicesCron } from "./cron/public-services";
import type { HubBindings } from "./env";
import { runScheduled } from "./scheduled";

export { RateLimiter } from "./durable/rate-limiter";
export { DraftRoom } from "./room/draft-room";

export default {
  fetch: app.fetch,
  /** Cron triggers are dispatched by schedule string; each task keeps its work in its own module. */
  async scheduled(controller, env, ctx) {
    if (PUBLIC_CRONS.includes(controller.cron))
      ctx.waitUntil(runPublicServicesCron(controller.cron, env));
    else ctx.waitUntil(runScheduled(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<HubBindings>;
