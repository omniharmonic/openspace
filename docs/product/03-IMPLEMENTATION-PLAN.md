# Commonplace — Implementation Plan

| | |
|---|---|
| **Author** | Benjamin Life (@omniharmonic) |
| **Status** | Draft v0.1 |
| **Date** | October 26, 2026 |
| **Reads with** | [01 — PRD](01-PRD.md) · [02 — Architecture](02-ARCHITECTURE.md) · [04 — Templates & Design System](04-TEMPLATES-AND-DESIGN-SYSTEM.md) |

---

## 1. Plan at a glance

Seven phases from spikes to full Squarespace parity and beyond. Each phase ends in something real people use.

| Phase | Name | Outcome | Weeks (funded) | Weeks (lean) |
|---|---|---|---|---|
| 0 | Foundations & spikes | Risky assumptions proven or replaced; ADRs final | 1–3 | 1–4 |
| 1 | MVP: "Live in three minutes" | Private beta — 6 templates, stack editor, forms, MCP, domains | 4–11 | 5–16 |
| 2 | Design parity | Grid sections, full block library, 12 templates, collaborators, updates — **public beta** | 12–18 | 17–27 |
| 3 | Content parity | Blog, events, portfolio, podcast, search, SEO suite, analytics | 19–23 | 28–34 |
| 4 | Growth parity | Cloudflare target, campaigns, members, pop-ups — **v1.0 public launch** | 24–29 | 35–43 |
| 5 | Commerce parity | Products, cart, Stripe checkout, shipping, tax, subscriptions — **v1.5** | 30–37 | 44–55 |
| 6 | Beyond parity | Importer, real-time co-editing, multilingual, native booking… | 38+ | 56+ |

**Funded** = 2 senior engineers + 1 product designer + Benjamin as product lead, all working with Claude Code agents. **Lean** = Benjamin directing agent swarms + a part-time contract designer + occasional senior-engineer review. Either way, Squarespace parity (end of Phase 5) lands in roughly 9 months funded or 13 months lean.

### 1.1 Critical path

```
S1 GitHub onboarding ─┐
S2 Editor shell ──────┼─► Studio core ─► Stack editor ─► MVP ─► Grid sections ─► Public beta
S3 Renderer ──────────┤                                    │
S4 Draft room ────────┘                                    └─► MCP v1
Templates (design) runs in parallel from week 2 and gates every milestone.
Cloudflare target (Phase 4) gates members and commerce.
```

The design track is on the critical path from day one. Hiring or contracting a strong product designer is the single highest-leverage early decision.

---

## 2. Phase 0 — Foundations & spikes (weeks 1–3)

### 2.1 Setup

- Monorepo (pnpm + Turborepo), TypeScript strict, Biome, Vitest, Playwright, Changesets.
- Licenses applied per package (MIT / AGPL-3.0 / CC BY 4.0), CONTRIBUTING, code of conduct, security policy.
- CI: lint, typecheck, unit tests, build all packages; preview deploys for Studio and Hub.
- Test GitHub org + test Cloudflare account for end-to-end runs.
- Register the GitHub App (dev and prod), Cloudflare Hub project, working domain.

### 2.2 Spikes

Each spike has a single question, a time box and a pass/fail criterion. Results get written as ADRs.

| Spike | Question | Pass criterion | Fallback |
|---|---|---|---|
| **S1** GitHub onboarding | Can one authorize-and-install flow create a repo in the user's account, give the App ongoing access to it, enable Pages and run the first build? | Fresh test account → live site in < 120s with ≤ 2 GitHub screens | Options 2–4 in architecture §6.3 |
| **S2** Editor shell | Can Puck host our page model with nested sections, an iframe canvas, inline Tiptap editing and a custom Grid section overlay with acceptable performance? | 40-section page; drag/resize at 60fps; typing latency < 50ms; no fidelity drift vs. production render | Own shell on dnd-kit + Zustand |
| **S3** Renderer | Do React blocks rendered via Astro with the image resolution pass produce zero-JS, Lighthouse-100 pages identical to the canvas? | Pixel diff < 0.1% canvas vs. build for 10 test pages; 0 KB React shipped | Render blocks as Astro components + separate canvas renderer (costly; avoid) |
| **S4** Draft room | Does a Durable Object op log + debounced commit flush give reliable autosave and multi-client sync? | 2 clients + 1 agent editing concurrently for 30 min; zero lost ops; commits ≤ 1 per 10s | Direct `createCommitOnBranch` from Studio, single-writer lock |
| **S5** MCP | Can Claude connect to a remote MCP on Workers with GitHub OAuth upstream and edit a page through validated ops? | Claude adds a section, restyles, and the change appears live in Studio | Local MCP via CLI first; remote MCP later |
| **S6** Build speed | What are cold and warm build times for a realistic image-heavy site? | 20 pages / 100 images: warm < 90s, cold < 4 min | Pre-generate variants in browser; reduce widths |
| **S7** Onboarding usability | Can non-technical people get through GitHub sign-up and our flow? | Clickable prototype, 5 participants, ≥ 4 succeed unaided | Redesign copy/flow; research the "no GitHub account" path earlier |

### 2.3 Exit gate

ADR-1 through ADR-13 confirmed or revised; any failed spike has a chosen fallback with re-estimated scope. Go/no-go meeting with the design partner group (see §9).

---

## 3. Phase 1 — MVP: "Live in three minutes" (weeks 4–11)

### 3.1 Scope

| Workstream | Deliverables |
|---|---|
| **A. Core packages** | `schema` (site, page, section, block, styles, collections stubs), `ops` (apply/invert/validate), `theme` (OKLCH palettes, contrast solver, 30 pairings, density/shape/buttons/motion compiler) |
| **B. Blocks + renderer** | 20 blocks: text, image, button, gallery (grid, carousel), video (lite), quote/testimonial, line, spacer, shape, form, newsletter signup, map, social links, accordion/FAQ, embed/code, logo strip, card, icon list, columns helper. Behaviors: carousel, lightbox, accordion, menu, form, reveal, video-lite |
| **C. site-kit + starter** | Astro integration, routes, token CSS, image pass, sitemap/robots, SEO meta, base-path handling, `publish.yml`, `commonplace check` |
| **D. Studio** | Dashboard, onboarding, canvas, Stack sections, preset gallery (~45 presets), block menu, design panel (tokens), Site Styles, pages & navigation, header/footer (preset variants), media library + in-browser pipeline, autosave, publish with summary, rollback, build status, mobile editing layout, first-run checklist |
| **E. Hub** | GitHub auth + token refresh, site creation, DraftRoom, publish/rollback, webhooks → build status, forms (Turnstile, inbox, notify, export), newsletter collection with double opt-in, transactional email |
| **F. MCP v1** | Remote MCP with GitHub OAuth, consent per site, read/write tools for pages/sections/blocks/styles/media, draft diff, publish with confirmation; `AGENTS.md` generation; local MCP in CLI |
| **G. Domains** | Custom domain wizard for GitHub Pages with DNS polling and HTTPS |
| **H. Templates** | Meadow, Harbor, Atelier, Ledger, Hearth, Signal — each with 3 looks, full demo content, licensed photography |
| **I. Web + docs** | Marketing site and template gallery (built with Commonplace), help center (getting started, domains, AI connection, FAQ) |

### 3.2 Milestones

- **M1.1 (end of week 6)** — Internal dogfood: create a site from a template, edit in Stack mode, publish, roll back. One template live.
- **M1.2 (end of week 9)** — Pilot: port 2–3 of Benjamin's existing Astro client sites (Boulder Feet Forward is a natural first candidate) and build two new sites with real owners. Forms and domains working. Claude edits via MCP.
- **M1.3 (end of week 11)** — Private beta with 25 invited owners (mix of Maya-type practitioners, small nonprofits, and Site Gardeners).

### 3.3 Acceptance criteria (MVP)

- A new person with no GitHub account reaches a live site in under 5 minutes (3 minutes with an account) in moderated tests, ≥ 8 of 10 unaided.
- Change photo + edit headline + add a section + publish: ≥ 9 of 10 unaided.
- All six templates pass the quality bar in doc 04 §8.
- Canvas vs. production pixel diff < 0.1% on the regression suite.
- Publish-to-live median < 90 seconds.
- Zero lost edits across 1,000 simulated sessions with network drops.
- Claude can build a five-section page from a one-paragraph brief through MCP, with the result passing Design check.
- Hub operating cost for beta < $10/month.

### 3.4 Dispatch-ready work breakdown (Phase 1)

Tickets sized for one agent or engineer, 1–4 days each. `→` marks dependencies.

**Core**
- `CORE-01` Schema: ids, responsive values, site/page/section/block types, JSON Schema export
- `CORE-02` Schema: rich text (ProseMirror subset) + Markdown converters → CORE-01
- `CORE-03` Ops: types, apply, invert, validate against schema → CORE-01
- `CORE-04` Ops: merge rules + property tests (commutativity on distinct ids) → CORE-03
- `CORE-05` Theme: OKLCH scale generator, neutral tinting, semantic roles
- `CORE-06` Theme: contrast solver + 5 section themes → CORE-05
- `CORE-07` Theme: type pairings registry (30), fluid scale, presets
- `CORE-08` Theme: density/shape/buttons/motion/image-treatment compilers → CORE-05
- `CORE-09` Theme: palette extraction from logo/photo

**Renderer & blocks**
- `REN-01` `defineBlock` API + registry + field types → CORE-01
- `REN-02` Page/section renderer (Stack mode), color-theme wrappers → REN-01, CORE-08
- `REN-03` Image resolution pass + `<Img>` with placeholders
- `REN-04` Behaviors runtime + carousel, lightbox, accordion, menu, form, reveal, video-lite
- `REN-05…REN-14` Blocks (two per ticket) → REN-01
- `REN-15` Visual regression matrix harness (blocks × variants × themes × breakpoints)

**site-kit**
- `KIT-01` Astro integration: content loaders, routes, token CSS → REN-02
- `KIT-02` Base-path + deploy config from `commonplace.json`
- `KIT-03` SEO meta, sitemap, robots
- `KIT-04` `commonplace check` (schema, links, budgets, secret scan)
- `KIT-05` Starter shell + `publish.yml` + `AGENTS.md` generator
- `KIT-06` Build-cache strategy + timing benchmarks

**Studio**
- `STU-01` App shell, routing, auth session (Hub), dashboard
- `STU-02` Onboarding flow (template gallery → create → building screen → editor)
- `STU-03` Canvas iframe + renderer mount + selection model → REN-02
- `STU-04` Editor shell integration (Puck or fallback per S2): outline, block menu, fields
- `STU-05` Inline text editing (Tiptap) bound to ops → CORE-02
- `STU-06` Section preset gallery (rendered in site styles)
- `STU-07` Design panel (token pickers, per-breakpoint overrides)
- `STU-08` Site Styles panel (palette, pairing, density, shape, buttons, motion) → CORE-05…08
- `STU-09` Pages & navigation manager
- `STU-10` Header/footer variants
- `STU-11` Media library + in-browser pipeline (resize, strip EXIF, placeholder, focal point)
- `STU-12` DraftRoom client (WebSocket, optimistic ops, offline queue) → HUB-04
- `STU-13` Undo/redo via inverted ops
- `STU-14` Publish flow, change summary, build status, rollback
- `STU-15` Mobile editing layout
- `STU-16` Forms inbox + newsletter list views
- `STU-17` Domain wizard UI → HUB-09
- `STU-18` "Connect your AI" settings + MCP grant management
- `STU-19` First-run checklist + empty states + help links

**Hub**
- `HUB-01` Worker skeleton (Hono), D1 schema + migrations, config, logging
- `HUB-02` GitHub App auth: authorize/install callback, token exchange, refresh, encryption → S1
- `HUB-03` Site creation pipeline (generate from template, personalize, enable Pages, dispatch)
- `HUB-04` DraftRoom Durable Object (op log, validation, broadcast, debounced commit flush)
- `HUB-05` Publish (squash to main), rollback, snapshot tags
- `HUB-06` GitHub webhooks: workflow_run → status; push → external-change refresh
- `HUB-07` Forms endpoint (HTML + fetch), Turnstile, rate limits, storage, notify, export
- `HUB-08` Newsletter signup + double opt-in + unsubscribe
- `HUB-09` Domain check service (RDAP, DoH polling), Pages domain API
- `HUB-10` Transactional email (Cloudflare Email Service) + templates
- `HUB-11` Quotas + abuse controls + audit log

**MCP**
- `MCP-01` OAuth provider + GitHub upstream + consent screen (per-site grants)
- `MCP-02` Read tools (sites, page, blocks, presets, styles) → REN-01
- `MCP-03` Write tools → ops into DraftRoom → HUB-04
- `MCP-04` Media upload tool (server-side pipeline)
- `MCP-05` Draft diff, publish with confirm, snapshots
- `MCP-06` Local MCP in CLI (stdio, file-based)
- `MCP-07` Agent evals: 20 scripted briefs scored on Design check + schema validity

**Templates (designer + agents)**
- `TPL-01` Section preset library v1 (~45)
- `TPL-02…07` One ticket per template (design, content, photography, looks, stress tests)
- `TPL-08` Template gallery thumbnails + live previews

---

## 4. Phase 2 — Design parity (weeks 12–18)

### 4.1 Scope

- **Grid sections**: 24/8-column grid, drag/resize/snap, smart guides, layering, keyboard nudging, bleed placement, auto mobile layout by reading order, independent mobile editing, optional tablet overrides, overlap accessibility lint.
- **Block library to ~40**: menu (restaurant), marquee, pricing table, team grid, stats, timeline, tabs, before/after, gallery (masonry, slideshow, strips), audio, booking embed (Cal.com/Calendly), link list.
- **Header & footer builder**: 8 header layouts, sticky/transparent options, mobile menu styles; footer as grid section.
- **Section backgrounds**: video embed backgrounds, gradients, parallax, overlays.
- **Animations**: motion presets per section/block.
- **Advanced**: custom CSS, page/site code injection, Code block hardening, font uploads.
- **Version history timeline** with thumbnails and named snapshots; **scheduled publishing**.
- **Collaborators & roles** (Owner/Designer/Editor/Contributor), section locking, approval queue for Contributors.
- **Update bot** + in-Studio update preview and apply.
- **Templates**: Field Notes, Encore, Kiln (catalog mode), Commons, Vow, Link; presets to ~90.
- **Design check** lint panel; template switching ("Try a new look").
- **Studio PWA** (installable, offline drafts); Site Gardener multi-site dashboard and ownership transfer.

### 4.2 Milestone

**M2 — Public beta (end of week 18).** Open signups with a waitlist throttle; Hub quotas enforced; status page live; security review of Studio, Hub and GitHub App complete.

### 4.3 Acceptance criteria

- Recreate 5 reference Squarespace sites (chosen by designers for layout complexity) using only Studio, matching layout at all three breakpoints to a designer's satisfaction.
- Grid editing: 60fps drag on a mid-range laptop; mobile auto-layout judged "acceptable without edits" on 8 of 10 test pages.
- An Editor-role collaborator cannot change locked layout or styles (Hub-enforced, tested).
- Update bot ships a minor `site-kit` release to all beta sites with < 1% failed builds.

---

## 5. Phase 3 — Content parity (weeks 19–23)

- **Collections**: blog (categories, tags, authors, featured posts, RSS/Atom, scheduled posts), events (recurrence, iCal, past/upcoming), portfolio/projects, podcast (Apple/Spotify-compatible RSS).
- **Post editor** with blocks (Markdoc), drafts, scheduling, Contributor submissions.
- **Summary blocks** (grid, list, carousel, wall) with filters.
- **Search** (Pagefind block + search page).
- **SEO suite**: per-page panel, structured data, generated social images, redirects manager, 404 page designer, SEO check in Design check.
- **Analytics dashboard** (cookieless): visits, pages, sources, devices, form conversions; weekly email digest (opt-in).
- **Chart block** (static SVG).

**M3 (end of week 23)** — A Field Notes-template newsletter writer and a Harbor nonprofit run fully on Commonplace, including blog, events and analytics.

**Acceptance**: feeds validate (W3C feed validator, Apple Podcasts checks); structured data validates in Google's Rich Results test; analytics within ±5% of a reference counter on test traffic.

---

## 6. Phase 4 — Growth parity (weeks 24–29)

- **Cloudflare deploy target**: guided account connection, Actions secrets via sealed box, `wrangler` deploy job, per-site R2 + D1 provisioning, domain migration, target switching.
- **Email campaigns**: block-based composer with email-safe rendering, sender connections (Cloudflare Email Service, Resend, Postmark, Amazon SES) with SPF/DKIM/DMARC verification, scheduling, segments by tag, one-click unsubscribe, bounce/complaint handling, basic stats.
- **Pop-ups and announcement bar** with triggers (time, scroll, exit intent on desktop) and frequency caps.
- **Members (free tiers)**: gated pages stored in owner's R2, magic-link login, member directory in Studio, password-protected pages.
- **Self-hosted video** and form file uploads on the Cloudflare target.

**M4 — v1.0 public launch (end of week 29).** Launch narrative: "Everything Squarespace does for content sites, free and yours." Includes the "Leave Squarespace" migration guide and a Site Gardeners directory.

**Acceptance**: a campaign to 2,000 test subscribers lands in inboxes (seed-list test ≥ 90% inbox placement on a verified domain); member gating holds under an adversarial test (no gated content reachable without a valid session, none present in the repo); switching a site between targets causes < 5 minutes of downtime.

---

## 7. Phase 5 — Commerce parity (weeks 30–37)

- **Stripe Connect** (Standard) onboarding from Studio; sovereign mode with owner's own keys on the site Worker.
- **Product collection**: variants (size/color), SKUs, images per variant, digital products, product page layouts, product presets and Kiln's full shop.
- **Inventory** in D1 with low-stock alerts; enforced at checkout.
- **Cart** behavior (drawer, quantity, persistence), **checkout** via Stripe Checkout with server-side price validation.
- **Shipping** (flat, by weight, free threshold, local pickup), **Stripe Tax** toggle, **discount codes** (Stripe promotion codes).
- **Subscriptions** and **paid membership tiers**; **donations** (one-time/recurring).
- **Orders dashboard**: filter, fulfill, packing slips, refunds; customer emails via Stripe receipts or owner's sender.
- **Digital delivery** via signed R2 links.

**M5 — v1.5 (end of week 37).** Three real shops live (including one migrated from Squarespace Commerce), with zero platform fees.

**Acceptance**: external penetration test of checkout and webhooks; price-tampering tests blocked; inventory consistent under 50 concurrent checkouts for the last unit; refunds and subscription cancellations reflected in Studio within 1 minute.

---

## 8. Phase 6 — Beyond parity (week 38 onward)

Prioritized by beta demand; candidate list:

- **Importer**: Squarespace export (WordPress-format XML for blog content) + public-site crawl, with the owner's agent mapping layouts to presets.
- **Real-time co-editing** (Yjs CRDT rich text inside DraftRoom), comments and @mentions on the canvas.
- **Multilingual sites** (per-locale content, hreflang, translation via owner's agent).
- **Native booking** (availability, Google Calendar free/busy via owner's connection, deposits).
- **Comments** (moderated, Hub-hosted) and **Instagram/social feed** block.
- **Abandoned cart recovery, gift cards, automations** (welcome series, post-purchase).
- **Courses** (members + lessons + progress).
- **Community template library** with designer credits.
- **"No GitHub account" path** research: community-org-held repos with later transfer, if S7 and beta data show GitHub sign-up is a major drop-off.
- **Google Sheets sync** for form entries via owner's connection.

---

## 9. How we work

### 9.1 Design partners

A standing group of 8–12 design partners from week 1: practitioners, small nonprofits, two shops (for later phases) and three Site Gardeners. They get early builds, attend monthly reviews, and their real sites are the pilot set.

### 9.2 Usability testing cadence

Every two weeks from Phase 1: five non-technical participants, moderated remote sessions on core tasks (onboard, edit, add section, change styles, publish, connect domain, connect AI). Findings become tickets before the next sprint. Metrics tracked against PRD §10.

### 9.3 Quality gates in CI

| Gate | Applies to | Threshold |
|---|---|---|
| Unit + property tests | packages | 100% pass; ops merge properties hold |
| Visual regression | blocks, presets, templates | No unapproved diffs |
| Canvas ↔ production fidelity | 30 fixture pages | Pixel diff < 0.1% |
| Lighthouse CI | template demos | Perf ≥ 95 mobile, A11y 100 |
| axe | template demos, Studio content flows | Zero serious/critical |
| Schema migrations | fixture sites at every past schemaVersion | Migrate + build succeeds |
| E2E onboarding | nightly against test GitHub org | Live site < 120s |
| Hub load test | weekly | p95 < 200ms at 10× beta traffic |
| Agent evals | MCP | ≥ 90% of briefs produce valid, Design-check-passing pages |

### 9.4 Release management

- Packages via Changesets; `next` channel for canaries; stable releases weekly.
- Hub deploys with gradual rollout (Workers versions + traffic split) and instant rollback.
- Studio deploys continuously behind feature flags; breaking schema changes only with migrations and a two-release deprecation window.

### 9.5 Security and privacy milestones

- Threat model review at the end of Phase 0.
- Internal security review before private beta (M1.3).
- External review of GitHub App + Hub auth before public beta (M2).
- Penetration test of members + commerce before v1.5 (M5).
- Data processing terms, privacy policy, and data export/delete tooling before public beta.

### 9.6 Working with agent swarms

- Each ticket in §3.4 includes: goal, files/packages touched, acceptance tests, and links to the relevant doc sections. Agents work in isolated branches; a human (or senior-review agent with the full architecture loaded) reviews every merge into `main`.
- Design work stays human-led: agents produce preset variations, stress-test renders and content drafts; the designer curates.
- Weekly integration day: run the full fixture suite, fix fidelity drift, update ADRs.

---

## 10. Budget

### 10.1 Infrastructure (stewards)

| Item | Monthly |
|---|---|
| Cloudflare Workers Paid (Hub) | $5 + usage (est. < $5 through v1.0) |
| Domains (product + Hub) | ~$3 |
| Error tracking / status page | $0 (self-hosted or free tiers) |
| Test accounts and CI | $0 (public-repo Actions) |
| **Total through v1.0** | **≈ $15/month** |

### 10.2 People (funded scenario, ~9 months to parity)

| Role | Allocation |
|---|---|
| Product lead (Benjamin) | Full time |
| Senior engineer — editor/Studio | Full time |
| Senior engineer — Hub/platform | Full time |
| Product designer — templates & Studio UX | Full time through Phase 2, then 50% |
| Photography / illustration licensing | One-time budget for 12 templates |
| Security reviews + pen test | Two engagements |

Agent usage (Claude Code) is a meaningful line item in both scenarios; it substitutes for roughly 1–2 additional engineers in throughput.

### 10.3 Sustainability

Funding paths that keep the software free: grants (open-source and digital public goods programs), voluntary contributions from sites, and a paid Site Gardeners services directory (people pay designers for setup; the software stays free). Revisit after M2 with real cost and usage data.

---

## 11. Risk register

| # | Risk | Likelihood | Impact | Mitigation | Trigger to act |
|---|---|---|---|---|---|
| R1 | GitHub sign-up deters normies | Medium | High | Guided sign-up; measure in S7 and beta | > 30% drop-off at GitHub step |
| R2 | App permission flow needs extra steps | Medium | Medium | S1 options; copywriting; fallback OAuth App | S1 fails pass criterion |
| R3 | Puck can't support Grid editing well | Medium | High | Own shell fallback; isolate via ops layer | S2 fails |
| R4 | Template quality short of Squarespace | Medium | Critical | Dedicated designer; review bar; design partners | Partners rate templates below their current site |
| R5 | Canvas/production drift | Low | High | Single renderer; fidelity CI | Any fidelity gate failure |
| R6 | Build times creep | Medium | Medium | Caching; budgets; incremental OG/images | p50 publish > 2 min |
| R7 | Hub costs exceed plan | Low | Medium | Quotas; sampling; D1 over KV; alerts | > 80% of allowances |
| R8 | Abuse (phishing/spam) | Medium | High | Turnstile; no credential fields; reporting; suspension | First confirmed abuse case → review |
| R9 | Platform policy change (GitHub/Cloudflare) | Low | High | Portable output; pluggable targets; self-host docs | Policy announcement |
| R10 | Email deliverability problems | Medium | Medium | Owner-owned senders; domain verification; caps | Inbox placement < 80% |
| R11 | Scope creep before parity | High | Medium | Phase gates; "beyond parity" backlog; partner prioritization | Phase slips > 2 weeks |
| R12 | Lean scenario capacity limits | Medium | High | Prioritize Phases 1–3; seek funding at M2 | Velocity < 60% of plan for 3 weeks |

---

## 12. Definition of "Squarespace parity" (checklist for M5)

- [ ] Template quality: design partners rate Commonplace templates equal to or better than their Squarespace sites (blind comparison, ≥ 70% prefer or equal)
- [ ] Section-based editor with preset gallery
- [ ] Grid layout with overlap and independent mobile layout
- [ ] Site Styles: fonts, colors, section themes, buttons, spacing, animations
- [ ] ~40 blocks covering Squarespace's common blocks
- [ ] Header/footer builder, navigation with folders
- [ ] Blog, events, portfolio, podcast collections with feeds
- [ ] Forms with inbox and notifications
- [ ] Newsletter list and email campaigns
- [ ] Pop-ups and announcement bar
- [ ] Member areas (free and paid), password pages
- [ ] Store: products, variants, inventory, cart, checkout, shipping, tax, discounts, subscriptions, digital products, donations
- [ ] Scheduling (embed)
- [ ] SEO suite, structured data, redirects, search
- [ ] Analytics dashboard
- [ ] Custom domains with HTTPS
- [ ] Collaborators and roles
- [ ] Version history and rollback; scheduled publishing
- [ ] Mobile editing
- [ ] Custom code and CSS for advanced users
- [ ] **Plus**: ownership, zero fees, AI editing via the owner's agent, open source

---

## 13. First two weeks — concrete next steps

1. Lock the working name and register domains.
2. Create the monorepo and the dev GitHub App; open the test org and test Cloudflare account.
3. Run S1 and S3 in parallel (agents), S2 with a senior engineer or a focused agent pair, S7 with the designer.
4. Recruit 8–12 design partners; pick the 2–3 pilot sites to port.
5. Brief or hire the product designer; start Meadow and Harbor as the first two templates.
6. Write ADRs as spikes conclude; hold the Phase 0 exit gate at the end of week 3.

---

*Prepared by Benjamin Life (@omniharmonic).*
