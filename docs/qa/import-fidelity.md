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
| Section padding | 1 | within 25% |
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

## Auto-tuning

After the import, the comparison runs and the importer tries, **one group at a time**, the
changes the differences point to, re-renders, measures again and **keeps a group only if the
score rises** (by more than 0.1, so measuring noise can't keep a bad change). Groups, in order:

1. **type** — a preset's size (computer and phone), tracking and capitals, but only when the
   original sets it consistently across pages (within 15%) and most pages differ;
2. **fonts** — a font that came out unrelated gets the nearest open match;
3. **rhythm** — content width (when the original's pages agree within 8%), section padding;
4. **colors** — text and heading colors per section theme, when the original used one color
   throughout that theme (Designer overrides `color.<theme>.<role>`; the contrast solver still
   checks them);
5. **buttons** — corner shape; the button fill per section theme (a clay button on a dark band);
6. **sections** — per page: backgrounds, card columns and image columns (layout hints), image
   crops, and narrower images on phones where the original kept them narrow.

It is bounded: at most 3 passes and 2 + 2 × passes re-measurements. The report lists the score
before tuning and every change kept.

## Fonts and licences

- Families Google Fonts serves are used as they are (self-hosted at publish).
- **Licensed foundry fonts** — detected from the font requests the page made (Adobe
  Fonts/Typekit, Fonts.com, Cloud.typography, MyFonts, Webtype, Type Network…) or, without a
  browser, assumed for any family Google doesn't serve — are **never copied**. The nearest
  open-licence family stands in, chosen by the measured shape among 160+ open families measured
  the same way (`packages/import/scripts/font-metrics.mjs` regenerates the table), within the
  same kind, with well-known equivalents as tie-breakers. The checklist gets **"Use your own
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

See the table below (measured October 2026, read-only against the live sites; side-by-sides
in the fidelity-2 report).
