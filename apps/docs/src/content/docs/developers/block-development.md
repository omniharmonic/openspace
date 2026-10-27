---
title: Block development
description: Add a new block to the OpenSpace library — schema, fields, variants, rendering, behaviors, AI guidance and tests.
---

Blocks live in `packages/blocks` (MIT). One definition drives three things: the **renderer** (HTML for the published site and Studio's canvas), **Studio** (fields, inspector controls, menus and defaults) and the **MCP tools** (schemas and AI guidance for agents).

## Define a block

```tsx
// packages/blocks/src/blocks/quote.tsx (abridged)
import { cx, RichText } from "@omniharmonic/openspace-renderer";
import { defineBlock, f } from "@omniharmonic/openspace-schema";

export const quoteBlock = defineBlock({
  type: "quote",
  version: 1,
  category: "text",
  label: "Quote",
  icon: "quote",
  description: "A pull quote or epigraph with attribution.",
  fields: {
    quote: f.richText({ marks: ["bold", "italic"], blocks: ["paragraph"], maxLength: 400 }),
    attribution: f.text({ optional: true, maxLength: 80 }),
    source: f.text({ optional: true, maxLength: 120, help: "Book, talk or publication" }),
  },
  variants: ["classic", "large", "bar"],
  styleSlots: ["colorTheme", "padding", "align", "radius", "border", "animation", "typography.quote"],
  ai: {
    purpose: "A short, memorable quotation set apart from body text.",
    whenToUse: "To pause the reader between sections, or to open a page with an epigraph.",
    avoid: "Customer reviews (use testimonial); misattributed or invented quotes.",
  },
  render: ({ fields, variant }) => (
    <figure className={cx("os-quote", `os-quote--${variant}`)}>
      <blockquote className="os-quote__text">
        <RichText doc={fields.quote} />
      </blockquote>
      {fields.attribution ? <figcaption>{fields.attribution}</figcaption> : null}
    </figure>
  ),
});
```

### Fields

`f.text`, `f.richText`, `f.image`, `f.media` (video/audio), `f.link` (page, collection item, URL, email, phone, file, anchor), `f.select`, `f.boolean`, `f.number`, `f.color` (a token reference), `f.list` (a repeatable group of fields), `f.reference` (collection items), `f.form` (a form schema) and `f.embed`. Each builder produces both validation and the metadata Studio and MCP use: labels, help text, limits, defaults and AI hints. Give text fields sensible `maxLength`s — they're guardrails that keep layouts from breaking.

### Rules of the road

- **Tokens, not values.** Style through the block's `styleSlots` and the theme's CSS custom properties (`--os-…`). Never hard-code colors or font sizes.
- **No client React.** `render` runs at build time and in the canvas only. If the block needs interactivity, write a **behavior**: a small vanilla module in `packages/renderer/src/behaviors/`, attached with `data-os-behavior="name"`, under 3 KB gzipped. It must work without JavaScript first.
- **Accessible.** Semantic HTML, labels, keyboard support, WCAG 2.2 AA in all five color themes.
- **Images** go through the renderer's `<Img>` so they get responsive sources, dimensions and focal points.
- **Real defaults.** `defaults` show what the block is for, in real-feeling copy — never lorem ipsum.
- **Version and migrate.** Changing a block's fields bumps `version` and adds a `migrate` step from the old shape, so existing sites update cleanly.
- Use the `os-` class prefix and add the block's CSS to the library stylesheet (`packages/blocks/src/css.ts`).

## Register and test

Add the block to `allBlocks` in `packages/blocks/src/index.ts`. The library's tests then check that every block validates its defaults, renders in every variant without throwing, and has non-empty AI guidance; add tests for anything specific to yours.

```sh
pnpm --filter @omniharmonic/openspace-blocks test
pnpm -w typecheck && pnpm -w test
```

Section presets that use the block live in `packages/blocks/src/presets/`; each declares its copy-length ranges, image aspects, designed-for themes and AI guidance.

## Submitting

Open a pull request against `omniharmonic/openspace`. New blocks go through the `blocks` package review, with the same visual and accessibility checks as templates. See `CONTRIBUTING.md`.
