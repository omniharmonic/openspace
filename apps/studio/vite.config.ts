/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { STUDIO_MANIFEST } from "./src/pwa/manifest";

const YEAR = 60 * 60 * 24 * 365;

// Stamped into index.html so every deploy changes the precached shell's revision: a new service
// worker then replaces a stale (e.g. redirected) cached copy instead of keeping it.
process.env.VITE_BUILD_ID ??= new Date().toISOString();

export default defineConfig({
  plugins: [
    react(),
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
