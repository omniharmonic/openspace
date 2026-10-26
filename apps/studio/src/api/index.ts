export * from "./catalog-queries";
export * from "./catalog-types";
export { HubProvider, useHub } from "./context";
export * from "./growth-queries";
export * from "./growth-types";
export { createHttpHub, DEFAULT_HUB_URL, githubStartUrl } from "./http";
export * from "./manage-queries";
export * from "./manage-types";
export * from "./queries";
export * from "./types";

import { createHttpHub, DEFAULT_HUB_URL } from "./http";
import type { HubApi } from "./types";

/**
 * Picks the Hub client from Vite env: `VITE_MOCK_API=1` → in-memory mock
 * (loaded on demand so it never ships in the default bundle), else HTTP to `VITE_HUB_URL`.
 */
export async function hubFromEnv(env: ImportMetaEnv = import.meta.env): Promise<HubApi> {
  // Read the flag straight off `import.meta.env` so production builds drop the mock (and its
  // demo content) entirely: Vite inlines the value and the dead branch is removed.
  if (import.meta.env.VITE_MOCK_API === "1" || import.meta.env.VITE_MOCK_API === "true") {
    const [{ createMockHub }, { registryTemplates }] = await Promise.all([
      import("./mock"),
      import("./catalog-mock"),
    ]);
    return createMockHub({
      sites: "demo",
      // The real launch templates (12, three looks each), as the Hub serves them.
      templates: await registryTemplates(),
      persistKey: "openspace.mockHub",
      latencyMs: 250,
      roomLatencyMs: 40,
      publishStepMs: 1500,
      agentPresenceMs: 5000,
    });
  }
  return createHttpHub({ baseUrl: env.VITE_HUB_URL || DEFAULT_HUB_URL });
}
