---
title: Claude Code plugin
description: Install the OpenSpace plugin for Claude Code for rapid web design — local MCP server, design skills, screenshot iteration and publishing commands.
---

The **OpenSpace plugin** turns Claude Code into a careful web designer for OpenSpace sites. It's built for fast loops: inspect the page, run the Design check, make one change, look at real screenshots at desktop and phone widths, repeat.

## Install

In Claude Code:

```
/plugin marketplace add omniharmonic/openspace
/plugin install openspace
```

You need Node.js 22 or newer. Screenshots need the `playwright` package in your site (`npm i -D playwright`) **and** a browser — `npx playwright install chromium`, or an installed Google Chrome; without them Claude falls back to the rendered HTML. To resize large uploads, also `npm i -D sharp`.

## What's included

| Part | What it does |
|---|---|
| **MCP server** | Starts `npx -y @omniharmonic/openspace-cli mcp` in the folder Claude Code runs in: the full OpenSpace tool set against your local site. |
| **Skill: web design** | Preset-first composition, the iteration loop, Squarespace-grade craft heuristics, mobile review and the "never invent facts" rule. |
| **Skill: site setup** | Creating a site from a template, connecting Claude, publishing, connecting a domain. |
| **Skill: content** | Blog posts, events, products, projects and podcast episodes. |
| **Skill: migrate** | Moving a Squarespace site: the import, a side-by-side screenshot loop to match the original, redirects and the domain move. |
| `/openspace:new-site` | Create a site from one of the twenty templates. |
| `/openspace:iterate` | Rapid design iteration on one page, with screenshots after every change. |
| `/openspace:design-check` | A design and SEO review of a page or the whole site. |
| `/openspace:restyle` | Change the whole look to a mood, through looks and Site Styles. |
| `/openspace:publish` | Show what changed, check it, publish after you confirm. |
| `/openspace:import-squarespace` | Move a Squarespace site into OpenSpace and match its look page by page ([guide](/guides/migrate-from-squarespace/)). |
| **Agent: openspace-designer** | An independent design reviewer that returns a prioritized fix list. |

## Work on a local site

The plugin's MCP server serves **the folder Claude Code was started in**, so start Claude Code inside your site (a folder with `openspace.json`):

```sh
npx -y @omniharmonic/openspace-cli new meadow my-site --title "Fernwood Yoga"
cd my-site && npm install
claude
```

Run `/mcp` to check that **openspace** is connected, then try:

```
/openspace:iterate home make the hero warmer and check it on mobile
```

Started somewhere else, the server stops with "Can't serve …: openspace.json …" — the plugin's skills and commands still work, and the server connects next time you start Claude Code in a site folder.

### What happens to your files

- Edits are written to `content/` and `media/` through the same loader and writer the site build uses. Claude can't write `src/`, workflows or `openspace.json`, or change custom code.
- **With git**, your working tree is the draft and the last commit is what's published. Before Claude's first edit in a session, a snapshot tag `os/snap/agent-<time>` records everything (without touching your index or branch), so `git checkout os/snap/agent-… -- content media` undoes all of it.
- `publish` (only after you confirm) commits `content/` and `media/` on the current branch with a summary message. **Push** to put it online — the site's publish workflow does the rest. `rollback` restores an earlier version as a new commit.
- **Without git**, edits are saved to the files and there's no publish step.

### Preview and screenshots

The `preview` tool starts a small preview server on `127.0.0.1` that renders your current files with the real renderer. `screenshot` captures a page — or a single section — at desktop (1440), tablet (834) or phone (390) width, so Claude can see what it built.

### Unattended runs

For scheduled jobs or agents working without you, register the server with `--no-publish` so the connection can edit the draft but never commit or roll back:

```sh
claude mcp add openspace -- npx -y @omniharmonic/openspace-cli mcp . --no-publish
```

Other options: `--no-screenshots`, and `--preview-port <n>` for a fixed preview port.

## Work on a site hosted by the Hub

Sites you created in Studio live on the Hub; connect Claude Code to its remote server:

```sh
claude mcp add --transport http openspace https://hub.openspace.dev/mcp
```

Claude Code opens the sign-in and consent screen on first use (`/mcp` → authenticate). Or use your **personal link** from Studio → Settings → Connect your AI as the URL — it needs no sign-in and covers one site. Edits then land in the same draft Studio shows, live. The Hub can't take screenshots yet; Claude uses rendered HTML and a preview link.

## The iteration loop

The web-design skill teaches Claude this loop (also available as the server's **iterate-design** prompt):

1. **Inspect** — `get_page` with `detail: "outline"`, `get_styles`.
2. **Check** — `design_check`; fix errors first, with `apply_fix` where offered.
3. **Edit** — one intent per pass: better copy, a stronger preset, the color-theme rhythm, a Site Styles change.
4. **Look** — `screenshot` the section that changed, at desktop and phone.
5. **Judge** — one H1, one primary action per screenful, deliberate rhythm, copy within preset ranges, consistent images, two typefaces, a calm phone layout, nothing invented. Repeat.

It finishes with zero Design check errors and a `get_draft_diff` summary for you.

## Other coding agents

Every OpenSpace site ships an `AGENTS.md` describing its structure, blocks and safe-edit rules, and `npx openspace mcp` works with any MCP client that runs local servers.
