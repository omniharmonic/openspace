---
description: Review the draft and publish an OpenSpace site
argument-hint: "[optional change message]"
---

Publish the user's OpenSpace site. Optional message: "$ARGUMENTS".

Use the `openspace` MCP tools. Publishing changes the live site, so be careful:

1. Call `get_draft_diff` and show the user the plain-language summary of what will change. If there are no changes, say so and stop.
2. Run `design_check` on the whole site with `minSeverity: "error"`. If there are errors, list them and offer to fix them first (`apply_fix` for autofixable ones). Don't publish over errors unless the user insists.
3. Run `phone_check` on the whole site. Most visitors use a phone: if anything doesn't work well on phones, run `fix_for_phones` (phone-only, desktop unchanged) and `phone_check` again; explain anything left in plain words and offer to fix it. Don't publish over phone errors unless the user insists.
4. Ask the user to confirm: "Publish these changes to the live site?" Wait for an explicit yes in this conversation — invoking this command counts as intent, but still confirm after showing the diff.
5. Call `publish` with `confirm: true` (and `message` when one was given).
   - On a local site this commits `content/` and `media/` on the current branch. Tell the user to push (`git push`) to put it online — offer to run it only if they want.
   - On a Hub site the live site updates in about a minute.
   - If the connection isn't allowed to publish, explain how to allow it (Studio → Settings → Connect your AI → "Can publish") or to publish from Studio.
6. Report the result, and mention `list_versions` / `rollback` for undoing a publish.
