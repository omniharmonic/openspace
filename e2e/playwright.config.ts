import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { HUB_PORT, HUB_URL, STUDIO_PORT, STUDIO_URL } from "./support/env";

/**
 * End-to-end suite: the REAL Hub (`wrangler dev`, DEV_MODE, fresh local D1/DO/R2 per run) and the
 * REAL Studio (Vite, `VITE_HUB_URL` → that Hub, no mock API), started by Playwright's `webServer`.
 *
 * Projects:
 *  - `desktop`  — Chromium at 1440×900: every flow spec.
 *  - `mobile`   — Chromium with iPhone-class emulation at 390 px: the gallery + mobile editing specs.
 *  - `webkit-mobile` — the same mobile specs on WebKit, when its browser is installed.
 *
 * `E2E_REUSE=1` reuses already-running servers (fast local iteration; state then persists).
 */
const require = createRequire(import.meta.url);
const reuse = process.env.E2E_REUSE === "1";
const MOBILE_SPECS = /(gallery|mobile)\.spec\.ts$/;

/** WebKit present? Honors PLAYWRIGHT_BROWSERS_PATH (incl. "0" = inside node_modules). */
function webkitInstalled(): boolean {
  const env = process.env.PLAYWRIGHT_BROWSERS_PATH;
  const dirs =
    env === "0"
      ? [join(dirname(require.resolve("playwright-core/package.json")), ".local-browsers")]
      : env
        ? [env]
        : [
            join(homedir(), "Library/Caches/ms-playwright"),
            join(homedir(), ".cache/ms-playwright"),
          ];
  const found = dirs.some(
    (d) => existsSync(d) && readdirSync(d).some((n) => n.startsWith("webkit-")),
  );
  if (!found)
    console.log(
      `[e2e] WebKit not installed (looked in ${dirs.join(", ")}): skipping webkit-mobile`,
    );
  return found;
}

const mobileDevice = {
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 844 },
};

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  outputDir: "./test-results",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 3,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: STUDIO_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /mobile\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testMatch: MOBILE_SPECS,
      use: { ...mobileDevice, defaultBrowserType: "chromium" },
    },
    ...(webkitInstalled()
      ? [
          {
            name: "webkit-mobile",
            testMatch: MOBILE_SPECS,
            use: { ...mobileDevice, defaultBrowserType: "webkit" as const },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: "node scripts/start-hub.mjs",
      url: `${HUB_URL}/health`,
      reuseExistingServer: reuse,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
      env: { E2E_HUB_PORT: String(HUB_PORT), E2E_STUDIO_PORT: String(STUDIO_PORT) },
    },
    {
      command: `pnpm --dir ../apps/studio exec vite --port ${STUDIO_PORT} --strictPort`,
      url: STUDIO_URL,
      reuseExistingServer: reuse,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
      env: { VITE_HUB_URL: HUB_URL, VITE_MOCK_API: "" },
    },
  ],
});
