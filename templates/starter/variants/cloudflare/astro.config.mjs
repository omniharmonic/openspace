// OpenSpace site shell — Cloudflare target. Pages are prerendered as static assets; the Worker
// serves members pages, sign-in and password pages. Everything else comes from openspace.json
// and content/ via the site-kit integration.
import cloudflare from "@astrojs/cloudflare";
import openspace, { CLOUDFLARE_ADAPTER_OPTIONS } from "@openspace/site-kit";
import { defineConfig } from "astro/config";

export default defineConfig({
  adapter: cloudflare(CLOUDFLARE_ADAPTER_OPTIONS),
  integrations: [openspace()],
});
