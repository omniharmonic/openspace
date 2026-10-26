---
description: Restyle an OpenSpace site to a new mood through Site Styles
argument-hint: "[mood, e.g. warmer and more editorial | template look]"
---

Restyle the user's OpenSpace site. Requested mood or look: "$ARGUMENTS".

Use the `openspace` MCP tools and the `openspace-web-design` skill (see its `references/craft-heuristics.md` mood table). Never write inline CSS; change Site Styles only.

1. If no mood was given, ask for one (or offer three directions in a sentence each).
2. Call `get_styles` (with options) and `get_site`. Take a `screenshot` of the home page at desktop as the "before".
3. Call `create_snapshot` with a name like `before-restyle` so the change is easy to undo.
4. Try the closest **template look** first: `list_templates`, then `apply_template_look` with `resetOverrides: true`. If no look fits, use `set_styles` with `choices` (pairing, palette brand/neutral, density, shape, buttons, motion, imageTreatment) or a curated `palette` id. Use exact `overrides` only for a specific brand color the user gave.
5. Read the tool's contrast explanation, if any.
6. Screenshot the home page at desktop and mobile, and one inner page. Compare with the "before". If it misses the mood, adjust one choice at a time and look again (at most three rounds before checking in with the user).
7. Run `design_check` and fix any errors.
8. Summarise what changed (the choices, in plain words) and how to undo it (`discard_draft`, or the `before-restyle` snapshot). Don't publish unless asked.
