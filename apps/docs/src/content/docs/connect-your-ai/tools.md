---
title: Tools reference
description: Every tool, prompt and resource the OpenSpace MCP server offers to your AI, locally and on the Hub.
---

The same tools are served by the Hub (`/mcp`, for sites in Studio) and by `openspace mcp` (for a local folder). Your AI discovers them automatically; this page is for the curious. Most tools take an optional `site` id, which can be left out when the connection covers one site. Rich text goes in and out as Markdown.

## Reading

| Tool | What it does |
|---|---|
| `list_sites` | Sites this connection can edit. With none yet, Claude offers to create one or move your existing site. |
| `create_site` | Hub only: create a new site from a template and look (needs **Create new sites** on the consent screen). The first time, it gives you a Studio link to approve OpenSpace on GitHub. |
| `start_site` | Hub only: Start with Claude — a new site from the person's idea (what it's for, who it's for, how it should feel) and brand material (a design-token file, colours, fonts) or a page Claude made (`html`). It goes live at once. See [Start with Claude](/guides/start-with-claude/). |
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
| `screenshot` | An image of a draft page or one section at desktop, tablet or phone width. On the Hub it is taken in the cloud (nothing to install); tall pages come back as several images. |
| `preview` | A preview link to share with you. |

## Design system

| Tool | What it does |
|---|---|
| `get_design_system` | The site's design system: what the site is for, the brand material the owner brought, its colours, fonts, sizes and design rules. Claude reads it before designing. |
| `update_design_system` | Save changes to it, or read a design-token file (W3C, Style Dictionary, Tokens Studio, a brand kit); with `applyToStyles` it restyles the site, readability-checked. |

## Custom components

Designer sections with their own design that you still edit through their fields (words, pictures, links). Claude reaches for them only when no ready-made section fits; only owners and designers can change their code.

| Tool | What it does |
|---|---|
| `list_components` | The site's designer sections and the Designer components library. |
| `get_component` | One designer section's full definition, where it is used and any problems. |
| `create_component` | Adds a designer section to the site, from the library or a new design. |
| `update_component` | Changes a designer section's design; sections using it stay working. |
| `preview_component` | Pictures of a designer section on its own (desktop and phone), with any problems found. |
| `insert_component` | Places a designer section on a page. |

## Publishing and history

| Tool | What it does |
|---|---|
| `get_draft_diff` | Plain-language summary of unpublished changes. |
| `publish` | Publish — needs `confirm: true` and publish permission. |
| `discard_draft` | Throw away unpublished changes — needs `confirm: true`. |
| `list_versions` / `rollback` | Published versions, and restoring one — rollback needs `confirm: true`. |
| `create_snapshot` | A named save point before a risky change. |

## Tools that reach the web

These fetch other websites. The Hub runs them in the cloud; the local server (`openspace mcp`, used by the Claude Code plugin) runs them on your computer.

| Tool | What it does |
|---|---|
| `screenshot_url` | An image of any public page — for example the site you're moving from — at desktop, tablet or phone width, to compare with `screenshot`. On the Hub, give it `site` (and `page`) instead of an address to capture your live, published page. Private and internal addresses are refused. |
| `import_site` | Imports a site from any platform — Squarespace, WordPress, Wix, Webflow, GitHub Pages or any HTML site, detected automatically — after asking for confirmation. On the Hub it runs in the cloud and creates a new site on free hosting (`confirmOwnership: true` once the person says it's theirs; `inPlace: true` makes their own GitHub Pages repository editable where it is, through a pull request they approve); locally it writes a new folder next to the site being served. A page Claude made goes in as `html` instead of an address: each section keeps its design and becomes editable. See [Move your site to OpenSpace](/guides/migrate-to-openspace/). |
| `import_squarespace` | Local server: the older name of `import_site`, for Squarespace sites. |
| `import_status` | Hub only: how a move is going — the steps, how many pages and images came across, what needs attention, the Finish setting up list, and the live address when it's done. |

Screenshots on the Hub are limited to about forty every ten minutes per person, so Claude prefers one section at one width while it iterates.

## Prompts

`design-a-page`, `restyle-site`, `write-blog-post` and `iterate-design`.

## Resources

- `openspace://guidance/design` — the design rules (the same ones Studio's Design check uses).
- `openspace://guidance/iteration` — the inspect → check → edit → look → judge loop.
- `openspace://presets` — the full section preset catalog.
- `openspace://schemas/…` — JSON Schemas for pages, sections, blocks, site settings, styles, rich text and collection items.
- `openspace://sites/{id}/tokens` and `openspace://sites/{id}/agents-md` — a site's design tokens and its `AGENTS.md`.
