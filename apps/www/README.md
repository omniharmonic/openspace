# apps/www — openspace.dev

The OpenSpace marketing site and template gallery, **built with OpenSpace itself**. It is an ordinary OpenSpace site: `openspace.json`, `content/` (pages, site settings, Site Styles, media library) and `media/`, rendered by `@openspace/site-kit` through the same thin Astro shell every site gets (`astro.config.mjs`, `src/pages/[...slug].astro`).

The content is authored in TypeScript (`src/site/www.ts`) from section presets with the templates' authoring kit, so every block is validated as it's built, and the gallery reads the twelve launch templates' own metadata. You can also open the folder in Studio or point Claude at it with `npx openspace mcp apps/www`.

| Command                                 | What it does                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm --filter @openspace/www generate` | Rewrite `openspace.json`, `content/**` and `media/LICENSES.json` from `src/site/www.ts`. |
| `pnpm --filter @openspace/www build`    | Static build to `dist/` (Astro's programmatic API, so it works on any Node 22).          |
| `pnpm --filter @openspace/www dev`      | Local preview with live reload.                                                          |
| `pnpm --filter @openspace/www test`     | Content checks (schema, Design check, SEO, all 12 templates listed) and a real build.    |

`media/templates/*.png` are screenshots of each template's home page in its three looks (from the templates' visual QA pass). Template designs and this site's content are CC BY 4.0.

Deploys like any OpenSpace site on GitHub Pages with the custom domain `openspace.dev`.
