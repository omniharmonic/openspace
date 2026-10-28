---
description: Create a new OpenSpace site from a template
argument-hint: "[template] [folder] [what the site is for]"
---

Create a new OpenSpace website for the user. Arguments given: "$ARGUMENTS".

Follow the `openspace-site-setup` skill. In short:

1. Work out the template, the folder name and what the site is for from the arguments. If the template is missing, recommend one or two of the twenty (`meadow`, `harbor`, `atelier`, `ledger`, `hearth`, `signal`, `field-notes`, `encore`, `kiln`, `commons`, `vow`, `link`, `darkroom`, `orbit`, `beacon`, `fixwell`, `keystone`, `gather`, `inkwell`, `folio`) based on the purpose, and ask the user to choose. Ask for the site title if it isn't clear. Always create it on the default free hosting (never `--target cloudflare` here); selling and member pages are turned on later from Studio's Finish setting up.
2. Run `npx -y @omniharmonic/openspace-cli new <template> <folder> --title "<title>"` (add `--repo owner/name` when they know their GitHub repository, `--domain` for a custom domain). Then `npm install` in the new folder.
3. Run `npx openspace check --phone` in the folder (the Phone check needs Playwright; without it the rules that need no browser still run) and report the result.
4. Tell the user how to continue with Claude: open Claude Code inside the new folder (`cd <folder> && claude`) so the `openspace` MCP server serves it, then try `/openspace:iterate home` to personalise the home page. Mention `npm run dev` for a local preview (Node 22.23.4+, Node 24 recommended).
5. Offer to replace the demo content with theirs: ask for their real name, tagline, services, photos and contact details. Never invent facts.

Do not create a GitHub repository or push anything without the user's explicit go-ahead.
