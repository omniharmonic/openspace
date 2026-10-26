import type { User } from "./db/users";
import type { HubBindings, HubConfig } from "./env";
import type { Logger } from "./lib/log";
import type { Services } from "./services";

/** Hono environment shared by every route module. */
export interface AppEnv {
  Bindings: HubBindings;
  Variables: {
    requestId: string;
    log: Logger;
    config: HubConfig;
    services: Services;
    user: User | null;
  };
}
