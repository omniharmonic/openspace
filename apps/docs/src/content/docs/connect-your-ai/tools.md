---
title: Tools reference
description: Every tool, prompt and resource the OpenSpace MCP server offers to your AI, locally and on the Hub.
---

The same tools are served by the Hub (`/mcp`, for sites in Studio) and by `openspace mcp` (for a local folder). Your AI discovers them automatically; this page is for the curious. Most tools take an optional `site` id, which can be left out when the connection covers one site. Rich text goes in and out as Markdown.

## Reading

| Tool | What it does |
|---|---|
| `list_sites` | Sites this connection can edit. |
| `get_site` | Settings, navigation, header and footer, Site Styles summary, pages and collections. |
| `get_page` | A page's sections and blocks with their ids — `outline` or `full` detail. |
| `list_blocks` / `get_block_schema` | The block catalog, with each block's fields and AI guidance. |
| `list_section_presets` | Designed section presets by category, with copy lengths and themes. |

## Editing

| Tool | What it does |
|---|---|
| `insert_section` | Add a section from a preset (preferred) or by hand. |
| `update_section` / `move_section` / `delete_section` | Change, reorder or remove a section. |
| `insert_block` / `update_block` / `move_block` / `delete_block` | Work with blocks; fields are validated. |
| `place_in_grid` / `auto_mobile_layout` | Grid placement per device; phone layout by reading order. |
| `create_page` / `update_page` / `delete_page` | Pages — `create_page` can build a page from a list of presets. |
| `update_navigation` / `update_site` | The menu and site settings (not custom code). |
| `upload_image` | Add an image from a link or data; resized and stripped of metadata. |
| `create_post` / `update_post` / `list_posts` | Blog posts, events, products and other collection items. |

## Design

| Tool | What it does |
|---|---|
| `get_styles` / `set_styles` | Read or change Site Styles; every change is contrast-checked. |
| `list_templates` / `apply_template_look` | Template looks, applied without touching content. |
| `design_check` / `apply_fix` | Studio's Design check and SEO check, with one-step fixes. |
| `render_page` | The page as HTML from the real renderer. |
| `screenshot` | PNG at desktop, tablet or phone width (local server only, for now). |
| `preview` | A preview link to share with you. |

## Publishing and history

| Tool | What it does |
|---|---|
| `get_draft_diff` | Plain-language summary of unpublished changes. |
| `publish` | Publish — needs `confirm: true` and publish permission. |
| `discard_draft` | Throw away unpublished changes — needs `confirm: true`. |
| `list_versions` / `rollback` | Published versions, and restoring one — rollback needs `confirm: true`. |
| `create_snapshot` | A named save point before a risky change. |

## Local server only

The local server (`openspace mcp`, used by the Claude Code plugin) adds two tools that reach the web:

| Tool | What it does |
|---|---|
| `screenshot_url` | PNG of any public page — for example the site you're moving from — at desktop, tablet or phone width, to compare with `screenshot`. |
| `import_site` | Imports a site from any platform — Squarespace, WordPress, Wix, Webflow or any HTML site, detected automatically — into a new folder next to the site being served (asks for confirmation first). See [Move your site to OpenSpace](/guides/migrate-to-openspace/). |
| `import_squarespace` | The older name of `import_site`, for Squarespace sites. |

## Prompts

`design-a-page`, `restyle-site`, `write-blog-post` and `iterate-design`.

## Resources

- `openspace://guidance/design` — the design rules (the same ones Studio's Design check uses).
- `openspace://guidance/iteration` — the inspect → check → edit → look → judge loop.
- `openspace://presets` — the full section preset catalog.
- `openspace://schemas/…` — JSON Schemas for pages, sections, blocks, site settings, styles, rich text and collection items.
- `openspace://sites/{id}/tokens` and `openspace://sites/{id}/agents-md` — a site's design tokens and its `AGENTS.md`.
