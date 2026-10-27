---
name: openspace-web-design
description: This skill should be used when the user asks to "design a page", "make the site look better", "redesign the home page", "improve the hero", "make it feel warmer / more premium / more editorial", "add a section", "make something distinctive / bespoke / high-end", "fix the mobile layout", "review the design", "iterate on the design", or otherwise wants web design work on an OpenSpace site through the openspace MCP tools. It gives the preset-first composition workflow, custom components for bespoke moments, the rapid inspect → design check → edit → screenshot loop with the exact tool names, and Squarespace-grade craft heuristics.
version: 0.2.0
---

# Web design for OpenSpace sites

OpenSpace sites are structured documents, not HTML. Pages hold **sections**; sections hold **blocks**; every page, section and block has a stable id (`pg_…`, `sec_…`, `blk_…`). Looks come from **Site Styles** tokens (palette, type pairing, density, shape, buttons, motion, image treatment) compiled by a contrast-safe theme engine. Every edit goes through the `openspace` MCP server as a validated operation, so a bad edit is rejected with a precise path instead of breaking the page.

Design work here is composition and judgement, not CSS. The levers, in the order to reach for them:

1. **Section presets** — designed sections (hero, about, services, testimonials, pricing, FAQ, CTA, contact…) that render in the site's own styles.
2. **Copy and images** — replace demo copy with the owner's words; keep within each preset's copy ranges.
3. **Section color themes** — `light`, `light-accent`, `dark`, `dark-accent`, `brand`; they create rhythm.
4. **Site Styles** — palette, pairing, density, shape, buttons, motion, image treatment, or a whole template look.
5. **Custom components** — bespoke designer sections (own markup, scoped CSS, a little JS) for the moments presets can't express. Owners still edit them through fields. See "Custom components" below.
6. **Exact values** (token overrides, grid placement) — only when the owner asks for something precise.

Never write inline CSS, never invent facts, and never publish unless the owner explicitly asks. Presets arrive with another business's sample people, quotes, prices and contact details: replace them with the owner's real content (or ask for it) — Design check reports what is left as `sample-content`, and placeholder text as `placeholder-text`.

## Before starting

1. Confirm the `openspace` MCP tools are available (tools named like `get_site`, `design_check`). If they are missing, explain how to connect: the plugin starts `npx -y @omniharmonic/openspace-cli mcp` in the current folder, which must be an OpenSpace site (it has `openspace.json`). For a Hub-hosted site, use the remote connector instead (see the `openspace-site-setup` skill).
2. Read the design rules once per session: the resource `openspace://guidance/design` (and `openspace://guidance/iteration`). They are the same rules Studio's Design check enforces.
3. Call `get_site` to learn page ids, the navigation and the current look. Call `get_styles` before any restyle (pass `options: false` when the option lists aren't needed).

## Preset-first composition

To build or rebuild a page, compose it from presets rather than assembling blocks:

1. Call `list_section_presets` (filter with `category` or `query`) and read each candidate's description, designed-for themes and copy ranges. Use `detail: "full"` only for the shortlist.
2. Pick **5–7 strong sections** for a home page, 3–5 for inner pages. Fewer, stronger sections beat many thin ones.
3. Draft the page in one call: `create_page` with `presets` in order and `themes` for rhythm, e.g. `["hero/split-image@1", "about/story-split@1", "services/image-cards@1", "testimonials/three-cards@1", "cta/banner@1"]` with `["light-accent", "light", "light", "dark", "brand"]`. To redesign an existing page, `insert_section` the new preset next to the old one, then `delete_section` the old one.
4. Replace every piece of demo copy with real content using `update_block` (rich text as Markdown). Ask the owner for anything not already known — names, prices, dates, testimonials, credentials.
5. Set images with `upload_image` (https URL or base64, with purposeful alt text), then put the returned `src` into the image field via `update_block`.
6. Run the iteration loop below until the page is right.

See `references/page-recipes.md` for proven preset sequences per site type (practitioner, nonprofit, portfolio, restaurant, product, writer, event).

## The rapid iteration loop

Keep each pass small — one intent per pass — and look at the result every time.

| Step       | Tools                                                                                                                                                            | What to do                                                                                                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Inspect | `get_page` (`detail: "outline"`), `get_styles`                                                                                                                   | Learn ids, headings, copy previews, themes. Use `detail: "full"` only for the section being edited.                                                                         |
| 2. Check   | `design_check` (page), `apply_fix`                                                                                                                               | Fix **errors** first (autofix where offered: `apply_fix` with the issue ids), then warnings that matter.                                                                    |
| 3. Edit    | `update_block`, `update_section`, `insert_section`, `move_section`, `delete_section`, `set_styles`, `apply_template_look`, `place_in_grid`, `auto_mobile_layout` | One intent: tighten the hero copy, swap a weak section for a better preset, fix the theme rhythm, restyle globally.                                                         |
| 4. Look    | `screenshot` (`device: "desktop"`, then `"mobile"`; or `"all"`), `render_page`                                                                                   | Screenshot the section that changed (`section: "sec_…"`) for speed; the whole page after structural changes. Without screenshots, read `render_page` with `fragment: true`. |
| 5. Judge   | —                                                                                                                                                                | Apply the craft checklist below. If anything fails, go back to step 2.                                                                                                      |

Finish with `design_check` showing **zero errors**, then `get_draft_diff` to summarise the work for the owner, and offer `preview` so they can look themselves.

Shortcuts that save round-trips:

- `get_page` outline + one `design_check` tells most of the story; avoid `detail: "full"` on whole pages.
- `screenshot` a single `section` after copy edits; a full page only after adding, removing or moving sections.
- `update_section` with `colorTheme` alone fixes rhythm; no need to touch blocks.
- `apply_fix` with `"all"` and a `page` clears every autofixable issue at once.
- Before a risky restyle, `create_snapshot` with a name such as `before-warmer-look`.

## Craft checklist (judge every screenshot)

Squarespace-grade means calm, confident, and intentional. Check, in order:

1. **Hierarchy.** One H1 per page (the hero headline). Headline 3–9 words; supporting line one or two sentences. Eyebrows are short labels, not sentences.
2. **One primary action per screenful.** The hero has one primary button; a second action uses a secondary or tertiary style. The page ends with a clear call to action.
3. **Rhythm.** Alternate surfaces deliberately: e.g. Light accent → Light → Light → Dark → Brand finale. Never more than three consecutive sections with the same theme; never flip every section.
4. **Copy fits the design.** Stay within each preset's recommended ranges; shorten copy rather than shrinking type. Body lines stay readable (the presets cap measure near 70 characters).
5. **Images.** Consistent aspect ratios within a section; focal points on faces and subjects; nothing upscaled; alt text says what the image is _for_; decorative images marked decorative.
6. **Type.** Two families maximum, set by the pairing in Site Styles — never per block.
7. **Whitespace and alignment.** Edges line up across sections; no cramped cards; density chosen globally (`compact` / `comfortable` / `airy`), not by padding hacks.
8. **Mobile (390 px).** Headline doesn't break into one-word lines; buttons are full and tappable; grid sections read top-to-bottom in a sensible order; nothing overlaps. After any grid change, run `auto_mobile_layout` and screenshot `device: "mobile"`.
9. **Truth.** No invented testimonials, prices, awards, client logos, statistics or credentials. Placeholder demo copy from presets is gone.
10. **Accessibility.** Design check shows no contrast failures and headings are in order. Overrides that fail contrast are adjusted automatically by `set_styles` — read its explanation.

More detailed heuristics (hero formulas, section-by-section guidance, restyle moods, image direction) live in `references/craft-heuristics.md`.

## Restyling

- For a new mood, try a **template look** first: `list_templates`, then `apply_template_look` (`resetOverrides: true` for a clean switch). Content and layout stay; only Site Styles change.
- For finer changes, `set_styles` with `choices` (pairing, density, shape, buttons, motion, imageTreatment) or a curated `palette` id from `get_styles` options. A brand color goes in `choices.palette.brand`.
- Use `overrides` (exact DTCG token values) only for an exact brand requirement. Contrast is enforced: failing overrides move to the nearest accessible shade (`onContrast: "adjust"`), or are refused with `"reject"`.
- After a restyle, screenshot the home page at desktop and mobile and one inner page; re-run `design_check`.

## Custom components (bespoke moments)

Presets first, always. Reach for a custom component only when the design calls for something no preset can express — an editorial hero with an animated reveal, a layered photo collage, a horizontal scroll story, a bento grid, a testimonial marquee — and at most one or two per page. The page keeps its simple structure: a component is one section whose words, images and links are **fields** the owner edits in Studio like any block.

1. `list_components` — the site's components and the opt-in **Designer components** library. Adapting a library design beats writing one from scratch: `insert_component` with a library `name` adds it to the site and places it (then `update_block` its fields with real content), or `create_component` with `from` and a new `name` to adapt its code with `update_component`.
2. For a new design, `create_component` with a full definition (`references/custom-components.md` has the format, template syntax and a worked example). Rules:
   - **Every word, image and link is a field** (text, richText, image with focal point, link, select, boolean, number, color token, list of items). Never hard-code copy in the template; `defaults` holds realistic sample content.
   - **Always on tokens**: colours `var(--os-color-text|heading|accent|surface|border|…)`, fonts `var(--os-font-heading|body|label)`, type `var(--os-type-h2-font-size)`, spacing `var(--os-space-md|lg|xl)`, radii `var(--os-radius-card|image)`. Fixed colours are flagged; Site Styles and section themes must restyle it.
   - Breakpoints `(max-width: 767px)`, `(min-width: 768px)`, `(min-width: 1200px)`; check it at 390 px.
   - Motion: wrap animations with `@media (prefers-reduced-motion: reduce) { … }`; JS reads `ctx.reducedMotion`. JS is optional progressive enhancement only (the section must work without it), DOM-only — no network, eval or innerHTML.
3. `insert_component` on the page, then `preview_component` (desktop + mobile screenshots of the component alone, plus its findings). Fix every **error** it reports (accessibility, contrast, motion, budgets) and the warnings that matter, with `update_component`, then screenshot the page in context.
4. Changing fields of a component already in use: keep changes compatible (new fields optional), or raise `version` and pass `migrate` (`rename`/`set`/`remove`) so existing sections upgrade in the same step.
5. Tell the owner in plain words: "This section has its own design; you can change its words and pictures like any other section." Only owners and designers can change a component's code.

## Grid sections

Grid sections are Fluid-Engine-style: 24 columns on desktop/tablet, 8 on mobile, 1-based rects `{x, y, w, h, z?}`; rows grow to fit text. Use `place_in_grid` with `d` (and `m` when needed). Overlap images freely with `z`, but text must never overlap text. After any grid change, `auto_mobile_layout` then a mobile screenshot.

## Safety rules

- Edits land in the **draft**; the live site changes only on publish. A snapshot is taken automatically before the first edit of each session, so all of Claude's changes can be undone.
- `publish`, `rollback`, `discard_draft` and `delete_page` need `confirm: true` — pass it only after the owner explicitly agrees in this conversation. Run `design_check` before publishing.
- Custom code (custom CSS, head/footer injection), `src/`, workflows and `openspace.json` are off-limits through MCP.
- When a tool rejects an edit, read the error path and hint, fix the input, and retry; nothing was changed.

## Additional resources

- **`references/tool-reference.md`** — every MCP tool with its arguments, grouped by job, plus prompts and resources.
- **`references/craft-heuristics.md`** — detailed design heuristics: hero formulas, section guidance, theme rhythms, mood → Site Styles mappings, image direction, mobile review.
- **`references/page-recipes.md`** — preset sequences for common pages and site types, with themes.
- **`references/custom-components.md`** — the custom component format, template language, CSS/JS rules and a worked example.
- The server's `iterate-design` prompt runs the same loop for one page; `design-a-page`, `restyle-site` and `write-blog-post` are also available.
