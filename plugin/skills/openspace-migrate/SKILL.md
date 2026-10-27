---
name: openspace-migrate
description: This skill should be used when the user asks to "move my site to OpenSpace", "migrate my website", "import my WordPress / Squarespace / Wix / Webflow / Carrd / Framer site", "switch from Squarespace (or WordPress, Wix, Webflow) to OpenSpace", "copy my website into OpenSpace", "make my OpenSpace site look like my old site", or gives the address of an existing website and wants the same site in OpenSpace. It detects the platform, runs the importer, iterates page by page to visual parity with side-by-side screenshots, and finishes with redirects, publishing, the domain move and an honest summary of what differs.
version: 0.2.0
---

# Moving a website to OpenSpace (from anywhere)

`openspace import <url>` detects which platform built the site and runs the matching importer:

| Platform | Importer | Reads |
| --- | --- | --- |
| Squarespace 7.0 / 7.1 | `import squarespace` | page HTML, the sitemap, `?format=json` with `--owner`, the blog's WordPress export with `--export` |
| WordPress | `import wordpress` | the public REST API (pages, posts, categories, tags, featured media, Yoast/Rank Math SEO) and/or the WXR export (`--export`: drafts, menus, attachments), plus the home page for navigation, footer and look |
| GitHub Pages (a `*.github.io` address or a GitHub repository) | `import github` | the repository: Jekyll from its source (_config.yml, pages, posts, collections, layouts and includes, front-matter redirects); sites whose pages are content files with typed sections (Decap/Sveltia CMS, Astro) field by field with their design tokens; plain HTML from the files; Hugo/Eleventy from the published pages plus their Markdown front matter |
| Wix, Webflow, Carrd, Framer, Shopify pages, Ghost, hand-made HTML — anything else | `import url` | the sitemap (or the site's own links), each page's HTML: main content, header navigation, footer, SEO and Open Graph, the look from the CSS; `--render` reads pages JavaScript builds (Playwright) |

Every importer writes the same result into a new folder: pages built from OpenSpace sections and blocks (landing-page sections are rebuilt with the closest section presets — hero, features, gallery, testimonials, call to action, contact), images downloaded into `media/` with their alt text, navigation, header and footer, blog posts as a collection, forms and newsletter signups, SEO titles and descriptions, a redirect for every changed address, and a Site Styles approximation of the look (palette, font pairing, buttons, density) that the contrast solver keeps accessible. It writes `IMPORT-REPORT.md` and runs `openspace check`.

The import is a strong first draft, not a pixel copy. The second half of the job — reaching visual parity — happens with the normal OpenSpace design tools, page by page, comparing screenshots of the original and the new site.

Ground rules for the whole migration:

- **Only for sites the person owns** or is moving on the owner's behalf. Ask before starting if it is not clear.
- **Recreate the look, never copy it.** Never paste the old site's template code, CSS, HTML or scripts into custom code or embeds. Match the look with presets, section color themes, grid placement and Site Styles tokens.
- **Keep the owner's words.** Imported copy is theirs; don't rewrite it unless asked. Never invent content to fill gaps.
- **The old site stays up** until the new one is live on the domain and verified.
- **It has to just work.** Most people moving a site are not technical. Talk in plain words ("your site", "put it live", "your free address"); don't say repository, branch, commit, workflow, Actions, deploy, MCP, target or DNS unless they do, or explain the word in one friendly sentence. Make the technical decisions yourself with the defaults below; ask only what only they can answer (the address, whether it's theirs).
- **Never change hosting during a move.** Every import stays on the default, free GitHub Pages target — even when the old site has a shop, donations, member or password pages. Don't pass `--target cloudflare` and don't set `deploy.target`. The first goal is a live site at visual parity on its free address; shops, members, email and the domain come after, from Studio's **Finish setting up** list (`content/setup-checklist.json`). A move must never end in a publish that is known to fail.

## 1. Detect and import

Gather only: the site address and whether it's theirs. Choose the folder name yourself (from the address). Use an export only if they already have one handy — don't send them looking:

- **Squarespace:** the blog export (Settings → Import & Export → Export → WordPress). Ask whether they own the site: owner mode (`--owner`) also reads Squarespace's `?format=json` data (variants, sale prices, SEO fields), but robots.txt asks automated tools not to read it — only use it with the owner's say-so.
- **WordPress:** Tools → Export → All content gives drafts, menus and SEO meta; the public REST API is used when it's open (most sites). Without either, pages are read from their HTML.
- **Wix, Framer and other script-built sites:** if the report says pages had little readable content, run again with `--render` (needs `npm i -D playwright && npx playwright install chromium`).

```sh
npx -y @omniharmonic/openspace-cli import https://www.example.com my-site
# or name the importer:
npx -y @omniharmonic/openspace-cli import squarespace https://www.example.com my-site --owner --export ~/Downloads/export.xml
npx -y @omniharmonic/openspace-cli import wordpress https://www.example.com my-site --export ~/Downloads/site.WordPress.xml
npx -y @omniharmonic/openspace-cli import url https://www.example.com my-site --render
npx -y @omniharmonic/openspace-cli import github https://owner.github.io/site/ my-site
cd my-site && npm install
```

Options: `--platform <name>` (skip detection), `--repo owner/name`, `--domain example.com`, `--title "…"`, `--max-pages N` (default 400), `--delay ms` (pause between requests, default 300), `--no-media` (structure only, for a quick look). The command paces its requests, honours robots.txt and identifies itself.

When an OpenSpace site is already being served in this session, the `import_site` MCP tool does the same (with `confirm: true` after the owner agrees; `platform` to skip detection; `owner: true` only when they confirm ownership of a Squarespace site; `render: true` for script-built pages). It creates the new folder next to the current site and never writes into it. `import_squarespace` is its older name for Squarespace sites.

Then:

1. Read `IMPORT-REPORT.md` and summarise it for the owner in plain language: which platform was detected, what came across, what didn't, what needs their decision.
2. Ask them to open Claude Code in the new folder (`cd my-site && claude`): the `openspace` MCP server serves the folder it starts in. Confirm the tools respond with `get_site`.

## 2. Reach visual parity, page by page

Work through the pages in navigation order, home page first. For each page, run this loop (at most five passes per page; one intent per pass):

0. **Measure first (once, then after each round).** When `compare_fidelity` is available (local server with Playwright), call it with the original address: it opens both sites in a browser and returns a 0–100 match per page with every difference — fonts for headings, text and labels, type sizes, letter spacing and capitals, content width, section spacing, backgrounds, columns, eyebrow rules, italic lines, image placement — and the `set_styles` setting that closes each one (e.g. `choices.typography.scale.h2.size = 60`). Apply the global ones first with `set_styles` (`choices.typography`, `choices.layout`), then work section by section below. Tell the owner the score in plain words ("it now matches your site closely: 92 out of 100"). An import already auto-tuned itself once (`openspace import` and the hosted move both do, when a browser is available): start from its `.fidelity/FIDELITY-REPORT.md` (or `.openspace/fidelity/` for a hosted move). Fonts the old site licensed (Adobe Fonts, Fonts.com…) were deliberately replaced by their nearest free match — don't try to copy them; point the owner to the "Use your own font licence" step instead.

1. **Look at both.** `screenshot_url` of the original page (`device: "all"`, or desktop then mobile) and `screenshot` of the OpenSpace page (`device: "all"`). Without screenshot tools, use `render_page` with `fragment: true` and describe the original from its URL; say once how to enable screenshots (Playwright).
2. **Name the three biggest differences**, in order of how much they change the impression: section order and rhythm, hero treatment, column structure, image crops, color themes, type scale, spacing, button style.
3. **Fix with design tools only:**
   - rhythm and surfaces: `update_section` with `colorTheme`; photo backgrounds and overlays through `update_section` `style.background`;
   - structure: swap a section for a closer preset (`list_section_presets`, `insert_section`, move the imported blocks' content across with `update_block`, then `delete_section`), e.g. `hero/full-bleed-photo@1` for a full-width photo hero or `contact/form-split@1` for a contact page;
   - layout in grid sections: `place_in_grid`, then `auto_mobile_layout`;
   - global look: `set_styles` (brand color, pairing, density, shape, buttons; `typography` for the original's own Google Fonts per role and its type sizes, tracking and capitals; `layout` for content width and section spacing) — do this once, early, on the home page, then leave it alone. Imports already carry these over when they could measure them; adjust rather than replace;
   - a section's exact background: `update_section` `style.background = { type: "color", color: "#4a1c18" }`; a short accent line between eyebrow and heading: the heading block's `eyebrow-rule` variant; paragraphs side by side: the text block's `columns` variant.
4. **Check:** `design_check` on the page; fix errors (`apply_fix` where offered). Imported pages often have several Heading 1s or skipped heading levels — fix the levels without changing the words.
5. **Look again** at the same widths and judge: does a visitor get the same first impression, the same order of information and the same calls to action?

Stop when the remaining differences are details the owner wouldn't notice, or are listed below as limits. Note each page's outcome for the final summary.

See `references/parity-checklist.md` for what to compare and the usual fixes, `references/squarespace-mapping.md` for Squarespace, and `references/platform-mapping.md` for WordPress, Wix, Webflow and other sites.

## 3. Fix what the report flagged

Go through `IMPORT-REPORT.md` → **Needs attention** with the owner:

- **Forms and newsletter:** submissions now arrive in the OpenSpace inbox. Existing subscribers must be exported from the old platform (or its email service) and imported in the Hub. Form plugins and integrations (Zapier, Mailchimp) need setting up again.
- **Custom code and scripts:** embeds became sandboxed Embed blocks; site-wide scripts (analytics, chat, pixels) were listed, not copied. Ask which are still needed; site-wide code goes in Settings → Advanced, which the owner adds — never through MCP.
- **Platform features:** shortcodes and page-builder widgets (WordPress), Wix apps, Webflow interactions, commerce and bookings are not imported — say what each did and offer the OpenSpace block or service that replaces it, or leave a note.
- **Commerce:** products are catalog content (Squarespace) or not imported (WooCommerce, Wix Stores, Shopify). Selling comes later, from **Finish setting up** in Studio, after the site is live — don't change hosting now.
- **Member areas and password pages:** later, from **Finish setting up**; their content was not readable. Keep the public pages live meanwhile.
- **Pages with little content** (script-built): re-import with `--render`, or rebuild those sections with presets using the original's screenshot and the owner's copy.
- **Links pointed at the home page** and **images that failed:** fix each one (`update_block`), asking the owner where a link should go.
- **Alt text:** often missing; write purposeful alt text for meaningful images (`update_block`), or mark them decorative.

Never invent replacements for content that didn't import — ask.

## 4. Redirects, publishing and the domain

- Redirects for every changed address are in `content/site.json` → `redirects`: WordPress permalinks (`/2024/03/title/`) and category/tag archives point at the journal, Squarespace blog and product URLs at their new homes, renamed pages at their new slugs. Keep them; add any the owner knows about (old campaign links).
- Run `npx openspace check` (zero errors) and a final `design_check` on every page, then `get_draft_diff`. Then ask one simple question — "Ready for me to put your new site live at its free address? Your current site isn't touched." — and publish when they say yes (`publish` with `confirm: true`, then push). The first live version comes before any shop, members, email or domain work.
- Domain move (only when they're ready — it's an item on the "when you're ready" list, not a step of the move), in this order, after the new site is live on its temporary address and checked: (1) add the custom domain to the OpenSpace site (`deploy.customDomain` in `openspace.json`, or the Hub); (2) at the DNS provider — the old platform's domain service or the registrar — change the records as the domain guide says (GitHub Pages: `A` records and a `CNAME`; Cloudflare: the Pages project's records); (3) wait until the domain serves the new site over HTTPS and a few old URLs redirect correctly; (4) only then cancel the old plan or hosting — for Squarespace, only then cancel the Squarespace site plan. Transferring the domain registration is optional and can wait.

## 5. Celebrate, then an honest summary

Start with the good news: **"Your new site is live!"** with the live link (and the Studio link if it's a Hub site), and what they save — they can stop paying their old platform for hosting once they move their address (a Squarespace plan is typically about $200–$550 a year). If the old site had a shop, say its products came across and show an “opening soon” note until they turn checkout on — and offer to point that note at their old shop meanwhile (a `redirects` entry from `/shop-elsewhere` to the old shop's address, status 302). Then a short **when you're ready** list of only what applies (their own web address, turning the shop back on, donations, member or password pages, newsletter subscribers, extras the old site had), one plain line each.

Then tell the owner, briefly:

- which platform was detected and what was imported (pages, posts, products, events, images, redirects);
- per page, how close it is to the original and what still differs (e.g. "hero photo crops tighter on mobile", "the Instagram feed widget is gone — replaced with a link");
- what they must do themselves (subscribers, Stripe, DNS, code snippets, member areas, plugin features);
- what OpenSpace does differently by design (the look comes from Site Styles tokens, so platform-specific styling — custom CSS, per-block fonts and colors, animations — is approximated, not copied).

## Additional resources

- **`references/parity-checklist.md`** — what to compare between the two screenshots and the fix for each common difference.
- **`references/squarespace-mapping.md`** — Squarespace blocks, sections and settings → OpenSpace equivalents, and what is not supported.
- **`references/platform-mapping.md`** — WordPress blocks and plugins, Wix, Webflow and generic HTML → OpenSpace, and each platform's limits.
- The `openspace-web-design` skill holds the full design loop and craft checklist; the `openspace-content` skill covers posts, events and products.
