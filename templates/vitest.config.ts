import { defineConfig } from "vitest/config";

// `templates/` also holds the starter package (its own tests); this package tests only the registry.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], testTimeout: 60_000 },
});
