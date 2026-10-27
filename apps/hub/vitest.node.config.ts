import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Node-side runs of Hub code (not `pnpm test`, which runs in workerd): the CPU benchmark of the
 * hot read paths (`pnpm bench`) and the template catalog generator (`pnpm embed:catalog`).
 */
export default defineConfig({
  resolve: {
    alias: { "cloudflare:workers": path.join(__dirname, "bench/cloudflare-workers-stub.ts") },
  },
  test: {
    include: ["bench/**/*.bench-test.ts", "scripts/**/*.gen-test.ts"],
    testTimeout: 120_000,
    server: { deps: { inline: [/workers-oauth-provider/] } },
  },
});
