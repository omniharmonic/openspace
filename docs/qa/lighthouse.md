# Performance

## Published templates: Lighthouse (mobile)

Every template's demo home page, built the way owners publish it: the template's
`openspace.json`, `content/` and `media/` in the starter shell, `astro build` with the site-kit
integration, served by a static server that gzips text and caches `_os/` files for a year
(`tools/visual-tests/scripts/serve.mjs`, like GitHub Pages or Cloudflare). Lighthouse 12,
mobile preset with default simulated throttling, median of 3 runs. Demo photos are remote
(Unsplash) images, so their timings include that host.

Targets (doc 04 §8.3): Performance ≥ 95, Accessibility 100, Best practices ≥ 95, SEO 100,
CLS < 0.05, JavaScript < 30 KB gzipped.

| Template | Perf | A11y | Best practices | SEO | FCP | LCP | TBT | CLS | JS (KB, transfer) |
|---|---|---|---|---|---|---|---|---|---|
| atelier | 99 | 100 | 100 | 100 | 1.36 s | 2.13 s | 0 ms | 0.000 | 4.5 |
| commons | 98 | 100 | 100 | 100 | 1.36 s | 2.14 s | 0 ms | 0.002 | 2.5 |
| encore | 99 | 100 | 100 | 100 | 1.20 s | 1.98 s | 0 ms | 0.000 | 3.6 |
| field-notes | 100 | 100 | 100 | 100 | 1.21 s | 1.66 s | 0 ms | 0.000 | 4.3 |
| harbor | 99 | 100 | 100 | 100 | 1.21 s | 2.13 s | 0 ms | 0.000 | 3.1 |
| hearth | 95 | 100 | 100 | 100 | 1.20 s | 2.91 s | 0 ms | 0.000 | 4.5 |
| kiln | 99 | 100 | 100 | 100 | 1.21 s | 1.83 s | 0 ms | 0.000 | 6.5 |
| ledger | 99 | 100 | 100 | 100 | 1.66 s | 1.96 s | 0 ms | 0.000 | 3.3 |
| link | 100 | 100 | 100 | 100 | 1.21 s | 1.69 s | 0 ms | 0.000 | 2.4 |
| meadow | 99 | 100 | 100 | 100 | 1.21 s | 2.13 s | 0 ms | 0.000 | 3.6 |
| signal | 100 | 100 | 100 | 100 | 1.21 s | 1.67 s | 0 ms | 0.000 | 4.2 |
| vow | 99 | 100 | 100 | 100 | 1.22 s | 1.98 s | 0 ms | 0.000 | 2.6 |

All twelve meet every target.

### Before this pass

The first run (same harness) had:

- Performance from **79** (vow: FCP 3.4 s, Speed Index 5.9 s) and **92** (link) up to 99; commons
  had FCP and LCP of 3.4 s.
- Best practices **96** on every template: a `/favicon.ico` 404 in the console.
- CLS **0.137** on encore and 0.068 on signal, from web fonts swapping in.
- `lcp-lazy-loaded` on six templates: the hero photo had `loading="lazy"`.
- Accessibility 98 on field-notes: a journal list skipped from `h2` to `h4`.

### What changed

| Fix | Where | Effect |
|---|---|---|
| Builds self-host the font pairing: Fontsource if installed, else a one-time download from Google Fonts (2 tries per file; falls back to the Google link only if that fails or `OPENSPACE_GOOGLE_FONTS=link`) | `packages/site-kit/src/node/fonts.ts` | No cross-origin render-blocking stylesheet; FCP 2–3.4 s → 1.2–1.7 s |
| Preload each family's Latin, upright font file (at most two) | site-kit `render.ts`, `integration.ts` | Text renders in its real font from the first paint; CLS 0.137 → 0 |
| The first two images of the first section load eagerly with `fetchpriority="high"`; every other image stays lazy | `packages/renderer/src/image.tsx`, `section.tsx` | No lazy-loaded LCP image; LCP is discovered in the HTML |
| Sites without a tab icon get an inline SVG monogram (the site's initial on its brand color) | `packages/renderer/src/html.ts` | No `/favicon.ico` 404; Best practices 100 |
| Collection and event item titles never skip a heading level | `packages/blocks/src/blocks/collections.tsx` | Accessibility 100 on field-notes |

### What's left

- **Stylesheets.** Each page links four small stylesheets (fonts, tokens, base, blocks:
  about 26 KB gzipped together). Lighthouse lists them as render-blocking, with an estimated
  saving of 300–750 ms that the scores already absorb. Splitting `blocks.css` per page, or
  inlining the critical part, would trim this further.
- **Demo photos.** `uses-responsive-images` and `image-delivery-insight` point at the Unsplash
  demo photos (the remote host decides their encoding). Owners' own photos go through Astro's
  image pipeline (AVIF/WebP, exact widths) and don't have this.
- **Hearth** sits at 95: its LCP is the second photo of a three-photo collage on a remote host.
- **Production font setup.** The starter doesn't install Fontsource packages, so published
  sites rely on the build-time Google download (which needs network during the build, as CI
  has). Adding the pairing's `@fontsource/*` packages when the Hub creates a site repository
  would make builds fully offline.

## Studio

Measured with `pnpm --filter @openspace/studio check:perf` against the mock build, Chromium with
"fast 4G" network (40 ms RTT, 9 Mbps) and CPU slowed ×4, cold cache, signed in. "First load" ends
when the page's sections are on the canvas (editor) or the site cards are shown (dashboard).
Median of 5. The machine was shared with other jobs (load average about 20), so absolute
times are noisy; the before/after pairs were run back to back.

| Measure | Before (f88e2f8) | After | Target (PRD §7.1) |
|---|---|---|---|
| Editor first load | 1.90 s | 1.92 s | < 3 s |
| Editor JavaScript (gzip) | 853 KB | 688 KB (−19%) | — |
| Dashboard first load | 1.19 s | 1.22 s | < 3 s |
| Dashboard JavaScript (gzip) | 589 KB | 527 KB | — |
| Typing in the inspector (keystroke → next frame) | 11 ms | 5 ms | < 50 ms |
| Keystroke in the inspector → canvas shows it | 260 ms | 74 ms | < 100 ms |

The mock build adds about 115 KB gzipped to both routes (the mock Hub and the template registry
it serves); a production build fetches templates from the Hub instead.

### Bundle

| Chunk (gzip) | Before | After |
|---|---|---|
| `EditorFrame` (the editor) | 257.7 KB | 144.4 KB |
| Shared renderer / blocks / schema chunk | 152.8 KB | 89.1 KB |
| Tiptap + ProseMirror (text editing, now lazy) | in `EditorFrame` | 91.8 KB, loaded after first load settles |

What moved out of the first load:

- **`react-dom/server`** (about 64 KB gzipped) was bundled into Studio because
  `compiledStylesFor` and `pageTitle` lived next to `renderPageHtml`. They now live in
  `packages/renderer/src/html-meta.ts`, so browser bundles don't pull in the server renderer.
- **Tiptap and ProseMirror** load when a text field is first edited (canvas or inspector);
  Studio warms them two seconds after the canvas appears, so the first edit is still instant.
  Until it arrives, the canvas keeps showing the static text and the inspector shows a quiet
  placeholder of the same size.
- **Pages, Media, Header & footer** panels and the **phone layout** are separate chunks
  (Add section, Site styles, Looks, Settings, Advanced/CodeMirror and libsodium already were).

The inspector's text fields commit 60 ms after the last keystroke (was 250 ms), so the canvas
follows typing within the 100 ms target; a burst still merges into one undo step.
