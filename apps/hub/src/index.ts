import { app } from "./app";
import { PUBLIC_CRONS, runPublicServicesCron } from "./cron/public-services";
import type { HubBindings } from "./env";

export { RateLimiter } from "./durable/rate-limiter";

export default {
  fetch: app.fetch,
  /** Cron triggers are dispatched by schedule string; each task keeps its work in its own module. */
  async scheduled(event, env, ctx) {
    if (PUBLIC_CRONS.includes(event.cron))
      ctx.waitUntil(runPublicServicesCron(event.cron, env as HubBindings));
  },
} satisfies ExportedHandler<Env>;
