---
title: Great on phones
description: How OpenSpace makes every page work on phones automatically, checks it before you publish, and fixes what it finds in one click — without changing your desktop design.
---

Most people who visit your site will see it on a phone. OpenSpace is built so that what you design on a big screen also works on a small one — and so that you never have to wonder.

## It works on phones by default

When you design on desktop, phones get sensible versions automatically:

- **Columns stack.** Text and pictures that sit side by side on desktop go one under the other on a phone.
- **Spacing comes down.** Generous desktop spacing is lighter on phones, so your content isn't pushed off the screen.
- **Text stays readable.** Paragraphs stay a comfortable size, big introductions don't turn into walls of huge text, and small labels never become too tiny to read.
- **Everything is easy to tap.** Links, buttons, menu items and social icons get tap areas at least 44 pixels tall — the size of a fingertip.
- **Nothing runs off the screen.** Long web addresses wrap, wide tables scroll inside their own box, and very tall photos are cropped to fit (around the focus point you chose).
- **Forms fit.** Fields and buttons are full width, and phones don't zoom in when someone taps a field.
- **Blocks you place freely** (in a free-form section) are laid out for phones in the order people read them. Add a block on desktop and the phone layout follows — unless you've arranged the phone layout yourself, in which case the new block goes last for you to place.

None of this changes your desktop design.

## The Phone check

Some things can't be decided automatically — a very long word in a big heading, a photo hero that pushes your main button off the first screen, text placed over a busy photo. The **Phone check** looks for them:

- **While you edit.** Switch the canvas to the phone view (the phone icon at the top). OpenSpace lays the page out as a phone, outlines anything that doesn't work well, and shows a **Fix for phones** button.
- **In the Design check.** The **Phones** tab lists every phone problem on every page, in plain words, with **Fix everything for phones**.
- **Before you publish.** The publish dialog tells you if anything doesn't work well on phones. OpenSpace measures each changed page as a real phone would show it (on two common phone sizes), so you know before your visitors do.

### What it checks

| | What "good" looks like |
| --- | --- |
| First screen | Your headline and main button are visible without scrolling. |
| Sideways scrolling | None — nothing is wider than the screen or cut off at the edge. |
| Text | Paragraphs at least 16 pixels; no tiny labels; headings that don't break words in half. |
| Tapping | Links and buttons at least 44 pixels tall, not squeezed against each other. |
| Layout | Text never squeezed into a thin strip; blocks in the order people read them; no text on top of other text. |
| Photos | Text over a photo stays readable on its brightest and darkest parts; no photo taller than the screen. |
| Spacing | Comfortable, not empty — no screen that is mostly blank space. |

## Fix for phones

**Fix for phones** (and **Fix everything for phones**) makes phone-only changes: it lays a section out for phones in reading order, puts a hero's words before its photos on phones, stacks columns, lightens spacing, shortens tall photo sections, uses a smaller heading size on phones, or makes a photo's overlay a little darker so text stays readable. Your desktop design stays exactly as you made it, and one **Undo** brings everything back.

A few things need a small edit from you — for example a word too long for any heading size, or a custom design with a fixed width. The check says what to do in each case.

## With Claude

When Claude works on your site (through the Claude app, Claude Desktop or Claude Code), it runs the same Phone check before anything is published and fixes what it finds, using the tools `phone_check` and `fix_for_phones`. You can ask it directly: *"Check my site on phones and fix anything that doesn't look right."*

## Moving a site

When you move a site to OpenSpace from Squarespace, WordPress, Wix, GitHub Pages or anywhere else — or bring a page Claude made — the move ends with the phone fixes already applied. The import report has a short **Phones** note saying what was adjusted.

## For developers

`npx openspace check` lists phone problems that need no browser as warnings. `npx openspace check --phone` also lays every page out as a phone in a real browser (Playwright, at 360 and 390 pixels) and `--fix` applies every phone fix to the content files. See [the CLI](/developers/cli/).
