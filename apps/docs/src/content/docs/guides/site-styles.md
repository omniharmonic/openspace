---
title: Site Styles
description: Change fonts, colors, buttons, spacing, corners, image treatments and motion for your whole OpenSpace site at once.
---

**Site Styles** (left panel, **⌥4**) controls the look of every page at once. You pick from curated **choices**; OpenSpace's theme engine turns them into a complete, consistent design system. Changes show on the canvas immediately and can be undone.

## Colors

- **Brand color** — pick one, type a hex value, or take it **from your logo** or **from a photo** (Studio suggests five candidate colors).
- **Curated palettes** — twenty tested combinations.
- **Neutrals** — warm, cool or pure grays, tinted toward your brand color.
- **Contrast** — standard or high.

From that one color, OpenSpace generates an accent scale, neutrals and five **section color themes** — *Light*, *Light accent*, *Dark*, *Dark accent* and *Brand* — each with matching text, link, border and button colors. A strip at the top of the panel shows all five.

### Readable by design

The color engine adjusts lightness (never hue) until every text and background pair meets WCAG 2.2 AA: at least 4.5:1 for body text and 3:1 for large text and controls, in every theme. If an exact color you set breaks that, the **Readability** section lists the failing pairs and offers a one-click **Fix** that moves the color to the nearest accessible shade.

## Fonts

Choose a **type pairing** from more than thirty, shown in the real fonts. Every pairing is openly licensed, with heading and body faces, weights and spacing tuned together. Sizes are fluid, so headlines scale smoothly from phone to desktop, and body text keeps a comfortable line length.

Two typefaces are plenty; change the pairing here rather than styling blocks one by one.

### Your own fonts

Owners and designers can **upload a licensed font** under **Fonts → Your fonts → Upload a font**: choose one or more **WOFF2, TTF or OTF** files (one per weight or style), check the weight and style of each, name the family and say what kind of font it is (serif, sans serif, display, monospace or handwriting). You must confirm that **you own the font or its license allows using it on a website**; fonts licensed only for desktop use or print can't be self-hosted.

Then choose whether the font is used for **headings**, **text**, or both. The files publish with your site (`media/fonts/`), load with `font-display: swap` so text never disappears while they arrive, and the main weight is preloaded for a fast first paint. Prefer WOFF2: it's the smallest.

## Spacing and shape

- **Density** — *compact*, *comfortable* or *airy* — scales section padding and gaps together, keeping the rhythm consistent.
- **Corners** — *sharp*, *soft* or *round* — sets the radius of images, cards, inputs and buttons together.

## Buttons, images and motion

- **Buttons**: solid, outline, underline, pill solid, pill outline or text with arrow, in primary, secondary and tertiary roles.
- **Image treatments**: none, rounded, arch, circle, organic blob, duotone, grain or a subtle frame — a site default you can override per block.
- **Motion**: none, subtle or expressive entrance and scroll animations. Animations are always turned off for visitors who ask their device for reduced motion.

## Design tokens (designers and owners)

Behind the choices is a standard set of **design tokens** (W3C DTCG format) stored in `content/styles.json`. Designers and owners can set **exact values** — a precise brand color, letter spacing for display type — in the *Design tokens* section. Exact values are still contrast-checked.

## Looks

A template's **looks** are saved combinations of these choices. See [Switching looks](/templates/#switching-looks).
