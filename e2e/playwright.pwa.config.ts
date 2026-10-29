import { defineConfig, devices } from "@playwright/test";
import { PWA_PORT, PWA_URL } from "./pwa/env";

/**
 * Studio's "new version" update, against real production builds with the service worker on
 * (the main suite runs the dev server, which never installs one). `scripts/pwa-build.mjs` builds
 * Studio twice (two build ids) and `scripts/pwa-server.mjs` serves one, then "deploys" the other.
 *
 *   pnpm --dir e2e exec playwright test -c playwright.pwa.config.ts
 *
 * `E2E_PWA_PORT` picks the port (default 24173); `E2E_PWA_REUSE_BUILDS=1` keeps the builds from
 * a previous run.
 */
const phone = { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } };

export default defineConfig({
  testDir: "./pwa",
  outputDir: "./test-results-pwa",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // One server, one "deploy" at a time.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: PWA_URL, trace: "retain-on-failure", serviceWorkers: "allow" },
  projects: [
    { name: "webkit-iphone", use: { ...phone, defaultBrowserType: "webkit" } },
    { name: "chromium-phone", use: { ...phone, defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: `node scripts/pwa-build.mjs && node scripts/pwa-server.mjs ${PWA_PORT} pwa/.builds/a pwa/.builds/b`,
    url: `${PWA_URL}/sw.js`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
