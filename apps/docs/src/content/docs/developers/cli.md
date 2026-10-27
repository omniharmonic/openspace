---
title: The openspace CLI
description: Create, check, preview, migrate and eject OpenSpace sites, and run the local MCP server, with the openspace command.
---

The `openspace` command (package `@omniharmonic/openspace-cli`, MIT) works on a site folder. Every new site lists it as a dev dependency, so inside a site `npx openspace …` just works; elsewhere use `npx -y @omniharmonic/openspace-cli …`.

## `openspace new <template> <dir>`

Create a site from a template.

```sh
npx -y @omniharmonic/openspace-cli new harbor riverbend --title "Riverbend Neighbors" --repo riverbend/site
```

| Option | Meaning |
|---|---|
| `--title <title>` | Site title. |
| `--repo <owner/name>` | GitHub repository; sets the Pages address. |
| `--url <url>` | Address before a custom domain, when not using `--repo`. |
| `--domain <hostname>` | Custom domain. |
| `--target <target>` | `github-pages` (default) or `cloudflare`. |
| `--hub <url>` | A self-hosted Hub. |
| `--templates-dir <dir>` | Use templates from a folder (for template authors). |

The folder must be new or empty. You get the template's content and media, a fresh site id, the starter shell, `AGENTS.md` and the publish workflow.

## `openspace import squarespace <url> [dir]`

Move a Squarespace site (7.0 or 7.1) into a new site folder: pages, blog, events, products, images, navigation, forms, SEO, redirects and a Site Styles approximation of the look, plus an `IMPORT-REPORT.md` of what needs your attention. It ends with `openspace check`. See [Move from Squarespace](/guides/migrate-from-squarespace/).

```sh
npx -y @omniharmonic/openspace-cli import squarespace https://www.example.com my-site --export export.xml
```

| Option | Meaning |
|---|---|
| `--owner` | You own the site: also read Squarespace's `?format=json` data (richer collections and SEO). |
| `--export <file>` | Squarespace's WordPress export, for complete blog posts and drafts. |
| `--target`, `--repo`, `--url`, `--domain`, `--title`, `--hub` | As for `openspace new`. |
| `--max-pages <n>` | Most pages and items to read (default 400). |
| `--delay <ms>` | Pause between requests to the site (default 300). |
| `--no-media` | Don't download images and files. |

Requests are paced, `robots.txt` is honoured, and the folder must be new or empty.

## `openspace check [dir]`

Validates the site before publishing: schemas (with file and field names), links (pages, items, navigation, redirects, links inside posts), images (referenced files exist and are in the media library), sizes (warns at 600 MB of media, fails at 900 MB; images over 2400 px), a **secret scan** (anything that looks like an API key fails), and pages that need Cloudflare hosting on GitHub Pages.

```sh
npx openspace check          # human-readable report, exit 1 on errors
npx openspace check --ci     # also GitHub Actions annotations (used by publish.yml)
npx openspace check --json
```

## `openspace dev`

Runs the site locally with live reload (`astro dev`; Astro needs Node 22.23.4 or newer, Node 24 recommended — `dev` stops with a clear message on older Node, and `new` and `check` warn). Extra arguments go to Astro, e.g. `npx openspace dev --port 4000`. `npm run dev` does the same.

## `openspace mcp [dir]`

Runs the OpenSpace MCP server over stdio for a local folder — the same tools as the Hub, plus screenshots, `screenshot_url` (a screenshot of any public page, such as the site you're moving from) and `import_squarespace` (the importer as a tool; it creates a new folder next to the served site). See the [Claude Code plugin](/connect-your-ai/claude-code/).

| Option | Meaning |
|---|---|
| `--no-publish` | The connection can't commit or roll back. |
| `--no-screenshots` | Don't start a browser. |
| `--preview-port <n>` | Fixed port for the local preview server. |

## `openspace migrate [--dry-run]`

Upgrades content to the current schema and block versions. It's a no-op when everything is current; `--dry-run` lists the files it would change.

## `openspace agents-md [--stdout]`

Regenerates `AGENTS.md` — the guide coding agents read — from the installed block library.

## `openspace eject --yes`

Copies site-kit's source into `src/openspace-kit`, rewrites imports and removes the dependency, leaving a plain Astro project. **Studio stops working on ejected sites**, and update pull requests no longer apply — only do this if you want to take the code in your own direction.
