# Commonplace — Product Requirements Document

**Squarespace-quality websites you own, for free.**

| | |
|---|---|
| **Author** | Benjamin Life (@omniharmonic) |
| **Status** | Draft v0.1 — for review |
| **Date** | October 26, 2026 |
| **Working name** | "Commonplace" (placeholder — check trademark and domain availability before public use) |
| **Companion docs** | [02 — Technical Architecture](02-ARCHITECTURE.md) · [03 — Implementation Plan](03-IMPLEMENTATION-PLAN.md) · [04 — Templates & Design System](04-TEMPLATES-AND-DESIGN-SYSTEM.md) |

---

## 1. Summary

Commonplace is an open-source website builder that gives non-technical people the Squarespace experience — exquisite templates, a drag-and-drop block editor, blogs, forms, newsletters, members, scheduling and a store — without the subscription. A person signs in with GitHub, picks a template, and has a live site in about three minutes. From then on they edit it visually, in a browser on any device, or by asking their own AI agent (Claude, through an MCP connector) to make changes.

Every site is a normal code repository in the person's own GitHub account, built with Astro and served free by GitHub Pages (or by their own free Cloudflare account for stores and member sites). The project's own infrastructure is a single small "Hub" service on Cloudflare's free and near-free tiers, so the cost of serving one more person rounds to zero. That's what makes "free forever" a structural property rather than a promotional one.

The bet: in 2026, the parts that used to justify a $16–$52/month subscription — hosting, a CDN, an editor, a design system, AI help — are either free commodities or open-source components. What's missing is the integration and the design quality. Commonplace is that integration.

---

## 2. Why now, and why this

### 2.1 The problem

**Website builders charge rent on commodities.** Squarespace plans run from roughly $16/month (annual) to $52/month, with a transaction fee on the lower commerce tier and separate subscriptions for Email Campaigns, Acuity Scheduling and Member Areas. A small nonprofit with a newsletter and a donate button easily pays $400+ a year, indefinitely, for what is mostly static hosting plus a form.

**Lock-in is the business model.** A Squarespace site can't be meaningfully exported. Stop paying and the site disappears. Your design work, your content structure and your audience list live in someone else's database.

**The DIY alternative is great for builders and bad for owners.** Benjamin's current practice — Astro on GitHub Pages with a Git-based CMS — produces fast, free, owned sites. But:

- The editing UX is a form-over-a-file experience, nothing like a visual canvas.
- Design changes require a developer (or Claude) every time.
- Handoff to a client is fragile: they need a GitHub account, have to learn a CMS, and can't touch layout.
- Each site is a one-off; improvements don't flow between sites.

### 2.2 What changed

- **Free static hosting is mature.** GitHub Pages and Cloudflare serve static sites globally at no cost.
- **Open-source visual editors exist.** Puck (MIT) provides a React drag-and-drop editor; Webstudio (AGPL), Onlook (Apache-2.0) and GrapesJS prove the patterns.
- **Astro is the content-site standard** and is now backed by Cloudflare (acquired January 2026, Astro 6 released March 2026).
- **AI agents can edit structured data safely.** With MCP, a person's own Claude can make design changes through a schema-constrained API, so the project never pays for inference.
- **Edge platforms make shared services nearly free.** A Cloudflare Worker with D1, R2 and KV can handle forms, newsletters, members and checkout for thousands of sites on a $5/month plan.

### 2.3 Product principles

1. **You own it.** Your site lives in your GitHub account, under your name, in open formats. Leave anytime with everything.
2. **Free forever — by architecture.** No per-site servers. Hosting, builds and storage run on the owner's free accounts. The shared Hub is designed to cost the stewards cents per thousand sites.
3. **As easy as Squarespace.** A person who has never heard of Git should succeed without ever seeing the word. Measured, not assumed (see §10).
4. **Beautiful by default, hard to make ugly.** Constrained design tokens, curated presets and accessible color systems mean every combination looks intentional.
5. **AI-native, AI-optional.** Everything is editable by hand. Everything is also editable by the person's own agent through a safe, typed API.
6. **Open and forkable.** All code is open source. Anyone can self-host the editor and Hub. No single point of failure — including us.
7. **Static first, dynamic where it earns it.** Pages are pre-built HTML with near-zero JavaScript. Dynamic features (forms, checkout, members) are small, isolated services.

---

## 3. Who it's for

### 3.1 Personas

**Maya — the solo practitioner (primary).** Yoga teacher, therapist, photographer or consultant. Edits mostly from her phone. Needs a gorgeous site, a booking link, a contact form and a monthly newsletter. Currently pays Squarespace about $33/month and resents it. Has never used GitHub. *Success:* she launches on her own in one sitting and edits weekly without help.

**The Riverbend Collective — community org / nonprofit (primary).** Run by rotating volunteers. Needs events, a blog, a donate button, volunteer sign-up forms and several editors with different levels of access. Budget is near zero. *Success:* a new volunteer can update the events page within 10 minutes of being invited.

**Jonah — the maker shop (secondary, Phase 5).** Sells ceramics and digital patterns. Needs products with variants, inventory, shipping, taxes and discount codes. *Success:* he moves his store off Squarespace and keeps the 3% transaction fee.

**The Site Gardener — builder for others (primary design partner).** A technical non-developer (Benjamin is the archetype) who builds sites for clients and community groups. Needs a multi-site dashboard, a fast way to start from a template, client handoff, and "design mode" precision. *Success:* builds a client site in an afternoon and hands it off with confidence the client won't break it.

**Template designers and developers (ecosystem).** Designers who create templates and section presets; developers who add blocks. *Success:* a designer can publish a template without writing React; a developer can add a block in under a day.

### 3.2 Jobs to be done

- *When I need a website for my practice,* I want something beautiful live today, so I look credible without hiring anyone.
- *When something on my site changes* (new class, price, photo), I want to fix it from my phone in a minute.
- *When I want a different look,* I want to try it safely and undo it if I hate it.
- *When I'm building for someone else,* I want to hand it off so they can edit content but not wreck the design.
- *When I want my AI to help,* I want to say "make the hero feel warmer and add a testimonials section" and watch it happen — and approve it before it goes live.
- *When I want to leave,* I want to take everything with me, working.

---

## 4. The experience

### 4.1 Onboarding — live in three minutes

1. **Landing page** → "Make your site — free". Template gallery visible immediately, no account needed to browse or preview.
2. **Pick a template**, optionally type a site name and one line about what you do. (Optional: "Start from my existing site" — paste a URL for the importer, Phase 6.)
3. **Sign in with GitHub.** If the person has no account, an inline explainer ("GitHub is a free, safe place where your site's files live. You own them.") and a guided sign-up that returns them to the same step.
4. **One authorization screen** (the Commonplace GitHub App).
5. **"Building your site…"** — an animated progress screen while the Hub creates the repository from the template, writes the person's name and tagline in, enables Pages and triggers the first build (target: under 90 seconds).
6. **Land in the editor** with the site loaded and a celebratory "Your site is live at name.github.io/site" with a copy/share button.
7. **First-run checklist** (dismissible): replace the logo · change the main photo · edit the headline · connect your domain · connect your AI.

No moment in this flow says "repository," "commit," "branch," "build" or "deploy." The Settings → Advanced page exposes those for people who want them.

### 4.2 Editing

The editor ("Studio") opens to the homepage in a live canvas.

- **Click anything to edit it.** Text edits inline. Images open a media picker. Any block shows a floating toolbar (style, duplicate, move, delete, ask AI).
- **Add a section** between any two sections: a gallery of *section presets* (hero, about, services, testimonials, gallery, pricing, FAQ, contact…) rendered in the site's current style, not generic thumbnails.
- **Add a block** inside a section: searchable block menu.
- **Layout modes per section:**
  - *Stack* — blocks flow top to bottom in columns. Can't be misaligned. The default for most sections.
  - *Grid* (Fluid-Engine-style) — a 24-column desktop / 8-column mobile grid. Drag, resize, overlap and layer blocks; independent mobile arrangement.
- **Design panel** (right side) for the selected block or section: spacing, alignment, color theme, typography preset, background, borders, effects and animation — all as token pickers first, with an "exact value" escape hatch.
- **Device preview** toggles desktop / tablet / mobile, with per-breakpoint overrides clearly marked.
- **Site Styles** (global): fonts, color palette and section color themes, button styles, spacing density, corner radius, image treatments, animations. Changing them updates every page live.
- **Undo/redo** without limit within a session; **full version history** forever (it's Git underneath), presented as a timeline of named snapshots ("Before Claude's changes", "Published Oct 26, 4:12pm").

### 4.3 Saving and publishing

- **Autosave, always.** Edits save locally instantly and sync to the cloud draft within seconds.
- **Drafts are private-in-practice.** The live site doesn't change until Publish.
- **Publish button** with a summary of what changed ("3 pages edited, 2 images added"). Live within ~1 minute; a progress pill shows status and a link when done.
- **Schedule publish** for a date and time (Phase 2).
- **Roll back** to any previous published version in one click.

### 4.4 AI — "Connect your AI"

A Settings tab gives the person a connector URL to paste into Claude (or any MCP-capable agent). After a one-time GitHub sign-in, their agent can read and edit the site through typed tools: add pages and sections, edit text, restyle, upload images, manage blog posts, and publish (with confirmation).

- **Agent edits land in the draft**, and Studio shows them live as they happen ("Claude is editing *Home*…") with an Accept / Undo banner.
- **Schema-constrained.** The agent can't write arbitrary HTML into a template block, so it can't break layouts. A code block exists for deliberate custom code.
- **Free to the project.** The person brings their own AI. Commonplace never pays for inference. A site also ships an `AGENTS.md` so coding agents (Claude Code and others) understand its structure without the Hub.

### 4.5 Collaboration and handoff

- **Invite by email or GitHub username** with roles: *Owner*, *Designer* (everything), *Editor* (content only — can't change layout or styles), *Contributor* (blog posts and events as drafts for approval).
- **Locked sections** — a designer can lock layout so editors only change text and images.
- **Site Gardener dashboard** — all sites you manage, their status, pending updates and form inbox counts. "Transfer ownership" moves the repo to the client's account with one confirmation.

### 4.6 Where things live, in plain language

Settings → "Your site's home" explains: *Your site's files are stored in your GitHub account (link). Your site is published by GitHub Pages / Cloudflare (link). Your form entries, subscribers and orders are kept by the Commonplace Hub (export anytime). You can leave and keep everything.*

---

## 5. Squarespace parity map

Phase key: **P1** MVP · **P2** Design parity · **P3** Content parity · **P4** Growth parity · **P5** Commerce parity · **P6** Beyond parity. "Static" means built into HTML at publish time; "Hub" means the shared service; "Integration" means a third-party free tier the person connects.

### 5.1 Editor and design

| Squarespace capability | Commonplace approach | How | Phase |
|---|---|---|---|
| Templates | 6 at MVP, 12 at P2, community library at P6 — see doc 04 | Static | P1–P2 |
| Section-based page building | Sections with preset gallery rendered in site style | Static | P1 |
| Fluid Engine grid (24-col desktop / 8-col mobile, overlap, independent mobile layout, pinned blocks) | *Grid* section layout with the same grid model, layering, per-breakpoint placement | Static | P2 |
| Classic stacked layout | *Stack* section layout (columns, safe defaults) | Static | P1 |
| Site Styles (fonts, colors, buttons, spacing, animations) | Token-based Site Styles; 30+ curated font pairings; generated accessible palettes | Static | P1 (core) / P2 (full) |
| Section color themes | Light / Light accent / Dark / Dark accent / Brand themes, generated from palette | Static | P1 |
| Section backgrounds (image, video, color) | Image with focal point, color, gradient, video (embed or self-hosted on Cloudflare target), parallax | Static | P1 / P2 |
| Header and footer builder | Header layouts (8 presets), sticky / transparent-on-hero, mobile menu styles; footer as a Grid section | Static | P1 / P2 |
| Mobile editing | Device preview, per-breakpoint overrides, Grid mobile layout | Static | P1 / P2 |
| Animations | Entrance, scroll and hover animations (CSS-only, respects reduced motion) | Static | P2 |
| Custom CSS / code injection | Advanced → Custom CSS, per-page head/footer injection, Code block | Static | P2 |
| Page management (nav, folders, hidden pages, page password) | Navigation editor, folders, unlisted pages; password pages on Cloudflare target only (§7.3) | Static / Hub | P1 / P4 |
| Version history | Named snapshots + one-click rollback (Git) | Repo | P1 (rollback) / P2 (timeline UI) |
| Scheduled publishing | Publish at time (Hub scheduler) | Hub | P2 |
| Multiple contributors and roles | Owner / Designer / Editor / Contributor + section locking | Repo + Hub | P2 |
| Image editing | Crop, focal point, filters, alt text (AI-suggested via the person's agent) | Studio | P1 / P2 |
| Font uploads | Upload licensed fonts; Google / Fontsource catalog | Static | P2 |

### 5.2 Blocks

Squarespace's block menu, mapped. The MVP set (P1) covers about 80% of real sites.

| Block | Phase | Notes |
|---|---|---|
| Text (rich text: headings, lists, links, quotes) | P1 | Inline editing with typography presets |
| Image (with caption, link, lightbox) | P1 | Responsive `<picture>`, focal point |
| Button | P1 | Uses global button styles (primary / secondary / tertiary) |
| Gallery — grid, masonry, slideshow, carousel, strips | P1 (grid, carousel) / P2 (rest) | Lightbox; CSS scroll-snap carousels |
| Video (YouTube, Vimeo, PeerTube, self-hosted) | P1 / P4 | Lite embeds (no third-party JS until click) |
| Audio / podcast episode | P3 | |
| Quote / testimonial | P1 | |
| Line, spacer, shape | P1 | Shapes as SVG with token colors |
| Form (custom fields, file upload) | P1 (fields) / P4 (uploads) | Hub storage, spam protection, email notify |
| Newsletter signup | P1 (collect) / P4 (campaigns) | Hub |
| Map | P1 | OpenStreetMap static tiles + "Open in Maps" link; no API key |
| Social links / share buttons | P1 | |
| Accordion / FAQ | P1 | `<details>` with schema.org FAQ |
| Embed / Code | P1 | Sandboxed in editor canvas |
| Summary (list of posts / events / products / projects) | P3 | Grid, list, carousel, wall layouts |
| Menu (restaurant) | P2 | Sections, prices, dietary tags |
| Calendar / events list | P3 | |
| Scrolling text (marquee) | P2 | |
| Logo strip / press | P1 | |
| Pricing table | P2 | |
| Team / people grid | P2 | |
| Stats / numbers | P2 | |
| Timeline | P2 | |
| Tabs | P2 | |
| Before/after image | P2 | |
| Search | P3 | Pagefind (static, no server) |
| Scheduling / booking | P2 (embed) / P6 (native) | Cal.com embed; Calendly also supported |
| Product / Add to cart | P5 | |
| Donation | P4 (link) / P5 (native) | |
| Member login / gated content | P4 | Cloudflare target |
| Chart | P3 | Static SVG from a small table |
| Instagram / social feed | P6 | Owner-authorized feed fetch at build time |
| Course / lesson | P6 | Members + video |

### 5.3 Content collections

| Capability | Approach | Phase |
|---|---|---|
| Blog: categories, tags, authors, excerpts, featured image, RSS, scheduled posts | Markdown + frontmatter collection; post editor with blocks | P3 |
| Comments | Opt-in: lightweight Hub comments with moderation; or Giscus for technical audiences | P6 |
| Events: dates, recurrence, location, ticket/RSVP link, .ics, past/upcoming | Collection + ICS feed generated at build | P3 |
| Portfolio / projects | Collection with project-page layouts | P3 |
| Podcast (RSS with Apple/Spotify tags) | Collection + feed generation; audio hosted on Cloudflare R2 (Cloudflare target) or external | P3 |
| Products | Collection (public catalog) + Hub (inventory, orders) | P5 |
| Courses | Members + ordered lessons | P6 |

### 5.4 SEO, performance, accessibility

| Capability | Approach | Phase |
|---|---|---|
| Page titles, descriptions, social images | Per-page SEO panel; AI suggestions via agent | P1 |
| Auto social share images | Generated at build from page title + site style | P3 |
| Sitemap, robots.txt, canonical URLs | Generated | P1 |
| Structured data (Organization, LocalBusiness, Article, Event, Product, FAQ) | Generated from content | P3 |
| URL redirects | Redirect manager (static HTML redirects on Pages; real 301s on Cloudflare) | P3 |
| Performance | Lighthouse ≥ 95 on every template (CI-enforced) | P1 |
| Accessibility | WCAG 2.2 AA on every template and block; contrast-safe color system; alt-text prompts | P1 |

### 5.5 Marketing and growth

| Capability | Approach | Phase |
|---|---|---|
| Forms with inbox, notifications, CSV export | Hub | P1 |
| Newsletter list (double opt-in, tags, import/export) | Hub | P1 (collect) |
| Email campaigns designed with site blocks, scheduling, basic stats | Hub + person's verified domain | P4 |
| Automations (welcome email, post-purchase) | Hub | P6 |
| Pop-ups and announcement bar | Static + small script | P4 |
| Analytics (visits, pages, referrers, devices) | Privacy-first, cookieless Hub analytics | P3 |
| Social sharing / link-in-bio page | Link-in-bio template + page type | P2 |

### 5.6 Commerce (Cloudflare target required)

| Capability | Approach | Phase |
|---|---|---|
| Physical and digital products, variants, images | Product collection | P5 |
| Inventory and stock alerts | Hub (D1) | P5 |
| Cart and checkout | Small cart island + Stripe Checkout on the owner's Stripe account (Stripe Connect, **no platform fee**) | P5 |
| Shipping rates (flat, weight, free threshold, local pickup) | Settings → Stripe shipping options | P5 |
| Taxes | Stripe Tax (owner opts in; Stripe charges its fee) | P5 |
| Discount codes | Stripe promotion codes | P5 |
| Subscriptions | Stripe Billing | P5 |
| Donations (one-time, recurring) | Stripe | P5 |
| Orders dashboard, fulfillment, refunds | Hub + Stripe | P5 |
| Abandoned cart recovery | Hub + email | P6 |
| Gift cards | P6 | P6 |
| Point of sale | Out of scope (Stripe Terminal is the owner's choice) | — |

### 5.7 Services, domains and accounts

| Capability | Approach | Phase |
|---|---|---|
| Free subdomain | `name.github.io/site` or `site.pages.dev` / `workers.dev` | P1 |
| Custom domain | Guided wizard with live DNS checking and HTTPS | P1 |
| Domain purchase | Not sold; wizard recommends at-cost registrars | P1 |
| Professional email | Out of scope; guide for free forwarding (Cloudflare Email Routing) | P2 (guide) |
| Scheduling | Cal.com / Calendly embed; native lightweight booking later | P2 / P6 |
| Member areas (free and paid tiers) | Magic-link login, gated pages, Stripe for paid tiers | P4 / P5 |
| Mobile app | Studio is a responsive PWA; installable | P2 |
| Import from Squarespace / WordPress | Content import (WordPress XML from Squarespace export) + AI-assisted layout rebuild | P6 |
| Export | It's already yours: download repo ZIP; export subscribers, entries, orders as CSV | P1 |

### 5.8 Deliberate differences from Squarespace

- **Ownership & portability** (Squarespace has none).
- **AI via your own agent** rather than a built-in, metered AI.
- **No transaction fees, no add-on subscriptions.**
- **Faster sites** — static HTML with near-zero JavaScript.
- **Open template ecosystem** — anyone can contribute.

---

## 6. Functional requirements (MVP detail)

### 6.1 Accounts and sites

- **FR-1** Sign in with GitHub through the Commonplace GitHub App. Session lasts 30 days with silent token refresh.
- **FR-2** Create a site from a template: name, optional tagline, deploy target (default GitHub Pages). Creates a public repo in the person's account, enables Pages, triggers first build.
- **FR-3** Dashboard lists all sites the person owns or collaborates on, with live/building/failed status.
- **FR-4** Delete a site (archives repo after typed confirmation; Hub data retained 30 days, then purged).
- **FR-5** Plain-language explanation that the repo is public and anything on the site is public anyway; never store private data in site content (enforced by design — private data goes to the Hub).

### 6.2 Editor

- **FR-10** Canvas renders the site's actual components (identical output to the published site) inside an isolated frame.
- **FR-11** Add, reorder, duplicate, hide and delete sections; insert from preset gallery.
- **FR-12** Add blocks from a searchable menu; edit fields inline or in the side panel.
- **FR-13** Stack layout with 1–4 columns and per-breakpoint stacking order.
- **FR-14** Design panel with token pickers for spacing, color theme, typography preset, alignment, background, border, radius, shadow; "exact value" escape hatch (Designer role only).
- **FR-15** Device preview (desktop 1440, tablet 834, mobile 390) with per-breakpoint overrides indicated by a dot.
- **FR-16** Site Styles: font pairing, palette (from brand color or image), button style, density, radius.
- **FR-17** Pages: add from page template, rename, set URL, set SEO fields, reorder nav, nest in folders, hide from nav.
- **FR-18** Media library: upload (drag, paste, camera on mobile), auto-resize and strip location metadata before upload, alt text, focal point, usage tracking, repo-size meter.
- **FR-19** Undo/redo (session) and rollback to any published version.
- **FR-20** Autosave (local instantly; cloud draft within 10 seconds of idle).
- **FR-21** Publish with change summary; build status; notification on completion or failure with plain-language error and "Fix it for me" (auto-revert of the breaking change).
- **FR-22** Works on a phone: all content editing, section add/reorder and publish. (Grid layout editing is desktop/tablet only; mobile shows a simplified reorder view.)

### 6.3 Forms and newsletter (MVP)

- **FR-30** Form block with field types: text, email, phone, long text, select, checkbox, radio, date; required/optional; success message or redirect.
- **FR-31** Spam protection (Cloudflare Turnstile, invisible by default) and per-site rate limits.
- **FR-32** Submissions inbox in Studio; email notification to owner; CSV export; delete; 12-month default retention (configurable).
- **FR-33** Newsletter signup block storing double-opt-in subscribers; export CSV.

### 6.4 AI connector (MVP)

- **FR-40** Settings → "Connect your AI" gives a personal MCP URL and step-by-step instructions for Claude (with screenshots).
- **FR-41** MCP tools: read site structure, read page, edit text, add/move/remove sections and blocks, apply styles, manage pages, upload image from URL, create blog post, preview, publish (requires explicit confirmation parameter).
- **FR-42** Agent edits write to the draft; Studio shows them live with an Accept/Undo banner.
- **FR-43** Every repo includes `AGENTS.md` describing schema, conventions and safe-edit rules.

### 6.5 Domains

- **FR-50** Custom domain wizard: detect registrar from WHOIS/RDAP where possible, show exact records to add with registrar-specific screenshots for the top 8 registrars, poll DNS until correct, enable HTTPS, confirm.
- **FR-51** Apex + `www` handling with redirect.

---

## 7. Non-functional requirements

### 7.1 Performance

- Published pages: Lighthouse Performance ≥ 95 on mobile for every template with its demo content; LCP < 2.0s on 4G; total JS < 30 KB on content pages (excluding embeds the owner adds).
- Studio: first load < 3s on mid-range laptop; interaction latency < 50ms for typing; canvas updates < 100ms after a style change.
- Time to first live site: median < 3 minutes from landing page; publish-to-live median < 90 seconds.

### 7.2 Accessibility

- Templates and blocks meet WCAG 2.2 AA. The color system cannot produce text/background pairs below 4.5:1 without an explicit override with a warning.
- Studio itself is keyboard-navigable and screen-reader-usable for content editing.

### 7.3 Platform constraints that shape the product

- **GitHub Pages** is free for **public** repositories (private requires a paid GitHub plan), caps published sites at 1 GB, has a 100 GB/month soft bandwidth limit, and times out deployments after 10 minutes.
- **GitHub Pages' terms prohibit using it primarily for e-commerce or commercial transactions, and say Pages sites shouldn't handle sensitive transactions like passwords or card numbers.** Therefore: content sites (portfolios, practices, nonprofits, blogs, small-business brochure sites) publish to GitHub Pages; **stores, member areas and password-protected pages require the Cloudflare deploy target** (the person's own free Cloudflare account, connected through a guided flow). Checkout always happens on Stripe-hosted pages.
- **Public repos mean public source.** Site content is public anyway; private data (submissions, subscribers, members, orders, gated content) never goes in the repo — it lives in the Hub or the owner's Cloudflare storage.

### 7.4 Privacy and security

- No tracking cookies on published sites by default. Analytics are cookieless and aggregate.
- Location metadata stripped from every uploaded photo.
- Hub stores the minimum: encrypted GitHub refresh tokens, form entries, subscribers, members, orders. Full export and delete on request.
- GitHub tokens are short-lived (8-hour access tokens with refresh); the editor never stores long-lived tokens in browser storage.

### 7.5 Reliability

- A published site keeps working if the Hub is down (forms queue a client-side retry and show a friendly fallback with the owner's email).
- A published site keeps working if Commonplace the project disappears entirely: the repo builds with standard tools; the Hub is self-hostable from a one-click deploy.

### 7.6 Cost ceiling

- Marginal cost per site to the stewards: < $0.002/month at the median (forms + analytics + auth). The Hub must remain within Cloudflare's Workers Paid base plan ($5/month) up to ~5,000 active sites. Budget alerts at 80% of plan allowances.

---

## 8. Scope boundaries

**In scope:** content websites, blogs, portfolios, small stores, member areas, newsletters, forms, bookings via embed, AI editing via MCP.

**Out of scope (explicitly):**

- Running arbitrary server code per site (no per-site backends).
- Selling domains or email inboxes.
- Hosting large video libraries (embed instead; small self-hosted clips on the Cloudflare target).
- A built-in metered AI model.
- Private repositories as the default (possible for people with GitHub Pro, but not supported in the MVP).
- Webflow-level arbitrary CSS for everyone — precision is available to the Designer role through tokens plus exact values, not raw class editing.

---

## 9. Ecosystem, governance and sustainability

### 9.1 Licensing

| Component | License | Why |
|---|---|---|
| Block library, templates, schema, site starter | MIT | Maximize adoption; sites must be freely forkable |
| Studio (editor) and Hub | AGPL-3.0 | Keep improvements to the commons when others host it |
| Documentation and template designs | CC BY 4.0 | Remixable with attribution |

(Third-party: Puck core is MIT — compatible. Avoid copying Webstudio's AGPL code into MIT packages.)

### 9.2 Stewardship

- The public Hub is operated by a small stewarding group. Costs are tiny but nonzero; fund through voluntary contributions, grants, and an optional "Site Gardeners" directory where designers offer paid setup services (the software stays free).
- Template contributions go through a design review (quality bar in doc 04).
- Anyone can run their own Hub. Studio is configurable to point at any Hub; a site's config names its Hub.

### 9.3 Abuse prevention

Phishing kits and spam sites are the main risk for any free builder. Mitigations: GitHub's own account and Pages policies apply; Hub rate limits and Turnstile on forms; a reporting address; takedown of Hub services (forms, email) for abusive sites; campaign sending requires a verified custom domain and starts with low volume caps.

---

## 10. Success metrics

| Metric | Target (6 months after public launch) |
|---|---|
| Median time from landing to live site | < 3 minutes |
| Onboarding completion (template picked → site live) | > 75% |
| Unassisted first edit published within 24 hours | > 60% of new sites |
| Usability test: non-technical participant completes "change photo, edit headline, add section, publish" without help | 9 of 10 participants |
| Templates passing Lighthouse ≥ 95 and axe zero serious issues | 100% |
| Active sites (published in last 90 days) | 2,000 |
| Hub cost per active site | < $0.002/month |
| Sites migrated from Squarespace | 200 |
| Community-contributed templates accepted | 10 |

---

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| GitHub account creation is a step too far for some normies | Onboarding drop-off | Inline guided sign-up; measure; Phase 6 option of a "managed account" path via a community GitHub org with later transfer |
| GitHub Pages terms exclude commerce | Store users can't use the default target | Cloudflare deploy target for transactional sites from Phase 4 |
| GitHub App permission model can't create repos the app can then access in one step | Onboarding friction | Phase 0 spike; fallback flows documented in doc 02 §6.3 |
| Template design quality falls short of Squarespace | Product fails its core promise | Hire/partner with a design lead; templates are a first-class deliverable with a review bar |
| Visual editor fidelity vs. published output drifts | Trust erodes | One component library renders both canvas and production; visual regression tests on every block |
| Build times grow with image-heavy sites | Slow publish | Build cache, image-processing cache, size budgets, incremental builds |
| Hub costs grow faster than expected | "Free" at risk | Per-site quotas, efficient storage choices (D1 over KV for writes), self-host option, budget alerts |
| Platform dependency (GitHub, Cloudflare) | Policy changes | Portable output (static HTML), pluggable deploy targets, documented migration to other Git hosts |
| Agent edits cause damage | Broken sites | Draft-only writes, schema validation, auto-snapshot before each agent session, one-click undo |

---

## 12. Open questions

1. Final product name and domain.
2. Do we offer a "no GitHub account" path for the least technical users (community-org-held repos, transferred later)? Legal and ownership implications to work through.
3. Which organization stewards the public Hub, and under what governance?
4. Is Stripe the only payment processor at launch, or do we add PayPal / Square early for regions Stripe doesn't serve?
5. Should Contributor-role edits use GitHub pull requests visible to technical owners, or stay inside the Hub's approval queue?
6. How do we handle fonts with restrictive licenses that people want to upload?

---

*Prepared by Benjamin Life (@omniharmonic).*
