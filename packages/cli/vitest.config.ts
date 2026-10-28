import { defineConfig } from "vitest/config";

// These tests run the whole importer and `openspace check` in-process, real `openspace`
// processes and (when installed) Chromium. Under `turbo run test --concurrency=8` they take
// 1.5–3.5 s, so vitest's 5 s default left no headroom on a loaded machine (the only failures
// seen were "Test timed out in 5000ms" while other suites ran). There's no race behind it: the
// same ceiling the Studio suite uses (30 s) applies here; slow-but-correct passes, a hang fails.
export default defineConfig({
  test: { testTimeout: 30_000, hookTimeout: 60_000 },
});
