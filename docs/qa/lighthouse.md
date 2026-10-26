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
| atelier | 100 | 100 | 100 | 100 | 1.05 s | 1.80 s | 0 ms | 0.000 | 3.3 |
| commons | 100 | 100 | 100 | 100 | 1.20 s | 1.65 s | 0 ms | 0.001 | 1.8 |
| encore | 100 | 100 | 100 | 100 | 1.05 s | 1.73 s | 0 ms | 0.000 | 2.6 |
| field-notes | 100 | 100 | 100 | 100 | 1.05 s | 1.35 s | 0 ms | 0.000 | 3.1 |
| harbor | 100 | 100 | 100 | 100 | 1.05 s | 1.65 s | 0 ms | 0.000 | 2.1 |
| hearth | 99 | 100 | 100 | 100 | 1.05 s | 1.95 s | 0 ms | 0.000 | 3.3 |
| kiln | 100 | 100 | 100 | 100 | 1.05 s | 1.43 s | 0 ms | 0.000 | 5.2 |
| ledger | 100 | 100 | 100 | 100 | 1.20 s | 1.65 s | 0 ms | 0.001 | 2.3 |
| link | 100 | 100 | 100 | 100 | 1.05 s | 1.20 s | 0 ms | 0.000 | 1.6 |
| meadow | 100 | 100 | 100 | 100 | 1.05 s | 1.73 s | 0 ms | 0.000 | 2.6 |
| signal | 100 | 100 | 100 | 100 | 1.05 s | 1.35 s | 0 ms | 0.000 | 3.0 |
| vow | 100 | 100 | 100 | 100 | 1.05 s | 1.65 s | 0 ms | 0.000 | 1.9 |

Median of 3 runs, served over HTTP/2 (TLS, like GitHub Pages and Cloudflare), built as published
(`OPENSPACE_GOOGLE_FONTS=download OPENSPACE_REMOTE_IMAGES=download`). **All twelve meet every
target, including LCP under 2.0 s** (hearth, the closest, at 1.95 s).


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
| Builds self-host the font pairing: Fontsource if installed, else, in publish workflows (`OPENSPACE_GOOGLE_FONTS=download`, set by the starter's and the Hub's `publish.yml`), a one-time download from Google Fonts with each family's license written next to the fonts as `_os/fonts/LICENSE-<family>.txt`. Local builds and tests link Google Fonts and never touch the network; a failed download is logged with its reason | `packages/site-kit/src/node/fonts.ts`, `integration.ts`, starter workflows | No cross-origin render-blocking stylesheet; FCP 2–3.4 s → 1.2–1.7 s |
| Preload the Latin, upright file of the weights the pairing uses for headings and body | site-kit `render.ts`, `integration.ts` | Text renders in its real font from the first paint; CLS 0.137 → 0 |
| The first two image sources of the first section (reading order, background first) load eagerly with `fetchpriority="high"`; every other image stays lazy. Chosen from the section's data, so rendering stays pure | `packages/renderer/src/image.tsx`, `section.tsx` | No lazy-loaded LCP image; LCP is discovered in the HTML |
| Image blocks' `sizes` follow their grid cell or stack column at each breakpoint; remote photos offer 640 and 960 px widths too | `packages/blocks/src/blocks/image.tsx`, renderer `REMOTE_WIDTHS` | Phones download a photo the width of its cell (hearth 94 → 98) |
| Sites without a tab icon get an inline SVG monogram (the site's initial on its brand color) | `packages/renderer/src/html.ts` | No `/favicon.ico` 404; Best practices 100 |
| Collection and event item titles never skip a heading level | `packages/blocks/src/blocks/collections.tsx` | Accessibility 100 on field-notes |

### LCP pass (final wave B)

Before: atelier 2.42 s, commons 2.12 s, harbor 2.13 s, hearth 2.43 s, meadow 2.44 s (encore,
vow and ledger 1.95–1.99 s).

| Fix | Where | Effect |
|---|---|---|
| `<link rel="preload" as="image" imagesrcset imagesizes fetchpriority="high">` for the likely LCP image, placed right after `<title>`: of the first section's high-priority images, the one covering most of a phone screen (from `sizes` and its aspect ratio); a `<picture>`'s first modern `<source>` with its `type` | `packages/renderer/src/html.ts` (`lcpImagePreload`) | The LCP candidate is requested with the document, ahead of stylesheets and fonts |
| Phone `sizes` subtract the page gutters (`calc(100vw - 48px)`, grid cells `calc((100vw - 48px) * share)`; bleeding items keep `vw`) | `packages/blocks/src/blocks/image.tsx` | At Lighthouse's 412 px × 1.75 DPR, photos pick the 640 px file instead of 768 px (meadow 2.44 → 1.98 s) |
| Lead images include the first image in the grid's **phone** order as well as the desktop one | `packages/renderer/src/section.tsx` (`leadImages`) | The image that is LCP on phones is eager + high priority (hearth's collage) |

**Self-hosted demo photos (follow-up).** The remaining four were held back by their LCP photo
coming from `images.unsplash.com` (a new connection plus the CDN's real latency). Publish builds
now download each demo photo once per width (480–1080 px) as AVIF and JPEG from the CDN into
`_os/img/` (`packages/site-kit/src/node/remote-images.ts`, `OPENSPACE_REMOTE_IMAGES=download`,
set in the starter's publish workflows next to the fonts' download; credits stay in the content),
and the harness serves HTTP/2 like production hosts (`serve.mjs`, `lighthouse.mjs --http1` for
the old setup). Result: atelier 2.15 → 1.80 s, commons 2.13 → 1.65 s, harbor 2.13 → 1.65 s,
hearth 2.43 → 1.95 s.

**Earlier analysis: LCP on remote demo photos.** The four templates still over 2.0 s show their LCP photo from
`images.unsplash.com`. Lighthouse's simulation adds a new connection to that origin (DNS + TCP +
TLS at 150 ms RTT) and its real, variable latency; experiments put the floor at about 2.1 s even
with every lazy image removed from the page, and single runs vary by ±0.3 s (hearth: 2.31–2.77 s
on identical HTML). Lower image quality (q=60), dropping font preloads and `content-visibility`
on later sections did not move the median. Self-hosting the demo photos through the build
pipeline was tried too; with the harness's HTTP/1.1 static server the extra same-origin
requests made LCP worse (3.0 s), so a fair test needed an HTTP/2 server (now the default). Owners' own photos
already go through Astro's image pipeline (same origin, AVIF/WebP) and don't pay this cost.

### Lighthouse in CI

`.github/workflows/lighthouse.yml` builds the twelve demos (with self-hosted fonts) and runs
`node scripts/lighthouse.mjs --runs=3 --min-perf=95 --min-a11y=100 --max-lcp=2000`, which exits non-zero when any
template's median misses a threshold. It runs nightly and on demand, not as a required check, and uploads the JSON
summaries.

### What's left

- **Stylesheets.** Each page links four small stylesheets (fonts, tokens, base, blocks:
  about 26 KB gzipped together). Lighthouse lists them as render-blocking, with an estimated
  saving of 300–750 ms that the scores already absorb. Splitting `blocks.css` per page, or
  inlining the critical part, would trim this further.
- **Demo photos.** `uses-responsive-images` and `image-delivery-insight` point at the Unsplash
  demo photos (the remote host decides their encoding). Owners' own photos go through Astro's
  image pipeline (AVIF/WebP, exact widths) and don't have this.
- **Production font setup.** The starter doesn't install Fontsource packages, so published
  sites rely on the publish workflow's Google download (CI has network; if it fails, pages
  link Google Fonts). Adding the pairing's `@fontsource/*` packages when the Hub creates a
  site repository would make builds fully offline.

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
follows typing within the 100 ms target; a burst still merges into one undo step. The network
doesn't pay for it: within a typing burst the room client sends the first keystroke at once,
then replaces the burst's unsent update of the same fields and sends at most every 400 ms
(`COALESCE_MS`). A 23-keystroke burst reaches the room as at most 3 ops instead of 23
(`RoomClient.test.ts`).
