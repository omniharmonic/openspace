# Phone rubric — making every page great on a phone

Most visitors see a small business's site on a phone. OpenSpace already makes desktop designs work on phones by default (columns stack, padding comes down, type stays readable, tap areas are 44px, wide tables scroll inside their block). The Phone check finds what defaults can't, and fixes most of it with phone-only settings, so desktop stays exactly as designed.

## The loop (every time, before any publish)

1. `phone_check` (whole site, or `page`). It runs the rules that need no browser and — where a browser is available (Playwright locally, Cloudflare on the Hub) — lays each page out as a phone at 360 and 390 px and measures it.
2. `fix_for_phones` — applies every automatic fix in one change and measures again.
3. Whatever is left has no automatic fix: edit as each issue's `fix` says, then `phone_check` again.
4. `screenshot` with `device: "mobile"` of the home page and every page you changed. Look at it as a visitor would.
5. Only publish (when the owner asks) with **zero phone errors and warnings**.

Never tell the owner "it works on mobile" without having run `phone_check` in this session.

## What "great on a phone" means

| Check | The bar |
| --- | --- |
| First screen | The headline and the main button are visible without scrolling (hero words before hero photos on phones). |
| Sideways scrolling | Never. Nothing is wider than the screen or cut off at its edge. |
| Reading text | 16px or larger for paragraphs; lead/intro text at most ~22px; labels and eyebrows at least 13px. |
| Headings | No word breaks mid-word; a heading never fills most of the screen (use a smaller **phone size**, or fewer words). |
| Tap targets | Every link and button is at least 44px tall, and never squeezed against another. |
| Columns | Text never sits in a strip narrower than ~170px: columns stack on phones. |
| Reading order | Blocks stack in the order a visitor reads them (eyebrow → heading → text → button → photo). |
| Text over photos | Readable over the brightest and darkest part of the photo, at phone crops (overlay or a panel). |
| Photos | No image taller than the screen; photo sections at most ~70% of the screen; set a focal point when a crop loses the subject. |
| Rhythm | Section padding on phones is generous but not empty (no more than ~100px above or below). |
| Header | Logo ~40px tall on phones; the menu button never collides with the title. |
| Forms | Fields and buttons are full width on phones; inputs are 16px so phones don't zoom. |
| Footer | Short and tappable: a few links, contact details, social icons. |

## Fixes and what they change (phone-only unless noted)

- **Re-stack for phones / Lay it out for phones / Place them for phones** — grid sections get phone placements in reading order (`grid.place` at `bp: "m"`).
- **Put the words first on phones** — hero words and button before the photos on phones (grid) or the button's column first (`layout.order.m`).
- **Stack the columns on phones** — `layout.columns.m = [12]`.
- **Tighten the spacing on phones** — `style.padding.m = "lg"`.
- **Shorten it on phones** — photo sections `style.minHeight.m = "70svh"`.
- **Use a smaller size on phones** — heading block `phoneSize` (desktop keeps `size`).
- **Use a 40px logo on phones** — `site.header.logoHeight.m`.
- **Raise the photo overlay / Put the text on a panel** — overlay opacity or a block color theme (these apply at every size; they only ever make text more readable).

## Custom components

Components are checked like everything else. Write their CSS mobile-first: no fixed widths over ~340px (`max-width` and percentages instead), images `max-width: 100%`, grids that collapse to one column under 768px (`@media (max-width: 767px)`), tap targets ≥ 44px, body text ≥ 16px. `phone_check` reports a component that scrolls sideways or overlaps by name.
