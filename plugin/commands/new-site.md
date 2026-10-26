---
description: Create a new OpenSpace site from a template
argument-hint: "[template] [folder] [what the site is for]"
---

Create a new OpenSpace website for the user. Arguments given: "$ARGUMENTS".

Follow the `openspace-site-setup` skill. In short:

1. Work out the template, the folder name and what the site is for from the arguments. If the template is missing, recommend one or two of the twelve (`meadow`, `harbor`, `atelier`, `ledger`, `hearth`, `signal`, `field-notes`, `encore`, `kiln`, `commons`, `vow`, `link`) based on the purpose, and ask the user to choose. Ask for the site title if it isn't clear. Ask whether they'll sell products or need member-only pages (then use `--target cloudflare`).
2. Run `npx -y @openspace/cli new <template> <folder> --title "<title>"` (add `--repo owner/name` when they know their GitHub repository, `--domain` for a custom domain). Then `npm install` in the new folder.
3. Run `npx openspace check` in the folder and report the result.
4. Tell the user how to continue with Claude: open Claude Code inside the new folder (`cd <folder> && claude`) so the `openspace` MCP server serves it, then try `/openspace:iterate home` to personalise the home page. Mention `npm run dev` for a local preview (Node 22.23.4+).
5. Offer to replace the demo content with theirs: ask for their real name, tagline, services, photos and contact details. Never invent facts.

Do not create a GitHub repository or push anything without the user's explicit go-ahead.
