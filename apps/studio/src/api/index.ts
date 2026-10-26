export { DEFAULT_HUB_URL, createHttpHub, githubStartUrl } from "./http";
export { createMockHub, type MockHub, type MockHubOptions } from "./mock";
export { HubProvider, useHub } from "./context";
export * from "./queries";
export * from "./types";

import { createHttpHub, DEFAULT_HUB_URL } from "./http";
import { createMockHub } from "./mock";
import type { HubApi } from "./types";

/** Picks the Hub client from Vite env: `VITE_MOCK_API=1` → in-memory mock, else HTTP to `VITE_HUB_URL`. */
export function hubFromEnv(env: ImportMetaEnv = import.meta.env): HubApi {
  if (env.VITE_MOCK_API === "1" || env.VITE_MOCK_API === "true") {
    return createMockHub({ sites: "demo", persistKey: "openspace.mockHub", latencyMs: 250 });
  }
  return createHttpHub({ baseUrl: env.VITE_HUB_URL || DEFAULT_HUB_URL });
}
