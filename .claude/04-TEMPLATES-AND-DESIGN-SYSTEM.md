# Commonplace — Templates & Design System

| | |
|---|---|
| **Author** | Benjamin Life (@omniharmonic) |
| **Status** | Draft v0.1 |
| **Date** | October 26, 2026 |
| **Reads with** | [01 — PRD](01-PRD.md) · [02 — Architecture](02-ARCHITECTURE.md) · [03 — Implementation Plan](03-IMPLEMENTATION-PLAN.md) |

---

## 1. Templates are the product

People choose Squarespace because its sites look expensive with no effort. If Commonplace templates are merely "good," the rest of the system doesn't matter. So design is a first-class engineering deliverable with its own budget, reviewer, quality bar and tests.

Three commitments follow:

1. **Beautiful by default.** Every template ships with real-feeling copy and photography and looks finished before the owner touches it.
2. **Hard to make ugly.** The owner changes *choices* (palette, pairing, density, shape) from curated sets. Every combination is designed to work.
3. **Precise when you want it.** Designers can reach exact values, grid placement and custom CSS — but the defaults never require them.

---

## 2. System layers

```
Primitives  →  Semantic roles  →  Component tokens  →  Section presets  →  Templates
(raw scales)   (what it means)     (how parts look)      (designed blocks     (pages + styles
                                                          of layout)           + presets + media)
```

### 2.1 Tokens (`content/styles.json`, W3C DTCG format)

```json
{
  "$schema": "https://schema.commonplace.dev/v1/styles.json",
  "choices": {
    "palette":  { "brand": "oklch(0.62 0.09 145)", "neutral": "warm", "contrast": "standard" },
    "pairing":  "fraunces-hanken",
    "density":  "airy",
    "shape":    "soft",
    "buttons":  "pill-solid",
    "motion":   "subtle",
    "imageTreatment": "arch"
  },
  "overrides": {
    "color": { "accent": { "$value": "oklch(0.58 0.12 40)", "$type": "color" } },
    "type":  { "display": { "letterSpacing": { "$value": "-0.02em" } } }
  }
}
```

Owners edit **choices**; the theme compiler (`@commonplace/theme`) expands them into a full token set. **Overrides** hold exact values set in "Designer" mode. Agents patch the same structure through `set_styles`.

### 2.2 Breakpoints and containers

| Name | Range | Grid |
|---|---|---|
| Mobile | < 768px | 8 columns |
| Tablet | 768–1199px | 24 columns (inherits desktop) |
| Desktop | ≥ 1200px | 24 columns |

Content max width: 1280px (wide 1440px, narrow 720px for reading). Blocks use **container queries** internally, so a testimonial in a narrow column adapts the same way it would on a phone.

---

## 3. Color

### 3.1 Generation

All color is generated in **OKLCH** (perceptually even lightness), from one input:

- a brand color the owner picks,
- a color extracted from their logo or a hero photo, or
- a curated palette.

From it, the compiler builds:

- **Accent scale** (11 steps, 50–950) and a **neutral scale** tinted toward the accent (warm / cool / pure options).
- **Semantic roles**: `background`, `surface`, `surface-raised`, `text`, `text-muted`, `heading`, `accent`, `accent-text` (text that sits on accent), `border`, `focus`, `link`, plus `success/warning/danger` for forms and commerce.

### 3.2 Section color themes

Squarespace-style section themes, each a complete role set generated from the palette:

| Theme | Use |
|---|---|
| Light | Default reading surface |
| Light accent | A tinted surface for gentle rhythm |
| Dark | Dramatic contrast, full-bleed imagery |
| Dark accent | Bold brand moments, CTAs |
| Brand | Saturated accent background for signature sections |

### 3.3 Contrast guarantees

The **contrast solver** adjusts lightness (not hue) until every text/background pair in every theme meets WCAG 2.2 AA (4.5:1 body, 3:1 large text and UI). If an owner's override breaks that, Studio shows the failing pairs and a one-click "nearest accessible" fix. It never silently ships an inaccessible combination.

---

## 4. Typography

### 4.1 Pairings

A library of 30+ curated pairings at MVP (60 at parity), all from openly licensed families (SIL OFL) self-hosted via Fontsource — no third-party font requests, no tracking. Each pairing defines heading and body families, weights, optical-size and letter-spacing tuning, and fallback metrics to prevent layout shift.

Owners can upload their own licensed fonts (Phase 2); Studio asks them to confirm web-use rights.

### 4.2 Type presets

| Preset | Role |
|---|---|
| `display` | Hero statements |
| `h1`–`h4` | Headings |
| `lead` | Intro paragraphs |
| `body` | Default text |
| `small` | Captions, fine print |
| `eyebrow` | Overlines / labels (uppercase, tracked) |
| `button`, `nav` | UI text |

Sizes use **fluid scales** (`clamp()` between mobile and desktop ratios — e.g., 1.2 on mobile to 1.333 on desktop), so headlines scale smoothly without per-breakpoint fiddling. Line length is capped near 70 characters for body text in every preset layout.

---

## 5. Space, shape, image and motion

- **Density** (`compact` / `comfortable` / `airy`) scales section padding and block gaps together, keeping rhythm consistent. Spacing uses a 4px base with a modular step scale (`3xs`…`3xl`).
- **Shape** (`sharp` / `soft` / `round`) sets the radius scale for images, cards, inputs and buttons together.
- **Buttons**: solid, outline, underline, pill solid, pill outline, text-with-arrow — in primary/secondary/tertiary roles.
- **Image treatments**: none, rounded, arch, circle, organic blob, duotone (from palette), grain overlay, subtle frame. Applied per template default and overridable per block.
- **Motion** (`none` / `subtle` / `expressive`): entrance reveals, stagger, image zoom-on-hover, parallax backgrounds. Pure CSS + the `reveal` behavior; everything disabled under `prefers-reduced-motion`.

---

## 6. Section presets

Presets are pre-composed sections (layout + blocks + style slots) that render in whatever Site Styles the site has. They're what make "Add section" feel like Squarespace rather than a blank canvas.

| Category | MVP | Parity |
|---|---|---|
| Header (site navigation) | 4 | 8 |
| Hero | 6 | 14 |
| About / story | 4 | 8 |
| Services / offerings | 4 | 8 |
| Features / benefits | 3 | 6 |
| Gallery / portfolio | 4 | 10 |
| Testimonials | 3 | 6 |
| Pricing | 1 | 5 |
| FAQ | 2 | 4 |
| Team | 1 | 4 |
| Stats / impact | 1 | 3 |
| Logos / press | 1 | 3 |
| Call to action | 3 | 6 |
| Contact / location / hours | 3 | 6 |
| Newsletter | 2 | 4 |
| Blog / summary lists | — | 5 |
| Events | — | 4 |
| Products | — | 6 |
| Footer | 3 | 6 |
| **Total** | **~45** | **~120** |

Each preset declares: purpose, recommended copy lengths (e.g., hero headline 3–9 words), image aspect ratios, which color themes it's designed for, and AI guidance (§9).

---

## 7. Launch templates

Twelve templates spanning the personas in the PRD. Six ship in the MVP (★); six follow in Phase 2. All fonts are OFL-licensed.

| Template | For | Mood | Pairing (heading / body) | Palette | Signature details |
|---|---|---|---|---|---|
| ★ **Meadow** | Yoga, therapy, bodywork, wellness | Calm, airy, organic | Fraunces / Hanken Grotesk | Oat, sage, clay | Arched image masks, soft grain, generous whitespace, class schedule + booking |
| ★ **Harbor** | Nonprofits, community orgs | Trustworthy, warm, civic | Newsreader / Public Sans | Deep blue, warm paper, signal orange | Impact stats band, programs grid, events list, sticky donate CTA |
| ★ **Atelier** | Photographers, visual artists | Gallery-first, minimal chrome | Instrument Serif / Instrument Sans | Monochrome + one accent | Full-bleed slideshow, project index with hover previews, lightbox |
| ★ **Ledger** | Consultants, coaches, freelancers | Crisp, editorial, confident | Source Serif 4 / IBM Plex Sans | Ink, ivory, deep green | Case-study layouts, services with outcomes, booking CTA |
| ★ **Hearth** | Restaurants, cafés, bakeries | Warm, appetizing | Young Serif / Work Sans | Tomato, cream, olive | Menu block, hours + map, reservations embed, gallery strip |
| ★ **Signal** | Products, startups, launches | Bold, modern, technical | Bricolage Grotesque / Geist | Near-black with electric accent | Feature grids, logo strip, pricing, FAQ, changelog |
| **Field Notes** | Writers, newsletters, blogs | Reading-first, literary | Literata / Manrope | Paper, ink, highlighter yellow | Newsletter-first home, essay layout, footnotes, reading time |
| **Encore** | Musicians, performers, podcasters | Expressive, nocturnal | Syne / DM Sans | Dark plum, bright accent | Tour dates, audio player, press kit, episode list |
| **Kiln** | Makers and small shops | Tactile, crafted | Gloock / Albert Sans | Clay, bone, charcoal | Product grid, maker story, workshops (commerce in Phase 5) |
| **Commons** | Coalitions, cooperatives, movements | Grounded, collective | Spectral / Epilogue | Earth greens, sky | Partner directory, map block, events, join form |
| **Vow** | Weddings and celebrations | Romantic, refined | Cormorant Garamond / Jost | Linen, ink, dusty rose | Day timeline, RSVP form, travel info, registry links |
| **Link** | Link-in-bio, single page | Mobile-first, punchy | Outfit / Outfit | Bold palette presets | Stacked link buttons, embeds, newsletter, socials |

### 7.1 What every template includes

- **Pages**: home, about, a primary offering page (services / work / menu / programs), contact; plus type-specific pages (journal, events, schedule, shop).
- **Demo content** written for a plausible fictional owner — never lorem ipsum — so people see the finished state.
- **Photography** under licenses permitting redistribution in templates (commissioned, CC0, or Unsplash-licensed), recorded in `media/LICENSES.json`. Demo images are swapped for the owner's during personalization prompts.
- **3 alternate "looks"** (palette + pairing + shape combinations) shown in the gallery, so one template covers several moods.
- **Personalization on create**: site name, tagline and (optionally) a logo or brand color are applied at creation; the logo drives palette extraction.

### 7.2 Switching templates

Because content and presentation are separated, "Try a new look" applies another template's Site Styles and preset variants to the existing content in preview. Sections whose preset has a counterpart in the new template map automatically (hero → hero); unmatched sections keep their structure with the new styles. Apply or discard — nothing changes until the owner chooses.

---

## 8. Quality bar

A template or preset is accepted only when it passes all of these.

### 8.1 Visual craft (design review)

- Consistent vertical rhythm on the spacing scale; no ad-hoc values.
- Type hierarchy readable at a glance; at most two families.
- Alignment holds across sections; optical adjustments where needed (hanging punctuation, icon alignment).
- Images composed with focal points that survive every aspect ratio the preset uses.
- Looks intentional in **all five section color themes** and **all three looks**.

### 8.2 Stress tests (automated + review)

Each preset is rendered with:

- 3× and 0.3× the demo copy length,
- missing images and very tall/very wide images,
- a long site name and a very wide logo,
- 1, 2, 5 and 12 items in repeatable lists,
- browser zoom at 200%,
- widths 320, 390, 834, 1280, 1440, 1920.

Failures that can't be fixed by design get guardrails in the schema (max lengths, min/max items) or lints in Studio.

### 8.3 Technical gates (CI)

- Lighthouse mobile Performance ≥ 95, Accessibility = 100, Best Practices ≥ 95, SEO = 100 with demo content.
- axe: zero serious/critical issues.
- Total JavaScript on content pages < 30 KB gzipped.
- CLS < 0.05.
- Visual regression baselines for every preset × theme × breakpoint.

---

## 9. Design guidance for agents (and Studio's "Design check")

The same rules power the MCP resource that guides an owner's AI and Studio's built-in lint. Written as plain guidance so both humans and agents can follow it:

1. **Start from presets.** Compose pages from section presets; customize fields before styles; use exact values only when asked.
2. **One primary action per screenful.** Secondary actions use secondary or tertiary button styles.
3. **Create rhythm with color themes.** Alternate surfaces deliberately (e.g., Light → Light accent → Light → Dark for a finale); avoid more than three consecutive sections with the same theme on long pages, and avoid flipping every section.
4. **Respect copy lengths.** Use each preset's recommended ranges; shorten rather than shrink type.
5. **Keep image aspect ratios consistent within a section.**
6. **Two typefaces maximum.** Change the pairing in Site Styles rather than per block.
7. **Never invent facts, testimonials, prices or credentials.** Ask the owner.
8. **Alt text describes the image's purpose,** not just its contents; decorative images are marked decorative.
9. **Check mobile.** After any grid change, review the mobile placement.
10. **Prefer fewer, stronger sections** over many thin ones.

Studio's **Design check** flags: contrast failures, more than two families, headings out of order, empty sections, images above 2× their displayed size, missing alt text, overlapping text in grid sections, and pages without a clear call to action.

---

## 10. Contributing templates and presets

- Templates are **data, not code**: page JSON, `styles.json`, presets and media, validated by the schema. Designers can build them entirely in Studio and export them with "Save as template."
- Submission is a pull request to `commonplace/templates` with a filled-in checklist (§8) and image licenses.
- A design reviewer from the stewarding group reviews craft; CI runs the technical gates.
- Accepted templates are credited to their designers in the gallery and remain CC BY 4.0 (designs) / MIT (any code).
- New blocks (code) go through the `blocks` package review instead, with the same visual and accessibility tests.

---

*Prepared by Benjamin Life (@omniharmonic).*
