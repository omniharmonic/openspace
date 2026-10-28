# Phone check — QA

How OpenSpace verifies that pages work on phones, and the numbers for the templates.

## What runs where

- **Renderer phone defaults** (`packages/renderer/src/styles/base-css.ts`, `layout-vars.ts`, `packages/schema/src/phone.ts`): stacked columns and lighter padding when a section only describes bigger screens; body text 16–20 px, lead ≤ 22 px, labels ≥ 13 px, small text ≥ 14 px and button labels ≥ 14 px; 44 px tap areas (text links by inline padding, so text doesn't move; footer links, social icons, brand, summaries, announcement close); contained tables, code, embeds and long links; 16 px inputs; very tall images cropped at 75svh. All inside `@media (max-width: 767.98px)`: desktop and tablet rendering are unchanged.
- **Static phone rules** (`packages/lint/src/phone.ts`, part of `designCheck`): grid sections not laid out for phones (missing placements, confusing fallback order, text in narrow phone columns), stack sections keeping text columns side by side, phone padding over 100 px, heading words too long for a phone line, photo sections taller than 75% of a phone, logos over 64 px on phones, custom CSS/components fixed wider than a phone.
- **The probe** (`packages/lint/src/phone-probe.ts`): a plain-JS script run in a real browser at 360 and 390 px — sideways scrolling, cut-off text, broken heading words, huge headings, small/tiny text, narrow text, tap targets under 44 px, text over text, text over photos (worst case over black and white) and low contrast, text at the screen edge, images taller than the screen, heavy crops, loose padding, crowded header, long footer, and the hero's main button below the first screen.
- **Runners:** `openspace check --phone [--fix]` (Playwright), MCP `phone_check` / `fix_for_phones` (CLI store via Playwright, Hub store via Cloudflare Browser Rendering), Hub `POST /api/sites/:id/phone-check` (cached in KV by page HTML hash, ≤ 10 changed pages per run), Studio's phone preview (the probe runs in the canvas, served as `/os-phone-probe.js`) and publish dialog.
- **Fixes** (`fixForPhones`): phone-only ops — `grid.place` at `m`, `layout.columns.m`, `layout.order.m`, `style.padding.m`, `style.minHeight.m`, heading `phoneSize`, `header.logoHeight.m` — plus a stronger photo overlay or a text panel for contrast. Every import applies them (`packages/import/src/phone.ts`).

## Template audit

`tools/visual-tests/scripts/phone-audit.mjs` over every page of all 20 templates (first look), at 360, 390 and 768 px:

| | Before (main @ eee259b) | After |
| --- | ---: | ---: |
| Phone findings (360 + 390) | 2,036 (2,000 tap targets, 22 tiny labels, 10 hero buttons below the first screen, 4 text-over-photo contrast) | **0** |
| Tablet findings (768, informational) | 962 | 940 |

All 20 templates pass the static Phone check with zero warnings in every look (`templates/test/templates.test.ts`), and the www site and three production imports (Power With, Bedford, Teal) measure zero phone findings after Fix for phones.

Tablet (768 px) tap targets are out of scope for the Phone check (they use the desktop pointer rules); see the mobile-1 report for follow-ups.

## Reproduce

```sh
pnpm turbo run build --filter=@omniharmonic/openspace-renderer
OS_TEMPLATE_RENDER=/tmp/render OS_LOOKS=1 pnpm --filter @omniharmonic/openspace-templates exec vitest run test/render.test.ts
node --experimental-strip-types tools/visual-tests/scripts/phone-audit.mjs /tmp/render /tmp/phone-audit --widths=360,390,768 --shots=home
```
