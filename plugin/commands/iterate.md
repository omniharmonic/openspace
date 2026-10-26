---
description: Rapid design iteration loop on one page with screenshots
argument-hint: "[page] [goal, e.g. stronger hero, calmer mobile]"
---

Run a rapid design iteration loop on an OpenSpace page. Page and goal: "$ARGUMENTS" (default page: home).

Follow the `openspace-web-design` skill's iteration loop with the `openspace` MCP tools. Keep each pass to one intent and look at the result every time.

1. **Orient (once):** read `openspace://guidance/iteration` if not read in this session. `get_page` with `detail: "outline"`, `get_styles` (without options), and a `screenshot` at `device: "all"` as the baseline. State the goal and the two or three biggest problems you see.
2. **Loop (up to 5 passes, or until the goal is met):**
   1. `design_check` on the page; fix errors first (`apply_fix` for autofixable issues).
   2. Make **one** improvement: rewrite weak copy (`update_block`), swap a section for a stronger preset (`insert_section` + `delete_section`), fix theme rhythm (`update_section` `colorTheme`), adjust grid placement (`place_in_grid`, then `auto_mobile_layout`), or a global Site Styles change (`set_styles` / `apply_template_look`).
   3. `screenshot` what changed — just the `section` for local edits, the whole page for structural or style changes — at desktop, and at mobile whenever layout or long headlines changed.
   4. Judge against the craft checklist (hierarchy, one primary action, rhythm, copy length, images, two typefaces, mobile, truth). Say in one line what improved and what's next.
3. Never invent facts, quotes, prices or credentials — if the improvement needs content only the owner has, ask and move on to another improvement meanwhile.
4. **Finish:** `design_check` with zero errors, a final `screenshot` at desktop and mobile, then `get_draft_diff` to summarise. Offer `preview` for the owner to look. Don't publish unless asked.
