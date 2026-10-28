---
description: Move a Squarespace site into a new OpenSpace site and bring it to visual parity
argument-hint: "<squarespace-url> [folder]"
---

Move the user's Squarespace site into OpenSpace. Arguments given: "$ARGUMENTS" (the site address, and optionally the folder to create).

Follow the `openspace-migrate` skill end to end (for other platforms, use `/openspace:migrate`):

1. **Confirm the basics** before fetching anything: that they own the site (or are moving it for the owner), the folder name (default: from the address), and whether they have Squarespace's WordPress export for the blog. Ask whether owner mode (`--owner`, reads `?format=json`) is OK.
2. **Import.** Run `npx -y @omniharmonic/openspace-cli import squarespace <url> <folder>` with the agreed options (or the `import_site` tool with `platform: "squarespace"` and `confirm: true` — `import_squarespace` is its older name — when an OpenSpace site is already served here), then `npm install` in the folder. Read `IMPORT-REPORT.md` and summarise it in plain language.
3. **Switch to the new site.** Ask the user to run `claude` inside the new folder so the `openspace` MCP server serves it; continue there. Check `get_site` responds.
4. **Parity loop, page by page** (home first, then navigation order, at most five passes per page): `screenshot_url` of the original page and `screenshot` of the new one at desktop and mobile, name the biggest differences, fix them with presets, section themes, grid placement and Site Styles (never raw HTML or copied Squarespace CSS), `design_check` and `phone_check` (`fix_for_phones`), look again.
5. **Report items:** go through "Needs attention" with the user (forms and subscribers, custom code, commerce, member areas, links, alt text). Never invent missing content — ask.
6. **Put it live, then celebrate:** `npx openspace check --phone` with zero errors (add `--fix` to fix everything for phones), `get_draft_diff`, then ask one plain question ("Ready for me to put your new site live at its free address? Your Squarespace site isn't touched.") and publish when they agree — never change the hosting target during the move, even with a shop. Then "Your new site is live!" with the link and what they save (they can cancel the Squarespace plan once their address points here), a short "when you're ready" list (their own web address — add it, update the settings where they bought it, check, only then cancel Squarespace; the shop; members; newsletter subscribers), and an honest summary of what still differs. Plain words throughout.

Do not push, publish, change DNS or cancel anything without the user's explicit go-ahead.
