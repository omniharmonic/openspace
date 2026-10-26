import { app } from "./app";
import type { HubBindings } from "./env";
import { runScheduled } from "./scheduled";

export { DraftRoom } from "./room/draft-room";

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduled(env, controller.scheduledTime));
  },
} satisfies ExportedHandler<HubBindings>;
