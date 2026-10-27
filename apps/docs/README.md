# apps/docs — docs.openspace.dev

The OpenSpace documentation, built with [Astro Starlight](https://starlight.astro.build). Pages live in `src/content/docs/` as Markdown; the sidebar is in `astro.config.mjs`. Content is licensed CC BY 4.0.

| Command | What it does |
|---|---|
| `pnpm --filter @omniharmonic/openspace-docs dev` | Local preview with live reload. |
| `pnpm --filter @omniharmonic/openspace-docs build` | Static build to `dist/` (with Pagefind search). |
| `pnpm --filter @omniharmonic/openspace-docs test` | Checks every required page exists, internal links resolve, and the docs match the code (MCP tool names, templates, Hub secrets, links from the plugin and openspace.dev); runs a real build. |

Both scripts use Astro's programmatic API, so they run on Node 22 versions the `astro` CLI refuses (it needs 22.23.4+).

Write in plain language for site owners first: no "repository", "commit", "branch", "build" or "deploy" in the owner guides unless explaining what's under the hood.
