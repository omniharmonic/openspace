import { defineConfig } from "vitest/config";

// Own config so vitest does not walk up to templates/vitest.config.ts (registry tests only).
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], testTimeout: 60_000 },
});
