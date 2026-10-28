# Import fidelity: how the score works

When a site is moved into OpenSpace (`openspace import …`, or "Move my site" in Studio, which
runs the same importer in the site's GitHub Actions), a real browser measures the original
site and the new one and compares them. The result is a 0–100 **fidelity score** per page and
device, an overall score, a report of every difference with the setting that would close it,
and side-by-side pictures (original left, OpenSpace right). The importer then **auto-tunes** the
new site against those measurements and keeps the best version.

This page says exactly what is measured, how it is scored, and what the score doesn't see, so
a number like "91/100" means the same thing every time.

## What is measured

Both sites are opened in Chromium (Playwright) at **1440 px** (a computer) and **390 px** (a
phone), up to six pages, scrolled once so lazy images load, fonts awaited. The same script
(`packages/import/src/fidelity/probe.ts`) runs on both sides:

- **Fonts per role** — headings, running text, labels (eyebrows, buttons, navigation) — as the
  page computes them, plus each font's *shape* drawn on a canvas at 100 px: x-height, cap
  height, average lowercase width, serif or sans (feet on the "l"), monospace, small caps.
- **The type scale** — sizes, line height, letter spacing and capitals of h1–h3, body, lead,
  small text, eyebrows, buttons, navigation and the site title.
- **The page rhythm** — content width, section padding, button corners.
- **Sections** — on OpenSpace pages the `.os-section`s; on the original, full-width `<section>`s,
  or else *visual bands*: wrappers with one big child are looked through, children stacked one
  above another are separate bands, children side by side (an image beside its words) or
  layered (a banner's photo and text) are one band, a short heading joins the band below it,
  and an article's paragraphs stay one band. Sidebars, cookie banners, headers, navigation and
  footers are chrome, not sections. Per section: background, heading and text style, text and
  heading color, columns, eyebrow and accent rule, italic lines, the largest image's side,
  width and crop, the first button's fill.
- **Screenshots** of the whole page, for the picture comparison below.

Sections are matched by heading, then by shared words, then — for an original section whose
words all sit inside one OpenSpace section (an article the original split around its
pictures) — by containment, then by position between matched neighbours.

## How it's scored

**Page score = 75% checks + 25% looks alike.**

**Checks (75%).** Every check has a weight; the page's check score is the weighted share that
passed:

| Check | Weight | Passes when |
|---|---|---|
| Font per role (heading, body, label) | 3 each | same family — or partial credit, below |
| h1, h2, body size | 2 each | within 12% |
| Other preset sizes (h3, lead, eyebrows, buttons, nav, site title) | 1 each | within 12% |
| Letter spacing and capitals (eyebrows, buttons, nav, site title) | 1 each | within 0.04 em, same case |
| Content width (computer) | 2 | within 6% |
| Section spacing | 1 | within 25% (half the gap between one section's content and the next's — measured the same way whether sections carry their own padding or sit in a flow) |
| Button corners | 1 | within 3 px (or both rounded) |
| Section present | 4 | a matching section exists |
| Section background | 2 | color distance < 16 (photo backgrounds aren't color-checked) |
| Section heading, section text | 2 each | same family and size within 12% (partial credit below) |
| Section text color | 1 | color distance < 28 |
| Section columns | 2 | same count |
| Eyebrow and rule, italic lines | 1 each | present where the original had them |
| Image placement | 1 | same side, width share within 8 points (or 35%) |
| Image crop | 1 | aspect ratio within 15% |
| Section height | 1 | 70%–135% of the original |

**Partial credit for fonts.** Licensed fonts may not be copied (see below), so a family that
differs isn't automatically a failure: if both fonts are the same kind (serif / sans / mono,
small caps or not), they get credit by how close their measured shapes are — distance
≤ 0.04 → 85%, ≤ 0.07 → 70%, ≤ 0.11 → 50%, ≤ 0.16 → 25%, else 0. (The distance weighs x-height,
x-height relative to cap height, width and cap height; `metricDistance` in `font-match.ts`.)
An unrelated font gets nothing. The report marks these "close (85%)", never "same".

**Looks alike (25%).** The two full-page screenshots are scaled to 64 px wide; the original is
cut into 8-row bands and each band is compared with the best-aligned band of the new page within
8% of the page height (so one taller section doesn't misalign everything below it): structural
similarity (SSIM) of the luminance in 8×8 windows (45%), color difference (35%), and how close
the page heights are (20%). Identical pages score 1.0. As calibrated on the sites below,
unrelated pages typically land at 0.2–0.5 and a faithful move at 0.75–0.9: the measure is
deliberately strict, so it can't be gamed by matching only the numbers above.

**Overall** = the mean of every page × device score.

## Two scores: corrected, and strict v3 beside it

Fidelity 3 found three places where the scorer (v3) measured wrong. They're corrected, and for
transparency **every report gives both numbers side by side**: the corrected score (`score`, what
auto-tuning optimises and what Studio shows first) and the **strict v3** score of the very same
measurements (`strict`). On a page where none of the three applies, the two are equal.

| Miscalibration (strict v3) | Corrected scorer |
|---|---|
| **Navigation in a header themed "brand" goes unseen.** The probe skips links inside `[class*=brand]` (meant for logo boxes), which also matches a header's colour theme, OpenSpace's `os-theme-brand` (WordPress Foundation's blue sidebar header: "Navigation: present" failed on every computer page). | A class *naming a colour theme* (`…theme-brand`) isn't a logo box. When the strict probe finds no navigation, the probe looks again without it and records the result as `corrections.nav`; only the corrected score reads it. Real logo boxes (`navbar-brand`, `site-brand`) still don't count as navigation. |
| **Off-screen slides count as columns.** A scroll-snap slideshow's slides sit side by side, mostly off screen, and were counted as 3–6 columns (Alameda lookbook, WordPress Foundation donate). | Per section the probe also counts columns as a visitor sees them and records it as `columnsOnScreen` when it differs: a box that clips content overflowing sideways (a scroll-snap slideshow, a map's tiles) counts as one picture however many slides or tiles it holds, and anything else counts when at least half of it is inside the viewport. A clearfix row (`overflow: hidden` without sideways overflow) keeps its columns. The corrected Columns check uses it on both sides. |
| **A picture-only band on a phone can't match.** Squarespace index rows stack on phones: the photo becomes a band of its own with no words, while the new site keeps the photo in the section with its words, so the band counted as missing (weight 4). | On a phone, an unmatched original section with no heading and no words but a picture is looked for in the new site's section that holds the picture with its words: between the matches of its matched neighbours, one with a picture, nearest in page position. Found, it's "present" and its crop is compared; not found, it's still missing. On a computer nothing changes. |

Where they're reported:

- **CLI** (`openspace import … --compare`, `openspace compare`): the first line gives the strict
  v3 score after the corrected one (before → after tuning), and each page line adds
  `(strict v3 N)` where they differ.
- **`FIDELITY-REPORT.md`**: "Scored two ways, side by side: **X/100 corrected**, Y/100 by the
  strict v3 scorer", each page heading adds `(strict v3: N/100)`, and a page lists what the
  corrected scorer read differently ("Corrected scoring on this page: …").
- **`fidelity.json`**: `strict: {score, exact}` and `scorer: "v3.1-corrected"` on the report;
  `strict: {score, exact, structure, checks}` and `corrections: [...]` on each page.
- **`fidelity-summary.json`** (version 1, additive): `strict`, `strictBefore`, `scorer`, and per
  page `strict`, `strictBefore`, `corrections`. Older readers ignore them; older summaries
  without them read as before.
- **Hub** (`GET /api/imports/:id` → `fidelity`, and the remote MCP's `import_status` text) and
  **Studio** ("How close it looks": "Scored two ways, to be open about it: X/100 with corrected
  measuring, Y/100 by the stricter earlier method", and `(strict N)` per page).

## Auto-tuning

After the import, the comparison runs and the importer tries, **one group at a time**, the
changes the differences point to, re-renders, measures again and **keeps a group only if the
score rises** (by more than 0.1, so measuring noise can't keep a bad change). Groups, in order:

1. **type** — a preset's size (computer and phone), tracking and capitals, but only when the
   original sets it consistently across pages (within 15%) and most pages differ; one tracking
   value serves computer and phone when the two are close (the value between them); headings set
   in another role's font on the original (Bedford's capitalised proxima h2/h3) take that role.
   For buttons, pages whose measured button is a content button speak for the site (a search or
   cookie button in the chrome doesn't);
2. **fonts** — a font that came out unrelated gets the nearest open match, and each label preset
   (eyebrow, button, navigation, site title) takes the role whose font the original used for it;
3. **rhythm** — content width (when the original's pages agree within 8%), section padding on a
   computer; 4. **rhythm-phone** — section padding on phones (tried on its own);
5. **widths** — per page, sections at the content width or the narrow width the original's
   words used (a 600 px introduction column on a site whose pages are 1200 px wide);
6. **colors** — text and heading colors per section theme, when the original used one color
   throughout that theme (Designer overrides `color.<theme>.<role>`; the contrast solver still
   checks them); 7. **page-color** — the same for each theme's background;
8. **buttons** — corner shape; the button fill per section theme (a clay button on a dark band);
9. **layout** — per page: card columns, image columns and section backgrounds matched by heading;
10. **headings** — a section heading sized unlike its level's preset (a smaller page title, a
    heading set as a small tracked label) takes the preset whose measured size matches on
    computer and phone (the heading block's size, a rich-text heading's preset, or a card's or
    column's heading style);
11. **heights** — a photo banner as tall as the original's: padding that fits its words and the
    original's height as its minimum, on computer and phone;
12. **backgrounds** — section backgrounds matched by position;
13. **crops** — image crops;
14. **phone images** — narrower images on phones where the original kept them narrow;
15. **components** — tried **one page at a time** (with its own budget), for sections still
    scoring below 75 once everything else has been tried: the section is recreated as a **custom
    component** (ADR custom-components §9): the probe's *blueprint* of the original section
    (every heading, paragraph, picture, button and link with its box and text style, plus accent
    rules and panels — boxes with their own fill or border) becomes a component that places each
    part on a 24-column grid where it sat on a computer and stacks them in reading order on
    phones, using the theme's font roles and colour roles (no fixed colours, never the original's
    CSS) and Site Styles buttons. Every word, picture and link is an editable field; a paragraph
    with links, bold or italics is a **rich text field** (the site's own links become paths on the
    new site), rules and panels are drawn on the theme's accent, border and surface colours. A
    band whose words also live in another section isn't recreated (no words shown twice). It must
    pass `checkComponent`, the component lint gates and `openspace check`, its pictures come into
    `media/`, and it's kept only if the score rises. The report gives the score with and without
    components.

It is bounded: at most 3 passes, 2 + 5 × passes re-measurements for the groups and 2 + 2 × passes
for components. The report lists the score before tuning and every change kept.

### What the importer reads from the live site besides the type and rhythm

The same probe (data that isn't scored) also gives the importer: the header logo's shown height,
the footer's color and how many groups of words sit side by side on its first line (a footer
set as one line "name · links · ©" becomes that many columns, in small labels when they were),
the page's own background and whether its sections sit on a **raised content card** (a blog
theme's white panel over a colored page: Site Styles `layout.surface: "card"` with
`layout.pageBackground`, and the card's text measure as the content width), and a **display
line** — the page's largest short text, well above its headings (a 7.0 banner title set in a
paragraph) — for the display preset.

## Fonts and licences

- Families Google Fonts serves are used as they are (self-hosted at publish).
- **Licensed foundry fonts** — detected from the font requests the page made (Adobe
  Fonts/Typekit, Fonts.com, Cloud.typography, MyFonts, Webtype, Type Network…) or, without a
  browser, assumed for any family Google doesn't serve — are **never copied**. The nearest
  open-licence family stands in, chosen by the measured shape among 160+ open families measured
  the same way (`packages/import/scripts/font-metrics.mjs` regenerates the table), within the
  same kind, with well-known equivalents only breaking near ties (the measured nearest wins:
  proxima-nova → Sofia Sans, whose shape is closer than Figtree's). The checklist gets **"Use your own
  font licence"**: with a web licence the owner uploads the real files in Site Styles → Your
  fonts (stored in `media/fonts/`).
- **System fonts** (Georgia, Helvetica, Arial, Times…) get their metric-compatible open twins
  (Gelasio, Arimo, Tinos…).
- Every weight and the italics a role uses are kept, and letter spacing per preset.

## What the score doesn't see

- Content inside third-party embeds (maps, video players), animations and hover states.
- Exact line breaks and kerning (fonts can be a licensed original vs. an open stand-in).
- Pages beyond the six compared (the home page first, then alphabetical).
- Section matching is heuristic on hand-built HTML; an unmatched section counts as missing.

## Results

Measured October 27, 2026, read-only against the live sites (nothing third-party committed),
same pages as before (Power With 4, Alameda 5, the others 6), computer 1440 px and phone 390 px.
"Fidelity 2" is the previous importer with its auto-tuning (re-run today: identical, ±1);
"fidelity 3" is this importer with auto-tuning. Same scorer, unchanged.

| Site | Fidelity 2 | Fidelity 3 | Without components |
|---|---|---|---|
| Power With (GitHub Pages, structured content) | 87 | **91** | 90 (one FAQ section recreated as a component) |
| WordPress Foundation (Twenty Fifteen) | 75 | **89** | — (none needed) |
| Alameda (Squarespace 7.1 shop) | 77 | **85** | — (none needed) |
| Bedford (Squarespace 7.0) | 69 | **78** | 78 (tried per page, not kept) |
| sive.rs (hand-made HTML) | 74 | **80** | 80 (tried per page, not kept) |

### Limits the score itself sets

Three of these are corrected since (see "Two scores" above); the strict v3 score still has them.

- **Licensed fonts cap a page.** sive.rs sets its headings in Valkyrie C4 (MB Type, licensed) and
  its text in Georgia. The nearest open stand-ins get 50% and 85% credit, so even with every
  other check passing and identical screenshots the site can't score above ~89.6. The owner's
  own font licence (Site Styles → Your fonts) lifts this.
- *(Corrected; strict v3 only)* **Header links in a `brand`-themed header aren't seen as navigation**: the probe skips links
  inside `[class*=brand]` (meant for logos), and OpenSpace's `os-theme-brand` matches it
  (WordPress Foundation's blue sidebar: "Navigation: present" fails on every computer page,
  ≈ −1.4 per page).
- **A page without a content button is scored against a chrome button** (a sidebar search or
  cookie "Accept" button), which a move rightly doesn't carry over.
- *(Corrected; strict v3 only)* **An image-only band on a phone can't match** the section that holds both the picture and its
  words (Squarespace index rows that stack on phones), so it counts as missing (weight 4).
- *(Corrected; strict v3 only)* **Off-screen slides count as columns** in a scroll-snap slideshow (Alameda lookbook,
  WordPress Foundation donate: "Columns 1 → 3/6").
- **Image width is measured against the section's box**: OpenSpace sections are full-bleed,
  hand-made pages' bands are the text column, so a 150 px cover reads 10% vs 22%.
