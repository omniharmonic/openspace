# OpenSpace MCP tool reference

The same tool set is served locally (`openspace mcp`, stdio) and by the Hub (`/mcp`, Streamable HTTP with OAuth). Most tools take an optional `site` (`st_…`), which can be left out when the connection covers one site. Pages can be named by id (`pg_…`), slug or title; `page: "footer"` targets the site footer section. Rich text goes in and comes out as Markdown.

Positions (`at`) accept an index, `"start"`, `"end"`, `{"before": id}` or `{"after": id}`.

## Read

| Tool                   | Arguments                                                | Use                                                                                       |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `list_sites`           | —                                                        | Sites this connection can edit.                                                           |
| `get_site`             | `site?`                                                  | Settings, navigation, header/footer, Site Styles summary, pages, collections. Call first. |
| `get_page`             | `page`, `detail?` (`"full"` \| `"outline"`)              | Section/block tree with ids. Use `outline` to orient, `full` before editing fields.       |
| `list_blocks`          | `category?`, `type?`                                     | Block catalog with fields, variants and AI guidance (`purpose`, `whenToUse`, `avoid`).    |
| `get_block_schema`     | `type`                                                   | JSON Schema of one block's fields.                                                        |
| `list_section_presets` | `category?`, `query?`, `detail?` (`"brief"` \| `"full"`) | Designed sections with copy ranges, themes and guidance.                                  |

Preset categories: header, hero, about, services, features, gallery, testimonials, pricing, faq, team, stats, logos, cta, contact, newsletter, blog, events, products, footer.

## Edit sections and blocks

| Tool                 | Arguments                                                                                                        | Notes                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `insert_section`     | `page`, `preset` _or_ `section`, `at?`, `colorTheme?`, `primaryLink?`, `secondaryLink?`, `collection?`, `label?` | Presets arrive with demo copy — replace it. Header presets restyle the site header; footer presets replace the footer.   |
| `update_section`     | `page`, `section`, `set?`, `unset?`, `colorTheme?`                                                               | Dot paths: `{"style.colorTheme": "dark", "style.padding": {"d": "xl", "m": "lg"}, "anchor": "classes", "hidden": true}`. |
| `move_section`       | `page`, `section`, `at`                                                                                          | Reorder.                                                                                                                 |
| `delete_section`     | `page`, `section`                                                                                                | Recoverable from the session snapshot.                                                                                   |
| `insert_block`       | `page`, `section`, `block` (`{type, fields, variant?, style?, column?, label?}`), `at?`, `place?`                | Stack sections: `column` (0-based). Grid sections: `place` `{d, t?, m?}`.                                                |
| `update_block`       | `page`, `block`, `set?`, `unset?`, `variant?`, `style?`, `column?`, `label?`, `hidden?`                          | `set` replaces whole top-level fields; lists are replaced whole.                                                         |
| `move_block` | `page`, `block`, `to` (`{section, at?, column?, place?}`) | Within a page; `to.section` is required (give the block's own section to reorder in place). `at` defaults to the end. |
| `delete_block`       | `page`, `block`                                                                                                  | Recoverable.                                                                                                             |
| `place_in_grid`      | `page`, `section`, `block`, `d?`, `t?`, `m?`                                                                     | Rects `{x, y, w, h, z?, bleed?}`, 1-based; 24 columns desktop/tablet, 8 mobile. `null` removes `t`/`m`.                  |
| `auto_mobile_layout` | `page`, `section`, `reset?`                                                                                      | Mobile placements by visual reading order.                                                                               |

## Pages, navigation, site, content

| Tool                | Arguments                                                                                                                                                       | Notes                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `create_page`       | `title`, `slug?`, `presets?`, `themes?`, `sections?`, `description?`, `addToNav?`, `navLabel?`, `hidden?`                                                       | Fastest way to draft a page from presets.                                            |
| `update_page`       | `page`, `set?`, `unset?`                                                                                                                                        | `{"title": …, "slug": …, "seo.description": …, "header.transparentOnHero": true}`.   |
| `delete_page`       | `page`, `confirm`                                                                                                                                               | Owner must agree.                                                                    |
| `update_navigation` | `tree`                                                                                                                                                          | Items: page, collection, link, button (one at most), folder (one level).             |
| `update_site`       | `set?`, `unset?`                                                                                                                                                | Title, tagline, header, announcement, social, seo, locale. Not nav, not custom code. |
| `upload_image`      | `alt`, `url?` _or_ `base64?`, `filename?`, `credit?`, `license?`                                                                                                | ≤ 2400 px, metadata stripped. Use the returned `src` in image fields.                |
| `create_post` | `title`, `body`, `collection?`, `slug?`, `date?`, `excerpt?`, `image?`, `imageAlt?`, `tags?`, `categories?`, `author?`, `status?`, `publishAt?`, `frontmatter?` | Drafts by default. Markdoc tags embed blocks. `date` applies to blog and podcast (required, default today) and portfolio; events put `start`/`end` (date-times with a UTC offset) in `frontmatter`. |
| `update_post`       | `slug`, `collection?`, `set?`, `body?`                                                                                                                          | Frontmatter set (`null` removes) and/or new body.                                    |
| `list_posts`        | `collection?`, `status?`, `withBody?`                                                                                                                           | Newest first.                                                                        |

## Design iteration

| Tool                  | Arguments                                                                                       | Notes                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `get_styles` | `options?` | Current choices, overrides and theme colors. Option lists (pairings, palettes, enums) are included by default; pass `options: false` to leave them out. |
| `set_styles`          | `choices?`, `palette?`, `overrides?`, `onContrast?` (`"adjust"` \| `"reject"`)                  | Contrast-checked.                                                                                                      |
| `list_templates`      | `template?`                                                                                     | Templates and their three looks.                                                                                       |
| `apply_template_look` | `template`, `look?`, `resetOverrides?`                                                          | Restyle with a look; content stays.                                                                                    |
| `design_check`        | `page?`, `checks?` (`["design", "seo"]`), `minSeverity?`                                        | Issues with ids and autofix labels.                                                                                    |
| `apply_fix`           | `issues` (ids or `"all"`), `page?`                                                              | Recomputes before each fix.                                                                                            |
| `preview`             | `page?`                                                                                         | Draft preview URL to share.                                                                                            |
| `render_page`         | `page`, `section?`, `fragment?`, `maxChars?`                                                    | Real renderer HTML.                                                                                                    |
| `screenshot` | `page`, `section?`, `device?` (`"desktop"` \| `"tablet"` \| `"mobile"` \| `"all"`), `fullPage?` | 1440 / 834 / 390 px images of the draft; tall pages come back as several images, top to bottom. Local: needs the `playwright` package installed in the site **and** a browser — `npx playwright install chromium`, or an installed Google Chrome. Hub (claude.ai, Claude Desktop): rendered by the Hub in the cloud, nothing to install. |

## Publishing and history

| Tool              | Arguments             | Notes                                                                                                        |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `get_draft_diff`  | —                     | Plain-language summary of unpublished changes.                                                               |
| `publish`         | `confirm`, `message?` | Needs `confirm: true` and a connection allowed to publish. Locally: a git commit of `content/` and `media/`. |
| `discard_draft`   | `confirm`             | Throws away every unpublished change.                                                                        |
| `list_versions`   | `limit?`              | Published versions, newest first.                                                                            |
| `rollback`        | `version`, `confirm`  | Restore a published version.                                                                                 |
| `create_snapshot` | `name`                | Named restore point before risky work.                                                                       |

## Tools that reach the web

Both servers add tools that fetch other websites. The local stdio server (`openspace mcp`) runs them on your computer; the Hub runs them in the cloud.

| Tool                 | Arguments                                                                                   | Use                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import_site`        | Local: `url`, `platform?`, `folder?`, `owner?`, `exportFile?`, `render?`, `confirm`; Hub: `url`, `confirmOwnership`, `name?`, `platform?`, `render?`, `inPlace?` | Import a site from any platform (detected unless `platform` is given: Squarespace, WordPress, Wix, Webflow, GitHub Pages…), always onto free GitHub Pages hosting. Locally into a **new** folder next to the served site (never into it), then `openspace check`; on the Hub into a new site that runs the import in the cloud — follow it with `import_status` (`inPlace: true` makes the person's own GitHub Pages repository editable where it is, through a pull request they approve). Needs `confirm: true` after the owner agrees; `owner: true` (Squarespace `?format=json`) only when they confirm they own the site; `render: true` reads script-built pages in a browser. Returns the summary and `IMPORT-REPORT.md`. |
| `import_squarespace` | same as `import_site`                                                                  | Local only: older name of `import_site` for Squarespace sites. |
| `screenshot_url`     | `url`, `device?` (`"desktop"` \| `"tablet"` \| `"mobile"` \| `"all"`), `fullPage?`; Hub also `site`, `page` | Image of any public page (the original site during a migration) at the same widths as `screenshot`, for side-by-side comparison. On the Hub, `site` (+ `page`) without `url` captures the site's live, published page. Locally it needs Playwright, like `screenshot`. |
| `compare_fidelity`   | `original`, `pages?`, `device?` (`"desktop"` \| `"mobile"` \| `"both"`), `images?` | Local only (Playwright). Opens the original site and this site in a browser and returns a 0–100 match per page with every difference (fonts per role, type sizes, tracking and capitals, content width, section spacing, backgrounds, columns, eyebrow rules, italic lines, image placement), the `set_styles` setting that closes each, and side-by-side images. Same as `openspace compare`. |

## Hub only (the Claude app connector)

| Tool | What it does |
| --- | --- |
| `list_templates` | Templates and their looks, for `create_site`. |
| `create_site` | A new site from a template and look (needs "Create new sites" on the consent screen). The first time, it returns a Studio link to approve OpenSpace on GitHub. |
| `import_status` | How a move started with `import_site` is going: the steps, pages and images so far, what needs attention, the Finish setting up list, the live address. |

## Prompts

- `design-a-page` (`brief`, `page?`) — compose or redesign a page from presets with real copy.
- `restyle-site` (`mood`) — change the whole look through Site Styles.
- `write-blog-post` (`topic`, `audience?`) — draft a post in the owner's voice.
- `iterate-design` (`page`, `goal?`) — the inspect → check → edit → look loop on one page.

## Resources

- `openspace://guidance/design`, `openspace://guidance/iteration`
- `openspace://presets` — the full preset catalog
- `openspace://schemas/blocks`, `openspace://schemas/blocks/{type}`, `openspace://schemas/{page|section|block|site|styles|rich-text|collection-item}`
- `openspace://sites/{id}/tokens` — choices, overrides, compiled tokens, contrast
- `openspace://sites/{id}/agents-md` — the site's `AGENTS.md`

## Rich text Markdown

Headings `#`–`####`, `**bold**`, `*italic*`, `[links](/contact)`, bullet and numbered lists, `> quotes`. A trailing `{.lead}` on a paragraph sets the lead preset (also `{.small}`, `{.eyebrow}`).

## Style choice values

- `density`: `compact`, `comfortable`, `airy`
- `shape`: `sharp`, `soft`, `round`
- `buttons`: `solid`, `outline`, `underline`, `pill-solid`, `pill-outline`, `text-arrow`
- `motion`: `none`, `subtle`, `expressive`
- `imageTreatment`: `none`, `rounded`, `arch`, `circle`, `blob`, `duotone`, `grain`, `frame`
- `palette`: `{ brand: "oklch(…)" or "#hex", neutral: "warm" | "cool" | "pure", contrast: "standard" | "high" }`, or a curated palette id via `set_styles` `palette`
- `pairing`: an id from `get_styles` options (e.g. `fraunces-hanken`, `newsreader-public-sans`, `instrument`, `source-serif-plex`, `bricolage-geist`, `literata-manrope`, `cormorant-jost`, `outfit`)
