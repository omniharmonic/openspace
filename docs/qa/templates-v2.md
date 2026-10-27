# Templates v2 — QA

Quality pass for the second wave of the section library and templates (branch `templates-v2`,
October 27, 2026). Research and build plan: [docs/design/TEMPLATE-RESEARCH.md](../design/TEMPLATE-RESEARCH.md).

## What changed

| | Before | After |
|---|---|---|
| Section presets (incl. 14 header presets) | 118 | **277** |
| Preset categories | 19 | **23** (new: Process & timeline, Portfolio & case studies, Menus, Impact & donations) |
| Templates × looks | 12 × 3 | **20 × 3** (Darkroom, Orbit, Beacon, Fixwell, Keystone, Gather, Inkwell, Folio) |
| Blocks | 46 | **47** (`table`) + a CSS-only monthly/yearly toggle on `pricing` |
| Credited demo photos | 104 | **164** |

Per category: header 14 · hero 31 · about 16 · services 16 · features 18 · process 9 · gallery 18 ·
portfolio 8 · testimonials 16 · pricing 13 · menu 6 · faq 8 · team 9 · stats 9 · impact 7 · logos 7 ·
cta 14 · contact 12 · newsletter 8 · blog 9 · events 9 · products 8 · footer 12.

Upgraded existing templates: Field Notes (reader-numbers strip, magazine archive wall), Ledger
(engagement timeline), Encore (tour photo strip).

## Automated checks (all green)

- **Presets** (`packages/blocks/src/presets/presets.test.tsx`): every preset builds a schema-valid
  section with valid blocks, copy inside its declared word ranges, image slots and credited photos,
  fresh ids, designed mobile placements for every grid item, and renders without html-validate
  findings in all five color themes.
- **Design check over every preset** (`packages/lint/src/design-check.test.ts`): no errors in any
  theme (contrast, heading order, broken links after insertion resolves example links), and
  text-over-photo contrast passes over both black and white photos in each photo preset's
  designed themes.
- **Stress** (`tools/visual-tests`, doc 04 §8.2): 11,683 renders — 263 section presets × copy at
  3× and 0.3×, missing/tall/wide images, 1/2/5/12 items, plus 40 header variations — at 320, 390,
  834, 1280, 1440, 1920 px and 200% zoom. One failure found and fixed: the horizontal `timeline`
  variant's connector line drew past its item (now ends inside it). Final run: no overflow or
  clipped text.
- **Templates** (`templates/test`): for all 20 templates — valid documents, required pages, Design
  check with no errors or warnings, SEO check on every page and collection item, no portrait used
  for two people, zero contrast failures in every look, every photo credited in
  `media/LICENSES.json`, no placeholder or library demo copy, `openspace check` clean and
  `openspace new` scaffolds; **axe: zero serious or critical violations on every page**.
- **Lighthouse (mobile, median of 3)**: every new and upgraded template scores Performance 99–100,
  Accessibility 100, Best practices 100, SEO 100, LCP 1.21–1.88 s, CLS ≤ 0.001, JS ≤ 4.3 KB.
  Table in [lighthouse.md](lighthouse.md#templates-v2-october-27-2026).

## Visual review

Every new preset was rendered in its default theme at 1440 and 390 (the preset gallery harness,
`OS_PRESET_GALLERY=… OS_PRESET_ONLY=hero/,process/ pnpm vitest run gallery` in `packages/blocks`)
and every new template page at 1440, 834 and 390. Fixes made after looking:

- Cards with a fixed theme read as heavy blocks on light sections or vanished on tinted ones; a
  shared `raised()` now picks a gentle contrast for whichever section theme they're placed in.
- Bento hero tiles rebalanced; product-screenshot hero buttons moved up to the copy; the local
  service hero's trust points stacked; the review card no longer overlaps the hero introduction.
- Collapsed FAQs in grid layouts no longer leave empty space; programme cards tightened.
- Table row headers align left (a specificity bug); the sitemap footer's link columns and the
  giant-wordmark footer reworked to span the page.
- Folio got a fourth project so its grid is even; Gather keeps a single signup (in the footer);
  Darkroom project pages don't repeat the cover photo in the gallery.

Screenshots (downscaled full pages: 1440 → 480 px, 834 → 320 px, 390 → 240 px) are in
[templates/](templates/): `<template>-home-<width>.png`, one inner page per template, and look
sheets `<template>-looks-1440.png` (also used on openspace.dev). Studio's Add section panel with
the new quick filters: [studio/panel-add-1440-light-templates-v2.png](studio/panel-add-1440-light-templates-v2.png).

## Studio section gallery

With 277 presets the gallery gained: search over AI guidance as well as names and tags ("restaurant",
"nonprofit"), quick filters (Photos, Text only, Layered, Dark), a live result count, category counts
that follow the search (empty categories greyed out), and the category picker on phones where the
dialog's sidebar is hidden. Thumbnails stay live renders in the site's own look, mounted only
near the viewport. Tests: `apps/studio/src/features/add-section/gallery.test.ts`.

## Photos

New demo photos come from Unsplash (Unsplash License) with photographer, profile and photo-page
credits taken from Unsplash's own API, and each URL was checked to return HTTP 200. Templates
self-host them at publish time like the rest (`OPENSPACE_REMOTE_IMAGES=download`).
