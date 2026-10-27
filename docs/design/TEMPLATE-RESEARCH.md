# Template & section library research (templates v2)

| | |
|---|---|
| **Status** | Research + build plan, October 27, 2026 |
| **Reads with** | [04 — Templates & Design System](../product/04-TEMPLATES-AND-DESIGN-SYSTEM.md) · [01 — PRD §4–5](../product/01-PRD.md) |
| **Scope** | Section presets (`packages/blocks/src/presets`), templates (`templates/*`), Studio's Add section gallery |

We studied how the leading builders and component libraries organise their templates and
section libraries, what separates "premium" from "templated", and where our library falls short.
**We learn patterns, never designs:** no layout, copy or imagery below is taken from a specific
template; every OpenSpace preset is composed from our own blocks, tokens and demo businesses.

---

## 1. What the market offers

### 1.1 Section libraries

| Library | Organisation | Scale (approx.) | Notes |
|---|---|---|---|
| **Squarespace 7.1 / Fluid Engine** | "Add section" panel: pre-built sections by category in a left rail, plus *Saved* sections (heart icon) and a *View Layouts* switcher that re-flows an existing section's blocks into suggested layouts ([Squarespace help](https://support.squarespace.com/hc/en-us/articles/360027987711-Adding-sections-to-pages)) | ~26 auto-layout list presets alone ([Will Myers](https://www.will-myers.com/articles/squarespace-71-list-sections-explained)) | Designers widely criticise the default section set as limited and dated ([sqspthemes](https://www.sqspthemes.com/blog/the-squarespace-71-sections-library-designers-have-been-begging-for)) — the gap third-party section kits fill. |
| **Tailwind Plus (UI blocks, marketing)** | Page sections: hero, feature, bento grid, CTA, header, newsletter, stats, testimonials, blog, contact, team, logo cloud, FAQ, footer, pricing (incl. a full feature comparison) ([Tailwind Plus](https://tailwindcss.com/plus/ui-blocks), [changelog](https://tailwindcss.com/plus/changelog)) | 12–20 per major category | Category list is a good baseline for "what every marketing site needs"; light + dark versions of each. |
| **shadcn blocks** | 128 categories, very long tail ([shadcnblocks](https://www.shadcnblocks.com/blocks)) | Hero 292, Feature 321, Pricing 96, Gallery 111, Blog 120, Team 41, Testimonial 40, CTA 38, Contact 30, FAQ 26, Timeline 19, Stats 20, Compare 10, Process 4, Case studies 16, Awards 23, Trust strip 4, Waitlist 3 | Heroes and features dominate demand; the long tail (process, compare, case study, awards, trust strip, waitlist, changelog) is where small libraries look thin. |
| **Relume** | Marketing / e-commerce / application; marketing sub-categories include hero header, feature, navbar, footer, CTA, pricing (30 added in one release), feature tabs ([Relume docs](https://resources.relume.io/resources/docs/how-to-use-the-relume-webflow-library), [what's new](https://www.relume.io/whats-new)) | 1,000+ marketing components | Sitemap-first: an AI sitemap picks sections per page — the same idea as our MCP + `ai` preset guidance. |

### 1.2 Template galleries and demanded site types

- **Squarespace** organises by industry (creative services, professional services, education,
  beauty, fitness, health & wellness, home services, events & experiences, nonprofits, personal —
  résumés, portfolios, weddings, freelancers, creators, podcasts) ([squarespace.com/templates](https://www.squarespace.com/templates)).
- **Webflow**'s largest template categories are Blog & Editorial and Architecture & Design, with
  Community & Nonprofit a solid middle ([webflow.com/templates/categories](https://webflow.com/templates/categories)).
- **Framer**: SaaS is repeatedly described as the most popular marketplace category, portfolios
  the most visually distinctive (project pages driven by the CMS) ([framerwebsites.com](https://framerwebsites.com/blog/framer-marketplace-guide), [portfolio roundup](https://framerwebsites.com/blog/best-framer-templates-portfolio)).
- **Wix Studio** filters by site type: online store, portfolio-CV, business, landing page, blog &
  content, services ([Wix marketplace](https://www.wix.com/marketplace/templates)).
- **Carrd** (single page) groups themes as profile, landing, form, portfolio and sectioned, plus
  link-in-bio and event pages ([UniLink guide](https://www.unilink.us/blog/best-carrd-templates-2026)).
- **Readymag** centres on portfolios, presentations, editorials and long reads.

**Demand we don't yet serve with a dedicated template:** SaaS / product launch (Signal is close
but app-focused), photographer / creative portfolio with project pages (Atelier is an artist
gallery), nonprofit cause campaign (Harbor is a community org), local service trades and salons,
events / conferences, consultants & coaches with a personal brand (Ledger is a firm), résumé / CV,
and writer-with-newsletter landing (Field Notes is a blog).

---

## 2. What makes a template feel premium

Distilled from the libraries above and design-practice write-ups ([wisdmlabs](https://wisdmlabs.com/blog/premium-website-design-7-decisions-that-set-brands-apart/), [pravinkumar on whitespace](https://www.pravinkumar.co/blog/webflow-whitespace-layout-breathing-room-2026), [Framer community](https://www.framer.com/community/posts/gtVGMm4ADbLzBRED1mcLf/)), mapped to how OpenSpace enforces each:

| Principle | What it looks like | How we hold it |
|---|---|---|
| **Restraint** | Fewer, stronger sections; one idea per screen; no heavy shadows, gradients or gratuitous motion | Presets ship one primary action; `ai.avoid` guidance; shadows only on layered cards |
| **Wide type contrast** | Display headlines far larger than body; a small, deliberate set of sizes; eyebrows as tracked labels | Theme's fluid scale (`display`/`h1`…), `size: "display"` on type-led heroes, eyebrow presets |
| **Consistent rhythm** | Same section padding and gaps everywhere; edges that line up | Density tokens only; grid presets on the 24/8 column grid; no ad-hoc values |
| **Considered imagery** | One aspect ratio per row, focal points that survive crops, treatments (arch, circle, grain) used sparingly | `ImageSlot` aspects, `photo()` sizing to ~2× display, image treatments per look |
| **Micro-detail** | Numbered steps, small captions, rules between columns, badges ("Most popular"), honest notes under buttons ("No card needed") | Button `note`, eyebrow labels, divider/line blocks, pricing badges |
| **Real content** | Plausible copy for a plausible business; no lorem | Copy-length rules per preset; tests reject placeholders |
| **Proof close to the ask** | Ratings, logos, numbers and quotes beside CTAs | Hero-with-stats / logos presets, social proof categories |

---

## 3. Gap analysis (before this work)

**Before:** 118 presets (8 header + 110 section/footer) in 19 categories; 12 templates × 3 looks;
46 blocks.

| Category | Had | Market expectation | Gaps |
|---|---|---|---|
| Hero | 16 | Largest category everywhere | Bento hero, video hero, product-screenshot hero, portrait/personal hero, local-service hero (phone + rating), event hero (date + countdown), cause/donate hero, menu/restaurant hero, résumé intro, split-with-form, type-led editorial variants |
| Features | 6 | 15–20+ | Alternating rows, comparison table, tabbed features, 4-up icon tiles, numbered benefits, feature + chart, integrations grid |
| Testimonials | 6 | 10+ | Quote wall/masonry, logo + quote, case-result cards, rating bar, video testimonial, dark spotlight |
| Pricing | 5 | 12–14 incl. comparison | Monthly/yearly toggle, full comparison table, 4-tier, rate card, packages with images, membership |
| Process / timeline | 0 (inside services/about) | Its own category ("process", "timeline") | Numbered steps, horizontal timeline, "how it works" with images, history |
| Portfolio / case study | 2 (inside gallery) | Project lists + case studies are a whole category | Case-study hero, results band, project index, selected work list |
| Menu (restaurant) | 0 presets (block exists) | Core to hospitality templates | Classic menu, two-column, menu with photo, drinks list, set menu |
| Donation / impact | 1 CTA | Nonprofit templates centre on it | Donate split, impact numbers, where-money-goes chart, campaign progress |
| Events | 4 | Conference sites need agenda, speakers, tickets, venue | Agenda tabs, speakers grid, ticket tiers, venue/travel |
| Contact | 6 | 6–30 | Phone-first service contact, map-led, contact cards, booking |
| Header / footer | 8 / 6 | 20+ / 45 | More header combos (dark/brand bars, social), mega/sitemap footer, CTA footer, minimal legal footer |
| Studio gallery | Categories + search + live previews in the site's look | Squarespace adds Saved + View Layouts | Filter by layout trait (photo / text-only / layered), counts per category, keyboard |

**Blocks:** a **comparison table** is a genuine gap (pricing comparison, feature matrices, spec
sheets) — nothing in the 46 blocks can render a real `<table>`. Pricing lacks a **billing-period
toggle**. Everything else needed (timeline, tabs, chart, before/after, countdown, donation,
restaurant menu, events, collection summaries, video, map) already exists.

---

## 4. Build plan

### 4.1 Blocks (only where a real gap exists)

1. **`table`** — comparison/spec table: column headings, rows of cells (text, ✓, —), optional
   highlighted column, caption; renders a semantic `<table>` with `<th scope>`; scrolls
   horizontally inside its own box on phones. Zero JS.
2. **Pricing billing toggle** — optional alternate price/period per plan plus two toggle labels;
   a CSS-only radio pair switches the shown price (works without JavaScript; the default price is
   what screen readers and no-CSS see first).

### 4.2 Section presets (target ~250+, quality over count)

New categories: **process** (steps, timelines), **portfolio** (projects, case studies),
**menu** (restaurant/café), **impact** (donation, outcomes). Every existing category deepened per
§3. Each preset: tokens only, designed themes, copy-length rules, image slots with crops, mobile
placements for grids, fictional businesses and people, example links resolved on insert.

### 4.3 Templates (8 new, 3 looks each)

| Template | For | Pages |
|---|---|---|
| **Darkroom** | Photographers & creative portfolios | Home, Work (portfolio collection), About, Services & rates, Contact |
| **Orbit** | SaaS / product launch | Home, Features, Pricing, Customers, Changelog (journal), Contact |
| **Beacon** | Nonprofit campaigns & charities | Home, Our work, Impact, Get involved, Donate, News |
| **Inkwell** | Writers & newsletters | Home (newsletter-first), Essays (blog), About, Books, Speaking |
| **Keystone** | Consultants & coaches | Home, Services, About, Results, Book a call |
| **Fixwell** | Local services (plumber/electrician) | Home, Services, Areas & pricing, Reviews, Contact |
| **Gather** | Events, festivals, conferences | Home, Programme, Speakers, Tickets, Venue & travel |
| **Folio** | Personal site / résumé | Home, Work history, Projects, Writing, Contact |

Plus upgrades to the weakest existing templates using the new sections (review screenshots for
the thinnest home pages first).

### 4.4 Studio gallery

Already: categories, search, live previews in the site's look, lazy frames. Add: trait filter
chips (photo / text-only / layered / dark-ready), per-category counts that follow search, grouped
results, and keyboard-friendly navigation for a 250-preset library.

### 4.5 Quality gates

Unit tests (schema, copy rules, credits, fresh ids, html-validate in all five themes), Design
check over every preset in every theme (contrast incl. text over photos, heading order, broken
links after resolution), mobile placement checks, template tests (design + SEO check, axe,
`openspace check`), Lighthouse mobile ≥ 95 with LCP < 2.0 s, screenshots at 1440 / 834 / 390.
