---
title: Move your site to OpenSpace
description: Bring an existing website into OpenSpace — from Squarespace, WordPress, Wix, Webflow or anywhere else — with its pages, posts, images, navigation, SEO and redirects, then match its look with Claude and move your domain without downtime.
---

OpenSpace can read your existing website and rebuild it as an OpenSpace site you own: the same pages and words, your photos, blog posts (and, from Squarespace, events and products), your navigation, page titles and descriptions, and redirects so every old link keeps working. The look is recreated with OpenSpace's own design system — your colors, a matching font pairing, your button style, and the closest designed section for each part of the page — rather than copied from the old template.

Your old site keeps running the whole time. You switch your domain over only when the new site is live and you're happy with it.

:::note
Only import sites you own or are moving for their owner. The importer reads your public site the way a careful visitor would: one page at a time, with a pause between requests, and it respects your site's `robots.txt`.
:::

:::tip[Have a page Claude made instead?]
Upload it: **Move my site → Upload a page** (an HTML file or a zip). Every section keeps its design and becomes editable. See [Start with Claude](/guides/start-with-claude/#bring-a-page-claude-made).
:::

## The easy way: Move my site in Studio (nothing to install)

1. Open [OpenSpace Studio](https://studio.openspace.host/move) and choose **Move an existing site** (it's next to the templates, and on your sites page).
2. Paste your site's address, tick **This is my site**, and choose **Move my site**. Sign in with GitHub if you haven't yet — the free place your site's files are kept.
3. Watch it happen: *Reading your site… Bringing pages across… 12 pages, 48 images… Checking everything… Publishing.* It usually takes a few minutes, and you can close the tab — your new site waits on your sites page.
4. When it's live, Studio shows its free address, **What needs your attention** (the few things that couldn't come across exactly) and **Finish setting up** (a shop, donations, member pages, your email list, your own domain — each a guided step, whenever you're ready).

Behind the scenes OpenSpace creates your new site, runs the same importer described below inside your site's own GitHub space, checks the result and publishes it. Every move lands on free GitHub Pages hosting first, even when your old site had a shop: selling, members and password pages are set up afterwards, so the first version always goes live.

### The next step: finish it with Claude

The automatic move brings your words and pictures across and gets the basics of the design. Simple sites often come out close; anything more complex — custom layouts, animations, Framer or Webflow designs — needs Claude to match closely, and with Claude it usually does. Studio is honest about it: **How close it looks** goes from 0 (nothing like your old site) to 100 (identical), 90 or more means near-identical, and below 50 Studio says plainly that the automatic result is rough. Whenever it's below 90, or some things didn't come across, the move's results lead with **Finish it with Claude** (the editor is right there too), and **Finish setting up** lists **Make it match your old site**. It connects Claude once (if it isn't yet), lets it work on this site with one click, and opens Claude with a ready message naming your old address and your new site. Claude then compares the two page by page, rebuilds what's missing — custom sections, animations, missing pieces — as parts you can still edit, checks it on phones, and asks you before anything goes live. In apps that show prompts, the OpenSpace connector's **Finish moving my site** prompt (`finish-a-move`) does the same.

You can do the same from the Claude app: connect OpenSpace (`https://hub.openspace.host/mcp`) and say *"Move my site www.example.com to OpenSpace"* — Claude uses the `import_site` tool and follows its progress with `import_status`.

### Sites on GitHub Pages

Paste the `*.github.io` address or the repository (`github.com/you/your-site`). OpenSpace reads the source, not just the pages: **Jekyll** sites (`_config.yml`, pages, `_posts` with dates, tags and categories, collections, the navigation in `_data`, layouts and includes, and front-matter redirects), sites whose pages are **content files with typed sections** (for example Astro with Decap or Sveltia CMS — each section's fields become the closest OpenSpace blocks, and the design tokens give the look), and **plain HTML**. Hugo and Eleventy sites are read from their published pages, with dates and tags from their Markdown.

If the repository is yours, you can instead **make it editable where it is**: OpenSpace prepares the change on a separate branch and opens a pull request that explains what changes and how to undo it. When you merge it, GitHub Pages switches to publishing with OpenSpace, your address (including a custom domain) stays the same, and your history keeps the old site — the **Revert** button brings it back.

## Doing it yourself: what you need

- Your site's address, for example `https://www.fernwoodyoga.com`. The site must be public while you import (turn off any site-wide password for an hour).
- Node.js 22.23.4+ (Node 24 recommended) for the command line, or the [Claude Code plugin](/connect-your-ai/claude-code/).
- **Optional:** an export from your platform — see your platform's section below.

## 1. Import

With Claude Code and the OpenSpace plugin, ask:

```
/openspace:migrate https://www.fernwoodyoga.com fernwood
```

Claude asks a few questions (is it your site? do you sell products? do you have an export?), runs the import and reads you the report.

Or run it yourself:

```sh
npx -y @omniharmonic/openspace-cli import https://www.fernwoodyoga.com fernwood
cd fernwood
npm install
npx openspace dev
```

`openspace import <url>` looks at your home page, works out which platform built it, and uses the matching importer: **Squarespace**, **WordPress**, **GitHub Pages** (from the repository), or the general importer for everything else (Wix, Webflow, Carrd, Framer, hand-made sites). You can name the importer yourself — `openspace import squarespace <url>`, `openspace import wordpress <url>`, `openspace import github <repository or github.io address>`, `openspace import url <url>` — or skip detection with `--platform`.

| Option | Meaning |
|---|---|
| `--export <file>` | An export file: WordPress's full export (WXR), or Squarespace's blog export. Adds drafts and complete posts. |
| `--owner` | Squarespace only: you own the site, so also read Squarespace's `?format=json` data (tags, authors, product variants, sale prices, event places, SEO fields). Squarespace's `robots.txt` asks automated tools not to read it, so it's off unless you say it's your site. |
| `--render` | Read each page in a real browser first, for sites that build their pages with JavaScript (some Wix and Framer sites). Needs Playwright: `npm i -D playwright && npx playwright install chromium`. |
| `--platform <name>` | Skip detection: `squarespace`, `wordpress`, `wix`, `webflow`, `framer`, `carrd`… or `url` for the general importer. |
| `--source-dir <dir>` | `import github` only: read a checkout of the repository instead of downloading it. |
| `--into-existing` | Import into an existing OpenSpace site folder: keep its `openspace.json` (site id, address) and replace its content and media. This is what the hosted import runs. |
| `--summary <file>` | Also write a JSON summary (pages, images, the check result). |
| `--repo <owner/name>`, `--domain <host>`, `--title <title>` | As for [`openspace new`](/developers/cli/). |
| `--max-pages <n>` | Read at most this many pages and items (default 400). |
| `--delay <ms>` | Pause between requests to your site (default 300 ms). |
| `--no-media` | Skip downloading images and files — a quick look at the structure. |

The new folder is a complete OpenSpace site on GitHub Pages hosting (a shop, members or password pages are set up after it's live, from the list in `content/setup-checklist.json`). The import ends by running `openspace check`, which should report no errors.

## 2. Read the import report

`IMPORT-REPORT.md` in the new folder says which platform was detected and lists:

- every page with its old and new address, and every collection;
- how the look was translated (brand color, font pairing, type scale, any contrast adjustments) and a Design check summary;
- **Needs attention** — the things only you can decide, such as scripts, a plugin or app OpenSpace doesn't have, a form field, a link to a page that wasn't imported, or member areas;
- the redirects, and what the importer never moves for your platform.

## What comes across, on every platform

| From your site | In OpenSpace |
|---|---|
| Pages and their sections, in order, with side-by-side columns | Pages with stacked or grid sections; recognised sections (hero, features, gallery, testimonials, call to action, contact) use the closest [section preset](/guides/editing/) |
| Headings, text, lists, images (with alt text and captions), galleries, buttons, quotes and testimonials, FAQs, tables, videos, maps | The matching blocks; images are downloaded into your site's media library |
| Forms | OpenSpace forms with the same fields; submissions arrive in your inbox |
| Newsletter signups | Newsletter blocks |
| Embeds | Embed blocks, which run in a sandbox |
| Blog posts | A blog collection with dates, authors, categories, tags, excerpts and featured images |
| Navigation, dropdown menus and the header button | Navigation with folders and a call-to-action button |
| Logo, footer, social links, page titles, descriptions and share images | The same, in site settings and page SEO |
| Changed addresses | 301 redirects to the new addresses |
| Colors, fonts, button shape | [Site Styles](/guides/site-styles/), with every color pairing checked for contrast |

Never copied: the old site's template code, CSS and scripts. Site-wide scripts (analytics, chat widgets) are listed in the report; add back the ones you still need in **Settings → Advanced**.

## Platforms

### Squarespace

Works with Squarespace 7.0 and 7.1, classic layouts and Fluid Engine grids. Ask Claude with `/openspace:migrate` or `/openspace:import-squarespace`, or run:

```sh
npx -y @omniharmonic/openspace-cli import squarespace https://www.fernwoodyoga.com fernwood \
  --owner --export ~/Downloads/Squarespace-Wordpress-Export.xml
```

- **Blog export:** in Squarespace open **Settings → Import & Export → Export**, choose **WordPress**, and download the `.xml` file. It includes drafts and complete posts.
- Also imported: events (dates, times and places), products as a catalog (prices, sale prices, options, variants), portfolio projects, section color themes, and redirects for `/home`, date-based post URLs and `/shop/p/…`.
- Not moved: orders, customers, inventory counts, discounts, gift cards, shipping and tax ([Store](/grow/store/) sells with Stripe on the Cloudflare target); scheduling, donations and other app blocks (their text is kept); member areas and password-protected pages, whose content isn't public ([recreate them](/grow/members/)); Code Injection and custom CSS (listed, never copied).

### WordPress

```sh
npx -y @omniharmonic/openspace-cli import wordpress https://www.example.com my-site \
  --export ~/Downloads/mysite.WordPress.2026-10-27.xml
```

- **Where content comes from:** the site's public REST API (`/wp-json/`) when it's open, which most sites are, plus the home page for the menu, footer and look. The export (**Tools → Export → All content**) adds drafts, menus and SEO fields, and is the only source when the REST API is switched off. Without either, pages are read from their HTML.
- **Block editor content** maps block by block: paragraphs, headings, lists, images, galleries, buttons, columns and media & text (as columns), covers (as photo sections — a cover at the top becomes a hero), quotes and pullquotes, embeds, tables, details (as FAQs), separators, and "latest posts" (as a list of your journal). **Classic editor** content becomes rich text, with `[caption]`, `[gallery]`, `[embed]`, `[video]` and `[audio]` shortcodes understood.
- **Posts** become a blog collection named after your posts page (for example `/news`), or `journal`. Categories, tags, authors, excerpts and featured images come with them.
- **SEO:** Yoast and Rank Math titles, descriptions, share images and noindex settings are kept.
- **Redirects:** every permalink (`/2024/03/my-post/`) and category or tag archive (`/category/news/`) redirects to its new address.
- Not moved: what plugins do (WooCommerce, bookings, memberships, page-builder widgets), comments, users, custom post types, and other shortcodes — each is listed in the report. Pages built with Elementor, Divi or similar come across as content with an approximate layout.

### Wix

```sh
npx -y @omniharmonic/openspace-cli import https://www.example.com my-site
```

- Pages and blog posts are found through your Wix sitemap; posts at `/post/…` become a blog collection with redirects.
- Wix positions everything absolutely; the importer turns strips and columns into OpenSpace sections and columns, so check spacing and alignment when you match the look.
- Some Wix pages are drawn by JavaScript. If the report says pages had little readable content, run the import again with `--render`.
- Not moved: Wix apps (Stores, Bookings, Events, Members, Forum, Pricing Plans), Velo code and animations.

### Webflow

```sh
npx -y @omniharmonic/openspace-cli import https://www.example.com my-site
```

- Webflow's clean HTML maps well: sections, rows and grids, dropdown menus, buttons, forms, lightbox galleries and rich text. Mobile-only copies of headings or menus are skipped.
- CMS items with dates (for example `/blog/…`) become a blog collection; other CMS collections are imported as pages.
- Not moved: interactions and animations, Ecommerce, Memberships and custom code embeds (listed in the report).

### Anything else

Carrd, Framer, Shopify content pages, Ghost, hand-made HTML — any public site:

```sh
npx -y @omniharmonic/openspace-cli import url https://www.example.com my-site
```

The importer reads your sitemap (or follows your site's own links), finds the main content of each page, skips menus, cookie banners and sidebars, and rebuilds each section with the closest OpenSpace blocks and presets. Pages with dates and authors become a blog. Add `--render` for sites that build their pages with JavaScript.

## 3. Match the look

The import gets the structure, words and images right and the look close. To get the rest of the way, open Claude Code in the new folder (`cd fernwood && claude`) and ask it to match the original, or let `/openspace:migrate` continue. Claude works page by page:

1. It screenshots your old page with `screenshot_url` and the OpenSpace page with `screenshot`, at desktop and mobile widths.
2. It names the biggest differences — section order, the hero, colors, spacing, image crops.
3. It fixes them with OpenSpace's design tools: section presets, color themes, grid placement and Site Styles. It never copies the old site's code.
4. It runs the Design check and looks again.

Without Claude, use Studio the same way: open each page next to your old site and adjust sections and [Site Styles](/guides/site-styles/).

## 4. Publish and move your domain

1. Fix the report's **Needs attention** items, run `npx openspace check`, and [publish](/guides/publishing/) to the free address (for example `yourname.github.io/fernwood`). Click through it.
2. [Connect your domain](/guides/domains/) to the OpenSpace site. Change the DNS records wherever your domain is managed today (Squarespace Domains, Wix, your registrar…) as the domain guide shows; you don't need to transfer it.
3. Wait until your domain shows the new site over HTTPS (usually minutes, sometimes a few hours), and try a few old links — old post addresses should redirect.
4. Only then cancel your old plan or hosting. Moving the domain registration is optional and can happen any time later.

## Questions

**Will my search rankings survive?** Page titles, descriptions and addresses are kept where possible, and every changed address redirects permanently (301) to its new one, which is what search engines need.

**Can I import again?** Yes — into a new folder. Import again before you start editing if your old site changed in the meantime; once you've edited the OpenSpace site, add new posts or pages there instead.

**The importer picked the wrong platform.** Use `--platform`, or name the importer: `openspace import url <address>` works for any site.

**Some pages came out nearly empty.** Their content is drawn by JavaScript. Run the import again with `--render`, or rebuild those sections from presets with Claude.
