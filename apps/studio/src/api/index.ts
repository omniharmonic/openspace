export { HubProvider, useHub } from "./context";
export { createHttpHub, DEFAULT_HUB_URL, githubStartUrl } from "./http";
export * from "./queries";
export * from "./types";

import { createHttpHub, DEFAULT_HUB_URL } from "./http";
import type { HubApi } from "./types";

/**
 * Picks the Hub client from Vite env: `VITE_MOCK_API=1` → in-memory mock
 * (loaded on demand so it never ships in the default bundle), else HTTP to `VITE_HUB_URL`.
 */
export async function hubFromEnv(env: ImportMetaEnv = import.meta.env): Promise<HubApi> {
  if (env.VITE_MOCK_API === "1" || env.VITE_MOCK_API === "true") {
    const { createMockHub } = await import("./mock");
    return createMockHub({ sites: "demo", persistKey: "openspace.mockHub", latencyMs: 250 });
  }
  return createHttpHub({ baseUrl: env.VITE_HUB_URL || DEFAULT_HUB_URL });
}
