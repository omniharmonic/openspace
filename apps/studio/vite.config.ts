/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
// The Phone check's in-browser probe (a plain-JS string, no imports): Studio runs it inside its
// phone preview. Served as a same-origin script because Studio's CSP allows no eval.
import { PHONE_PROBE_SCRIPT } from "../../packages/lint/src/phone-probe";
import { STUDIO_MANIFEST } from "./src/pwa/manifest";

const YEAR = 60 * 60 * 24 * 365;

// Stamped into index.html so every deploy changes the precached shell's revision: a new service
// worker then replaces a stale (e.g. redirected) cached copy instead of keeping it.
process.env.VITE_BUILD_ID ??= new Date().toISOString();

const PROBE_FILE = "os-phone-probe.js";
const PROBE_JS = `window.__osPhoneProbe = function () { return ${PHONE_PROBE_SCRIPT}; };\n`;

/** `/os-phone-probe.js`: served in dev, emitted at build. */
function phoneProbe(): Plugin {
  return {
    name: "openspace-phone-probe",
    configureServer(server) {
      server.middlewares.use(`/${PROBE_FILE}`, (_req, res) => {
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.end(PROBE_JS);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: PROBE_FILE, source: PROBE_JS });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    phoneProbe(),
    // Installable Studio that opens offline (PRD §5.1): the app shell is precached; fonts,
    // template data and photos are cached as they are used. Drafts live in IndexedDB.
    VitePWA({
      registerType: "prompt",
      // Studio registers the worker itself (src/pwa/register.ts), never in dev or tests.
      injectRegister: false,
      manifest: STUDIO_MANIFEST,
      includeAssets: ["icons/apple-touch-icon.png", "icons/favicon-32.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        // The editor and the template library are large chunks; they must be in the shell.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/mcp/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "os-font-css", expiration: { maxEntries: 60 } },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "os-fonts",
              expiration: { maxEntries: 120, maxAgeSeconds: YEAR },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Template gallery data and documents: fast from cache, refreshed in the background.
            urlPattern: ({ url }) => url.pathname.startsWith("/api/templates"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "os-templates", expiration: { maxEntries: 40 } },
          },
          {
            urlPattern: ({ url }) =>
              url.origin === "https://images.unsplash.com" ||
              url.origin === "https://raw.githubusercontent.com",
            handler: "CacheFirst",
            options: {
              cacheName: "os-images",
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173 },
  preview: { port: 4173 },
  // main.tsx awaits the Hub client (the mock loads on demand).
  build: { target: "es2022" },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    restoreMocks: true,
    testTimeout: 30_000,
  },
});
