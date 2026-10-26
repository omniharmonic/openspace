# OpenSpace — PRD parity matrix

Final whole-branch review (build plan Task 30), against `docs/product/01-PRD.md` (§4 experience,
§5 parity map, §6 FR-1…FR-51, §7 NFRs) and the "Squarespace parity" checklist in
`docs/product/03-IMPLEMENTATION-PLAN.md` §12. Reviewed at `754a24b`; this version reflects `main` at `49c3438` after the review's two fix waves (wave A: security and real-hosting correctness; wave B: product gaps and parity closers, with their re-reviews).

## How to read this

| Status | Meaning |
|---|---|
| **Implemented** | Built, wired end to end, and covered by unit tests and/or the Playwright e2e suite. |
| **Implemented (dev-emulated)** | Built with a real provider implementation (GitHub App, Cloudflare, Stripe, email providers, Turnstile, DNS/RDAP) **and** a dev implementation (Global Constraint 8). Everything was exercised against the dev implementation; the real provider path is unit-tested against mocked `fetch` only and **has never run against the live service**. |
| **Partial** | Works, but part of the requirement is missing or doesn't hold. What's missing is stated. |
| **Missing** | Not built. |
| **Deferred (P6)** | Phase 6 in the PRD ("beyond parity"). Out of scope for this build by design. |

Targets that can only be measured with real users or real infrastructure (median time to a live
site, Hub cost per site, usability tests, design-partner blind comparison) are listed with
the evidence that exists and are marked **Partial** where the target itself is unverified.

### Verification evidence used

- `pnpm turbo run typecheck test --force --concurrency=4` on the merged fix waves: **39/39 tasks
  pass** (the review's baseline at `754a24b` was about 2,100 unit tests; both waves added tests in
  schema, ops, renderer, theme, email-render, site-kit, cli, hub and studio).
- `pnpm exec biome check .`: clean.
- `pnpm e2e` (Playwright: real Hub under `wrangler dev` in DEV_MODE plus the real Studio): **29
  passed**. At review time one spec failed on a stale selector (F-4) and blocked the publish,
  rollback and scheduled-publish tests; it now reads `.st-ss-pairing__name`
  (`e2e/tests/edit-publish.spec.ts`), so all 29 flows run in one pass.
- QA documents: `docs/qa/lighthouse.md` (re-measured after the LCP pass), `docs/qa/accessibility.md`,
  `docs/qa/stress.md`, `docs/qa/studio.md`.
- Everything above runs against dev implementations. No provider path (GitHub, Cloudflare incl. R2
  and Workers secrets, Stripe, email, Turnstile, DNS/RDAP, GitHub Actions OIDC) has run against a
  live service.

### Summary counts

| Status | Count |
|---|---|
| Implemented | 126 |
| Implemented (dev-emulated) | 45 |
| Partial | 10 |
| Missing | 0 |
| Deferred (P6) | 11 |
| **Total rows** | **192** |

The PRD sections give 171 requirement rows (§4, §5, §6, §7); the §12 checklist adds 21. At the
review (`754a24b`) the counts were 123 / 36 / 19 / 3 / 11. Several rows moved from Partial or
Missing to **Implemented (dev-emulated)**, not **Implemented**, because the fixes only run against
dev implementations.

**Missing:** none. The three review-time gaps (font uploads, form file uploads, budget alerts) are
built. So are the gaps that sat inside Partial rows: weight-based shipping, subscription products,
per-page code injection, the §9.3 abuse-reporting address and campaign volume caps. Not built:
takedown tooling beyond the footer abuse address, and real registrar screenshots.

**Still Partial** (10 rows, 7 distinct gaps):
1. Gated content (member areas in §5.7 and §12, FR-5, 7.3c): images used only on gated pages remain
   publicly fetchable from the repo and live site (the Hub preview signs them), and git history
   retains gated content committed before the fix. Everything else from F-1, F-2, F-3, F-7 and M-7
   is fixed.
2. LCP (7.1a): all 12 templates are 1.20-1.95 s, but measured by Lighthouse's simulated throttling
   over local HTTP/2 with self-hosted demo photos, and hearth (1.95 s) is within run-to-run noise
   (about 0.1 s) of the 2.0 s limit.
3. Lighthouse as a CI gate (§5.4): a nightly/on-demand workflow exists but has never run on GitHub
   and isn't a per-change gate.
4. FR-50: registrar guides are written steps plus drawn diagrams, not real screenshots.
5. Time to first live site and publish-to-live (7.1c): unmeasurable without real GitHub Pages.
6. Hub cost per site (7.6a): designed for, unmeasured.
7. Design-partner blind comparison (§12): not run.

Fixed since review and no longer Partial: members and password pages on the Cloudflare target
(F-1, F-2, F-3, F-7), Turnstile site key provisioning (F-5), scheduled blog posts (F-6).

---

## §4 The experience

### §4.1 Onboarding

| # | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 4.1.1 | Landing page, template gallery browsable and previewable without an account | **Implemented** | `apps/studio/src/features/templates/`, `apps/www/`; Hub `/t/:templateId/*` previews (`apps/hub/src/routes/preview.ts`); e2e `gallery.spec.ts` (desktop, mobile, webkit-mobile). |
| 4.1.2 | Pick template, optional name and one-line tagline | **Implemented** | `features/onboarding/`; Hub personalizes name and tagline (`apps/hub/src/services/personalize.ts`); e2e `gallery.spec.ts` checks the live site shows them. "Start from my existing site" is P6 (see 5.7 import). |
| 4.1.3 | Sign in with GitHub, inline "what is GitHub" explainer and guided sign-up returning to the same step | **Implemented (dev-emulated)** | `features/auth/SignInPanel.tsx`; real OAuth `apps/hub/src/routes/auth.ts` (`/auth/github/start|callback`, state CSRF, `return_to` allowlist); dev sign-in in e2e. |
| 4.1.4 | One authorization screen (GitHub App) | **Implemented (dev-emulated)** | `apps/hub/src/github/app.ts` (App JWT, installation and user tokens). Ledger: sites created through `/api/sites` fall back to the user token when there's no `installation_id` (Spike S1). |
| 4.1.5 | Progress screen while the Hub creates the repo, writes name and tagline, enables Pages and triggers the first build (< 90 s) | **Implemented (dev-emulated)** | Copy is "Setting up your site…" (ledger ruling: GC9 no-jargon beats the PRD's "Building"). Retry is idempotent (`POST /api/sites/:id/publish`). The < 90 s target is unmeasured against real GitHub. |
| 4.1.6 | Land in editor with "Your site is live at …" and copy/share | **Implemented** | Celebratory toast (`/sites/:id?welcome=1`); e2e `gallery.spec.ts`. |
| 4.1.7 | First-run checklist (dismissible) | **Implemented** | `features/editor/FirstRunChecklist.tsx`. |
| 4.1.8 | No "repository/commit/branch/build/deploy" outside Settings → Advanced | **Implemented** | GC9 copy rule; `features/settings/AdvancedSettings.tsx` is the only place with Git vocabulary. |

### §4.2 Editing

| # | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 4.2.1 | Click anything to edit; inline text; images open media picker; floating toolbar (style, duplicate, move, delete, ask AI) | **Implemented** | `features/editor/canvas/Overlay.tsx`, Tiptap inline editing (`features/editor/text/`). "Ask AI" shows how to ask your connected agent (no built-in model, by design). e2e `edit-publish.spec.ts`. |
| 4.2.2 | Add section from a preset gallery rendered in the site's current style | **Implemented** | `features/add-section/PresetGallery.tsx` (live scaled renders); ≥ 90 presets (`packages/blocks/src/presets/`, test `presets.test.tsx`). |
| 4.2.3 | Add block from a searchable menu | **Implemented** | Block menu in `features/inspector/`; e2e adds a block. |
| 4.2.4 | Stack layout mode | **Implemented** | `packages/renderer/src/section.tsx`; FR-13. |
| 4.2.5 | Grid layout mode (24/8 columns, drag, resize, overlap, layering, independent mobile) | **Implemented** | `features/editor/grid/`; e2e `grid.spec.ts`. |
| 4.2.6 | Design panel with token pickers and "exact value" escape hatch | **Implemented** | `features/inspector/design/`; exact values are role-gated (Designer/Owner). |
| 4.2.7 | Device preview desktop/tablet/mobile with per-breakpoint overrides marked | **Implemented** | FR-15. |
| 4.2.8 | Site Styles (fonts, palette, section themes, buttons, density, radius, image treatments, animations), live | **Implemented** | `features/styles/SiteStylesPanel.tsx`, `packages/theme`; e2e changes palette and pairing and checks the live CSS variables after publish. |
| 4.2.9 | Unlimited session undo/redo; full version history as a timeline of named snapshots | **Implemented** | Store undo stacks (`features/editor/model/store.ts`); History (`features/sync/`), snapshots `os/snap/*`; e2e `sync.spec.ts`, `edit-publish.spec.ts`. |

### §4.3 Saving and publishing

| # | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 4.3.1 | Autosave: local instantly, cloud draft within seconds | **Implemented** | IndexedDB pending ops plus document cache (`features/sync/RoomClient.ts`), DraftRoom flush to `os/draft` after 10 s idle or 50 ops (`apps/hub/src/room/draft-room.ts`); e2e `sync.spec.ts` (offline → online). |
| 4.3.2 | Drafts private in practice; live site unchanged until Publish | **Implemented** | `/p/` draft vs `/s/` published previews; e2e. |
| 4.3.3 | Publish with change summary, progress pill and link | **Implemented (dev-emulated)** | `features/sync/PublishFlow.tsx`, ops `summarize`; real path dispatches the GitHub Actions workflow; build status through the `workflow_run` webhook (`/webhooks/github`, signature verified). Publish-to-live time is unmeasured on real Pages. |
| 4.3.4 | Schedule publish | **Implemented** | D1 `schedules` plus minute cron (`apps/hub/src/scheduled.ts`); e2e scheduled publish (passes; see e2e note above). |
| 4.3.5 | One-click rollback to any published version | **Implemented** | `POST /api/sites/:id/rollback` (Designer+, ledger ruling); e2e rollback test. |

### §4.4 AI — "Connect your AI"

| # | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 4.4.1 | Settings tab with connector URL; GitHub sign-in once; typed tools; publish with confirmation | **Implemented** | `features/settings/ConnectAiSettings.tsx`; OAuth 2.1 + PKCE via `@cloudflare/workers-oauth-provider` (`apps/hub/src/mcp/oauth.ts`, `routes/mcp.ts`); personal token URLs; e2e `mcp.spec.ts`. |
| 4.4.2 | Agent edits land in draft; "Claude is editing Home…"; Accept / Undo banner | **Implemented** | DraftRoom agent sessions plus snapshot at first write; e2e `mcp.spec.ts` (live indicator, "Changes by Claude", Undo all). |
| 4.4.3 | Schema-constrained; code block for deliberate custom code | **Implemented** | All writes through `@openspace/ops` validation; the embed block is always sandboxed (ledger ruling, Task 6). |
| 4.4.4 | Free to the project (BYO AI); `AGENTS.md` in every site | **Implemented** | No inference anywhere; `generateAgentsMd` (`packages/site-kit/src/agents-md.ts`), written on site creation. |

### §4.5 Collaboration and handoff

| # | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 4.5.1 | Invite by email or GitHub username; Owner / Designer / Editor / Contributor | **Implemented (dev-emulated)** | `apps/hub/src/services/collaborators.ts`, Studio `/invite/:token`; e2e `collaborators.spec.ts` (Editor can't change styles or grid; the room refuses `styles.patch` and `grid.place`). Invitation email goes through `EmailSender` (dev outbox in e2e). Ruling: Editors may publish. |
| 4.5.2 | Locked sections | **Implemented** | `packages/ops/src/roles.ts` (`transformForRole`); Studio lock toggles. |
| 4.5.3 | Site Gardener dashboard: all sites, status, pending updates, inbox counts; transfer ownership | **Implemented (dev-emulated)** | `features/dashboard/Dashboard.tsx` (live/building/failed, unread inbox counts); transfer `POST/DELETE /api/sites/:id/transfer` with expiry (`expireTransfers`); real `transferRepo` untested live. |

### §4.6 Where things live

| # | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 4.6.1 | Settings → "Your site's home" plain-language explainer | **Implemented** | `features/settings/` (test `settings.test.tsx`). |

---

## §5 Squarespace parity map

### §5.1 Editor and design

| Capability | Phase | Status | Evidence / notes |
|---|---|---|---|
| Templates: 6 at MVP, 12 at P2 | P1–P2 | **Implemented** | 12 templates × 3 looks (`templates/{meadow,harbor,atelier,ledger,hearth,signal,field-notes,encore,kiln,commons,vow,link}`); all pass designCheck and Lighthouse (`docs/qa/lighthouse.md`). |
| Template community library | P6 | **Deferred (P6)** | — |
| Section-based building with preset gallery in site style | P1 | **Implemented** | See 4.2.2. |
| Fluid Engine grid incl. overlap, independent mobile, pinned blocks | P2 | **Implemented** | Grid editor plus `autoMobileLayout` (`packages/lint`); pinned blocks are grid items with `pin: top|bottom` (ledger ruling).  |
| Classic stack layout | P1 | **Implemented** | — |
| Site Styles: 30+ pairings, generated accessible palettes | P1/P2 | **Implemented** | 33 pairings (`packages/theme/src/pairings.ts`), ≥ 16 curated palettes, `extractPalette` from image or logo, contrast solver. |
| Section color themes (5) | P1 | **Implemented** | light / light-accent / dark / dark-accent / brand; solver tests across every curated palette. |
| Section backgrounds: image with focal point, color, gradient, video (embed or self-hosted), parallax | P1/P2 | **Implemented** | `packages/schema/src/section.ts`, `packages/renderer/src/section.tsx`, `features/inspector/design/SectionDesign.tsx`. |
| Header (8 layouts, sticky, transparent on hero, mobile menu styles) and footer as a Grid section | P1/P2 | **Implemented** | `packages/renderer/src/header.tsx`, `features/site-chrome/HeaderBuilder.tsx`. Ruling: header collapses to the burger menu below 1024 px. |
| Mobile editing (device preview, per-breakpoint overrides, Grid mobile layout) | P1/P2 | **Implemented** | e2e `grid.spec.ts`, `mobile.spec.ts`. |
| Animations (entrance, scroll, hover; CSS-only; reduced motion) | P2 | **Implemented** | `AnimationSchema` on sections and blocks, `reveal` behavior, hover states in `base-css.ts`, `prefers-reduced-motion`. |
| Custom CSS / code injection: Custom CSS, **per-page** head/footer injection, Code block | P2 | **Implemented** | Custom CSS and site-wide head/footer injection (`packages/schema/src/site.ts`), plus **per-page** `headInjection` / `footerInjection` (`packages/schema/src/page.ts:72`, rendered after the site-wide code). Editors (ops roles) and MCP can't set them; owners and designers get an Advanced section in page settings, and the canvas shows a placeholder and never runs the code. Code block: done (sandboxed). |
| Page management: nav editor, folders, unlisted pages | P1 | **Implemented** | `features/pages/PagesManager.tsx`. |
| Password pages (Cloudflare target only) | P4 | **Implemented (dev-emulated)** | Hub dev preview (`apps/hub/src/routes/preview.ts`) is e2e-tested. On Cloudflare the Hub generates `OS_SESSION_SECRET` and rewrites `OS_PAGE_PASSWORDS` before each publish, rollback and password change (`apps/hub/src/services/worker-secrets.ts`); the starter workflow pushes them with `wrangler secret bulk` (`templates/starter/variants/cloudflare/.github/workflows/publish.yml`). The page-password cookie is purpose-bound (`kind:"pw"`, `packages/site-kit/src/cloudflare/gate.ts`). The Worker path has never run on real Cloudflare. Same residuals as member areas for images (see §5.7). |
| Version history: rollback (P1), timeline UI (P2) | P1/P2 | **Implemented** | — |
| Scheduled publishing | P2 | **Implemented** | — |
| Multiple contributors and roles plus section locking | P2 | **Implemented** | Contributor approval queue (`apps/hub/src/services/approvals.ts`). |
| Image editing: crop, focal point, filters, alt text (AI-suggested via the person's agent) | P1/P2 | **Implemented** | `features/media/MediaDetails.tsx` (crop, filters, focal point, alt). |
| Font uploads; Google / Fontsource catalog | P2 | **Implemented** | `Styles.fonts[]` with a required `license.webUse` (`packages/schema/src/styles.ts`); theme compiler swaps the font tokens; renderer emits `@font-face` with `font-display: swap` and a WOFF2 preload; Hub sniffs WOFF2/TTF/OTF and accepts them only in `media/fonts/` from designers; Studio Site Styles → Your fonts. Unit-tested; no e2e. The Fontsource/Google catalog is still the built-in pairing list. |

### §5.2 Blocks (47 block types registered, `packages/blocks/src/blocks/`)

| Block | Phase | Status | Evidence / notes |
|---|---|---|---|
| Text | P1 | **Implemented** | `text.tsx`, inline Tiptap. |
| Image (caption, link, lightbox) | P1 | **Implemented** | `image.tsx`, `lightbox` behavior. |
| Button | P1 | **Implemented** | `button.tsx`. |
| Gallery: grid, carousel (P1); masonry, slideshow, strips (P2) | P1/P2 | **Implemented** | `gallery.tsx`. |
| Video (YouTube, Vimeo, PeerTube, self-hosted), lite embeds | P1/P4 | **Implemented** | `video.tsx`, `video-lite` behavior. |
| Audio / podcast episode | P3 | **Implemented** | `audio.tsx`. |
| Quote / testimonial | P1 | **Implemented** | `quote.tsx`, `testimonial`, `quote-carousel`. |
| Line, spacer, shape | P1 | **Implemented** | `decor.tsx`. |
| Form: custom fields (P1) | P1 | **Implemented (dev-emulated)** | `form.tsx`; Hub `POST /f/:siteId/:formId`; e2e `forms.spec.ts`. Turnstile real path: see FR-31. |
| Form: file upload (P4) | P4 | **Implemented (dev-emulated)** | `file` field type with accepted kinds and a max size up to 25 MB (`packages/schema/src/form.ts`); signed reservation and PUT for the JS path, multipart for no-JS (`apps/hub/src/services/form-uploads.ts`); stored in Hub R2, never in the repo; signed one-hour attachment links in the inbox; counted in the `uploadBytes` quota. Reservations need Turnstile or a verified root proof that can't chain. Hub and Studio unit tests only (no e2e), and Turnstile is dev-emulated. |
| Newsletter signup: collect (P1), campaigns (P4) | P1/P4 | **Implemented (dev-emulated)** | `newsletter.tsx`; campaigns in §5.5. |
| Map (OSM static, no key) | P1 | **Implemented** | `map.tsx`. |
| Social links / share buttons | P1 | **Implemented** | `social.tsx`. |
| Accordion / FAQ with schema.org | P1 | **Implemented** | `accordion.tsx` (FAQPage JSON-LD). |
| Embed / Code, sandboxed in canvas | P1 | **Implemented** | `embed.tsx` (always sandboxed). |
| Summary (posts/events/products/projects; grid, list, carousel, wall) | P3 | **Implemented** | `collections.tsx`. |
| Menu (restaurant) | P2 | **Implemented** | `restaurant-menu.tsx`. |
| Calendar / events list | P3 | **Implemented** | `collections.tsx` (`events`). |
| Scrolling text (marquee) | P2 | **Implemented** | `marquee.tsx`. |
| Logo strip / press | P1 | **Implemented** | `logo-strip.tsx`. |
| Pricing table | P2 | **Implemented** | `pricing.tsx`. |
| Team / people grid | P2 | **Implemented** | `team.tsx`. |
| Stats / numbers | P2 | **Implemented** | `data.tsx`. |
| Timeline | P2 | **Implemented** | `data.tsx`. |
| Tabs | P2 | **Implemented** | `tabs.tsx`. |
| Before/after image | P2 | **Implemented** | `compare.tsx`. |
| Search (Pagefind) | P3 | **Implemented** | `search.tsx`, site-kit postbuild runs Pagefind. |
| Scheduling / booking: embed (P2) | P2 | **Implemented** | `booking.tsx` (Cal.com, Calendly lite load). The ledger notes the Cal.com embed URL was never checked by hand. |
| Scheduling / booking: native | P6 | **Deferred (P6)** | — |
| Product / Add to cart | P5 | **Implemented (dev-emulated)** | `commerce.tsx`, cart behavior; e2e `checkout.spec.ts` (including a price-tampering check). |
| Donation: link (P4), native (P5) | P4/P5 | **Implemented (dev-emulated)** | `commerce.tsx` → Hub checkout `kind=donation` (one-time or monthly). |
| Member login / gated content | P4 | **Implemented (dev-emulated)** | `members.tsx`; e2e `members.spec.ts` on the Hub preview. Real Cloudflare target: see §5.7 members. |
| Chart (static SVG) | P3 | **Implemented** | `chart.tsx`. |
| Instagram / social feed | P6 | **Deferred (P6)** | A `social-feed` block exists with build-time data or a placeholder; the owner-authorized fetch isn't built. |
| Course / lesson | P6 | **Deferred (P6)** | — |

### §5.3 Content collections

| Capability | Phase | Status | Evidence / notes |
|---|---|---|---|
| Blog: categories, tags, authors, excerpts, featured image, RSS | P3 | **Implemented** | `features/collections/`, site-kit RSS and Atom (`packages/site-kit/src/feeds.ts`). |
| Blog: scheduled posts | P3 | **Implemented (dev-emulated)** | Studio "Goes live" (`publishAt`). Publish and rollback record the next future `publishAt` in `site_automation.next_publish_at`; the minute cron (`scheduled-items` in `apps/hub/src/scheduled.ts`, `services/site-automation.ts`) dispatches the publish workflow when it is due (F-6). Tested against the dev GitHub run; the real workflow dispatch has never run. |
| Comments | P6 | **Deferred (P6)** | — |
| Events: dates, recurrence, location, RSVP link, .ics, past/upcoming | P3 | **Implemented** | RRULE editor (`features/collections/RepeatEditor.tsx`), iCal feed with RRULE (`feeds.ts`). |
| Portfolio / projects | P3 | **Implemented** | — |
| Podcast (RSS with Apple/Spotify tags) | P3 | **Implemented** | `itunes:` and Podcasting 2.0 tags (`feeds.ts`); audio is an external URL or a repo file. |
| Products (public catalog plus Hub inventory and orders) | P5 | **Implemented (dev-emulated)** | `/_os/catalog.json` (`packages/site-kit/src/manifests.ts`) ⇄ Hub `services/catalog.ts` (contract matches). |
| Courses | P6 | **Deferred (P6)** | — |

### §5.4 SEO, performance, accessibility

| Capability | Phase | Status | Evidence / notes |
|---|---|---|---|
| Page titles, descriptions, social images; SEO panel | P1 | **Implemented** | Pages manager SEO fields with search and social previews; `seoCheck` (`packages/lint`). |
| Auto social share images | P3 | **Implemented** | Satori and resvg (`packages/site-kit/src/node/og.ts`). |
| Sitemap, robots.txt, canonical URLs | P1 | **Implemented** | site-kit `seo.ts`, `routes.ts`. |
| Structured data (Organization, LocalBusiness, Article, Event, Product, FAQ) | P3 | **Implemented** | `packages/site-kit/src/seo.ts`; FAQ from the accordion block. |
| URL redirects (static on Pages, `_redirects` on Cloudflare) | P3 | **Implemented** | `postbuild.ts`, Advanced → Redirects. |
| Lighthouse ≥ 95 on every template, **CI-enforced** | P1 | **Partial** | All 12 templates score 99–100 (`docs/qa/lighthouse.md`). A gate now exists: `.github/workflows/lighthouse.yml` runs `scripts/lighthouse.mjs --min-perf=95 --min-a11y=100 --max-lcp=2000` nightly and on demand, but it is not a per-change gate and has never run on GitHub Actions. |
| WCAG 2.2 AA on every template and block; contrast-safe colors; alt-text prompts | P1 | **Implemented** | axe e2e zero serious/critical on 36 template × look homes plus Studio screens (`a11y-perf.spec.ts`); Lighthouse a11y 100; theme contrast solver; lint flags missing alt text. |

### §5.5 Marketing and growth

| Capability | Phase | Status | Evidence / notes |
|---|---|---|---|
| Forms with inbox, notifications, CSV export | P1 | **Implemented (dev-emulated)** | e2e `forms.spec.ts` (no-JS and JS submit, notification mail, inbox, CSV). Email providers (Cloudflare Email, Resend, Postmark) are real but untested live. |
| Newsletter list (double opt-in, tags, import/export) | P1 | **Implemented (dev-emulated)** | e2e `forms.spec.ts`, `campaign.spec.ts`. |
| Email campaigns with site blocks, scheduling, basic stats | P4 | **Implemented (dev-emulated)** | `apps/hub/src/services/campaigns.ts`, `features/marketing/`; e2e `campaign.spec.ts` (segment, List-Unsubscribe). Sender verification is required (SPF/DKIM/DMARC via DoH). |
| Automations (welcome, post-purchase) | P6 | **Deferred (P6)** | — |
| Pop-ups and announcement bar | P4 | **Implemented** | `packages/renderer/src/chrome.tsx`, `features/site-chrome/BannerEditors.tsx` (triggers, frequency caps). |
| Privacy-first cookieless analytics | P3 | **Implemented (dev-emulated)** | Beacon `POST /a/:siteId` (salted daily hash), dashboard `features/analytics/`; Analytics Engine in production, D1 fallback in dev. |
| Link-in-bio template and page type | P2 | **Implemented** | `templates/link`, `link-list` block, page template. |

### §5.6 Commerce (Cloudflare target required)

| Capability | Phase | Status | Evidence / notes |
|---|---|---|---|
| Physical and digital products, variants, images | P5 | **Implemented (dev-emulated)** | Product collection; digital delivery by signed, expiring link (`/c/:siteId/download/:token`). |
| Inventory and stock alerts | P5 | **Implemented** | `services/commerce.ts` (atomic decrement, low-stock threshold); last-unit concurrency test (Hub). |
| Cart and Stripe Checkout on the owner's account (Connect, no platform fee) | P5 | **Implemented (dev-emulated)** | `services/checkout.ts` (prices re-read from the published catalog), DevStripe; e2e `checkout.spec.ts`. |
| Shipping rates: flat, **weight**, free threshold, local pickup | P5 | **Implemented (dev-emulated)** | Flat, free-over threshold, pickup and **weight tiers** (`byWeight`): product and variant weight in grams, parcel weight computed server-side from the catalog, checkout refuses a parcel too heavy for every option (`services/checkout.ts`, `services/commerce.ts`). |
| Taxes (Stripe Tax opt-in) | P5 | **Implemented (dev-emulated)** | Tax flag sets `automatic_tax` (`services/checkout.ts`). |
| Discount codes (Stripe promotion codes) | P5 | **Implemented (dev-emulated)** | `allow_promotion_codes`; discount codes API. |
| Subscriptions (Stripe Billing) | P5 | **Implemented (dev-emulated)** | Subscription **products** (`subscription.interval` month/year, `packages/schema/src/collections.ts:200`) check out in Stripe subscription mode; mixed intervals are refused; shipping is a recurring line. Dashboard refunds, sold-out auto-refunds and `charge.refunded` work and a full refund cancels the subscription (cron retries failed cancels, capped at 7). Plus membership tiers and monthly donations. Dev Stripe only. |
| Donations (one-time, recurring) | P5 | **Implemented (dev-emulated)** | — |
| Orders dashboard, fulfillment, refunds | P5 | **Implemented (dev-emulated)** | `features/commerce/OrdersArea.tsx`, packing slip, refund; e2e refunds $48.00. |
| Abandoned cart recovery | P6 | **Deferred (P6)** | — |
| Gift cards | P6 | **Deferred (P6)** | — |

(Point of sale is explicitly out of scope in the PRD and isn't counted.)

### §5.7 Services, domains and accounts

| Capability | Phase | Status | Evidence / notes |
|---|---|---|---|
| Free subdomain (`name.github.io/site`, `workers.dev`) | P1 | **Implemented (dev-emulated)** | — |
| Custom domain wizard with live DNS checking and HTTPS | P1 | **Implemented (dev-emulated)** | See FR-50/51. Only for the GitHub Pages target: Cloudflare-target domains are connected in the owner's Cloudflare account (`services/domains.ts:442`). |
| Domain purchase: not sold; recommend at-cost registrars | P1 | **Implemented** | `features/settings/DomainsSettings.tsx`. |
| Professional email: guide for free forwarding | P2 | **Implemented** | `apps/docs/src/content/docs/guides/domains.md` (Cloudflare Email Routing). |
| Scheduling (Cal.com / Calendly embed) | P2 | **Implemented** | `booking` block. |
| Scheduling (native lightweight booking) | P6 | **Deferred (P6)** | — |
| Member areas, free and paid tiers (magic link, gated pages, Stripe for paid tiers) | P4/P5 | **Partial** | Magic link, Hub-signed ES256 JWT, JWKS, tiers and membership checkout are done and e2e-tested on the dev preview. Fixed since review: purpose-bound `os_member` / `os_pw` cookies (F-1), per-tier gating via `access.tiers` with a Studio picker and warning (F-7), 24 h Worker sessions with Hub silent re-sign-in so blocked members lose access within a day (M-7), Worker secrets provisioned (F-2), and gated page content sealed out of the repo into Hub R2 and delivered to the Worker's R2 bucket by an OIDC-authorized workflow job (F-3; `apps/hub/src/services/gated-content.ts`, `packages/site-kit/src/cloudflare/gate.ts`). **Remaining:** (a) images used only on gated pages are still committed to the repo and served publicly from the live Cloudflare site (the Hub preview signs them, M-11); (b) gated content committed before the fix remains in Git history; (c) the Cloudflare path has never run against real Cloudflare or GitHub. |
| Mobile app: responsive, installable PWA | P2 | **Implemented** | `apps/studio/src/pwa/`, phone Studio (`features/mobile/`); e2e `mobile.spec.ts` (Chromium and WebKit). |
| Import from Squarespace / WordPress | P6 | **Deferred (P6)** | — |
| Export: repo ZIP; subscribers, entries, orders as CSV | P1 | **Implemented** | `features/settings/ExportSettings.tsx`, Hub `/export` ZIP plus CSV routes. |

---

## §6 Functional requirements

### §6.1 Accounts and sites

| FR | Requirement | Status | Evidence / notes |
|---|---|---|---|
| FR-1 | GitHub App sign-in; 30-day session with silent token refresh | **Implemented (dev-emulated)** | `apps/hub/src/auth/session.ts` (HttpOnly, SameSite=Lax, 30 days), `auth/github-tokens.ts` (AES-GCM refresh tokens, refresh race handling). |
| FR-2 | Create site from template (name, tagline, target); public repo; enable Pages; first build | **Implemented (dev-emulated)** | `apps/hub/src/services/sites.ts`; e2e `gallery.spec.ts`. |
| FR-3 | Dashboard of owned and collaborating sites with live/building/failed | **Implemented** | `features/dashboard/Dashboard.tsx`, `refreshStatus`. |
| FR-4 | Delete: archive repo after typed confirmation; Hub data kept 30 days, then purged | **Implemented (dev-emulated)** | `archiveSite` (`services/sites.ts:635`), `purgeArchivedSites` cron (`apps/hub/src/scheduled.ts`). |
| FR-5 | Plain-language "repo is public" explanation; private data never in site content | **Partial** | The explanation and the secret scan (`openspace check`, `packages/schema/src/secrets.ts`) are done, and gated page content is no longer committed (sealed stubs, F-3). **Residuals:** images used only on gated pages remain publicly fetchable, and gated content committed before the fix stays in Git history (owners should be told). `openspace check` warns on gated content found in files. |

### §6.2 Editor

| FR | Requirement | Status | Evidence / notes |
|---|---|---|---|
| FR-10 | Canvas renders the actual components (identical to published) in an isolated frame | **Implemented** | One renderer (ADR-3) for canvas, Hub preview and site-kit; site-kit test asserts build HTML equals `renderPageHtml` output. |
| FR-11 | Add, reorder, duplicate, hide, delete sections; insert from presets | **Implemented** | — |
| FR-12 | Blocks from a searchable menu; inline or side-panel editing | **Implemented** | Inspector generated from field metadata (`features/inspector/`). |
| FR-13 | Stack 1–4 columns with per-breakpoint stacking order | **Implemented** | — |
| FR-14 | Design panel token pickers; exact values Designer-only | **Implemented** | — |
| FR-15 | Device preview 1440 / 834 / 390 with override dots | **Implemented** | — |
| FR-16 | Site Styles: pairing, palette (from brand color or image), button style, density, radius | **Implemented** | e2e step 5. |
| FR-17 | Pages: add from template, rename, URL, SEO, reorder nav, folders, hide | **Implemented** | `features/pages/PagesManager.tsx`. |
| FR-18 | Media library: drag/paste/camera, resize, strip location, alt, focal point, usage, repo-size meter | **Implemented** | `features/media/` (pipeline: ≤ 2400 px, EXIF/GPS stripped, content-hash names, DOMPurify SVG; meter warns at 600 MB, blocks at 900 MB). e2e checks a GPS-tagged JPEG comes back with no EXIF. |
| FR-19 | Session undo/redo; rollback to any published version | **Implemented** | — |
| FR-20 | Autosave locally at once; cloud draft within 10 s of idle | **Implemented** | — |
| FR-21 | Publish with summary, status, completion/failure notice, plain-language error, "Fix it for me" | **Implemented (dev-emulated)** | `fixLastPublish` (`room/draft-room.ts`), error table (`services/build-errors.ts`); Hub test maps a failed run and reverts. |
| FR-22 | Works on a phone: content editing, section add/reorder, publish; grid editing desktop/tablet only | **Implemented** | Phone Studio (`features/mobile/MobileStudio.tsx`); e2e `mobile.spec.ts`. |

### §6.3 Forms and newsletter

| FR | Requirement | Status | Evidence / notes |
|---|---|---|---|
| FR-30 | Form field types text, email, phone, long text, select, checkbox, radio, date; required; success message or redirect | **Implemented** | `packages/schema/src/form.ts` (password and card types are forbidden). |
| FR-31 | Turnstile (invisible by default) and per-site rate limits | **Implemented (dev-emulated)** | Rate limits (DO RateLimiter, IPv6 /64 and `::ffff:` keys), honeypot, Hub Turnstile verification and an `interaction-only` widget. The site key now reaches builds: `GitHubAccess.setVariable` sets `OPENSPACE_TURNSTILE_SITE_KEY` and `openspace.json` carries `integrations.turnstileSiteKey`, which site-kit reads (`packages/site-kit/src/integration.ts`); existing sites are backfilled by the minute cron (F-5). Needs the GitHub App's Variables permission. Never run against real Turnstile or GitHub. |
| FR-32 | Inbox; email notification; CSV export; delete; 12-month retention (configurable) | **Implemented (dev-emulated)** | `features/inbox/`, retention purge cron, `storedSubmissionsMonths` quota. |
| FR-33 | Newsletter signup with double opt-in; CSV export | **Implemented (dev-emulated)** | — |

### §6.4 AI connector

| FR | Requirement | Status | Evidence / notes |
|---|---|---|---|
| FR-40 | "Connect your AI": personal MCP URL and step-by-step instructions with screenshots | **Implemented** | `ConnectAiSettings.tsx`. The steps use drawn sketches in place of real screenshots (fine for unbranded docs). |
| FR-41 | MCP tools: read structure, read page, edit text, add/move/remove sections and blocks, styles, pages, upload image from URL, blog post, preview, publish (confirm) | **Implemented** | 39 tools in `packages/mcp-tools/src/tools/` (incl. `design_check`, `apply_fix`, `screenshot`); publish needs `confirm` plus a grant with publish allowed; SSRF guard on `upload_image` (`apps/hub/src/mcp/ssrf.ts`). |
| FR-42 | Agent edits to draft; live in Studio with Accept/Undo | **Implemented** | e2e `mcp.spec.ts`. |
| FR-43 | `AGENTS.md` in every repo | **Implemented** | — |

### §6.5 Domains

| FR | Requirement | Status | Evidence / notes |
|---|---|---|---|
| FR-50 | Domain wizard: RDAP registrar detection, exact records, registrar-specific **screenshots** (top 8), DNS polling, HTTPS, confirm | **Partial** | RDAP lookup, records, DoH polling, HTTPS and confirmation are dev-emulated and pass e2e `domains.spec.ts`. Eight registrar guides (`apps/hub/src/services/registrars.ts`) are still **written steps**; each now has a drawn inline-SVG diagram of the DNS screen with numbered markers (`apps/studio/src/features/settings/RegistrarDiagram.tsx`). These are illustrations, **not real registrar screenshots**. |
| FR-51 | Apex + `www` with redirect | **Implemented (dev-emulated)** | Four apex A records plus `www` CNAME; GitHub Pages redirects apex ⇄ www (`services/domains.ts`). |

---

## §7 Non-functional requirements

| § | Requirement | Status | Evidence / notes |
|---|---|---|---|
| 7.1a | Published pages: Lighthouse perf ≥ 95 mobile, LCP < 2.0 s on 4G, JS < 30 KB | **Partial** | Perf 99–100 and JS 1.6–5.2 KB on all 12 templates; **LCP 1.20–1.95 s on all 12** (was 2.13–2.45 s on 7), median of 3 (`docs/qa/lighthouse.md`). Fixes: LCP image preload, phone `sizes`, and self-hosted demo photos in publish builds (`OPENSPACE_REMOTE_IMAGES=download`). Caveats: Lighthouse's simulated mobile throttling over a local HTTP/2 server, not a real host or network; hearth (1.95 s) is within the ±0.1 s run-to-run noise of the 2.0 s limit; the measured builds use self-hosted demo photos, which publish builds download once and fall back to remote on failure. |
| 7.1b | Studio: first load < 3 s; typing < 50 ms; canvas < 100 ms after a style change | **Implemented** | Editor first load 1.92 s, dashboard 1.22 s (`docs/qa/lighthouse.md` § Studio). The editor bundle is 688 KB gzip. |
| 7.1c | Time to first live site < 3 min median; publish-to-live < 90 s | **Partial** | Not measurable without real GitHub Pages (dev-emulated flow completes in seconds). |
| 7.2a | Templates and blocks WCAG 2.2 AA; colors can't fall below 4.5:1 without explicit override and warning | **Implemented** | Theme solver plus `auditContrast`; readability warnings with "nearest accessible" fix. |
| 7.2b | Studio keyboard-navigable and screen-reader-usable | **Implemented** | `docs/qa/accessibility.md` (36 screen × theme combos, 0 serious/critical; keyboard walkthrough). |
| 7.3a | GitHub Pages limits respected (1 GB, 10-minute deploy timeouts) | **Implemented** | Repo-size meter (600/900 MB), size budgets in `openspace check`. |
| 7.3b | Stores, member areas, password pages require the Cloudflare target; checkout on Stripe-hosted pages | **Implemented (dev-emulated)** | Studio enforces the target rule, checkout is Stripe-hosted, and the Cloudflare gated-page path is now wired end to end (F-2, F-3). That path has never run on real Cloudflare. |
| 7.3c | Private data (submissions, subscribers, members, orders, **gated content**) never in the repo | **Partial** | Hub data is in D1 and form uploads are in R2. Gated page content is sealed out of the repo (stubs carry `contentRef`; content in Hub R2). **Residuals:** images used only on gated pages remain publicly fetchable, and gated content committed before the fix stays in Git history. |
| 7.4a | No tracking cookies; analytics cookieless and aggregate | **Implemented** | Salted daily-rotating hash, no raw IP. |
| 7.4b | Location metadata stripped from every uploaded photo | **Implemented** | Studio pipeline; e2e EXIF check. Direct-API uploads to the Hub media route aren't re-stripped (Studio is the only uploader). |
| 7.4c | Hub stores the minimum; encrypted refresh tokens; full export and delete on request | **Implemented** | AES-GCM tokens; `/data/delete`, `/data/erase`, `/export`. |
| 7.4d | GitHub tokens short-lived with refresh; no long-lived tokens in browser storage | **Implemented (dev-emulated)** | Tokens stay in the Hub; Studio holds only the session cookie. |
| 7.5a | Published site keeps working if the Hub is down (form retry queue plus owner-email fallback) | **Implemented** | `packages/renderer/src/behaviors/form.ts` (queue, week-long retry, fallback). |
| 7.5b | Site builds with standard tools; Hub self-hostable from a one-click deploy | **Implemented** | `npx openspace eject`, "Deploy to Cloudflare" in `apps/docs/src/content/docs/self-hosting.md`. |
| 7.6a | Marginal cost per site < $0.002/month; within the $5 plan to ~5,000 sites | **Partial** | The architecture is designed for it (quotas `services/quotas.ts`, D1, sampled analytics, Cache API) but it's unmeasured. |
| 7.6b | Budget alerts at 80% of plan allowances | **Implemented (dev-emulated)** | Daily growth cron measures month-to-date requests, analytics events, emails and R2 storage, and at 80% of an allowance records a `budget_alerts` row (once per resource per month) and emails the operator, retrying a failed email next run (`apps/hub/src/operator-env.ts`, migration `0450`, `apps/docs/src/content/docs/operators/budget-and-abuse.md`). Usage is a lower bound from the Hub's own counters; it doesn't read Cloudflare billing. |

---

## Implementation plan §12 — "Squarespace parity" checklist

| Item | Status | Notes |
|---|---|---|
| Template quality: design partners rate ≥ 70% equal or better (blind comparison) | **Partial** | Templates meet the doc 04 §8 bar per `docs/qa/` (Lighthouse, axe, stress tests); the design-partner blind comparison hasn't been run. |
| Section-based editor with preset gallery | **Implemented** | |
| Grid layout with overlap and independent mobile layout | **Implemented** | |
| Site Styles: fonts, colors, section themes, buttons, spacing, animations | **Implemented** | |
| ~40 blocks covering Squarespace's common blocks | **Implemented** | 47 block types. |
| Header/footer builder, navigation with folders | **Implemented** | |
| Blog, events, portfolio, podcast collections with feeds | **Implemented** | Scheduled posts now go live through the cron-triggered publish (see §5.3). |
| Forms with inbox and notifications | **Implemented (dev-emulated)** | Turnstile site key now provisioned (F-5); file uploads built. |
| Newsletter list and email campaigns | **Implemented (dev-emulated)** | Per-site campaign volume cap with warm-up (`CAMPAIGN_DAILY_BASE` doubling per clean day up to `CAMPAIGN_DAILY_MAX`), auto-pause above 5% bounces or 0.3% complaints, and `ABUSE_EMAIL` in every campaign footer (M-10). |
| Pop-ups and announcement bar | **Implemented** | |
| Member areas (free and paid), password pages | **Partial** | See §5.7: gated-only images are still public, and previously committed gated content stays in Git history. Everything else is fixed. |
| Store: products, variants, inventory, cart, checkout, shipping, tax, discounts, subscriptions, digital products, donations | **Implemented (dev-emulated)** | Weight-based shipping and subscription products are built. |
| Scheduling (embed) | **Implemented** | |
| SEO suite, structured data, redirects, search | **Implemented** | |
| Analytics dashboard | **Implemented (dev-emulated)** | |
| Custom domains with HTTPS | **Implemented (dev-emulated)** | GitHub Pages target only. |
| Collaborators and roles | **Implemented** | |
| Version history and rollback; scheduled publishing | **Implemented** | |
| Mobile editing | **Implemented** | |
| Custom code and CSS for advanced users | **Implemented** | Site-wide and per-page head/footer injection. |
| Plus: ownership, zero fees, AI editing via the owner's agent, open source | **Implemented** | MIT packages, AGPL Studio/Hub, CC BY docs; Stripe Connect with no platform fee; MCP. |

---

## Not built from adjacent PRD sections (for completeness)

- **§9.3 abuse prevention:** Hub rate limits, Turnstile, verified sender domains, a reporting
  address (`ABUSE_EMAIL`, in every campaign footer) and campaign volume caps with warm-up and
  bounce/complaint auto-pause are done. There's no takedown tooling.
- **§10 success metrics:** none measurable before launch.
- **Known residuals:** images used only on gated pages remain publicly fetchable; git history
  retains gated content committed before the sealing fix; LCP margins are small (hearth 1.95 s,
  about 0.1 s noise).
- **Real external services:** GitHub App (now also needing the Variables permission), GitHub
  Actions OIDC, Cloudflare account API, R2 and Workers secrets, Stripe (Connect and sovereign),
  Cloudflare Email Service / Resend / Postmark, Turnstile, RDAP/DoH and Analytics Engine have real
  implementations that **have never run against the live services**. A credentialed smoke test of
  each is the first thing to do before launch. Existing Cloudflare sites also need the new
  workflow (update bot) before gated pages or secrets work, and migration `0452` must not have
  been applied remotely before its in-place edit.
