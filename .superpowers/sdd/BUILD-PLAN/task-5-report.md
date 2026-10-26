# Task 5 report — `@openspace/renderer`

Status: DONE_WITH_CONCERNS (concerns are minor; see the end)
Commits: dca8fc6, cbfcc75, 0ab098d, 1909e2b (on main, not pushed)

## What was built
- **React 19 components** (`src/`):
  - `page.tsx`: `<PageView doc page mode basePath imageMap hubUrl editor extras>`. It renders, in order: skip link, announcement bar, header, `<main id="main">` with the sections, footer.
  - `section.tsx`: `<SectionView>`.
    - Stack mode: 1–4 columns with `--cols/--tcols/--mcols` ratios and `--to/--mo` stacking order.
    - Grid mode: the §3.3 CSS, with inline `--x/--y/--w/--h/--z`, `--tx…` and `--mx…` per item. Bleed uses `--cs/--ce: full-start/full-end`. DOM order follows desktop reading order.
    - Items with no stored `m` rect fall back to reading-order, full-width placement below the stored mobile placements.
    - Color-theme wrapper, color/gradient `--bg`, image background (focal point, overlay, parallax via CSS scroll-driven animation), background video, entrance reveal attributes.
  - `block.tsx`: `<BlockView>`.
    - Looks up the context registry first, then the global one.
    - Migrates stale versions (`migrateBlock`) and validates fields.
    - Unknown or invalid blocks render nothing in production and a notice in preview/editor.
    - Wraps output in `.os-block` (the container-query context) and applies style slots (padding, align classes, radius, shadow, border, colorTheme, imageTreatment, animation).
  - Smaller components:
    - `image.tsx`: `<Img>`. Reads `ImageResolverContext` and emits `<picture>` with AVIF/WebP `<source>`s, srcset, sizes, width/height and a blurred placeholder. Falls back to the raw src plus base path plus media-library dimensions. Builds an Unsplash/imgix srcset automatically. Supports focal point (object-position), aspect, treatment classes, priority and `fill` (fills grid cells).
    - `link.tsx`: `resolveLink`/`<Link>` for page, item, url, email, phone, file and anchor targets, with base path, new tab and broken-link detection.
    - `richtext.tsx`: `<RichText>` with presets, marks, base-aware links and token highlights.
    - `header.tsx`: `<Header>` in all 8 variants, with sticky, transparent-on-hero / overlay (takes the hero section's theme) and slide/fullscreen/dropdown/drawer mobile menus. Nav folders use `<details>`, so they work without JS. Without JS the mobile menu shows inline. Includes the cart button when Stripe is connected.
    - `chrome.tsx`: `<Footer>` (renders the footer Section), `<AnnouncementBar>`, `<Popup>` (`<dialog>`).
    - `primitives.tsx`: `<Button>`, `SocialLinks`, `SocialIcon`.
- **Registry** (`registry.ts`): `registerBlocks`, `getBlock`, `listBlocks`, `unregisterBlocks`, plus `BlockRegistryContext` for overrides (schema's `BlockRegistry` satisfies it). `RendererBlockDefinition` types `render` as returning `ReactNode`. There is no dependency on `@openspace/blocks`.
- **Studio hooks** (`context.tsx`):
  - `data-os-id` is emitted on every section and block in all modes.
  - `EditorContext` (`wrapSection`, `wrapBlock`, `renderMissingBlock`) is the hook point for selection affordances.
  - `editor` mode disables reveal animations and shows hidden sections dimmed.
  - `SectionContext` lets blocks know their section.
- **HTML documents** (`html.ts`): `renderPageHtml({doc, pageId, mode, basePath, imageMap, hubUrl, behaviorsUrl, siteUrl, jsonLd, fontStylesheets, stylesheets, extraHead})`.
  - Head: title template, description, robots (preview is always noindex), canonical, Open Graph and Twitter tags, favicon, an inline `os-js` class script, font links (Google Fonts by default; site-kit passes self-hosted Fontsource), token CSS (memoised `compileStyles`), base CSS, custom CSS (`</style` neutralised), JSON-LD (escaped), modulepreload for each behavior used, head injection.
  - Body: data attributes (site, hub, base, mode), loader script only when behaviors are present, footer injection.
  - The analytics beacon is included only in production when analytics is enabled.
  - Also exports `behaviorsForPage(html | options)`, `pageTitle`, `siteUrlFor` and `jsonForScript`.
- **Base stylesheet `os.css`** (`styles/base-css.ts` → `BASE_CSS` string; the build writes `dist/os.css`, exported as `@openspace/renderer/os.css`).
  - Organised in cascade layers, so a site's custom CSS always wins.
  - Covers: reset; typography presets generated from `TOKEN_VARS`; rich-text flow capped at `--os-measure`; sections; stack and grid layouts; block container queries (large type is clamped in narrow columns; `.os-split`, `.os-cards`, `.os-cluster` helpers); image treatments with overlay and frame; the button system using all 15 role vars; forms; announcement; header layouts; menus; popup; and styles for every behavior's UI.
  - Reveal hides content only when motion is allowed and the behavior is running, and never above the fold. Under `prefers-reduced-motion` everything is static.
  - It uses only `--os-*` names from `TOKEN_VARS` (tested); per-instance values are short private vars.
  - Form input outlines use `text-muted` and focus uses `focus`; the decorative `border` role is never used for inputs.
- **Behaviors** (`src/behaviors/*.ts`): vanilla ES modules, each exporting `default init(el)`. Each is bundled by esbuild into `dist/behaviors/*.js`.
  - The set: carousel, lightbox, accordion, tabs, marquee (with pause button), reveal, menu (focus trap, Esc, scroll lock, folders, `is-scrolled`), popup (time/scroll/exit triggers + frequency cap), announcement, form, newsletter, video-lite (click-to-load iframe and background video), search (lazy Pagefind UI, "/" shortcut), cart (localStorage, drawer dialog, sends SKU+qty only to `${hub}/c/:site/checkout`), beacon.
  - Form behavior detail: inline validation, async submit, Hub field errors, success/redirect. When the Hub is unreachable it saves the entry to a localStorage retry queue (flushed on load and on `online`) and shows the owner's email.
  - The loader `os-behaviors.js` scans `[data-os-behavior]` and dynamically imports only the modules used, relative to its own URL; it exposes `window.OpenSpace.scan()`.
  - Node entry `@openspace/renderer/node` provides `BEHAVIOR_FILES`, `behaviorSourcePath`, `behaviorDistPath`, `bundleBehaviors()`, `writeAssets(outdir)` and `BASE_CSS_PATH`. The manifest (`BEHAVIORS`, `BEHAVIOR_BUDGETS`, `behaviorsInHtml`) is exported from the main entry.
- **Build**: `tsup` (entries index + node), then `scripts/build-assets.mjs` produces the behaviors and `os.css`. `esbuild` is a runtime dependency because `bundleBehaviors` is used by site-kit and the Hub.

## Behavior sizes (gzip -9)
accordion 502 · announcement 282 · beacon 403 · carousel 505 · cart 2037 · form 1550 · lightbox 942 · marquee 651 · menu 946 · newsletter 770 · popup 570 · reveal 465 · search 712 · tabs 476 · video-lite 536 · loader 411. All behaviors together come to about 11 KB.

## Tests (`packages/renderer`, 56 tests in 5 files)
- `render.test.tsx`:
  - SSR snapshots of a stack section and a grid section.
  - Responsive inheritance in CSS vars: stack columns, padding and min height; tablet grid inheriting desktop; mobile order.
  - Grid bleed, z, fallback mobile rects and reading order.
  - Backgrounds, themes, reveal and editor mode.
  - Block migration and style slots; unknown/invalid blocks; `EditorContext` wrapping.
  - Image map usage (sources, srcset, dimensions, placeholder, focal point, treatment), raw fallback with base path, Unsplash srcset.
  - All link types; rich text; all 8 header variants; nav folders, hidden items and buttons; page overrides; PageView.
- `html.test.ts`: full document head; CSS inline vs linked; behavior tags only for behaviors present plus the beacon; no React runtime; preview noindex; title template, custom domain, JSON-LD escaping, injections; `behaviorsForPage`.
- `css.test.ts`: only documented `--os-*` vars, all emitted by the compiled theme; never declares `--os-*`; §3.3 grid, breakpoints, container queries, reduced motion; inputs use `text-muted`.
- `behaviors-size.test.ts`: esbuild-bundles every behavior and the loader and asserts gzip budgets (3 KB each, cart 12 KB, beacon and loader 1 KB, total under 30 KB); plain ESM default export, no React.
- `behaviors-dom.test.ts` (happy-dom): accordion exclusive mode, tabs keyboard, menu open/Esc/focus return, announcement persistence, popup delay + frequency cap, reveal, form validation / success / Hub-down queue with owner email, cart persistence and count, beacon payload.

Commands run:
- `pnpm -w typecheck` → 18/18 successful
- `pnpm -w test` → 17/17 successful (renderer: 56 passed)
- `pnpm build` in `packages/renderer` → "built 16 behavior modules and os.css"
- `npx biome check packages/renderer/src packages/renderer/scripts` → clean

Visual check: I rendered the fixture site with real Unsplash photos and took screenshots with headless Chromium at 1440 and 390. This found four layout bugs, all fixed in 1909e2b:
- the overlay header was not in flow;
- a CSS specificity issue on split-nav;
- grid images were stretching rows (they now fill their cells);
- mobile fallback rects overlapped stored mobile placements.

## Deviations / decisions
- **Grid row unit and gap**: not in the theme's token contract, so they are private vars in `os.css` (`--row-unit` 1.25rem mobile / 1.5rem from tablet; `--grid-gap` = `--os-space-2xs`).
- **Header**: collapses to the menu button below 1024px rather than at a device breakpoint, since nav does not fit at 834px. Header height is deterministic in CSS (from `logoHeight` vars set on `.os-page`), so the overlay header and first-section compensation cause no layout shift.
- **Section padding tokens** map literally to `--os-space-<token>`; with no padding set, sections use the fluid `--os-section-pad-y`.
- **Popup**: there is no popup config in the site schema yet, so `<Popup>` is a component taking explicit props. `PageView` has an `extras` slot for popups.
- **Background video autoplay** is done by the `video-lite` behavior: it plays muted when visible and never under reduced motion.
- **Page URLs** end with a trailing slash (`/about/`, `/journal/slug/`) to match static hosting.

## Concerns
- The Studio agent shares the Playwright MCP browser. I navigated it once by accident (to `http://localhost:8765`) before switching to a private headless Chromium. Their page probably needs reloading.
- Form attribute contract for Task 6: `data-os-owner-email`, `data-os-success`, `data-os-redirect`, `.os-field__error` linked via `aria-describedby`, `data-os-message` for custom validation text.
- Cart attribute contract: `data-os-add`, `data-os-sku`, `data-os-name`, `data-os-price` (minor units), `data-os-currency`.
- `<Img>` emits React's camel-case `srcSet` / `fetchPriority` attribute names in static markup. HTML attributes are case-insensitive, so this works, but it is cosmetically unusual.
- The parallax effect needs `animation-timeline` support (Chromium-based browsers today); elsewhere it degrades to no parallax.

---

## Fix round 1

All exports are backward compatible. The only additions are `ogImageUrl`, `repairFields`, `MissingBlock`, `BlockErrorBoundary` and the `Img` class `is-unsized`. No signatures changed.

### Important
1. **og:image doubled the base path.** New `ogImageUrl(src, siteUrl, imageMap)`. Image-map srcs (already-final URLs; root-relative ones include the base path) now resolve with `new URL(src, siteUrl)`, which uses the origin. `media/` paths still resolve against the site URL, which carries the base path. Test: basePath plus an image map with `/maya-yoga/_astro/hero.hash.jpg` gives `https://maya.github.io/maya-yoga/_astro/hero.hash.jpg`; the raw media path and remote map URLs are covered too.
2. **Production rendered schema-invalid blocks with raw fields.** `prepare()` now calls `repairFields()`: each top-level field with a validation issue is replaced by its default, or removed if it has none. The fields are then validated again; if they are still invalid, the block is skipped (rendered as nothing). Raw invalid values never reach a render function. Tests: a bad select value is repaired to its default (`primary`); a `javascript:` URL link field gives an empty production render with no `javascript:` in the output, and a notice in preview.

### Minor
3. **video-lite** loads only `https:` embeds: checked on init and again on click (the URL is parsed and its protocol checked). Test included.
4. **Error handling comment.** The `RenderBlock` comment now states exactly what is caught: only the render function's own synchronous throw. Nested component errors fail a static render, which site-kit reports as a build error. Added a real `BlockErrorBoundary` class around each block for client renders (Studio canvas).
5. **Grid blocks with no `layout.items` entry** are now rendered in preview/editor as an unplaced full-width item (`.os-grid__item--unplaced`, `data-os-unplaced`) through `MissingBlock`, which honours `EditorContext.renderMissingBlock`. Production still omits them. Test included.
6. **Overlay-header compensation** now targets `.os-section--first` (set from `FirstSectionContext`) instead of `:first-child`, so it survives `wrapSection` wrappers. Test: editor mode with a wrapper.
   - Also fixed a cascade-layer bug found during the headless-browser check: the mobile compensation rule sat in a later layer than the tablet/desktop rules and always won. All three now live together in the components layer; the measured padding-top at 1440px is now 140px (64 + 76), previously 124px.
7. **Remote images without dimensions.** Width/height already come from image values (`ImageValue.width/height`) and media-library lookups. When neither is known and no `aspect`/`fill` is set, `<Img>` adds `is-unsized`, which reserves an `aspect-ratio` box (`var(--aspect, 3 / 2)`) so nothing shifts. Section background images now use `fill`. Test included.
8. **react / react-dom** are now `peerDependencies` (`^19.0.0`) and devDependencies.
9. **Form retry queue.** When a queued entry later gets a non-network rejection, it is removed from the queue and the visitor sees an error on the matching form ("A message you sent earlier couldn't be delivered (reason). Please send it again."). Entries that still can't reach the Hub stay queued for up to 7 days. Test included.
10. **Transparent-overlay test** now asserts `os-header--transparent-overlay os-theme-light-accent is-sticky is-overlay`.
11. **search** registers the "/" listener once per page, shared by all triggers. Test: two triggers produce one keydown listener.

### Commands
```
$ cd packages/renderer && npx vitest run       → Test Files 5 passed, Tests 64 passed (64)
$ pnpm -w typecheck                              → Tasks: 18 successful, 18 total
$ pnpm -w test                                   → Tasks: 17 successful, 17 total
$ pnpm build (renderer)                          → built 16 behavior modules and os.css
$ npx biome check packages/renderer              → Checked 48 files, no errors
```
Headless Chromium (private, not the shared MCP browser) on the transparent-overlay page at 1440px: the header sits below the announcement bar, overlaying the hero, and the first section's padding-top is 140px.

---

## Fix round 2

1. **Unplaced grid items lost their position at ≥768px (Important).** The rule is now `.os-grid__item.os-grid__item--unplaced{grid-column:content-start/content-end;grid-row:auto}`. Its two classes beat the single-class tablet/desktop `.os-grid__item` placement rules, which sit in the same `os.layout` layer.
   - New test (`css.test.ts`): the rule exists inside the `os.layout` layer, and every other `{grid-column:` rule in that layer is the single-class `.os-grid__item`.
   - Headless Chromium check of a preview page with an unplaced block: computed `grid-column` is `content-start / content-end` at 390, 834 and 1440, with widths of 325, 749 and 1280px (the full content track).
2. **Rejected queue entry dropped when its form wasn't on the page (minor).** `flush()` now marks a Hub-rejected entry with `rejected` (the Hub's message, or "") and does not resubmit it.
   - If the entry's form is on the current page, the visitor sees the error there and the entry is removed.
   - Otherwise the entry stays queued (up to 30 days) until a page with that form loads, where the error is shown once.
   - New DOM test: the entry is kept while its form is absent, is not resubmitted, and is then reported and cleared once its form is present.

Commands:
```
$ cd packages/renderer && npx vitest run   → Tests 66 passed (66)
$ pnpm -w typecheck                          → Tasks: 18 successful, 18 total
$ pnpm -w test                               → Tasks: 17 successful, 17 total
$ pnpm build (renderer)                      → built 16 behavior modules and os.css
$ npx biome check packages/renderer          → no errors
```
