---
description: Move a Squarespace site into a new OpenSpace site and bring it to visual parity
argument-hint: "<squarespace-url> [folder]"
---

Move the user's Squarespace site into OpenSpace. Arguments given: "$ARGUMENTS" (the site address, and optionally the folder to create).

Follow the `openspace-migrate` skill end to end (for other platforms, use `/openspace:migrate`):

1. **Confirm the basics** before fetching anything: that they own the site (or are moving it for the owner), the folder name (default: from the address), and whether they have Squarespace's WordPress export for the blog. Ask whether owner mode (`--owner`, reads `?format=json`) is OK.
2. **Import.** Run `npx -y @omniharmonic/openspace-cli import squarespace <url> <folder>` with the agreed options (or the `import_site` tool with `platform: "squarespace"` and `confirm: true` — `import_squarespace` is its older name — when an OpenSpace site is already served here), then `npm install` in the folder. Read `IMPORT-REPORT.md` and summarise it in plain language.
3. **Switch to the new site.** Ask the user to run `claude` inside the new folder so the `openspace` MCP server serves it; continue there. Check `get_site` responds.
4. **Parity loop, page by page** (home first, then navigation order, at most five passes per page): `screenshot_url` of the original page and `screenshot` of the new one at desktop and mobile, name the biggest differences, fix them with presets, section themes, grid placement and Site Styles (never raw HTML or copied Squarespace CSS), `design_check`, look again.
5. **Report items:** go through "Needs attention" with the user (forms and subscribers, custom code, commerce, member areas, links, alt text). Never invent missing content — ask.
6. **Finish:** `npx openspace check` with zero errors, `get_draft_diff`, and publish only if they ask. Then walk them through the domain move (add the domain, change DNS, verify HTTPS and redirects, only then cancel Squarespace) and give an honest summary of what still differs from the original.

Do not push, publish, change DNS or cancel anything without the user's explicit go-ahead.
