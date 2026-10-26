# OpenSpace — Build Plan (agent-executable)

Spec: `docs/product/01-PRD.md` (binding), `docs/product/02-ARCHITECTURE.md`, `docs/product/03-IMPLEMENTATION-PLAN.md`, `docs/product/04-TEMPLATES-AND-DESIGN-SYSTEM.md`.
The product docs use the working name "Commonplace". This repo ships it as **OpenSpace**.

## Global Constraints

These bind every task.

1. **Naming.** Product name "OpenSpace". npm scope `@openspace/*`. Site config file `openspace.json` (replaces `commonplace.json`). CLI binary `openspace`. CSS custom property prefix `--os-`, class prefix `os-`, data attributes `data-os-*` (replaces `--cp-`, `cp-`, `data-cp-*`). Draft branch `os/draft`, snapshot tags `os/snap/<name>`. Everything else follows the architecture doc literally.
2. **Monorepo.** pnpm workspaces + Turborepo, TypeScript strict (`"strict": true`, `noUncheckedIndexedAccess: true`), ESM only, Node 22, Biome for lint/format, Vitest for unit tests, Playwright for e2e. Layout per architecture §14: `apps/{studio,hub,www,docs}`, `packages/{schema,ops,theme,blocks,renderer,site-kit,email-render,mcp-tools,cli,lint}`, `templates/{starter,<template-id>}`, `plugin/` (Claude Code plugin), `tools/{visual-tests,fixtures}`, `e2e/`.
3. **Licenses.** packages/* and templates/* MIT; apps/studio and apps/hub AGPL-3.0-only; docs + template designs CC-BY-4.0. Each package.json carries its `license`.
4. **One renderer (ADR-3).** The `@openspace/renderer` React components are the only way pages become HTML — used by the Studio canvas, the Hub dev preview, site-kit (Astro build) and email/OG generation. Published pages ship zero React runtime; interactivity only through `data-os-behavior` vanilla modules (≤ 3 KB gz each, cart ≤ 12 KB).
5. **Structured edits only (ADR-2, ADR-9).** All document mutations — Studio, Hub, MCP, CLI — go through `@openspace/ops` operations validated against `@openspace/schema`. No code path writes page JSON any other way.
6. **Stable ids.** `pg_`, `sec_`, `blk_`, `med_`, `frm_`, `st_` prefixes + 10-char lowercase base32 (Crockford alphabet). Ids are preserved by every edit.
7. **Responsive values** `{ d, t?, m? }`; missing breakpoints inherit `m ← t ← d`. Breakpoints: mobile < 768, tablet 768–1199, desktop ≥ 1200. Device previews 1440 / 834 / 390.
8. **Runs with no external accounts.** Every external dependency (GitHub, Cloudflare account, Stripe, email providers, Turnstile) sits behind an interface with (a) a real implementation that works when credentials are configured and (b) a dev/test implementation that is selected when `DEV_MODE=true` or credentials are absent. The whole product — onboarding, editing, publishing, forms, newsletter, MCP, members, checkout — must be demonstrable locally with `pnpm dev` and testable with Playwright without any secrets.
9. **No word "repository / commit / branch / build / deploy" in non-Advanced Studio UI copy** (PRD §4.1).
10. **Accessibility.** Templates/blocks: WCAG 2.2 AA; the theme contrast solver must guarantee ≥ 4.5:1 body text and ≥ 3:1 large text/UI in all five section themes. Studio: keyboard-navigable, labelled controls.
11. **Performance.** Published content pages: total JS < 30 KB gz; no layout shift from images (width/height always emitted).
12. **Security.** No secrets ever in site content (`openspace check` fails on them). Code/embed blocks render inside sandboxed iframes in the Studio canvas (no `allow-same-origin`). Webhook signatures verified. Prices never trusted from the browser. Form builder forbids password/card-number field types.
13. **Commits.** Small, frequent, conventional-commit subjects (`feat(schema): …`). Every commit ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `node_modules`, build output or secrets. `pnpm -w typecheck && pnpm -w test` must pass before each task's final commit.
14. **Design quality bar.** Studio UI aims for Figma-grade polish (dense, precise, calm neutral chrome, 13px UI type, crisp 1px borders, keyboard-first) and published templates aim for Squarespace-grade polish (doc 04 §8). No lorem ipsum anywhere.

---

### Task 1: Monorepo foundation

Create the workspace skeleton so every later task has a place to land.

- Root: `package.json` (private, `packageManager: pnpm@10`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `templates/*`, `tools/*`, `e2e`, `plugin`), `turbo.json` (tasks: build, dev, test, typecheck, lint with sensible `dependsOn`/outputs), `tsconfig.base.json` (strict, ESM, `moduleResolution: bundler`, `jsx: react-jsx`), `biome.json`, root scripts `build`, `dev`, `test`, `typecheck`, `lint`, `format`, `e2e`.
- Create empty-but-buildable package shells for every package listed in Global Constraint 2 with `package.json` (name, version 0.1.0, license, `type: module`, `exports` pointing to `src/index.ts` for workspace use — packages are consumed as TS source inside the monorepo via `exports` + a `build` script using `tsup` producing `dist/` for publishing), `tsconfig.json`, `src/index.ts` exporting a placeholder `export const name = "<pkg>"`, and one Vitest smoke test. Apps get minimal shells too (studio: Vite React app rendering "OpenSpace Studio"; hub: Hono worker returning `{ok:true}` on `/health` with `wrangler.jsonc`; www/docs: placeholder README only).
- `LICENSE` (MIT at root covering packages/templates), `LICENSE-AGPL` text referenced by studio/hub, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, root `README.md` (what OpenSpace is, quickstart `pnpm i && pnpm dev`, architecture map, link to docs/product).
- `.github/workflows/ci.yml`: install, lint, typecheck, test, build.
- Acceptance: `pnpm install`, `pnpm -w typecheck`, `pnpm -w test`, `pnpm -w build` all succeed from a clean checkout.

### Task 2: `@openspace/schema` — content model

Implements architecture §2.2, §3 and the block-definition API of §4.1 (the type side; rendering lives in renderer/blocks).

- `ids.ts`: `newId(prefix)`, `isId`, Crockford base32 10-char.
- `responsive.ts`: `Responsive<T>`, `resolve(value, bp)` with inheritance, zod helper `responsive(schema)`.
- Zod schemas + inferred TS types for: `SiteConfig` (openspace.json: siteId, schemaVersion, template{id,version}, hub, deploy{target: "github-pages"|"cloudflare", url, customDomain}, features{forms,newsletter,analytics,search}), `Site` (site.json: title, tagline, logo, favicon, nav tree with pages/folders/external links/buttons + hidden flag, header{variant (8 layouts), sticky, transparentOnHero, mobileMenu}, footer (a Section), announcement bar, social profiles, seo defaults, locale, integrations{analytics, bookingUrl, stripeConnected}, customCss, headInjection, footerInjection, redirects[]), `Styles` (styles.json choices + DTCG overrides per doc 04 §2.1), `Page` (id, title, slug, seo{title, description, image, noindex}, header override, hidden, password/members gating flags, sections[]), `Section` (id, preset?, layout stack|grid exactly per §3.2–3.3 incl. grid items with d/t/m rects + z + bleed, style{colorTheme, padding, minHeight, background{none|color|image(focal, overlay)|gradient|video}, animation}, locked?, hidden?, blocks[]), `Block` (id, type, v, column?, fields, variant?, style?), `RichTextDoc` (ProseMirror JSON subset of §3.5), `CollectionItem` frontmatter for blog/events/portfolio/podcast/products, `MediaMeta`, `FormSchema` (field types per FR-30; forbids password/card types).
- `defineBlock` + `f.*` field builders (`text, richText, image, media, link, select, boolean, number, color, list, reference, form, embed`) producing both a zod schema for the block's fields and serializable field metadata (for Studio inspectors and MCP tool schemas). `BlockDefinition` type includes type, version, category, label, icon name, fields, variants, styleSlots, defaults, ai{purpose, whenToUse, avoid}, migrate. Rendering function type is generic (`render: (props) => unknown`) so schema has no React dependency.
- `richtext.ts`: Markdown ⇄ RichTextDoc converters (lossless within the schema; use `mdast`-free hand parser or `marked` lexer) + `plainText(doc)`.
- `migrations.ts`: registry of site-level migrations keyed by schemaVersion and `migrateSite(content)`.
- `json-schema.ts`: export JSON Schema for every top-level document (`zod-to-json-schema` or zod v4 native `toJSONSchema`).
- `secrets.ts`: `scanForSecrets(text)` detecting API-key-shaped strings (Stripe sk_, GitHub ghp_/gho_, AWS AKIA, generic high-entropy `key=`), used by check + Hub.
- Tests: valid/invalid fixtures for every schema, responsive inheritance, markdown round-trips (headings, lists, links, marks, quotes, hard breaks), secret scanner true/false positives, id format.

### Task 3: `@openspace/ops` — operations

Architecture §5.3. Pure TS over schema types.

- Op union exactly as the architecture lists (block.update/insert/move/delete, grid.place, section.insert/move/delete/update, styles.patch, page.create/update/delete, nav.update, site.update, media.add/remove, collection.upsert/delete) — each carrying `id` (op id), `actor`, `ts`.
- `SiteDocument` aggregate type: `{ config, site, styles, pages: Record<id, Page>, collections: Record<name, Record<slug, CollectionItem>>, media: Record<path, MediaMeta> }`.
- `apply(doc, op) → doc` (immutable, Immer), `invert(doc, op) → op` (computed before apply), `validate(doc, op) → {ok} | {ok:false, errors:[{path,message}]}` (schema-validates the resulting document fragment and referential integrity: target exists, ids unique).
- `applyAll`, `transformForRole(op, role, lockedSections)` → allowed/denied with reason (Owner/Designer all; Editor: no styles.patch, no grid.place, no section layout/style changes, no ops on locked sections except text/image field updates; Contributor: only collection.upsert with status draft).
- Merge: `rebase(localPending, remoteOps)` — ops on distinct ids commute; same-field concurrent edits LWW by (ts, actor); returns conflicts list for "X changed this too" toasts.
- `summarize(ops, doc) → string` human change summary ("Edited Home and About; added 2 images; changed accent color") and `stats` (pages edited, images added…).
- `diff(before, after) → Op[]` (used by CLI/local MCP to turn file edits into ops and by update bot).
- Tests incl. property tests with `fast-check`: apply∘invert = identity; ops on distinct ids commute; validate rejects dangling refs.

### Task 4: `@openspace/theme` — design tokens

Doc 04 §2–§5, architecture ADR-11.

- OKLCH math (oklch ⇄ oklab ⇄ linear sRGB ⇄ sRGB hex, gamut mapping by chroma reduction), WCAG relative luminance + contrast ratio.
- `accentScale(brand)` 11 steps 50–950; `neutralScale(brand, "warm"|"cool"|"pure")`.
- Semantic roles (background, surface, surface-raised, text, text-muted, heading, accent, accent-text, border, focus, link, success, warning, danger) for five section themes: light, light-accent, dark, dark-accent, brand.
- Contrast solver: adjusts lightness only until all text/bg pairs pass (4.5 body, 3 large/UI); `auditContrast(tokens)` returns failing pairs and `nearestAccessible(color, against)`.
- Type pairings registry: ≥ 30 OFL pairings including all 12 template pairings from doc 04 §7 (Fraunces/Hanken Grotesk, Newsreader/Public Sans, Instrument Serif/Instrument Sans, Source Serif 4/IBM Plex Sans, Young Serif/Work Sans, Bricolage Grotesque/Geist, Literata/Manrope, Syne/DM Sans, Gloock/Albert Sans, Spectral/Epilogue, Cormorant Garamond/Jost, Outfit/Outfit) with weights, letter-spacing, fallback stacks, and Google Fonts / Fontsource CSS URL builder.
- Fluid type scale (clamp between 1.2 mobile and 1.333 desktop ratio) for presets display, h1–h4, lead, body, small, eyebrow, button, nav.
- Compilers for density (compact/comfortable/airy; 4px base, 3xs…3xl), shape (sharp/soft/round radius scales), buttons (solid, outline, underline, pill-solid, pill-outline, text-arrow × primary/secondary/tertiary), motion (none/subtle/expressive), image treatments (none, rounded, arch, circle, blob, duotone, grain, frame).
- `compileStyles(styles) → { tokens, css }` where css defines `:root` vars and `.os-theme-<name>` classes; apply DTCG overrides; deterministic output.
- `extractPalette(pixels: Uint8ClampedArray) → brand color candidates` (k-means / median cut in OKLab, chroma-weighted).
- `curatedPalettes` (≥ 16 named).
- Tests: conversions round-trip, every curated palette × 5 themes passes contrast, solver fixes a deliberately failing override, CSS snapshot.

### Task 5: `@openspace/renderer` — page renderer + behaviors

Architecture §3.3, §4.2, §4.3.

- React 19 components: `<PageView>`, `<SectionView>` (stack: 1–4 columns with per-breakpoint ratios + stacking order; grid: exact CSS of §3.3 with inline `--x/--y/--w/--h/--z` + `--tx…` + `--mx…` custom props, bleed via full-start/full-end), `<BlockView>` (looks up registry), `<RichText>`, `<Img>` (reads `ImageResolverContext` map → `<picture>` with srcset/sizes/width/height/placeholder; falls back to raw src; supports focal point via object-position, aspect, treatment classes), `<Link>` resolution (page/collection/url/email/phone/file/anchor) with base path, section color theme wrappers, background (image w/ focal + overlay, gradient, color, video embed, parallax flag), `<Header>` (8 layouts: classic-left, classic-center, split-nav, logo-center-nav-below, minimal-burger, stacked, sidebar-drawer, transparent-overlay; sticky, transparent-on-hero; mobile menu styles slide/fullscreen/dropdown) + nav folders, `<Footer>` (renders a Section), `<AnnouncementBar>`, `<Popup>`.
- Block registry API: `registerBlocks(defs)`, `getBlock(type)`; renderer has no dependency on the block library itself.
- `renderPageHtml({ doc, pageId, mode: "production"|"preview", basePath, imageMap, hubUrl, behaviorsUrl }) → string` producing a complete HTML document: head (title/meta/OG/canonical/JSON-LD hook/fonts/token css/base css/custom css/head injection), body, behavior script tags only for behaviors present on the page.
- Base stylesheet `os.css` (reset, layout, grid, typography presets, buttons, forms, treatments, motion reveal classes honoring `prefers-reduced-motion`, container queries for blocks). Exported as a string and as a file.
- Behaviors (vanilla TS, each its own entry, built with esbuild into `dist/behaviors/*.js`, size-budget test): carousel (scroll-snap + buttons + keyboard), lightbox, accordion (enhances `<details>`), tabs, marquee, reveal (IntersectionObserver), menu (mobile nav, focus trap), popup (time/scroll/exit-intent triggers + frequency cap in localStorage), announcement (dismiss), form (async submit + inline validation + Hub-down fallback showing owner email + retry queue), newsletter, video-lite, search (lazy Pagefind UI), cart (≤ 12 KB: localStorage cart, drawer, checkout POST), analytics beacon (~1 KB). A tiny loader `os-behaviors.js` auto-inits by `data-os-behavior`.
- Tests: SSR snapshot of stack + grid sections, image map usage, behavior size budget, inheritance of responsive props in output CSS vars.

### Task 6: `@openspace/blocks` — block library A (P1 set)

Implement with `defineBlock` (schema) + render components (renderer primitives), each with fields, variants, styleSlots, defaults (real-feeling copy), `ai` guidance, and an `icon`. Blocks: text, image, button, gallery (grid, carousel, masonry, slideshow, strips), video (YouTube/Vimeo/PeerTube lite + self-hosted file), quote, testimonial, line, spacer, shape (SVG token colors), form (FR-30 field types, Turnstile hook, success message/redirect; posts to `${hub}/f/:siteId/:formId`), newsletter signup (`/n/:siteId/subscribe`), map (OpenStreetMap static tile image + "Open in Maps" link, no key), social links + share buttons, accordion/FAQ (`<details>` + FAQPage JSON-LD), embed/code (sandboxed iframe srcdoc in preview mode), logo strip, card, icon list (inline SVG icon set ~40 icons), columns helper. Export `allBlocks` and `registerAll()`.
- Tests: every block validates its defaults, renders without throwing in all variants, and has non-empty ai guidance.

### Task 7: `@openspace/blocks` — block library B (parity set)

restaurant menu (sections, prices, dietary tags), marquee, pricing table, team grid, stats/numbers, timeline, tabs, before/after (CSS clip + range input behavior), audio / podcast episode, booking embed (Cal.com/Calendly lite load), link list (link-in-bio), summary (posts/events/projects/products with grid/list/carousel/wall layouts and filters — data supplied through a `CollectionsContext`), events list/calendar, chart (static SVG bar/line/pie from a small table), search (Pagefind), product + add-to-cart (cart behavior), donation (one-time/recurring amounts → Hub checkout or external link), member login / gated content notice, social feed (build-time feed data or placeholder), countdown, hours/opening times, contact info/address card, divider with ornament, heading (convenience), quote carousel. Same tests as Task 6. Total library ≥ 40 blocks.

### Task 8: Section presets + `@openspace/lint` (Design check + mobile auto-layout)

- `packages/blocks/src/presets/`: ≥ 90 section presets across the doc 04 §6 categories (header, hero, about, services, features, gallery, testimonials, pricing, FAQ, team, stats, logos, CTA, contact/location/hours, newsletter, blog summary, events, products, footer). Each preset: id `category/name@version`, label, description, recommended copy lengths, image aspects, designed-for color themes, ai guidance, and a `build()` returning a fresh Section with new ids and real-feeling demo copy. Mix stack and grid layouts (≥ 15 grid presets with overlap).
- `@openspace/lint`: `designCheck(doc, pageId?) → Issue[]` implementing doc 04 §9 flags (contrast failures via theme audit, > 2 families, heading order, empty sections, oversized images > 2× display, missing alt text, overlapping text in grid sections, no clear CTA, > 3 consecutive same-theme sections, flipping every section, copy length out of preset range) with severity + fix hints + auto-fix where trivial. `autoMobileLayout(section)` generates `m` placements by visual reading order (top-to-bottom, then left-to-right on desktop rects), stacking full width on 8 columns with heights scaled. `seoCheck(page)`.
- Tests for each rule and for reading-order layout.

### Task 9: Templates (12) with three looks each

`templates/<id>/` for meadow, harbor, atelier, ledger, hearth, signal, field-notes, encore, kiln, commons, vow, link — each a full `SiteDocument` as files in the site-repo layout (`openspace.json`, `content/site.json`, `content/styles.json`, `content/pages/*.json`, `content/collections/**`, `media/LICENSES.json`), plus `template.json` (name, description, persona, mood, 3 looks = styles choices variants, thumbnail page id, tags). Content follows doc 04 §7 (pairings, palettes, signature details, required pages) with a plausible fictional owner and real-feeling copy — never lorem ipsum. Photography: remote Unsplash image URLs (`https://images.unsplash.com/photo-…?w=…`) verified to return HTTP 200, recorded with photographer credit in `media/LICENSES.json` (Unsplash License). `templates/index.ts` exports a typed registry `loadTemplate(id)`. Tests: every template validates, every page passes `designCheck` with no errors, every image URL listed in LICENSES.

### Task 10: `@openspace/site-kit` + starter

Architecture §2, §4.3–§4.4, §7.1.

- Astro integration `openspace()` that: reads `openspace.json` + `content/**` from the project root; derives `site`/`base` from deploy config (project-site base `/repo`, `/` with custom domain); injects routes for every page and collection item (blog post pages, category/tag lists, event pages, project pages, product pages, podcast episode pages) rendering through `renderPageHtml` with an image map from Astro `getImage()` (AVIF+WebP+fallback widths) for local `media/` images; emits token CSS, base CSS, behavior bundles; generates sitemap.xml, robots.txt, RSS + Atom (blog), iCal (events), podcast RSS (Apple/Spotify tags), JSON-LD (Organization/LocalBusiness/Article/Event/Product/FAQ), static HTML redirects (+ `_redirects` for Cloudflare), 404 page, social share images (Satori + resvg, content-hash cached), `/_os/forms.json` manifest, `/_os/catalog.json` product manifest (prices for server-side validation); runs Pagefind when search enabled; Cloudflare target mode using `@astrojs/cloudflare` with a worker entry for members (`/members/*`) + `/_os/auth/callback` + password pages.
- `templates/starter`: thin Astro shell (`astro.config.mjs`, `src/pages/[...slug].astro`, `package.json`, `.github/workflows/publish.yml` exactly per §7.1 with `npx openspace check --ci`, Cloudflare variant workflow, `AGENTS.md` generated).
- `generateAgentsMd(schema)` exported for CLI/Hub.
- Test: build a fixture site (`tools/fixtures/meadow-site` assembled from the meadow template) with real `astro build` in a test, asserting pages, feeds, sitemap, zero React runtime in output JS, and HTML identical (modulo image URLs) to `renderPageHtml` output.

### Task 11: `@openspace/mcp-tools` — shared MCP tool set

Architecture §10.2–§10.3, doc 04 §9.

- `SiteStore` interface: `listSites, getDocument(siteId), applyOps(siteId, ops, actor) → result, getDraftDiff, publish(siteId, message), discardDraft, rollback(siteId, version), listVersions, previewUrl, uploadImage(siteId, {url|base64, alt}) → MediaMeta, snapshot(siteId, name)`.
- Tool definitions (name, description, zod input, handler(store, input, grant)) for every tool in §10.2: list_sites, get_site, get_page (rich text as Markdown), list_blocks, list_section_presets, get_styles, set_styles (contrast-checked), insert_section (from preset id or explicit), update_section, move_section, delete_section, insert_block, update_block, move_block, delete_block, place_in_grid, create_page, update_page, delete_page (confirm), update_navigation, upload_image, create_post, update_post, list_posts, get_draft_diff, preview, publish (confirm + grant.publish), discard_draft (confirm), rollback, plus design-iteration helpers for rapid work: `design_check` (runs lint), `apply_template_look`, `list_templates`, `screenshot` (returns preview URL + optional PNG when a screenshot provider is configured).
- Resources: block JSON Schemas, site tokens, AGENTS.md, design guidance (doc 04 §9 text), presets catalog. Prompts: `design-a-page`, `restyle-site`, `write-blog-post`.
- `createMcpServer(store, grant)` producing a transport-agnostic JSON-RPC handler implementing MCP (initialize, tools/list, tools/call, resources/list, resources/read, prompts/list, prompts/get) — usable by Streamable HTTP (Hub) and stdio (CLI). Use `@modelcontextprotocol/sdk` types where helpful.
- In-memory `MemorySiteStore` for tests. Tests drive a full "build a five-section page from a brief" script through the JSON-RPC handler and assert the result validates and passes designCheck with no errors.

### Task 12: `@openspace/cli`

`openspace` binary (commander): `check [--ci]` (schemas, internal links, image refs, size budgets incl. repo media size meter, secret scan; non-zero exit on failure, readable report), `dev` (runs astro dev), `migrate`, `mcp` (stdio MCP over a `FileSiteStore` operating on the local clone: reads content files into a SiteDocument, applies ops, writes files back preserving formatting; publish = git commit on current branch if git present, else noop with message), `new <template> <dir>` (scaffold a site from templates + starter), `eject`, `agents-md`. Tests run check against fixtures (pass + each failure class) and an MCP stdio round-trip.

### Task 13: `@openspace/email-render`

Blocks → email-safe table HTML for campaigns and transactional mails (text, image, button, line, spacer, quote, columns(2), social links, footer with unsubscribe), inlined styles from compiled tokens, dark-mode meta, plain-text alternative. Templates for: double opt-in confirmation, form notification, magic link, order receipt, campaign wrapper. Tests: snapshot + no `<script>`, all links absolute.

### Task 14: Hub foundation — Worker, D1, auth, GitHub access, sites

Architecture §6, §8.1–§8.3. `apps/hub` on Hono + Cloudflare Workers (wrangler 4, `wrangler dev` locally with miniflare D1/DO/R2/KV).

- D1 migrations for every table in §8.3 plus: sessions, mcp_grants, mcp_tokens, invitations, dev_repos/dev_files/dev_commits (dev GitHub emulation), analytics_events (dev fallback for Analytics Engine), outbox (dev email), domains, products/inventory, campaigns, members, member_tokens, audit_log.
- Config + env typing; structured logging; error middleware; CORS (Studio origin + site domains for public routes).
- `GitHubAccess` interface (createRepoFromTemplate, readTree/readFile at ref, commitFiles(branch, files, message, expectedHead), createBranch/resetBranch, tag, listCommits, enablePages, setPagesDomain, dispatchWorkflow, workflowStatus, setSecret, addCollaborator, openPullRequest, transferRepo) with `GitHubAppAccess` (real REST/GraphQL via fetch; App JWT + installation tokens; user tokens w/ refresh, AES-GCM encrypted refresh tokens) and `DevGitHubAccess` (D1-backed, content-addressed, supports branches/tags/history; "publishing" marks a dev deployment live immediately).
- Auth: `/auth/github/start|callback` (real), `/auth/dev/login` (DEV_MODE only: creates user from a name), session cookie (HttpOnly, 30 days), `/auth/token`, `/auth/logout`, `/api/me`.
- Sites API: create from template (copies template files from a bundled template registry into the repo, personalizes name/tagline/brand color, enables Pages, dispatches publish, returns site record), list (owner + collaborator), get, patch, delete (archive w/ typed confirmation, 30-day retention flag), `/api/sites/:id/document` (full SiteDocument of draft head), `/api/templates` (gallery data).
- Dev preview server: `GET /s/:siteId/*` serves the published (main) version and `GET /p/:siteId/*` serves the draft via `renderPageHtml` (with behaviors served from `/_os/behaviors/*`), so a "live site" exists without GitHub.
- Tests with `@cloudflare/vitest-pool-workers` (or miniflare) for auth, site creation, dev GitHub semantics.

### Task 15: Hub DraftRoom, publishing, history, roles

Architecture §5.3–§5.5, §6.4.

- `DraftRoom` Durable Object (SQLite storage, WebSocket hibernation API): on connect send head + ops since client's seq; receive ops → validate (schema + role via `transformForRole`) → assign seq → persist → broadcast; presence (who's here, "Claude is editing Home…"); flush to `os/draft` after 10 s idle or 50 ops with `Co-authored-by` / `Agent:` trailers; agent session snapshots (tag `os/snap/agent-<ts>`), "undo all agent changes" (revert ops since snapshot); HTTP RPC for MCP to submit ops and read document.
- Publish: flush → squash commit on main = draft tree, message from `summarize` → reset draft → dispatch workflow → status. Rollback (new commit with old tree), versions list (timeline with summary/author/date), named snapshots, scheduled publish (D1 `schedules` + cron every minute), build status via `workflow_run` webhook (`/webhooks/github` with signature verification) pushed to room; plain-language error translation table + "Fix it for me" (auto-revert last publish).
- Collaborators: invite by email/GitHub login with role, accept flow, list/remove, section locking, Contributor approval queue (pending collection drafts → approve/reject).
- Tests: concurrent clients + agent ops ordering, role denials, flush batching, publish/rollback trees, schedule execution.

### Task 16: Hub public services — forms, newsletter, analytics, email, domains, quotas

Architecture §8.4, §9.1–§9.3, §7.3; PRD FR-30..33, FR-50..51.

- Forms `POST /f/:siteId/:formId` (urlencoded + JSON + multipart), schema validation from the site's forms manifest (derived from document in dev), Turnstile verify (dev bypass), honeypot, per-IP+site rate limit (DO RateLimiter), quota 1,000/month, store, notify owner (batched digest option), redirect `?os_form=success` or JSON; inbox API (list/search/mark-read/delete/export CSV), retention purge cron.
- Newsletter subscribe → double opt-in email → confirm/unsubscribe (RFC 8058 one-click) pages; subscribers API (list, tags, import CSV, export CSV, delete).
- Analytics beacon `POST /a/:siteId` (salted daily-rotating hash, no raw IP), queries API (visits, uniques, top pages, referrers, devices, form conversions; day/week/month ranges), weekly digest opt-in.
- `EmailSender` interface: Cloudflare Email Service (real binding), Resend, Postmark (real via fetch), `DevOutbox` (stores in D1, viewable at `/dev/outbox`).
- Domains: RDAP registrar lookup, DoH polling endpoint returning checklist for apex A records (GitHub Pages IPs) + www CNAME, Pages API set domain + HTTPS, update openspace.json.
- Quotas table + enforcement middleware, audit log for every mutating action, data export (ZIP of entries/subscribers/orders CSV) + delete-my-data.
- Tests for each endpoint incl. spam/rate-limit/quota rejections.

### Task 17: Hub MCP server

Architecture §10.1. `POST /mcp` Streamable HTTP (JSON responses + SSE when requested) wired to `@openspace/mcp-tools` with a `HubSiteStore` backed by DraftRoom. Auth: OAuth 2.1 authorization server (`/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, dynamic client registration `/register`, `/authorize` with GitHub (or dev) sign-in + consent screen listing sites with checkboxes + "Allow publishing", `/token` with PKCE) — use `@cloudflare/workers-oauth-provider` if it fits, else a compact in-house implementation on KV — plus personal access tokens (`/mcp/t/<token>` URL form) created/revoked from Studio. Grants per site, publish permission off by default, rate limit 2,000 ops/day, agent session snapshot at first write. Tests: full OAuth PKCE dance in dev mode, tool call writes reach DraftRoom, publish denied without grant/confirm.

### Task 18: Hub growth + commerce

Architecture §9.2, §9.4, §9.5, §11.2; PRD §5.5–§5.6.

- Campaigns: CRUD (block JSON body), render via email-render, sender connections (Resend/Postmark/SES/Cloudflare + DevOutbox) with domain verification checks (SPF/DKIM/DMARC via DoH), segments by tag, schedule (cron), fan-out via Queue (dev: inline), unsubscribe, click tracking redirects, open pixel where allowed, stats, bounce/complaint webhook.
- Members: magic link `POST /m/:siteId/login` → email → `/m/:siteId/verify/:token` → Hub-signed JWT (ES256, JWKS at `/.well-known/jwks.json`) → redirect to site `/_os/auth/callback`; member directory API; tiers; password-page hash setting; dev preview enforces gating for gated pages.
- Commerce: products/inventory API (stock per SKU, low-stock alerts), `POST /c/:siteId/checkout` (prices re-read from published catalog manifest/document, stock check, Stripe Checkout Session on connected account with shipping options, tax flag, promotion codes, subscriptions, donations; DevStripe fake checkout page that completes the session), `POST /c/stripe/webhook` (signature verify; completes orders, decrements stock atomically, digital delivery link, member tier change), orders API (list/filter/fulfill/packing slip HTML/refund), Stripe Connect onboarding link + sovereign mode flag, discount codes.
- Update bot cron: compares site kit version → creates update PR (dev: pending update record) with changelog; apply/merge endpoint.
- Pop-ups/announcement are content (renderer); nothing here.
- Tests: checkout price tampering rejected, last-unit concurrency (50 parallel), webhook signature, magic link round trip, campaign to segment lands in outbox with unsubscribe header.

### Task 19: Studio shell, UI kit, dashboard, onboarding

`apps/studio` (React 19 + Vite + TypeScript, React Router, Zustand, TanStack Query, Radix primitives, lucide icons, Tiptap, dnd-kit). AGPL.

- Studio UI kit (`src/ui/`): Figma-grade tokens (neutral chrome light + dark, 13px Inter-like system UI font stack, 4px grid, 1px hairlines, focus rings), components: Button, IconButton, Input, NumberScrubInput (drag-to-scrub like Figma), Select, Segmented, Toggle, Slider, ColorSwatch/Picker (token-first + exact), Popover, Dialog, Sheet (mobile bottom sheet), Tooltip with shortcut hints, Toast, Tabs, Menu, ContextMenu, CommandPalette (⌘K), EmptyState, Skeleton, Badge, Kbd, Avatar/presence stack.
- Hub API client + auth session; router: `/` (marketing redirect or dashboard), `/templates` (public gallery with live previews rendered by renderer + 3 looks switcher, no account required), `/new/:template` (name + tagline + optional brand color/logo → sign in (GitHub or dev) → "Building your site…" animated progress → editor with celebratory live-URL toast), `/sites` dashboard (cards with live/building/failed status, inbox counts, pending updates; Site Gardener multi-site view, transfer ownership), `/sites/:id/*` editor routes (placeholder until Task 20).
- First-run checklist component (dismissible).
- No Git vocabulary in UI copy (Global Constraint 9).
- Vitest + Testing Library tests for UI kit and onboarding flow against a mocked API.

### Task 20: Studio editor core — canvas, selection, inline editing, layers, undo

- Editor store (Zustand): SiteDocument, current page, selection (multi-select), hover, breakpoint, zoom, panels; every mutation = ops via `@openspace/ops` with undo/redo stacks of inverted ops (unlimited in session).
- Canvas: same-origin iframe with token CSS + base CSS + fonts, rendering `PageView` via React portal; device frames 1440/834/390 + "fit"; zoom (⌘+/⌘-/⌘0, pinch, ctrl-wheel) and pan (space-drag) like Figma; hover outlines with block-type label; selection box with handles; floating block toolbar (style, duplicate, move up/down, delete, ask AI); section toolbar (move, duplicate, hide, delete, theme quick-switch, layout mode stack/grid); "+" add-section affordances between sections.
- Inline rich-text editing with Tiptap mounted on the selected text block, schema-matched to §3.5, toolbar (typography preset, bold/italic/underline/strike, link, lists, quote, highlight), emitting `block.update` ops on change (debounced) — typing latency < 50 ms.
- Left panel: Pages list + Layers tree (sections → blocks, drag to reorder, visibility/lock toggles, rename labels). Right panel: Inspector placeholder (Task 21).
- Keyboard shortcuts (⌘Z/⇧⌘Z, ⌘D duplicate, ⌫ delete, arrows select prev/next, ⌥↑/↓ move, Esc select parent, ⌘C/⌘V copy/paste blocks & sections across pages, ⌘K palette, ? shortcuts sheet).
- Code/embed blocks rendered inside sandboxed iframes in canvas.
- Tests: store ops/undo, selection model, shortcut handlers.

### Task 21: Studio inspector, presets, block menu, design panel, Site Styles

- Add-section gallery: presets grouped by category, each thumbnail a live scaled render in the current Site Styles (not static images), search, insert at position.
- Block menu: searchable, categorized, keyboard navigable; insert into section/column/grid.
- Field inspector auto-generated from block field metadata (all `f.*` types incl. list editors with drag reorder, link picker for pages/collections/urls, image picker opening media library, form builder for form blocks with field types + validation + success settings, reference filters).
- Design panel for selected block/section: token pickers for spacing, alignment, color theme, typography preset, background (image w/ focal point picker, color, gradient, video), border, radius, shadow, animation; per-breakpoint override toggles with dot indicators; "exact value" escape hatch visible only to Designer/Owner roles; section layout controls (stack columns 1–4 with ratio presets + per-breakpoint stacking order; switch to grid).
- Site Styles panel: palette (brand color picker, from image/logo extraction, curated palettes, neutral warm/cool/pure, contrast standard/high), font pairing gallery rendered in real fonts, density, shape, buttons, motion, image treatment; live update of the whole canvas; contrast warnings with "nearest accessible" fix; DTCG overrides editor (Designer).
- Tests for inspector generation and styles ops.

### Task 22: Studio Grid editor (Fluid-Engine parity)

- Grid overlay on grid sections: 24-col desktop/tablet, 8-col mobile, row unit lines, bleed tracks; drag to move with snapping, 8 resize handles, smart guides (edges/centers of siblings + section center), distance labels, ⇧ constrain, ⌥ duplicate-drag, keyboard nudge (arrows 1 cell, ⇧ 4 cells), bring forward/back (⌘]/⌘[), overlap allowed with text-overlap warning, multi-select move, 60 fps (pointer events + rAF + CSS transforms during drag, commit `grid.place` op on drop).
- Mobile: auto layout via `autoMobileLayout` until edited; independent mobile editing in mobile preview; optional tablet override toggle; "reset mobile layout".
- Convert stack → grid preserving visual order.
- Phones: grid editing hidden; simplified reorder view.
- Tests: snapping math, placement ops, auto-layout integration.

### Task 23: Studio sync, autosave, publish, history

- DraftRoom WebSocket client: optimistic ops, seq tracking, rebase on remote ops, reconnect with backoff, presence avatars, "X changed this too" conflict toast with restore, IndexedDB persistence of pending ops + document cache (works offline; syncs within 10 s of idle when back), Hub-down fallback banner.
- Agent activity: "Claude is editing Home…" live indicator, Accept / Undo-all banner after agent session.
- Publish flow: button with change summary dialog ("3 pages edited, 2 images added"), progress pill (Publishing… → Live with URL / Couldn't publish + plain-language error + "Fix it for me"), schedule publish date/time picker, discard draft.
- History: timeline of published versions + named snapshots (date, author, summary), preview any version, one-click rollback, create named snapshot.
- Tests against a mocked room.

### Task 24: Studio site management surfaces

- Pages & navigation manager: add page from page templates (blank, about, services, contact, blog index, events, shop, link-in-bio), rename, slug, SEO fields (title/description/social image/noindex with live search-result + social-card preview), drag reorder nav, folders, hide from nav, unlisted, password/members gating (Cloudflare target notice), duplicate, delete.
- Header builder (8 layouts gallery, sticky/transparent, mobile menu style, CTA button) and footer editor (footer grid section in canvas), announcement bar + pop-up editors with triggers and frequency caps.
- Media library: upload via drag/drop/paste/file picker/mobile camera; in-browser pipeline (createImageBitmap, ≤ 2400px, re-encode JPEG q.85 / PNG/WebP for alpha, EXIF/GPS stripped, dominant color, blur placeholder, saliency focal point suggestion, content-hash naming `media/YYYY/MM/<slug>-<hash>.<ext>`, dedupe), SVG sanitize (DOMPurify), alt text, focal point editor, crop + basic filters, usage tracking, repo-size meter (warn 600 MB, block 900 MB), upload queue in IndexedDB → Hub media upload endpoint.
- Settings: General (name, tagline, logo, favicon, locale), "Your site's home" plain-language explainer, Domains wizard (registrar detection, records table, live DNS checklist polling, HTTPS), Connect your AI (personal MCP URL, copy button, step-by-step for Claude + Claude Code plugin install, grants list w/ revoke and publish toggle), Collaborators (invite by email/GitHub username, roles, locks, approval queue), Hosting (GitHub Pages ↔ Cloudflare upgrade flow with token sealed-box to Actions secret), Advanced (custom CSS editor, head/footer code injection, redirects manager, 404 page, repo link, branch/commit vocabulary allowed here, eject info), Export (download ZIP, CSV exports), Delete site (typed confirmation).
- Tests for media pipeline (EXIF stripped, size cap, hash naming) and settings forms.

### Task 25: Studio content, marketing and commerce surfaces

- Collections: blog (post list, block-based post editor with Markdoc output, categories, tags, authors, featured image, excerpt, status draft/scheduled/published, publishAt), events (dates, recurrence, location, RSVP link), portfolio projects, podcast episodes (audio URL, duration, episode/season), products (variants, SKUs, images per variant, digital file, price, stock link to inventory), Contributor submissions + approvals.
- Forms inbox (per form, search, mark read, export CSV, delete, retention setting, notification settings), Subscribers (list, tags, import/export), Campaigns (block composer using email-render preview desktop/mobile/dark, sender connection + domain verification, segment, schedule/send, stats), Analytics dashboard (visits, uniques, top pages, sources, devices, conversions, date ranges; tasteful charts), Members (directory, tiers, invite), Orders (list, filter, fulfill, packing slip, refund), Store settings (Stripe connect, shipping rates flat/weight/free threshold/pickup, tax toggle, discount codes, low-stock threshold), Donations settings.
- Tests for each surface's core interactions with mocked API.

### Task 26: Studio Design check, looks, updates, mobile Studio, PWA

- Design check panel (lint issues grouped by page with jump-to and auto-fix), SEO check.
- "Try a new look": template/look switcher previewing other templates' Site Styles + preset variant mapping on the current content, apply or discard.
- Update available banner + changelog + preview + apply.
- Mobile Studio (< 768px): page list → section list → tap to edit in bottom sheet, reorder sections by drag handle, replace images from camera roll, publish; grid editing hidden; 44px touch targets; safe-area insets.
- PWA: manifest, icons, service worker caching app shell, offline drafts (IndexedDB), install prompt.
- Tests: mobile layout rendering at 390px, lint panel actions.

### Task 27: Claude Code plugin, docs site, marketing site

- `plugin/`: Claude Code plugin `openspace` — `.claude-plugin/plugin.json`, `.mcp.json` registering the local stdio server (`npx -y @openspace/cli mcp`) and documenting the remote Hub URL option, skills: `openspace-web-design` (doc 04 §9 guidance, preset-first composition workflow, rapid iterate loop: get_page → design_check → edit → preview/screenshot → repeat), `openspace-site-setup`; commands `/openspace:new-site`, `/openspace:design-check`, `/openspace:restyle`, `/openspace:publish`; agent `openspace-designer`. Include README with install instructions (`/plugin marketplace add omniharmonic/openspace`) and a `.claude-plugin/marketplace.json` at repo root.
- `apps/docs`: Astro Starlight docs (getting started, editing, styles, domains, connect your AI, Claude Code plugin, forms, newsletter, members, store, self-hosting the Hub, contributing templates, block development).
- `apps/www`: marketing site + template gallery built with site-kit from an OpenSpace site document (dogfooding).

### Task 28: End-to-end test suite

`e2e/` Playwright (chromium + webkit mobile emulation) running against `wrangler dev` Hub (DEV_MODE) + Studio dev server, orchestrated by Playwright `webServer`. Flows: browse gallery without account → create site (dev sign-in) → building → editor; edit headline inline, replace image, add section from preset, add block, change Site Styles, publish → live dev site reflects change; undo/redo; rollback; schedule publish; grid drag/resize; mobile editing at 390px; forms submit on live site → inbox → CSV; newsletter double opt-in via dev outbox; MCP: OAuth dance + tool calls build a page, Studio shows agent banner, Undo all; domains wizard dev path; collaborator Editor role cannot change styles; member magic link gating; checkout with dev Stripe; campaign send to outbox; design check; axe scan of template demos (zero serious/critical); JS budget on published pages. All must pass.

### Task 29: Design and mobile optimization passes

Systematic visual QA with screenshots at 390/834/1440 of every Studio surface and every template page. Fix spacing, typography, alignment, empty/loading/error states, dark mode, focus states, touch targets, overflow, motion; templates to doc 04 §8 bar (stress tests: 3× / 0.3× copy, missing images, long names, 1/2/5/12 list items, 200% zoom). Lighthouse on template demos (≥ 95 perf mobile, a11y 100). Document results in `docs/qa/`.

### Task 30: Final whole-branch review and hardening

Most-capable-model review of the full codebase against the PRD parity checklist (implementation plan §12) and FR list; fix wave; README/status update with a parity matrix in `docs/PARITY.md` marking each PRD requirement Implemented / Implemented (dev-emulated external service) / Deferred with reason.
