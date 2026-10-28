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

## `openspace import <url> [dir]`

Move an existing site into a new site folder: pages, blog posts, images, navigation, forms, SEO, redirects and a Site Styles approximation of the look, plus an `IMPORT-REPORT.md` of what needs your attention. It ends with `openspace check`. The platform is detected from the home page; or name the importer:

- `openspace import squarespace <url> [dir]` — Squarespace 7.0 and 7.1 (also events, products and portfolio);
- `openspace import wordpress <url> [dir]` — WordPress, from the public REST API and/or the WXR export;
- `openspace import github <repo> [dir]` — a GitHub Pages site from its repository (`owner/name`, a github.com or `*.github.io` address; `--source-dir` reads a checkout): Jekyll from source, content files with typed sections (Decap/Sveltia CMS, Astro), plain HTML, Hugo/Eleventy from the published pages;
- `openspace import url <url> [dir]` — any other site (Wix, Webflow, Carrd, Framer, hand-made HTML).

Imports always target GitHub Pages hosting; a shop, members or password pages are listed in `content/setup-checklist.json` for after launch. In Studio, **Move an existing site** runs the same importer in the new site's GitHub Actions — nothing to install.

See [Move your site to OpenSpace](/guides/migrate-to-openspace/).

```sh
npx -y @omniharmonic/openspace-cli import https://www.example.com my-site
npx -y @omniharmonic/openspace-cli import squarespace https://www.example.com my-site --export export.xml
npx -y @omniharmonic/openspace-cli import wordpress https://www.example.com my-site --export site.WordPress.xml
```

| Option | Meaning |
|---|---|
| `--platform <name>` | Skip detection (`import <url>` only): `squarespace`, `wordpress`, `wix`, `webflow`, `framer`, `carrd`… or `url`. |
| `--owner` | Squarespace: you own the site, so also read `?format=json` data (richer collections and SEO). |
| `--export <file>` | A WordPress export (WXR): a WordPress site's full export, or Squarespace's blog export. |
| `--render` | Read pages in a browser first (Playwright), for sites built by JavaScript. Not for `import squarespace`/`wordpress`. |
| `--repo`, `--url`, `--domain`, `--title`, `--hub` | As for `openspace new`. |
| `--into-existing` | Import into an existing site folder: keep `openspace.json` (site id, address), replace content and media. |
| `--summary <file>` | Also write a JSON summary (pages, images, check result). |
| `--source-dir <dir>` | `import github` only: read this checkout instead of downloading the repository. |
| `--max-pages <n>` | Most pages and items to read (default 400). |
| `--delay <ms>` | Pause between requests to the site (default 300). |
| `--no-media` | Skip images and files (structure only). |

## `openspace check [dir]`

Validates the site before publishing: schemas (with file and field names), links (pages, items, navigation, redirects, links inside posts), images (referenced files exist and are in the media library), sizes (warns at 600 MB of media, fails at 900 MB; images over 2400 px), a **secret scan** (anything that looks like an API key fails), and pages that need Cloudflare hosting on GitHub Pages. Phone problems that need no browser (sections not laid out for phones, squeezed columns, padding that empties a phone screen, heading words too long for a phone line, tall photo sections, fixed widths in custom CSS) are listed as warnings — they never fail a publish.

```sh
npx openspace check          # human-readable report, exit 1 on errors
npx openspace check --ci     # also GitHub Actions annotations (used by publish.yml)
npx openspace check --json
npx openspace check --phone        # also the Phone check in a real browser (Playwright) at 360 and 390 px
npx openspace check --phone --fix  # fix everything for phones (phone-only settings; writes content/)
```

The [Phone check](/guides/phones/) renders every page exactly as published, lays it out as a phone and measures it: sideways scrolling, cut-off or overlapping text, small text, tap targets under 44 px, text over photos, the main button below the first screen. It exits 1 on phone errors. Without Playwright (`npm i -D playwright && npx playwright install chromium`) only the rules that need no browser run.

## `openspace dev`

Runs the site locally with live reload (`astro dev`; Astro needs Node 22.23.4 or newer, Node 24 recommended — `dev` stops with a clear message on older Node, and `new` and `check` warn). Extra arguments go to Astro, e.g. `npx openspace dev --port 4000`. `npm run dev` does the same.

## `openspace mcp [dir]`

Runs the OpenSpace MCP server over stdio for a local folder — the same tools as the Hub, plus screenshots, `screenshot_url` (a screenshot of any public page, such as the site you're moving from) and `import_site` (the importer as a tool, any platform; it creates a new folder next to the served site — `import_squarespace` is its older name). See the [Claude Code plugin](/connect-your-ai/claude-code/).

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
