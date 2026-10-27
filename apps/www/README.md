# apps/www — openspace.host

The OpenSpace marketing site and template gallery, **built with OpenSpace itself**. It is an ordinary OpenSpace site: `openspace.json`, `content/` (pages, site settings, Site Styles, media library) and `media/`, rendered by `@omniharmonic/openspace-site-kit` through the same thin Astro shell every site gets (`astro.config.mjs`, `src/pages/[...slug].astro`).

## How it's made

Everything on the page is a block or a section preset from `@omniharmonic/openspace-blocks`, written in TypeScript with the templates' authoring kit (`src/site/www.ts`), so every block is validated as it's built. Where the page needs more than blocks can say, it uses the same escape hatches any site owner has:

| Escape hatch                                                        | Where                   | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code blocks** (sandboxed `srcdoc` iframes, no same-origin access) | `src/site/demos/*.html` | The three interactive demos (the Studio look switcher in the hero, the JSON ↔ page split view, the Claude session) and the savings calculator on the home and Support pages. Each is self-contained HTML, CSS and a little vanilla JS, honours `prefers-reduced-motion`, and runs in Studio's canvas too. The calculator is rendered complete for its first plan, so it reads without JavaScript, and every donation link is also listed as plain text beside it. |
| **Custom CSS** (Site settings → Advanced)                           | `src/site/custom.css`   | Art direction the Site Styles can't express: the hero's grid lines, display type sizes, the demos' frames and heights, the cost chart's emphasis. Sections are targeted by their anchors (`#hero`, `#cost`, …).                                                                                                                                                                                                                                                   |

No head or footer code injection is used, and the published page ships no scripts of its own beyond site-kit's small behaviors.

## Donations

Every donation link lives in **one constant, `DONATE` in `src/site/www.ts`**: Stripe Payment Links keyed by amount, `oneTime` (10, 25, 50, 100, 250 and `custom`) and `monthly` (3, 5, 10, 20). The home page's Support section, the `/support/` page and the savings calculator all read from it, so replacing the `https://donate.stripe.com/REPLACE_ME_…` placeholders there and running `generate` updates the whole site. The calculator suggests the tier nearest a tenth of what leaving a builder saves (`suggestGift`), from the same dated `PRICES` as the cost chart.

Facts on the page come from the repo: performance numbers from `docs/qa/lighthouse.md`, feature status from `docs/PARITY.md`. The cost comparison uses each builder's published annual prices, read on 27 October 2026 (`PRICES` in `www.ts`, sources in the page's footnote); re-check them before changing the date.

## Media

- `media/showcase/<id>.jpg`: the first screen (1280 × 800) of each template's demo home page in its first look, rendered from `tools/visual-tests` builds (`node tools/visual-tests/scripts/build-templates.mjs`, then a Playwright screenshot of each `/`).
- `media/templates/<id>-looks.png`: each template's home page in its three looks, side by side (from the templates' visual QA pass), used on `/templates/`.
- `media/brand/og.png` (1200 × 630 share image) and `media/brand/favicon.svg`.

Template designs and this site's content are CC BY 4.0; the template renders include the templates' Unsplash demo photos, credited in each template's `media/LICENSES.json`.

## Commands

| Command                                              | What it does                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @omniharmonic/openspace-www generate` | Rewrite `openspace.json`, `content/**` and `media/LICENSES.json` from `src/site/` (`UPDATE_WWW=1`). Run it after editing `www.ts`, `custom.css` or a demo.                                  |
| `pnpm --filter @omniharmonic/openspace-www build`    | Static build to `apps/www/dist/` (Astro's programmatic API, so it works on any Node 22). From the repo root: `node apps/www/scripts/build.mjs apps/www apps/www/dist`.                      |
| `pnpm --filter @omniharmonic/openspace-www dev`      | Local preview with live reload.                                                                                                                                                             |
| `pnpm --filter @omniharmonic/openspace-www test`     | Content checks (schema, Design check, SEO, `openspace check`, the cost figures and sources, all 12 templates listed), a check that the committed files match `src/site/`, and a real build. |

You can also open the folder in Studio or point Claude at it with `npx @omniharmonic/openspace-cli mcp apps/www`; regenerate from `www.ts` afterwards, or move the change into `www.ts`, since `generate` overwrites `content/`.

## Deploying

`apps/www/dist` is a plain static folder: `index.html` per page, `404.html`, `sitemap.xml`, `robots.txt`, hashed assets under `_astro/` and `_os/` (safe to cache for a year). For production builds set `OPENSPACE_GOOGLE_FONTS=download` so the fonts are self-hosted.

It goes on Cloudflare at `https://openspace.host` (canonical URLs, sitemap and share images already use that origin), for example as a Workers static-assets project or a Pages project whose output directory is `apps/www/dist`. Studio lives at `studio.openspace.host` and the Hub at `hub.openspace.host`. Analytics are on, so the Hub must know this site's id (`st_7kj225jvm3` in `openspace.json`) for page views to be recorded.
