---
name: openspace-migrate
description: Move an existing website (Squarespace, GitHub Pages, WordPress, Wix, any site) into OpenSpace with no installs, using the OpenSpace connector, then match the old look page by page with screenshots.
license: MIT
metadata:
  version: "0.3.0"
  for: claude.ai and Claude Desktop with the OpenSpace connector (https://hub.openspace.host/mcp)
---

# Moving a website to OpenSpace — from the Claude app, nothing to install

This skill runs entirely through the **OpenSpace connector** (the remote MCP server at `https://hub.openspace.host/mcp`). The import runs in the cloud, screenshots are taken in the cloud, and the owner edits the result in OpenSpace Studio in their browser. Never ask the owner to open a terminal, install Node, npm, Playwright or anything else. If they mention a command line, they are in the wrong guide: this path needs only a browser and Claude.

Ground rules for the whole migration:

- **Only for sites the person owns** or is moving on the owner's behalf. Ask before starting if it is not clear.
- **Recreate the look, never copy it.** Never paste the old site's template code, CSS, HTML or scripts into embeds. Match the look with presets, section color themes, grid placement and Site Styles.
- **Keep the owner's words.** Imported copy is theirs; don't rewrite it unless asked. Never invent content to fill gaps.
- **The old site stays up** until the new one is live on the domain and checked.
- Use plain words with the owner: "your site", "publish", "the live site". Avoid "repository", "commit", "branch", "build" and "deploy" unless they use them first.

## 0. Check the connection

Call `list_sites`. If the OpenSpace tools are missing, walk the owner through it:

1. They need an OpenSpace account first: open https://studio.openspace.host, **Sign in with GitHub**, and accept the request to install OpenSpace on their GitHub account (OpenSpace keeps each site in their own GitHub account).
2. In Claude: **Settings → Connectors → Add custom connector**, name **OpenSpace**, address `https://hub.openspace.host/mcp`. Claude opens OpenSpace: sign in, tick the sites Claude may work on, press **Allow**.
3. In this chat, turn the OpenSpace connector on in the tools menu.

## 1. Gather and look first

Ask for: the address of the site to move; whether they own it; whether they sell products or have member or password pages (those need the Cloudflare hosting option in Studio); and, for Squarespace, whether they can export the blog (Settings → Import & Export → Export → WordPress) — the file can be added later in Studio.

Then look at the original before changing anything: `screenshot_url` with the address and `device: "all"` for the home page, and desktop shots of two or three inner pages. Describe the site back to the owner in two or three sentences (sections, mood, colors, type) so they know you've seen it.

## 2. Import in the cloud

Call `import_site` with the site's address. Explain first what will happen and pass `confirm: true` only after the owner agrees. Pass `owner: true` only when they confirm they own a Squarespace site (it reads Squarespace's own page data, which its robots.txt asks automated tools not to read without permission).

The import runs in the cloud and takes a few minutes. Follow exactly what `import_site` returns: it says where the new site is, how to check progress, and when it is ready. While it runs, tell the owner what's happening in one line; don't call it in a tight loop.

When it is done:

1. If the new site isn't in `list_sites`, the connection doesn't cover it yet: ask the owner to open Studio → Settings → Connect your AI and allow Claude on the new site (or reconnect the connector and tick it). Then call `get_site` on it.
2. Read the import report the tool returns (also `IMPORT-REPORT.md` in the site) and summarise it in plain language: what came across, what didn't, what needs their decision.
3. Ask the owner to open the new site in Studio (the link comes with the import result) so they can watch your edits arrive.

### An existing GitHub Pages site (Jekyll or plain HTML)

For a site that already lives on GitHub Pages (`something.github.io`, or a custom domain served by GitHub Pages), `import_site` can make it editable in Studio. Give it the site's address (or the GitHub address of its source, when the owner knows it). Ask the owner which they want:

- **A new OpenSpace site** next to the old one (safest: the old site keeps running unchanged until they switch the domain), or
- **convert the existing site in place**, when the tool offers it: the same GitHub location and address carry on, now edited in Studio. Explain that the old files are replaced by OpenSpace's on publish, and that the history keeps the old version.

Jekyll posts become blog posts, `_config.yml` title and navigation carry over, Markdown pages become OpenSpace pages. Liquid templates, plugins and custom layouts are approximated with presets and Site Styles, never copied.

## 3. Reach visual parity, page by page

Work through the pages in navigation order, home page first. For each page (at most five passes; one intent per pass):

1. **Look at both.** `screenshot_url` of the original page and `screenshot` of the OpenSpace page, same device. Start with desktop, then mobile. Tall pages arrive as several images, top to bottom. Screenshots are rate-limited (about forty every ten minutes), so compare one section at a time (`screenshot` with `section`) once the page structure is right.
2. **Name the three biggest differences**, in order of how much they change the impression: section order and rhythm, hero treatment, column structure, image crops, color themes, type scale, spacing, button style.
3. **Fix with design tools only:**
   - rhythm and surfaces: `update_section` with `colorTheme`; photo backgrounds and overlays through `update_section` `style.background`;
   - structure: swap a section for a closer preset (`list_section_presets`, `insert_section`, move the imported blocks' content across with `update_block`, then `delete_section`);
   - layout in grid sections: `place_in_grid`, then `auto_mobile_layout`;
   - global look: `set_styles` (brand color, pairing, density, shape, buttons) — once, early, on the home page, then leave it alone.
4. **Check:** `design_check` on the page; fix errors (`apply_fix` where offered). Imported pages often have several Heading 1s or skipped heading levels — fix the levels without changing the words.
5. **Look again** at the same widths and judge: does a visitor get the same first impression, the same order of information and the same calls to action?

Stop when the remaining differences are details the owner wouldn't notice, or are listed as limits. Note each page's outcome for the final summary.

If `screenshot_url` or `screenshot` says screenshots aren't available, continue with `render_page` (`fragment: true`) and ask the owner to describe or share a screenshot of the original; say so once.

See `references/parity-checklist.md` for what to compare and the usual fixes, `references/squarespace-mapping.md` for Squarespace, and `references/platform-mapping.md` for WordPress, Wix, Webflow and other sites. Those references mention import options in their command-line spelling (such as `--render` or `--export`); here they are `import_site` options or Studio settings — for example, script-built pages are re-imported with `import_site` and `render: true`.

## 4. Fix what the report flagged

Go through the report's **Needs attention** list with the owner:

- **Forms and newsletter:** submissions now arrive in the OpenSpace inbox (Studio → Forms). Existing subscribers are exported from the old platform and imported in Studio.
- **Custom code and scripts:** embeds became sandboxed Embed blocks; site-wide scripts (analytics, chat, pixels) were listed, not copied. Ask which are still needed; the owner adds site-wide code in Studio → Settings → Advanced — never through the connector.
- **Platform features** (shortcodes, page-builder widgets, Wix apps, Webflow interactions, bookings): say what each did and offer the OpenSpace block or service that replaces it, or leave a note.
- **Commerce:** selling needs the Cloudflare hosting option and Stripe connected in Studio.
- **Member areas and password pages:** recreate them in Studio as members-only or password pages.
- **Links pointed at the home page** and **images that failed:** fix each one (`update_block`), asking the owner where a link should go.
- **Alt text:** write purposeful alt text for meaningful images (`update_block`), or mark them decorative.

Never invent replacements for content that didn't import — ask.

## 5. Publish and move the domain

- Run a final `design_check` on every page (zero errors), then `get_draft_diff` and summarise it.
- Publish only when the owner asks: they press **Publish** in Studio, or you call `publish` with `confirm: true` if the connection was allowed to publish. `screenshot_url` with `site` (and `page`) shows the live result once it is up.
- Domain, in this order, after the new site is live on its temporary address and checked: (1) Studio → Settings → Domain, enter the domain — the wizard shows the exact records for their registrar and checks them; (2) the owner changes those records at the old platform's domain settings or their registrar; (3) wait until the domain serves the new site over HTTPS and a few old addresses redirect correctly; (4) only then cancel the old plan (for Squarespace, only then cancel the Squarespace site plan). Moving the domain registration itself is optional and can wait.
- Redirects for every changed address were created by the import; keep them, and add any the owner knows about (old campaign links) in Studio.

## 6. Finish with an honest summary

Tell the owner, briefly:

- which platform was detected and what was imported (pages, posts, products, events, images, redirects);
- per page, how close it is to the original and what still differs;
- what they must do themselves (subscribers, Stripe, DNS, code snippets, member areas, platform features);
- what OpenSpace does differently by design (the look comes from Site Styles, so platform-specific styling is approximated, not copied).

## Additional resources

- **`references/parity-checklist.md`** — what to compare between the two screenshots and the fix for each common difference.
- **`references/squarespace-mapping.md`** — Squarespace blocks, sections and settings → OpenSpace equivalents.
- **`references/platform-mapping.md`** — WordPress, Wix, Webflow and generic HTML → OpenSpace, and each platform's limits.
- The `openspace-web-design` skill holds the full design loop and craft checklist; `openspace-content` covers posts, events and products.
