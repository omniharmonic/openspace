# Craft heuristics

Detailed guidance for making OpenSpace pages look designed, not assembled. Everything here is achieved with presets, copy, color themes and Site Styles — never inline CSS.

## The ten rules (doc 04 §9 — Studio's Design check enforces the same)

1. Start from presets. Customize fields before styles; use exact values only when asked.
2. One primary action per screenful. Secondary actions use secondary or tertiary button styles.
3. Create rhythm with color themes. Alternate surfaces deliberately; avoid more than three consecutive sections with the same theme on long pages, and avoid flipping every section.
4. Respect copy lengths. Shorten rather than shrink type.
5. Keep image aspect ratios consistent within a section.
6. Two typefaces maximum. Change the pairing in Site Styles rather than per block.
7. Never invent facts, testimonials, prices or credentials. Ask the owner.
8. Alt text describes the image's purpose; decorative images are marked decorative.
9. Check mobile. After any grid change, review the mobile placement.
10. Prefer fewer, stronger sections over many thin ones.

Design check flags: contrast failures, more than two families, headings out of order, empty sections, images above 2× their displayed size, missing alt text, overlapping text in grid sections, pages without a clear call to action, long runs of one theme, flipping every section, copy outside preset ranges.

## The hero

The hero carries the page. Get it right before anything else.

- **Headline (H1):** 3–9 words, concrete, in the owner's voice. Say what they do or what the visitor gets: "Slow, grounded yoga in Portland", not "Welcome to our website".
- **Supporting line:** one or two sentences (≈ 15–35 words) naming who it's for and the next step.
- **One primary button** with a verb + object ("Book a class", "See the menu", "Start free"). An optional second action as a secondary style ("Meet Maya").
- **Image:** the strongest, most specific photograph available — a real person, place or product. Faces look into the page, not off the edge. Use `hero/split-image@1` for portraits, `hero/full-bleed-photo@1` or `hero/photo-corner-text@1` for landscapes, `hero/centered@1` or `hero/big-type@1` when there's no great photo.
- **Theme:** `light-accent` for calm brands, `dark` for dramatic photography and products, `brand` for bold launches. Photo-background heroes need a dark or light scrim the preset already provides.
- **Transparent header:** over a full-bleed photo hero, set `update_page` `{"header.transparentOnHero": true}`.

Formula options for the headline:
- _Outcome:_ "Sleep through the night again"
- _Who + what + where:_ "Wedding photography for the Hudson Valley"
- _Promise + proof:_ "Fresh pasta, made every morning since 2011"

## Section-by-section

- **About / story:** one portrait, 60–150 words, a real detail (where, since when, why). End with a soft link, not a second hard CTA.
- **Services / offerings:** 3 is the sweet spot (2 feels thin, 5+ goes in a price list or tabs). Each card: a name, one sentence of outcome, a price only if the owner gave one. Use `services/price-list@1` for menus of treatments.
- **Features:** benefits, not specs. Icons from the built-in set, consistent style. Four short items in `features/icon-row@1` beat eight long ones.
- **Gallery:** 6–9 strong images with one consistent aspect (`gallery/grid@1`) or a deliberate mix in `gallery/masonry@1`. Lightbox on for portfolios.
- **Testimonials:** only real quotes with real names. Two or three; short (under 40 words). If the owner has none, leave the section out — never fabricate.
- **Pricing:** at most three plans; mark one as featured; same feature count per plan; a note for fine print.
- **FAQ:** 4–8 questions the owner actually gets asked; answers in one or two sentences.
- **Stats:** only numbers the owner can stand behind; 3–4 values; short labels.
- **Logos / press:** only real clients or publications that covered the owner.
- **CTA finale:** a short headline that restates the main action, one button, `brand` or `dark` theme.
- **Contact:** a form with few fields (name, email, message), plus hours and address if there's a place to visit. Use `contact/location@1` for physical businesses.
- **Footer:** link columns for multi-page sites, `footer/minimal-row@1` for single-page and link-in-bio sites.

## Color-theme rhythm

Five themes: `light`, `light-accent`, `dark`, `dark-accent`, `brand`. The contrast solver makes all five readable; rhythm is the designer's job.

Proven sequences:
- Calm practitioner (6 sections): `light-accent` → `light` → `light` → `light-accent` → `dark` → `brand`
- Nonprofit: `dark` (photo hero) → `light` → `brand` (stats band) → `light` → `light-accent` → `dark`
- Product launch: `dark` → `dark` (logos) → `dark-accent` → `dark` → `dark-accent` → `brand`
- Editorial / writer: `light` → `light` → `light-accent` → `light` → `dark`

Avoid: four of the same theme in a row; alternating every single section; two `brand` sections on one page (the brand moment loses its punch).

## Restyle moods → Site Styles

Try `apply_template_look` first (each template has three tested looks). For direct control, map the mood to choices:

| Mood                    | Pairing                  | Density       | Shape   | Buttons        | Image treatment     | Motion       |
| ----------------------- | ------------------------ | ------------- | ------- | -------------- | ------------------- | ------------ |
| Warm, organic, calm     | `fraunces-hanken`        | `airy`        | `soft`  | `pill-solid`   | `arch` or `rounded` | `subtle`     |
| Civic, trustworthy      | `newsreader-public-sans` | `comfortable` | `soft`  | `solid`        | `rounded`           | `subtle`     |
| Gallery-minimal         | `instrument`             | `airy`        | `sharp` | `underline`    | `none`              | `subtle`     |
| Crisp, editorial        | `source-serif-plex`      | `comfortable` | `sharp` | `solid`        | `none`              | `subtle`     |
| Appetizing, friendly    | `young-serif-work-sans`  | `comfortable` | `round` | `pill-solid`   | `rounded`           | `subtle`     |
| Bold, technical         | `bricolage-geist`        | `comfortable` | `soft`  | `solid`        | `none`              | `expressive` |
| Literary, reading-first | `literata-manrope`       | `airy`        | `sharp` | `text-arrow`   | `frame`             | `none`       |
| Expressive, nocturnal   | `syne-dm-sans`           | `comfortable` | `round` | `pill-outline` | `grain`             | `expressive` |
| Romantic, refined       | `cormorant-jost`         | `airy`        | `soft`  | `outline`      | `arch`              | `subtle`     |
| Punchy, mobile-first    | `outfit`                 | `compact`     | `round` | `pill-solid`   | `circle`            | `subtle`     |

"Warmer" usually means: a warm neutral (`palette.neutral: "warm"`), a brand hue in the oranges/clays, softer shape, `light-accent` surfaces. "More premium" usually means: more whitespace (`airy`), fewer sections, larger photography, restrained buttons (`outline`/`underline`), one accent used sparingly. "More modern" usually means: a grotesque pairing, `sharp` or `soft` shape, `dark` heroes, `expressive` motion.

## Images

- Ask for the owner's own photos first; they beat stock every time.
- Upload from URLs the owner gives with `upload_image`; write alt text about purpose ("Maya guiding a student into a seated twist"), not "image of woman".
- Keep one aspect ratio per section; let the preset's aspect do the cropping and set a focal point on the subject.
- Don't upload images far larger than they display (Design check flags > 2× display size).

## Mobile review (390 px)

Screenshot every changed page at `device: "mobile"` and check:
- The H1 wraps into two or three balanced lines, not a column of single words. Shorten it if not.
- Buttons are large and not side-by-side when cramped.
- Grid sections read in the right order — fix with `auto_mobile_layout` (`reset: true` to start over) or `place_in_grid` `m` rects.
- Images aren't tiny or cropped through faces.
- No text overlaps text; no horizontal scrolling.

## Copy

- Short paragraphs, plain words, the owner's voice. Read existing pages first and match their tone.
- Every claim must come from the owner or their existing content. If something's missing, ask the owner — or leave that block out — rather than inventing it or leaving placeholder text on the page.
- SEO: every page gets a unique description of 50–160 characters (`update_page` `seo.description`).
