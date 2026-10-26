# Template stress tests

Doc 04 §8.2 asks that every preset hold up under copy that is 3× and 0.3× the demo length,
missing and very tall or wide images, 1 / 2 / 5 / 12 items in repeatable lists, a long site name
and a very wide logo, at 200% zoom and at 320, 390, 834, 1280, 1440 and 1920 px.

## How it works

- `tools/visual-tests/src/stress.ts` builds the variations. They stay within what Studio
  allows, so a failure is something an owner could really produce:
  - copy is scaled word by word and capped at the field's `maxLength`;
  - lists are resized within their `min` and `max`;
  - optional images are removed, required ones get an empty source;
  - tall (600×1800) and wide (2400×600) images use inline placeholders, so no network is needed.
- `src/stress.render.test.ts` (skipped unless `OS_STRESS` is set) renders all 110 section presets
  through site-kit inside the Meadow site, one page per preset with every variation that changes
  something stacked: 654 sections. It also renders every template's home page twice: with a
  70-character site name, and with a 10:1 logo.
- `scripts/stress.mjs` loads every page at the six widths, and at 1280 px with 200% zoom
  (640 CSS px at 2×). It flags any element past the screen edge that nothing clips, and any
  heading, paragraph, link, button, list item or caption whose text is wider than its box.
  - Spam-trap fields, screen-reader text and carousels are skipped, since they are positioned
    or overflow on purpose.
  - Each failing section is screenshotted.

## Results

**4,746 checked renders, no overflow and no clipped text:** 654 preset variations plus 24 header
cases, each at 320, 390, 834, 1280, 1440, 1920 px and 1280 px at 200% zoom.

The first run found 32 failures. They were fixed in the design rather than with new limits:

| Failure | Fix |
|---|---|
| Long site names ran past the screen (`white-space: nowrap`), pushing the navigation and the header button off the right edge at 834–1440 px and at 200% zoom (all 12 templates) | The title wraps (balanced, at most about 30 characters per line); the brand shrinks before the navigation; navigation items wrap onto a second row instead of overflowing; header actions never shrink (`packages/renderer` base CSS) |
| Stat labels ("On-time invoices") broke mid-word in the screenshot callout's narrow stats box at 320 px | Stats stack in one column in boxes under 20rem; labels may wrap long words (`packages/blocks` data CSS) |
| Large stats with long values squeezed their labels to one word per line | Large stats stack value over label in boxes under 30rem |
| An email address in the newsletter footer overflowed its column at 834 px | Long words (emails, URLs) wrap anywhere on published pages (`overflow-wrap: break-word` on `body`) |
| Five plans in the two-plan pricing preset squeezed prices out of their cards at 1440 and 1920 px | Columns follow the plan count and never leave one plan alone on a row: 4 plans as 2 × 2 in medium boxes (4 in a row when wide), 5 as 3 + 2 (`planColumns`, `packages/blocks` pricing) |

No new guardrails were needed: the existing schema limits (plans ≤ 5, list maxima, field max
lengths) already keep content within what the designs absorb.

Samples (after the fixes): [long name, encore, 1280](templates/stress-encore-long-name-1280.png),
[long name, kiln, 390](templates/stress-kiln-long-name-390.png),
[wide logo, meadow, 390](templates/stress-meadow-wide-logo-390.png),
[hero with stats at 3× / 0.3× copy and missing / tall / wide images, 390](templates/stress-hero-with-stats-390.png).

## Not covered

- Visual judgement of every variation. The script catches overflow and clipping; balance and
  rhythm were reviewed by eye on samples, not on every render.
- Collection-fed lists (blog, events, products) take their items from collections, so the
  item-count variations don't change them; templates' own collections cover 1–12 items.
