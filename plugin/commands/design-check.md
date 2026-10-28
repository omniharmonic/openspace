---
description: Run a design, phone and SEO review of an OpenSpace page or site
argument-hint: "[page] (default: whole site)"
---

Review the design of the OpenSpace site for the user. Target: "$ARGUMENTS" (a page id, slug or title; empty means the whole site).

Use the `openspace` MCP tools and the `openspace-web-design` skill.

1. Call `get_site` to learn the pages. Read `openspace://guidance/design` if not read in this session.
2. Call `design_check` (with `page` when one was given; checks `["design", "seo"]`) and `phone_check` (same scope) — the Phone check measures the pages as a phone at 360 and 390 px where a browser is available.
3. For each page in scope, call `get_page` with `detail: "outline"` and take a `screenshot` at `device: "desktop"` and `device: "mobile"` (fall back to `render_page` with `fragment: true` if screenshots are unavailable). For a whole-site review, prioritise the home page and the most important inner pages.
4. Judge each page against the craft checklist: hierarchy and H1, one primary action per screenful, color-theme rhythm, copy within preset ranges, image consistency and alt text, two typefaces, mobile layout, nothing invented.
5. Report concisely, grouped by severity:
   - **Errors** from design_check (with issue ids and whether an autofix exists).
   - **Phones**: phone_check errors and warnings in plain words (what a visitor on a phone would notice), and that `fix_for_phones` fixes the ones with an automatic fix without touching desktop.
   - **Design issues** seen in the screenshots, each with the section id and a concrete fix using the tools (e.g. "swap sec_… for `testimonials/large-single@1`", "set sec_… to `light-accent`").
   - **SEO** issues (missing or duplicate descriptions, titles).
6. Ask whether to apply the fixes. Do not change anything until the user agrees; autofixable issues can then be cleared with `apply_fix`, and phone issues with `fix_for_phones` (then `phone_check` again).
