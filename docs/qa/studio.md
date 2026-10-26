# Studio design review

Every surface was screenshotted with `pnpm --filter @openspace/studio tour` at 1440, 834 and 390
in light and dark (114 screenshots per run):

- sign in, dashboard, template gallery, onboarding;
- the editor, its seven panels, a selected block, inline text editing, the command palette,
  shortcuts, publish;
- settings and the workspace screens (content, inbox, campaigns, analytics, orders, members);
- on phones: sections, section sheet, block sheet, pages, preview, Check, More.

The tour also audits each screen for sideways scrolling, controls past the right edge and
content wider than its panel or dialog. The first run flagged the phone preview toolbar, and
the panel-width audit flagged Site styles (a hidden color input); the final run flags none.
Most findings below came from looking at the screenshots, not from the audit.

The bar is Figma: precise, calm, keyboard-first, equally finished in light and dark. Findings
below are in priority order, each with the fix. Before/after pairs are in [studio/](studio/).

## Findings and fixes

### Layout breaks

1. **Tablet top bar overlapped itself** (834 px). The status pill, presence avatar and zoom
   control drew on top of each other because the right column of a `1fr auto 1fr` grid
   overflowed into the centre.
   - Fix: under 1200 px, the bar becomes `1fr auto auto`. "Needs attention" and "Saved" become
     their dot and icon (the words stay for screen readers and in the tooltip), and the page
     name hides.
   - [before](studio/block-selected-834-light-before.png) / [after](studio/block-selected-834-light-after.png)
2. **Canvas squeezed to 268 px on tablets** with both side panels open, and **the page ran
   under the inspector**: the fit zoom assumed phone padding (24 px) whenever the canvas was
   narrower than 768 px, though the canvas still pads 48 px each side.
   - Fix: between 768 and 1099 px there is one side panel at a time, enforced by every panel
     action. The rail closes the inspector; the inspector toggle closes the left panel; a pick
     on the canvas shows the inspector; a pick in Layers keeps Layers.
   - The fit zoom measures the canvas's real padding. The tour now flags a page that runs
     under a side panel or past the canvas.
   - [after, inspector](studio/block-selected-834-light-after.png) /
     [after, Layers](studio/panel-layers-834-light-after.png)
3. **Phone preview toolbar ran off the screen** (390 px; a Task 26 concern). The block
   toolbar's last buttons were clipped.
   - Fix: floating toolbars are capped to the page width and scroll sideways.
   - [before](studio/mobile-preview-selected-390-light-before.png) / [after](studio/mobile-preview-selected-390-light-after.png)
4. **Design check panel wider than its column.** The All/Design/SEO switch and "Fix all safe"
   were cut off at the right, because a fix button ("Use the page's first paragraph") had
   no-wrap text, and a grid track sized to it.
   - Fix: the bar's grid is `minmax(0, 1fr)`, the toggle row wraps, and fix buttons wrap
     their label.
   - Every Studio button now caps at its container's width and ends long labels in an
     ellipsis, so this can't recur elsewhere.
   - [before](studio/panel-check-1440-light-before.png) / [after](studio/panel-check-1440-light-after.png)
5. **Phone header wrapped "Your sites" onto two lines** (390 px).
   - Fix: navigation links don't wrap, and under 420 px the mark alone carries the brand.
   - [before](studio/dashboard-390-light-before.png) / [after](studio/dashboard-390-light-after.png)

### Rhythm and alignment

6. **Header & footer panel** was indented 24 px against every other panel's 12, because the tab
   panel and its groups both padded. In the layout gallery, "Classic" sat lower than
   "Centred navigation": the grid stretched its rows.
   - Fix: one padding, and `align-content: start`.
   - [before](studio/panel-chrome-1440-light-before.png) / [after](studio/panel-chrome-1440-light-after.png)
7. **Palette names truncated** ("Monochro…", "Signal Ora…", "Electric Vi…").
   - Fix: the two swatch chips overlap more, and names wrap to a second line instead of an
     ellipsis.
   - [before](studio/panel-styles-1440-light-before.png) / [after](studio/panel-styles-1440-light-after.png)
8. **Header preset thumbnails were strips of blank space** (a Task 26 concern). The preview
   page's `min-height` made each header thumbnail 240 px tall with the header in the top 13 px.
   - Fix: thumbnails fit their content. Headers render at 1024 px (still the desktop layout,
     about 25% larger) above a faint two-line page, so the layout reads.
   - [before](studio/panel-add-1440-light-before.png) / [after](studio/panel-add-1440-light-after.png)
9. **Template gallery: "Use …" buttons at different heights** across a row when descriptions
   differed in length.
   - Fix: the card body is a grid whose description row absorbs the difference.
10. **Phone section sheet summaries read "See the schedule primary First class free…".**
    Option values (button style, alignment, layout) were treated as reading text.
    - Fix: they're excluded in `@openspace/lint`'s `blockText`.

### States and details

11. **Canvas controls over settings and workspace screens.** The device switch and zoom showed
    while a screen covered the canvas.
    - Fix: they step back (hidden, keeping their place in the bar).
12. **Phone Check tab** showed no badge when a check failed (a Task 26 minor).
    - Fix: it shows "!", like the desktop badge, with "couldn't check everything" for screen
      readers.
13. **Inspector controls in phone sheets** were 32 px (formatting buttons, override toggles)
    and 39 px (tabs) (a Task 26 minor). Also, the phone CSS targeted `.st-select__trigger`,
    which doesn't exist.
    - Fix: 44 px. The phone check now opens the block inspector and its Design tab and fails
      on anything smaller.
14. **Contrast and names.** See [accessibility.md](accessibility.md): status badges, dark accent
    buttons, dark secondary text and presence avatars now meet AA; filter selects have names.

### Reviewed and kept

- **Desktop canvas frame height.** At 54% the frame shows about 1200 px of page, then the dotted
  canvas. The cap keeps sections sized in viewport units realistic; the frame scrolls.
- **The first-run checklist** floats over the canvas's bottom-left corner. It can be collapsed
  or dismissed, and it goes away once done.

More "after" screenshots: [editor, dark](studio/editor-1440-dark.png),
[inline text editing](studio/text-editing-1440-light.png),
[analytics, dark](studio/area-analytics-1440-dark.png),
[template gallery](studio/gallery-1440-light.png),
[phone block sheet, dark](studio/mobile-block-sheet-390-dark.png).

## Deferred items from earlier tasks

| Item | Resolution |
|---|---|
| Phone Preview block toolbar overflow at 390 (Task 26) | Fixed (#3) |
| Editor chunk size (Tasks 20–26) | 257.7 → 144.4 KB gz; see [lighthouse.md](lighthouse.md#bundle) |
| Preset thumbnail white space (Task 26) | Fixed (#8) |
| Inspector controls 44 px on phones, included in the phone check (Task 26) | Fixed (#13) |
| StrictMode dev opens the Pages sheet (Task 26) | Fixed: a request already consumed (StrictMode runs the effect twice) is ignored |
| PWA update toast / other tabs reset (Task 26) | "Try again" with other tabs open now tells again (a counter, not a flag) |
| bfcache presence (Task 26) | A tab restored from the back/forward cache says hello again (tested) |
| Logout clears the cache in `finally` (Task 26) | Done; tested with a failing sign-out |
| "Already fixed" on recheck failure (Task 26) | When the re-check itself fails, Studio says it couldn't check again instead of "Already fixed" |
| Mobile Check tab badge on failures (Task 26) | Fixed (#12) |
| about.ts "Walt" vs founder "Marion" (Task 8) | The bike-shop history now names Marion as founder; Jo joins as a partner |
| Lint test comma-selector loophole (Task 7) | Every selector in a list must be allowed |
| Booking split link placement (Task 7) | The fallback link stays under the calendar in the split layout |
| PriceText "now From" phrasing (Task 7) | Prices that start with a word read "Was $80, sale price: From $68" |
| Form ids via `sub()` (Task 7) | Help and error ids use `sub()` |
| Reference/embed Enter resets editing (Task 21) | Enter applies but keeps the field in edit mode; blur hands it back |
| Media kind not validated on pick (Task 21) | Picking audio for a video (or the reverse) is refused with a plain message |
| Thumbnail docs stale for pages and media (Task 21) | Thumbnails follow page titles, slugs and the media library |
| `previewUrl` bare path when the repository is unknown (Task 21) | Previews show the placeholder instead of a broken image |
| Desktop default writes 3xl (Task 21) | Reviewed and kept: 3xl (64/96/128 px by density) is the closest token to every density's section padding, and the hint says so |
| Lint pulls React through blocks (Task 8) | Not changed: it needs a React-free block-definitions entry in `@openspace/blocks`, a structural change outside a polish pass |
| Stale test comments (Task 21) | Not pursued: the note named no specific comments |
| Biome format error in `RoomClient.recovery.test.ts` (Task 24) | Already clean on this branch |
