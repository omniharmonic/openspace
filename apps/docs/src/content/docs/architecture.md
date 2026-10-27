---
title: Architecture overview
description: How OpenSpace works — site repositories, Studio, the Hub, deploy targets, operations, the renderer and the MCP server.
---

OpenSpace has four moving parts.

1. **Site repositories** — one per website, in the owner's GitHub account. Content is JSON and Markdoc, design choices are tokens, media are optimized master images, and a thin Astro shell depends on the versioned `@omniharmonic/openspace-site-kit` package. A GitHub Actions workflow builds and publishes it.
2. **Studio** — the visual editor: a static React app that renders the *same* block components the published site uses, inside a canvas frame.
3. **The Hub** — one shared service on Cloudflare Workers (D1, R2, KV, Durable Objects, Queues). It handles GitHub sign-in, coordinates live drafts, hosts the MCP server, and provides what static sites can't: forms, newsletters, analytics, members, checkout webhooks, scheduled publishing and template updates.
4. **Deploy targets** — GitHub Pages (default, for content sites) or the owner's own Cloudflare account (stores, members-only and password pages).

```
 Owner's accounts (free)                         The commons
 ┌──────────────────────────────────┐           ┌──────────────────────────┐
 │ GitHub repo: content + tokens +  │◀─commits──│ Hub (Cloudflare Worker)  │◀──── your AI (MCP)
 │ media → Actions → GitHub Pages   │           │ drafts · MCP · forms ·   │
 │            or → owner's Cloudflare│           │ newsletter · analytics · │
 └──────────────────────────────────┘           │ members · commerce       │
            ▲                                    └──────────────────────────┘
            │ visitors: pages                               ▲
            └──── forms, signups, beacons, checkout ────────┘   Studio (static app) ⇄ Hub
```

## Key decisions

| Decision | Why |
|---|---|
| **Static-first output with Astro** | Free hosting, speed and durability. Published pages ship no React runtime. |
| **Edit structured JSON, never raw HTML** | Humans and agents make precise changes without breaking layouts; migrations stay possible. |
| **One renderer for canvas and production** | `@omniharmonic/openspace-renderer` produces both, so Studio is truly what-you-see-is-what-you-get. |
| **One public repo per site, in the owner's account** | Ownership, portability, free Pages and Actions. |
| **Thin site repo + versioned site-kit** | Improvements reach every site through update pull requests; "eject" stays possible. |
| **Draft branch + per-site draft room; squash on publish** | Live collaborative and agent edits, and a clean published history. |
| **Shared Hub on Cloudflare** | Near-zero marginal cost per site; self-hostable. |
| **Two deploy targets** | GitHub Pages' terms exclude commerce and sensitive transactions. |
| **MCP with typed, validated operations; bring your own AI** | Safe agent edits; the commons never pays for inference. |
| **Design tokens in W3C DTCG; colors in OKLCH** | Interoperable tokens and perceptually even palettes with guaranteed contrast. |
| **Rich text as ProseMirror JSON; posts as Markdoc** | Lossless, validated block text; portable posts without arbitrary JavaScript. |

## The site repository

```
my-site/
├─ openspace.json          # site id, Hub, deploy target, template, schema version
├─ content/
│  ├─ site.json            # title, navigation, header, footer, SEO, integrations
│  ├─ styles.json          # Site Styles choices + DTCG token overrides
│  ├─ media.json           # media library: dimensions, alt text, focal points
│  ├─ pages/*.json         # one file per page (folders mirror URLs)
│  └─ collections/<name>/  # _collection.json + Markdoc items (posts, events, products…)
├─ media/                  # master images ≤ 2400 px, metadata stripped
├─ src/pages/[...slug].astro
├─ astro.config.mjs        # integrations: [openspace()]
├─ AGENTS.md               # how coding agents should edit this site
└─ .github/workflows/publish.yml
```

Every page, section and block has a stable id (`pg_`, `sec_`, `blk_` plus ten base-32 characters), so edits, merges and agent targeting are reliable. Responsive values are `{ d, t, m }` (desktop, tablet, mobile); a missing breakpoint inherits from the larger one. No secrets ever go in content — `openspace check` fails if anything looks like a key.

## Operations and the draft room

Every edit — from Studio, the MCP server or the CLI — is an **operation** from a small typed vocabulary (`block.update`, `section.insert`, `grid.place`, `styles.patch`, `page.create`, `nav.update`, `media.add`, `collection.upsert`, …). Operations are validated against the schema before they're accepted, are invertible (for undo), and merge cleanly because they target stable ids.

Each site has a **draft room** (a Durable Object) holding the ordered log of draft operations while anyone is editing. Studio connects over a WebSocket and applies changes optimistically; the room validates, enforces roles and section locks, orders and broadcasts them, and flushes commits to the `os/draft` branch after a few seconds of quiet. **Publishing** squashes the draft into one commit on `main` with a human-readable summary; the push triggers the publish workflow. **Rollback** is a new commit with an old tree — history is never rewritten. Snapshots are tags (`os/snap/…`).

## Rendering without shipping React

Blocks are React components used only for server-side rendering at build time and for the Studio canvas. Interactivity comes from **behaviors** — tiny vanilla modules attached with `data-os-behavior` (carousel, lightbox, accordion, tabs, menu, form, newsletter, cart, reveal…), each under 3 KB gzipped (the cart under 12 KB), and only the behaviors a page uses are shipped. Content pages stay under 30 KB of JavaScript.

`site-kit` resolves images through Astro's image pipeline (AVIF, WebP and a fallback at several widths, with stored dimensions and blurred placeholders), compiles tokens to CSS, and generates the sitemap, robots.txt, RSS/Atom, iCal and podcast feeds, structured data, redirects, social share images, the forms manifest and the product catalog used to verify prices at checkout. Pagefind adds static search when it's on.

## The MCP server

Tools are defined once in `@omniharmonic/openspace-mcp-tools` and served two ways:

- **Remote** — the Hub's `/mcp` endpoint (Streamable HTTP). The Hub is an OAuth 2.1 authorization server for MCP clients (dynamic registration, PKCE) and an OAuth client of GitHub; consent grants are per site, with publishing off by default. Personal-token links (`/mcp/t/…`) cover one site without OAuth.
- **Local** — `openspace mcp` over stdio against a folder, with a local preview server and Playwright screenshots.

Every tool call becomes validated operations in the same path as human edits; destructive tools need `confirm: true`; a snapshot is taken at the start of each agent session; rate limits apply per connection. See the [tools reference](/connect-your-ai/tools/).

## Packages

| Package | Role | License |
|---|---|---|
| `@omniharmonic/openspace-schema` | Zod schemas, types, JSON Schema, migrations | MIT |
| `@omniharmonic/openspace-ops` | Operations: apply, invert, validate, rebase, summarize, diff | MIT |
| `@omniharmonic/openspace-theme` | Token compiler, OKLCH palettes, contrast solver, font pairings | MIT |
| `@omniharmonic/openspace-blocks` | The block library and section presets | MIT |
| `@omniharmonic/openspace-renderer` | Page, section and grid renderer, behaviors | MIT |
| `@omniharmonic/openspace-site-kit` | The Astro integration | MIT |
| `@omniharmonic/openspace-email-render` | Blocks → email-safe HTML | MIT |
| `@omniharmonic/openspace-mcp-tools` | MCP tools, resources and prompts shared by Hub and CLI | MIT |
| `@omniharmonic/openspace-lint` | Design check, SEO check, automatic mobile layout | MIT |
| `@omniharmonic/openspace-cli` | `check`, `dev`, `new`, `migrate`, `eject`, `agents-md`, `mcp` | MIT |
| `apps/studio`, `apps/hub` | The editor and the Hub | AGPL-3.0 |

Documentation and template designs are CC BY 4.0.
