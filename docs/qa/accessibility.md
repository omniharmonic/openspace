# Accessibility

## Studio: axe

`pnpm --filter @openspace/studio check:a11y` runs axe-core 4.14 in Chromium on Studio's main
screens, in light and in dark, at 1440 px with reduced motion, so colors are measured after
panels finish fading in.

- Rule sets: WCAG 2.0/2.1/2.2 A and AA, plus best practices.
- Screens: sign in, dashboard, template gallery, editor, and the Layers, Add section, Site styles,
  Media, Header & footer, Design check and Looks panels.
- Workspace screens: Settings, Content, Form inbox, Email campaigns, Analytics, Orders and Members.
- The page canvas (the owner's site) and preset thumbnails are excluded. They are the
  published templates, which have their own gates: Lighthouse accessibility 100 and the
  templates' axe test.

**Result: 0 serious or critical issues on all 36 screen × theme combinations.**

First run: serious or critical issues on every screen. Fixed:

| Issue | Fix |
|---|---|
| Status badge text ("Needs attention", "Live") under 4.5:1 on its tint | `--st-danger` #c93636 → #bd2f2f, `--st-live` #188350 → #146c43 (light); dark danger #f06464 → #f47676 |
| White labels on dark-mode primary buttons at 4.17:1 | Dark `--st-accent` #5b6cff → #4f5ef5 (4.9:1) |
| Dark secondary text (`--st-text-3`) under 4.5:1 on fields and hovered rows | #8b8d93 → #96989e (≥ 4.6:1 on every dark surface) |
| Presence avatar initials under 4.5:1 on 5 of 8 colors | Darker presence palette, all ≥ 4.6:1 with white |
| Filter selects (journal categories, forms, order kinds, member tiers, subscriber status and tags) with no accessible name | Labelled ("Filter by category", …) |
| Account button named "Account: …" while showing initials | Named by its content (visually hidden "Account:" + the avatar's name) |
| Font pairing buttons named by the pairing while showing a specimen | Specimen text hidden from assistive tech; the name is the visible pairing name |
| Header preset cards: visible name and description ran together ("ClassicChanges…") | A space between them, and the label matches the visible description |
| Settings and workspace screens added a second `main` landmark over the editor's | They are labelled regions |

Remaining (moderate, not gated): `page-has-heading-one` on editor screens (the editor's
headings are panel titles; the page's `h1` is inside the canvas frame) and landmark notes on
workspace screens that sit over the editor. Layer tree items trip the experimental
label-in-name heuristic because a tree item contains its child items; that is the ARIA tree
pattern, so the check skips tree items.

## Studio: keyboard walkthrough

The same script edits without a mouse:

1. Open a site from the dashboard with Enter.
2. ⌥2 opens Layers; Tab reaches the tree.
3. Arrow keys select layers, and the inspector follows.
4. Enter renames a layer and Enter finishes; focus returns to the row with a visible ring.
5. ⌘K opens the command palette, which takes focus; Escape closes it.
6. ⌘Z undoes.
7. Publish opens its dialog from the keyboard.

All steps pass. Fixed along the way: after renaming, focus went back to the row by script
and Chrome showed no ring. The tree now tracks whether the person is using a pointer and shows
the ring on keyboard focus however it arrived.

## Phones

`pnpm --filter @openspace/studio check:phone` (360 / 390 / 430) now also opens the block
inspector sheet and its Design tab. Its controls are 44×44 like the rest of the phone layout:

- formatting buttons;
- override toggles;
- tabs;
- section headers;
- selects.

**Result: no sideways scrolling, every control at least 44×44.**

## Published templates

Lighthouse accessibility is 100 on all twelve demo home pages ([lighthouse.md](lighthouse.md)).
The templates' own axe test (`templates/test`) checks every page of every template.
