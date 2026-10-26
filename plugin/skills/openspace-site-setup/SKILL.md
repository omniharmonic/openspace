---
name: openspace-site-setup
description: This skill should be used when the user asks to "create a new website", "start an OpenSpace site", "make a site from a template", "set up openspace", "connect my domain", "put my site online", "publish my site for the first time", "connect Claude to my OpenSpace site", or asks how to get an OpenSpace site running locally, on GitHub Pages or on Cloudflare. It covers creating a site from one of the twelve templates with the openspace CLI, running it, connecting the MCP server, publishing, and connecting a custom domain.
version: 0.1.0
---

# Setting up an OpenSpace site

OpenSpace sites are ordinary folders (and GitHub repositories) holding `openspace.json`, `content/` (JSON pages, site settings, styles, Markdoc collections), `media/`, and a thin Astro shell that builds through `@openspace/site-kit`. There are two ways to work on one:

- **Studio + Hub (no terminal):** the person signs in with GitHub at Studio, picks a template, and is live in about three minutes. Claude connects through the Hub's remote MCP connector. Point non-technical owners here.
- **Local folder + CLI (this plugin's default):** create the site with `openspace new`, edit it with Claude through the local MCP server (`openspace mcp`), publish by committing and pushing.

Ask which one the person wants if it isn't obvious. Never say "repository", "commit", "branch", "build" or "deploy" to an owner who chose Studio unless they use those words first.

## 1. Pick a template

The twelve launch templates (each with three looks):

| Id            | For                                 | Mood                        |
| ------------- | ----------------------------------- | --------------------------- |
| `meadow`      | Yoga, therapy, bodywork, wellness   | Calm, airy, organic         |
| `harbor`      | Nonprofits, community orgs          | Trustworthy, warm, civic    |
| `atelier`     | Photographers, visual artists       | Gallery-first, minimal      |
| `ledger`      | Consultants, coaches, freelancers   | Crisp, editorial, confident |
| `hearth`      | Restaurants, cafés, bakeries        | Warm, appetizing            |
| `signal`      | Products, startups, launches        | Bold, modern, technical     |
| `field-notes` | Writers, newsletters, blogs         | Reading-first, literary     |
| `encore`      | Musicians, performers, podcasters   | Expressive, nocturnal       |
| `kiln`        | Makers and small shops              | Tactile, crafted            |
| `commons`     | Coalitions, cooperatives, movements | Grounded, collective        |
| `vow`         | Weddings and celebrations           | Romantic, refined           |
| `link`        | Link-in-bio, single page            | Mobile-first, punchy        |

Choose by the person's purpose, not their favourite color — looks change color and type later in one call (`apply_template_look`).

## 2. Create the site locally

```sh
npx -y @openspace/cli new meadow my-site --title "Fernwood Yoga" --repo maya/fernwood-yoga
cd my-site
npm install
```

Options for `openspace new <template> <dir>`:

- `--title <title>` — the site title.
- `--repo <owner/name>` — the GitHub repository; sets the GitHub Pages address (`https://owner.github.io/name`).
- `--url <url>` — the address before a custom domain, when not using `--repo`.
- `--domain <hostname>` — a custom domain from the start.
- `--target github-pages|cloudflare` — default `github-pages`. Use `cloudflare` for stores, member areas and password-protected pages (GitHub Pages' terms exclude commerce).
- `--hub <url>` — a self-hosted Hub instead of the public one.

The folder must not exist yet (or be empty). The result has a fresh site id, the template's pages, styles and demo content, `AGENTS.md`, and a `.github/workflows/publish.yml`.

Useful commands inside the site:

- `npx openspace check` — validates schemas, links, images, size budgets and scans for secrets. Run it before every publish.
- `npm run dev` — local preview with live reload (Astro needs Node 22.23.4 or newer).
- `npm run build` — the same static build the publish workflow runs.
- `npx openspace agents-md` — refresh `AGENTS.md` after upgrading packages.

## 3. Connect Claude

With this plugin installed, Claude Code starts `npx -y @openspace/cli mcp` in the folder Claude Code was opened in. Start Claude Code **inside the site folder** (`cd my-site && claude`) so the server finds `openspace.json`. Check with `/mcp` that `openspace` is connected; the tools then appear (`get_site`, `design_check`, `screenshot`…).

- Screenshots need two things: the `playwright` package in the site (`npm i -D playwright`) and a browser — `npx playwright install chromium`, or an installed Google Chrome. Without them, `screenshot` explains what's missing and `render_page` still works.
- Large uploads (> 2400 px) are resized when `sharp` is installed; otherwise they're refused with a hint.
- For unattended runs, run the server with `--no-publish` so the connection can edit but never commit (the plugin README shows the setup).

For a Hub-hosted site (created in Studio), connect the remote server instead — the owner copies a personal link from Studio → Settings → Connect your AI:

```sh
claude mcp add --transport http openspace <personal link or https://hub.openspace.dev/mcp>
```

The plain `/mcp` URL signs in with OAuth (GitHub sign-in, then a consent screen choosing sites and whether publishing is allowed). A personal link (`…/mcp/t/…`) works without sign-in and covers one site — treat it like a password.

## 4. Publish

**Local sites (git):**

1. Create an empty public GitHub repository and push the folder (`git init`, `git add -A`, `git commit`, `git remote add origin …`, `git push -u origin main`).
2. In the repository: Settings → Pages → Source: **GitHub Actions**.
3. Every push to `main` runs `publish.yml`: install, `openspace check --ci`, build, deploy. The site appears at `https://owner.github.io/name` in about a minute.

Through MCP, `publish` (with `confirm: true`, only after the owner asks) commits `content/` and `media/` on the current branch with a change summary; pushing that commit publishes. `rollback` restores a version from `list_versions` as a new commit.

**Studio sites:** the owner presses Publish in Studio, or Claude calls `publish` with `confirm: true` if the connection was granted publishing.

## 5. Connect a custom domain

**In Studio:** Settings → Domain. The wizard detects the registrar, shows the exact records with registrar-specific steps, checks DNS every 15 seconds and turns on HTTPS when the certificate is ready.

**Local / CLI sites on GitHub Pages:**

1. Set `deploy.customDomain` in `openspace.json` (or create the site with `--domain`). site-kit then serves from `/` instead of `/repo`.
2. At the registrar, add four `A` records for the apex (`185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`) and a `CNAME` for `www` pointing to `owner.github.io`.
3. In the repository: Settings → Pages → Custom domain → enter the domain; tick **Enforce HTTPS** once the certificate is issued.
4. Push. The next publish uses the new address everywhere (canonical URLs, sitemap, feeds).

Editing `openspace.json` is a person's job — Claude's MCP tools can't change it. Make that edit with the person's agreement, as a normal file edit.

## Troubleshooting

- _MCP server failed to start:_ Claude Code isn't running in a site folder (no `openspace.json`), or Node is older than 22. Run `npx -y @openspace/cli mcp` by hand to see the message.
- _`npm run dev` says Node is too old:_ install Node 22.23.4 or newer (Astro's requirement).
- _Publish workflow fails at `openspace check`:_ run `npx openspace check` locally; it names the file and field.
- _Pages shows a 404 at the new domain:_ DNS hasn't propagated or the Pages custom domain isn't set yet; recheck in a few minutes.

For design work after setup, use the `openspace-web-design` skill; for posts, events and products, the `openspace-content` skill.
