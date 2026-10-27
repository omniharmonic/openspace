---
description: Move any website (Squarespace, WordPress, Wix, Webflow, anything) into a new OpenSpace site and bring it to visual parity
argument-hint: "<site-url> [folder]"
---

Move the user's website into OpenSpace. Arguments given: "$ARGUMENTS" (the site address, and optionally the folder to create).

Follow the `openspace-migrate` skill end to end:

1. **Confirm the basics** before fetching anything: that they own the site (or are moving it for the owner), the folder name (default: from the address), and whether they have an export (WordPress: Tools → Export; Squarespace: the blog's WordPress export). For Squarespace, ask whether owner mode (`--owner`, reads `?format=json`) is OK.
2. **Detect and import.** Run `npx -y @omniharmonic/openspace-cli import <url> <folder>` (it detects the platform; add `--export`, `--owner`, `--render` or `--platform` as agreed), or the `import_site` tool with `confirm: true` when an OpenSpace site is already served here. Then `npm install` in the folder. Read `IMPORT-REPORT.md`, tell the user which platform was detected, and summarise the report in plain language. If it says pages had little readable content, offer to re-run with `--render`.
3. **Switch to the new site.** Ask the user to run `claude` inside the new folder so the `openspace` MCP server serves it; continue there. Check `get_site` responds.
4. **Parity loop, page by page** (home first, then navigation order, at most five passes per page): `screenshot_url` of the original page and `screenshot` of the new one at desktop and mobile, name the biggest differences, fix them with presets, section themes, grid placement and Site Styles (never copied template code, CSS or scripts), `design_check`, look again.
5. **Report items:** go through "Needs attention" with the user (forms and subscribers, scripts, plugin/app features, commerce, member areas, links, alt text). Never invent missing content — ask.
6. **Redirects and publishing:** keep the redirects in `content/site.json`; `npx openspace check` with zero errors, `get_draft_diff`, and publish only if they ask.
7. **Domain move and summary:** walk them through it (add the domain, change DNS, verify HTTPS and redirects, only then cancel the old plan or hosting) and give an honest summary of what still differs from the original.

Do not push, publish, change DNS or cancel anything without the user's explicit go-ahead.
