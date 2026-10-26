# OpenSpace plugin for Claude Code

Turns Claude into a careful web designer for [OpenSpace](https://github.com/omniharmonic/openspace) sites — the open-source website builder where every site is yours. Claude edits your site through typed, validated operations (never raw HTML), composes pages from designed section presets, restyles through Site Styles, and checks its own work with Design check and real screenshots at desktop, tablet and mobile widths.

What's inside:

| Component                        | What it does                                                                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MCP server** (`.mcp.json`)     | Starts `npx -y @openspace/cli mcp` in the folder Claude Code runs in: the full OpenSpace tool set (read, edit, presets, styles, design check, render, screenshot, publish) against your local site. |
| **Skill `openspace-web-design`** | The design playbook: preset-first composition, the rapid inspect → design check → edit → screenshot loop, Squarespace-grade craft heuristics, mobile review, never inventing facts.                 |
| **Skill `openspace-site-setup`** | Create a site from one of the twelve templates with the CLI, connect Claude, publish, connect a domain.                                                                                             |
| **Skill `openspace-content`**    | Blog posts, events, products, projects and podcast episodes through the content tools.                                                                                                              |
| **`/openspace:new-site`**        | Create a new site from a template.                                                                                                                                                                  |
| **`/openspace:iterate`**         | Rapid design iteration on one page, with screenshots after every change.                                                                                                                            |
| **`/openspace:design-check`**    | A design and SEO review of a page or the whole site.                                                                                                                                                |
| **`/openspace:restyle`**         | Change the whole look to a mood, through template looks and Site Styles.                                                                                                                            |
| **`/openspace:publish`**         | Show what changed, check it, and publish after you confirm.                                                                                                                                         |
| **Agent `openspace-designer`**   | An independent design reviewer that uses Design check, screenshots and rendered HTML and returns a prioritised fix list.                                                                            |

## Install

In Claude Code:

```
/plugin marketplace add omniharmonic/openspace
/plugin install openspace
```

Or in one step on recent Claude Code versions:

```
/plugin install openspace --marketplace omniharmonic/openspace
```

Requirements: Node.js 22 or newer. For screenshots, install the `playwright` package in your site (`npm i -D playwright`) plus a browser: `npx playwright install chromium`, or an installed Google Chrome. For resizing large uploads, `npm i -D sharp`.

## Use it with a local site

The bundled MCP server serves **the folder Claude Code was started in**, which must be an OpenSpace site (it contains `openspace.json`). So:

```sh
npx -y @openspace/cli new meadow my-site --title "Fernwood Yoga"   # or /openspace:new-site
cd my-site && npm install
claude
```

Then check `/mcp` shows `openspace` as connected. If Claude Code is started anywhere else, the server exits with "Can't serve …: openspace.json …" — that's expected; the plugin's skills and commands still load.

Edits are written to `content/` and `media/`. With git, a snapshot tag (`os/snap/agent-…`) is taken before Claude's first edit in each session, so `git checkout os/snap/agent-… -- content media` undoes everything; `publish` commits `content/` and `media/` (only with your confirmation), and pushing puts it online.

To let Claude edit but never commit (for unattended runs), copy [`examples/local-no-publish.mcp.json`](examples/local-no-publish.mcp.json) into your site as `.mcp.json` and disable the plugin's server, or run `claude mcp add openspace -- npx -y @openspace/cli mcp . --no-publish`.

## Use it with a site on the OpenSpace Hub

Sites created in Studio live on the Hub; connect Claude Code to the Hub's remote MCP server instead of the local one:

```sh
claude mcp add --transport http openspace https://hub.openspace.dev/mcp
```

On first use Claude Code opens the Hub's sign-in (GitHub) and a consent screen where you tick the sites Claude may edit and whether it may publish (off by default). Alternatively, paste the **personal link** from Studio → Settings → Connect your AI (`https://hub.openspace.dev/mcp/t/…`) as the URL — it needs no sign-in, covers one site, and should be kept private like a password. Revoke links and connections in the same Settings tab.

A ready-made entry is in [`examples/remote-hub.mcp.json`](examples/remote-hub.mcp.json); a self-hosted Hub uses its own `https://<your-hub>/mcp`. The Hub doesn't take screenshots yet, so Claude falls back to rendered HTML and a preview link there.

## Examples

```
/openspace:iterate home make the hero warmer and check it on mobile
/openspace:design-check
/openspace:restyle calmer and more editorial
/openspace:new-site hearth ember-and-olive a neighbourhood Italian restaurant in Providence
/openspace:publish Updated class schedule for winter
```

Or just ask:

- "Redesign the About page from presets, keep my words, and show me desktop and mobile screenshots."
- "Write a journal post about our new Saturday class from these notes, as a draft."
- "Add the November workshop to events: 21 Nov, 2–4pm, $45, booking link …"
- "Ask the openspace-designer agent to review the site before I publish."

## How Claude is kept safe

- The `openspace-designer` agent is a reviewer: its prompt limits it to read-only tools (`get_*`, `list_*`, `design_check`, `screenshot`, `render_page`, `preview`). Its frontmatter has no `tools:` list on purpose — the MCP tool names differ between the plugin's server (`mcp__plugin_openspace_openspace__…`) and a Hub server added with `claude mcp add` (`mcp__openspace__…`), and an exact list would hide one or the other.

- Every change is a validated operation; invalid edits are rejected with a precise reason and nothing changes.
- Edits land in the draft. Publishing, rolling back, discarding and deleting pages need explicit confirmation from you.
- Claude can't change custom code, the site's build files or `openspace.json` through these tools.
- The design skill forbids inventing testimonials, prices, statistics or credentials.

## Development

The plugin lives in the OpenSpace monorepo at `plugin/`. `pnpm --filter @openspace/claude-plugin test` validates the manifests, frontmatter, every tool and preset the skills mention (against `@openspace/mcp-tools` and `@openspace/blocks`), and builds each page recipe through the real MCP server to check it passes Design check. `claude plugin validate plugin` runs Claude Code's own validator.

License: MIT.
