---
title: Move from Squarespace
description: Bring a Squarespace site into OpenSpace — pages, blog, events, products, images, navigation, SEO and redirects — then match its look with Claude and move your domain without downtime.
---

OpenSpace can read your Squarespace site and rebuild it as an OpenSpace site you own: the same pages and words, your photos, blog posts, events and products, your navigation, page titles and descriptions, and redirects so every old link keeps working. The look is recreated with OpenSpace's own design system — your colors, a matching font pairing, your button style — rather than copied from Squarespace's template.

Your Squarespace site keeps running the whole time. You switch your domain over only when the new site is live and you're happy with it.

:::note
Only import sites you own or are moving for their owner. The importer reads your public site the way a careful visitor would: one page at a time, with a pause between requests, and it respects your site's `robots.txt`.
:::

## What you need

- Your site's address, for example `https://www.fernwoodyoga.com`. The site must be public while you import (turn off any site-wide password for an hour).
- Node.js 22 or newer for the command line, or the [Claude Code plugin](/connect-your-ai/claude-code/).
- **Optional, recommended for blogs:** Squarespace's blog export. In Squarespace open **Settings → Import & Export → Export**, choose **WordPress**, and download the `.xml` file. It includes drafts and complete posts.

## 1. Import

With Claude Code and the OpenSpace plugin, ask:

```
/openspace:import-squarespace https://www.fernwoodyoga.com fernwood
```

Claude asks a few questions (do you sell products? do you have the blog export?), runs the import and reads you the report.

Or run it yourself:

```sh
npx -y @omniharmonic/openspace-cli import squarespace https://www.fernwoodyoga.com fernwood \
  --owner --export ~/Downloads/Squarespace-Wordpress-Export.xml
cd fernwood
npm install
npx openspace dev
```

| Option | Meaning |
|---|---|
| `--owner` | You own the site: also read Squarespace's `?format=json` data, which adds tags, categories, authors, product variants, sale prices, event places and SEO fields. Squarespace's `robots.txt` asks automated tools not to read this data, so it is off unless you say it's your site. |
| `--export <file>` | The WordPress export, for complete blog posts and drafts. |
| `--target cloudflare` | Use the Cloudflare hosting target — needed to sell products, and for members-only or password pages. Default: GitHub Pages. |
| `--repo <owner/name>`, `--domain <host>`, `--title <title>` | As for [`openspace new`](/developers/cli/). |
| `--max-pages <n>` | Read at most this many pages and items (default 400). |
| `--delay <ms>` | Pause between requests to your site (default 300 ms). |
| `--no-media` | Skip downloading images and files — a quick look at the structure. |

The new folder is a complete OpenSpace site. The import ends by running `openspace check`, which should report no errors.

## 2. Read the import report

`IMPORT-REPORT.md` in the new folder lists:

- every page with its old and new address, and every collection;
- how the look was translated (brand color, font pairing, type scale, any contrast adjustments);
- **Needs attention** — the things only you can decide, such as custom code, a form field OpenSpace doesn't have, a link that pointed at a page that wasn't imported, or member areas;
- the redirects, and what the importer never moves (below).

## What comes across

| From Squarespace | In OpenSpace |
|---|---|
| Pages and their sections (classic layouts and Fluid Engine grids) | Pages with stacked or grid sections, in the same order and column structure |
| Text, images (with alt text and captions), galleries, buttons, quotes, accordions, videos, maps, audio | The matching blocks; images are downloaded into your site's media library |
| Forms | OpenSpace forms with the same fields; submissions arrive in your inbox |
| Newsletter blocks | Newsletter signups |
| Code and embed blocks | Embed blocks, which run in a sandbox |
| Blog | A blog collection with dates, authors, categories, tags, excerpts and featured images |
| Events | An events collection with dates, times and places |
| Products | A products collection with prices, sale prices, options and variants |
| Portfolio projects | A portfolio collection |
| Navigation, folders and the header button | Navigation with folders and a call-to-action button |
| Logo, social links, page titles and descriptions | The same, in site settings and page SEO |
| Changed addresses (`/home`, date-based post URLs, `/shop/p/…`) | 301 redirects to the new addresses |
| Section color themes, colors, fonts, button shape | Section color themes and [Site Styles](/guides/site-styles/) |

## What doesn't

- **Commerce settings and history**: orders, customers, inventory counts, discounts, gift cards, shipping and tax. Products come across as your catalog; to sell, use the Cloudflare target and connect Stripe ([Store](/grow/store/)).
- **Subscribers and submissions**: newsletter subscribers, form submissions and blog comments. Export your subscriber list from Squarespace and import it in [Forms & newsletter](/grow/forms-and-newsletter/).
- **Member areas and password-protected pages**: their content isn't public, so it can't be read. Recreate them as [members-only or password pages](/grow/members/).
- **Custom code**: site-wide Code Injection and custom CSS are listed in the report but never copied. Add back the snippets you still need (for example analytics) in **Settings → Advanced**.
- **App blocks** such as scheduling, donations, Instagram feeds and restaurant menus: their text is kept where there is any, and each is listed in the report.

## 3. Match the look

The import gets the structure, words and images right and the look close. To get the rest of the way, open Claude Code in the new folder (`cd fernwood && claude`) and ask it to match the original, or let `/openspace:import-squarespace` continue. Claude works page by page:

1. It screenshots your Squarespace page with `screenshot_url` and the OpenSpace page with `screenshot`, at desktop and mobile widths.
2. It names the biggest differences — section order, the hero, colors, spacing, image crops.
3. It fixes them with OpenSpace's design tools: section presets, color themes, grid placement and Site Styles. It never copies Squarespace's code.
4. It runs the Design check and looks again.

Without Claude, use Studio the same way: open each page next to your Squarespace site and adjust sections and [Site Styles](/guides/site-styles/).

## 4. Publish and move your domain

1. Fix the report's **Needs attention** items, run `npx openspace check`, and [publish](/guides/publishing/) to the free address (for example `yourname.github.io/fernwood`). Click through it.
2. [Connect your domain](/guides/domains/) to the OpenSpace site. If your domain is with Squarespace Domains, change its DNS records there as the domain guide shows; you don't need to transfer it.
3. Wait until your domain shows the new site over HTTPS (usually minutes, sometimes a few hours), and try a few old links — old blog post and product addresses should redirect.
4. Only then cancel your Squarespace site plan. Moving the domain registration away from Squarespace is optional and can happen any time later.

## Questions

**Will my search rankings survive?** Page titles, descriptions and addresses are kept where possible, and every changed address redirects permanently (301) to its new one, which is what search engines need.

**Can I import again?** Yes — into a new folder. Import again before you start editing if your Squarespace site changed in the meantime; once you've edited the OpenSpace site, add new posts or pages there instead.

**It's a Squarespace 7.0 site.** That works too: 7.0 layouts, index pages and blogs are read the same way.
