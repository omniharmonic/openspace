/** Design guidance for agents (doc 04 §9) — the same rules Studio's Design check enforces. */
export const DESIGN_GUIDANCE = `# OpenSpace design guidance

The same rules power Studio's built-in Design check. Follow them so pages look designed, not assembled.

1. **Start from presets.** Compose pages from section presets (list_section_presets); customize fields before styles; use exact values only when asked.
2. **One primary action per screenful.** Secondary actions use secondary or tertiary button styles.
3. **Create rhythm with color themes.** Alternate surfaces deliberately (e.g., Light → Light accent → Light → Dark for a finale); avoid more than three consecutive sections with the same theme on long pages, and avoid flipping every section.
4. **Respect copy lengths.** Use each preset's recommended ranges; shorten rather than shrink type.
5. **Keep image aspect ratios consistent within a section.**
6. **Two typefaces maximum.** Change the pairing in Site Styles rather than per block.
7. **Never invent facts, testimonials, prices or credentials.** Ask the owner.
8. **Alt text describes the image's purpose,** not just its contents; decorative images are marked decorative.
9. **Check mobile.** After any grid change, review the mobile placement.
10. **Prefer fewer, stronger sections** over many thin ones.
11. **Custom components for bespoke moments only.** When no preset can express a distinctive section (an editorial hero, a layered collage, a horizontal story), use a custom component (list_components → create_component or insert_component from the Designer components library). Expose every word, image and link as a field (owners edit fields, never code), style only with theme tokens (var(--os-color-…), var(--os-font-…), var(--os-space-…)), use the 767/768/1199/1200 breakpoints, honour reduced motion, and look at it with preview_component before showing the owner.

Design check flags (custom components too: invalid code, budgets, motion, fixed colours, accessibility): contrast failures, more than two families, headings out of order, empty sections, images above 2× their displayed size, missing alt text, overlapping text in grid sections, and pages without a clear call to action.

## Working with OpenSpace

- Content is structured: sections hold blocks; every section and block has a stable id — target edits by id and never recreate what you can update.
- Styles come from Site Styles tokens (palette, pairing, density, shape, buttons, motion, image treatment). Never write inline CSS; restyle with set_styles or apply_template_look.
- Section color themes: light, light-accent, dark, dark-accent, brand. The contrast solver keeps text readable in all five.
- Rich text is Markdown: headings (#–####), **bold**, *italic*, [links](/contact), lists, > quotes; a trailing {.lead} sets a paragraph preset.
- Edits land in the draft. The owner publishes — call publish only when they ask, with confirm: true.
`;

/** The rapid design-iteration loop (resource + `iterate-design` prompt). */
export const ITERATION_GUIDANCE = `# Design iteration loop

Repeat until the page is right, keeping each pass small:

1. **Inspect** — get_page (detail "outline") for ids and copy; get_styles for the current look.
2. **Check** — design_check on the page. Fix errors first (apply_fix for autofixable issues), then warnings that matter.
3. **Edit** — one intent per pass: replace demo copy (update_block), swap a section for a better preset (insert_section + delete_section), adjust a section's color theme for rhythm (update_section colorTheme), or restyle globally (set_styles / apply_template_look).
4. **Look** — screenshot the page (or just the section you changed) at desktop and mobile; use render_page when screenshots are unavailable.
5. **Judge** — hierarchy (one H1, clear headline), one primary action per screen, rhythm of themes, copy within preset ranges, images consistent, nothing cramped on mobile. Then go back to 2.

Finish with design_check showing zero errors and get_draft_diff to summarise the work for the owner.
`;
