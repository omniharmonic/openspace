// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions in workflow files
/**
 * The starter shell's hosting-specific files (templates/starter: `site/` for GitHub Pages,
 * `variants/cloudflare/` for Cloudflare), embedded so the Hub can switch a site's hosting without
 * a filesystem. Generated from templates/starter; test/hosting.test.ts checks they still match.
 */
export const STARTER_HOSTING_FILES = {
  "github-pages": {
    ".github/workflows/publish.yml":
      "# .github/workflows/publish.yml (generated; managed by site-kit updates)\nname: Publish\non:\n  push: { branches: [main] }\n  workflow_dispatch:\npermissions: { contents: read, pages: write, id-token: write }\nconcurrency: { group: publish, cancel-in-progress: true }\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v7\n      - uses: actions/setup-node@v7\n        # package.json keys the npm cache: Hub-created sites have no lockfile at first.\n        with: { node-version: 22, cache: npm, cache-dependency-path: package.json }\n      - uses: actions/cache@v6\n        with:\n          path: node_modules/.astro\n          key: os-assets-${{ hashFiles('media/**') }}\n          restore-keys: os-assets-\n      # Sites created by the Hub start without a lockfile.\n      - run: if [ -f package-lock.json ]; then npm ci; else npm install; fi\n      - run: npx openspace check --ci # schema, links, budgets, secret scan\n      - run: npm run build # astro build (+ pagefind, og images)\n        env:\n          OPENSPACE_TURNSTILE_SITE_KEY: ${{ vars.OPENSPACE_TURNSTILE_SITE_KEY }}\n      - uses: actions/upload-pages-artifact@v5\n        with: { path: dist }\n  deploy:\n    needs: build\n    runs-on: ubuntu-latest\n    environment: { name: github-pages, url: \"${{ steps.d.outputs.page_url }}\" }\n    steps:\n      - id: d\n        uses: actions/deploy-pages@v5\n",
    "astro.config.mjs":
      '// OpenSpace site shell. Site, base path, routes, images, feeds and publishing all come from\n// openspace.json and content/ via the site-kit integration \u2014 there is nothing to configure here.\nimport openspace from "@openspace/site-kit";\nimport { defineConfig } from "astro/config";\n\nexport default defineConfig({\n  integrations: [openspace()],\n});\n',
  },
  cloudflare: {
    ".github/workflows/publish.yml":
      "# .github/workflows/publish.yml (generated; managed by site-kit updates) \u2014 Cloudflare target.\n# Prerendered pages deploy as static assets of a Worker in the owner's Cloudflare account; the\n# Worker serves members pages, sign-in and password pages. The R2 bucket and D1 database are\n# provisioned automatically on the first deploy.\nname: Publish\non:\n  push: { branches: [main] }\n  workflow_dispatch:\npermissions: { contents: read }\nconcurrency: { group: publish, cancel-in-progress: true }\njobs:\n  publish:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v7\n      - uses: actions/setup-node@v7\n        # package.json keys the npm cache: Hub-created sites have no lockfile at first.\n        with: { node-version: 22, cache: npm, cache-dependency-path: package.json }\n      - uses: actions/cache@v6\n        with:\n          path: node_modules/.astro\n          key: os-assets-${{ hashFiles('media/**') }}\n          restore-keys: os-assets-\n      # Sites created by the Hub start without a lockfile.\n      - run: if [ -f package-lock.json ]; then npm ci; else npm install; fi\n      - run: npx openspace check --ci # schema, links, budgets, secret scan\n      - run: npm run build # astro build (+ pagefind, og images, Worker)\n        env:\n          OPENSPACE_TURNSTILE_SITE_KEY: ${{ vars.OPENSPACE_TURNSTILE_SITE_KEY }}\n      - run: npx wrangler deploy\n        env:\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}\n",
    "astro.config.mjs":
      '// OpenSpace site shell \u2014 Cloudflare target. Pages are prerendered as static assets; the Worker\n// serves members pages, sign-in and password pages. Everything else comes from openspace.json\n// and content/ via the site-kit integration.\nimport cloudflare from "@astrojs/cloudflare";\nimport openspace, { CLOUDFLARE_ADAPTER_OPTIONS } from "@openspace/site-kit";\nimport { defineConfig } from "astro/config";\n\nexport default defineConfig({\n  adapter: cloudflare(CLOUDFLARE_ADAPTER_OPTIONS),\n  integrations: [openspace()],\n});\n',
    "wrangler.jsonc":
      '{\n  "$schema": "./node_modules/wrangler/config-schema.json",\n  // Renamed to the site\'s repository name when Cloudflare hosting is connected.\n  "name": "openspace-site",\n  "compatibility_date": "2026-10-01",\n  "compatibility_flags": ["nodejs_compat"],\n  // Gated (members / password) page content \u2014 never stored in the public repository.\n  // Provisioned automatically on the first deploy.\n  "r2_buckets": [{ "binding": "OS_GATED" }],\n  // Stock and orders for the store (Phase 5).\n  "d1_databases": [{ "binding": "OS_DB" }],\n  "observability": { "enabled": true }\n}\n',
  },
} as const;

/** package.json entries the Cloudflare variant adds to the shell's (merged, never overwritten). */
export const CLOUDFLARE_PACKAGE_ADDITIONS: Record<string, Record<string, string>> = {
  dependencies: {
    "@astrojs/cloudflare": "^14.4.2",
  },
  devDependencies: {
    wrangler: "^4.152.0",
  },
};
