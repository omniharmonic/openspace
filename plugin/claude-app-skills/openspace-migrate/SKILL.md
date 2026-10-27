---
name: openspace-migrate
description: Move an existing website (Squarespace, GitHub Pages, WordPress, Wix, any site) into OpenSpace with no installs, using the OpenSpace connector, then match the old look page by page with screenshots.
license: MIT
metadata:
  version: "0.5.0"
  for: claude.ai and Claude Desktop with the OpenSpace connector (https://hub.openspace.host/mcp)
---

# Moving a website to OpenSpace — it has to just work

The person you're helping is usually not technical. They want their site out of a platform that charges them every month, looking the same, live, and easy to edit. Your job is to get them there with as little effort from them as possible.

Everything runs through the **OpenSpace connector** (`https://hub.openspace.host/mcp`): the import runs in the cloud, screenshots are taken in the cloud, and they edit the result in OpenSpace Studio in their browser. Nothing is installed on their computer.

## How to work with the person

- **Plain language, always.** Say "your site", "your new site", "put it live", "your web address", "your free address". Don't say repository, branch, commit, workflow, Actions, build, deploy, MCP, target, DNS or CNAME. If a technical word is truly needed, explain it in one friendly sentence.
- **Make the technical decisions yourself**, with the defaults below. Ask only what only they can answer: the address of their site and whether it's theirs. Don't ask about hosting, importers, options or formats.
- **Keep them posted in one short line** at each stage ("Copying your pages and photos now — this takes a few minutes").
- **Never ask them to open a terminal** or install anything (Node, npm, Playwright…). This path needs only a browser and Claude.
- **Never invent content.** Their words and photos are theirs; don't rewrite unless asked. Ask before filling a gap.
- **Recreate the look, never copy it.** Never paste the old site's code, CSS or scripts into embeds. Match the look with OpenSpace's designs and Site Styles.
- **Their old site keeps running** until they decide to move their web address — which is optional and comes at the very end.

## Defaults (decide, don't ask)

- **Hosting: always the free default (GitHub Pages).** Never switch a site to Cloudflare or any other hosting during a move, even if the old site has a shop, donations, member pages or password pages. Those features come back later, from Studio's **Finish setting up** list, after the site is live. A move must never end in a publish that is known to fail.
- **A new OpenSpace site** next to the old one. For an existing GitHub Pages site, also a new site — unless they explicitly ask to convert the existing one in place.
- **Everything imported:** pages, posts, images, navigation, forms, products (as catalog pages, not yet for sale), redirects.
- **Is it theirs?** Ask once, simply, "Is this your site?" Only then pass `confirmOwnership: true` — it also lets the import read data only an owner may (Squarespace's own page data). Don't ask for exports; blog posts are read from the site.
- **GitHub Pages:** a `*.github.io` address or a GitHub repository is read from its source (Jekyll pages and posts, sites whose pages are content files, plain HTML). Make a new site unless they explicitly ask to keep the site where it is — then pass `inPlace: true`: OpenSpace prepares the change on GitHub and they approve it with one click (they can undo it the same way).
- **Script-heavy sites** (Wix, Framer): if the import report says pages came through nearly empty, re-run `import_site` with `render: true` yourself.

## 0. Check the connection

Call `list_sites`. If the OpenSpace tools are missing, walk them through it, one step at a time:

1. Open https://studio.openspace.host and **Sign in with GitHub** (free; it's where their site's files are kept). When asked, allow OpenSpace on their GitHub account.
2. In Claude: **Settings → Connectors → Add custom connector**, name **OpenSpace**, address `https://hub.openspace.host/mcp`. Sign in when it opens, tick their sites (if any) and press **Allow**.
3. In this chat, turn the OpenSpace connector on in the tools menu.

## 1. Look first

Ask for their site's address (and "Is this your site?" for Squarespace). Then `screenshot_url` with `device: "all"` for the home page, and desktop shots of two or three inner pages. Tell them in two or three warm sentences what you see (sections, mood, colors), so they know you've understood their site.

## 2. Bring it over

Call `import_site` with the address and `confirmOwnership: true` (after they said it's theirs). Say in one sentence what will happen ("I'll copy your pages, words and photos into a new OpenSpace site; your current site isn't touched").

The import runs in the cloud and takes a few minutes. Follow `import_status` (with the site id `import_site` returned) every half minute or so, with a one-line update in between ("Bringing your pages across… 12 pages and 40 photos so far"). It tells you exactly what's next:

- **"Connect GitHub"** (their first site): give them the Studio link it names; they press Connect GitHub (about a minute). Then keep following `import_status`.
- **"Approve the change on GitHub"** (`inPlace` only): give them the link; they press **Merge pull request**. Then keep following.
- **"is live"**: it's done. The new site is already part of this connection (`get_site` works).
- **"didn't finish"**: tell them why in their words, and offer to try again (Studio's Try again, or `import_site` once more).

When it's done:

1. Read the "What needs attention" and "Finish setting up" lists it returns and keep the technical parts to yourself. Tell them only: what came across, and anything you need from them.
2. Give them the Studio link for the new site so they can watch your changes arrive.

## 3. Make it look like their site, page by page

Home page first, then the pages in the menu. For each page (at most five passes; one change at a time):

1. **Look at both.** `screenshot_url` of the original page and `screenshot` of the new one, same device — desktop, then mobile. Tall pages arrive as several images, top to bottom. Screenshots are limited (about forty every ten minutes), so once the structure is right compare one section at a time (`screenshot` with `section`).
2. **Name the three biggest differences** a visitor would notice: section order, the top of the page, columns, photo crops, colors, type size, spacing, buttons.
3. **Fix with the design tools:** `update_section` (`colorTheme`, `style.background`), a closer preset (`list_section_presets`, `insert_section`, move content across with `update_block`, `delete_section`), `place_in_grid` then `auto_mobile_layout`, and once, early, the global look with `set_styles` (brand color, fonts, spacing, buttons).
4. **Check:** `design_check`; fix errors (`apply_fix` where offered). Imported pages often have several main headings — fix the levels without changing the words.
5. **Look again** and judge: same first impression, same order, same main buttons?

Stop when the remaining differences are details they wouldn't notice. If screenshots aren't available, continue with `render_page` (`fragment: true`) and say so once.

See `references/parity-checklist.md` for what to compare and the usual fixes, `references/squarespace-mapping.md` for Squarespace, and `references/platform-mapping.md` for other platforms. Those references mention import options in their command-line spelling (such as `--render`); here they are `import_site` options (for example `render: true`). Ignore any reference advice to change hosting during the move.

## 4. Put it live

The goal is a **live site that looks like theirs, on its free address**, before anything else.

- `design_check` on every page (zero errors), then `get_draft_diff`.
- Ask one simple question: "Ready for me to put your new site live at its free address? Your current site stays exactly as it is." Then `publish` with `confirm: true`. If this connection can't publish, ask them to press **Publish** in Studio.
- After a minute or two, `screenshot_url` with `site` (no `url`) to see the live home page, and check it looks right.

Shops, donations, member pages, password pages, newsletters and the web address do **not** block this step: they come after, in the "when you're ready" list.

## 5. Celebrate, then "when you're ready"

Finish with a short, warm message:

- **Celebrate:** "Your new site is live!" with the live link, and the Studio link to edit it.
- **What they save:** they no longer need to pay their old platform for hosting once they switch over (a Squarespace plan is typically about $200–$550 a year; say "you can stop paying for <platform> hosting" when you don't know their plan).
- **When you're ready** — a short list, only of what applies to their site, each one line, in plain words (Studio's **Finish setting up** list walks them through each):
  - use your own web address (e.g. www.their-site.com) — the old site stays up until this is done; cancel the old plan only after the address shows the new site;
  - turn your shop back on (products came across as pages, with a friendly “opening soon” note where the Buy button will be; selling needs a payment account) — meanwhile, offer to point that note at their old shop: add a redirect from `/shop-elsewhere` to the old shop's address (status 302) with `update_site`;
  - donations, member pages or password pages;
  - bring your newsletter subscribers across, and where form messages now arrive;
  - any extras the old site had (booking widgets, chat, analytics) — say what each did and what replaces it.
- Mention, in one sentence, anything that looks different on purpose (the look comes from OpenSpace's designs, so some details are approximated).

Never invent replacements for content that didn't import — ask.

## Additional resources

- **`references/parity-checklist.md`** — what to compare between the two screenshots, and the usual fixes.
- **`references/squarespace-mapping.md`** — Squarespace blocks, sections and settings → OpenSpace.
- **`references/platform-mapping.md`** — WordPress, Wix, Webflow, GitHub Pages and HTML sites → OpenSpace.
- The `openspace-web-design` skill holds the full design loop; `openspace-content` covers posts, events and products.
