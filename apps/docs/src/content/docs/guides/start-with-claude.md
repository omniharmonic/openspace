---
title: Start with Claude
description: Describe your idea, bring your brand — a Claude Design System, a Canva brand kit, Figma tokens, your logo and photos, or a page Claude made for you — and get a live site in minutes that Claude then designs with you.
---

There are three ways to begin with OpenSpace: **start from a template**, **move a site you already have**, or **start with Claude**. Start with Claude is for when you have an idea (and maybe a brand) but no site yet — or when Claude has already sketched a page for you.

You tell us about your idea in your own words. A good site goes **live straight away** on free hosting, in your colours and fonts. Then Claude designs it properly with you, one step at a time, showing you the result as it goes. Nothing to install.

## 1. Tell us about your idea

Open [Start with Claude](https://studio.openspace.host/start) in Studio (it's next to the templates, and on your sites page). Three questions:

- **What is it for?** Your business, project or cause — a sentence or two, the way you'd tell a friend.
- **Who is it for?** The people you want to reach.
- **How should it feel?** Pick a few words — warm, calm, bold, playful, elegant, earthy, modern… or add your own.

Then sign in with GitHub (the free place your site's files are kept — it's yours).

## 2. Bring anything you already have (all optional)

Choose **Add files** and add whatever you have. OpenSpace works out what each file is:

| What you bring | What happens |
|---|---|
| **Your logo** (PNG or JPG, with "logo" in the file name) | It goes in your site's header. |
| **Photos** | They replace the starting design's pictures on your home page. |
| **A design system or brand kit** (`.json`) | Your colours, fonts, text sizes and spacing become your site's styles. See below for where to get one. |
| **A brand guide** (PDF, Word, Markdown or text) | Claude reads it — your voice, your do's and don'ts. A PDF is kept with your site's files (never published). |
| **A page Claude made you** (`.html`, or a `.zip` with its pictures) | It becomes your site — see [Bring a page Claude made](#bring-a-page-claude-made). |

You can also pick **brand colours** (your main colour first) and type the names of the **fonts** you use.

Choose **Make my site**. In a minute or two it's live.

### Where design-token files come from

A "design-token file" is just a list of your brand's colours, fonts and sizes that design tools can export. OpenSpace reads all the common kinds:

- **A Claude Design System** — ask Claude for "my design system as a design-tokens JSON file" (W3C design tokens). Download the file Claude makes.
- **Canva** — from your Brand Kit, note your colours and fonts, or export them; a simple file like `{"colors": [{"name": "Blush", "hex": "#F4C7C3"}], "fonts": [{"usage": "Heading", "family": "Abril Fatface"}]}` works.
- **Figma** — export your variables or styles with Tokens Studio (Figma Tokens) or a design-tokens plugin.
- **Style Dictionary** files, or any hand-written JSON with groups such as `color`, `font`, `type` and `space`.

Your colours are checked for readability: if a colour is too light for text on your background, OpenSpace nudges it just enough to read well, and tells you. Fonts that are free on Google Fonts are used as they are; a licensed font (say, one you bought) is replaced by the closest free pairing until you upload it in **Site Styles → Your fonts**.

## 3. Your site is live — now Claude designs it

Without Claude, your site is already a good, editable site: the closest template to what you described, wearing your brand. With Claude, it becomes truly yours. Studio shows you how:

### In the Claude app (recommended)

1. **Connect OpenSpace to Claude** (once): in Claude, **Settings → Connectors → Add custom connector**, address `https://hub.openspace.host/mcp`. Sign in with GitHub and tick your site. ([Step-by-step](/connect-your-ai/claude-app/).)
2. **Add the design skill**: download [openspace-design-from-scratch.zip](/skills/openspace-design-from-scratch.zip) and upload it in Claude under **Settings → Capabilities → Skills**.
3. **Send the ready-made message** Studio gives you (or choose **Open Claude with it**).

Claude then works with you like a designer would: it asks about your business and the people you want to reach, describes two or three directions in words for you to choose from, sets your colours and type, plans your pages, builds them — using OpenSpace's designed sections and one or two bespoke ones made just for you — and checks every change with screenshots. It publishes only when you say so.

### In Claude Code

Add the plugin (`/plugin marketplace add omniharmonic/openspace`, then `/plugin install openspace@openspace`), connect the site, and run `/openspace:design-from-scratch`.

### Starting from a conversation

Already talking to Claude in the Claude app with OpenSpace connected? Just say "make me a website for …". Claude can create the site itself (the `start_site` tool) — with your brand files, or with a page it made for you earlier in the chat.

## Bring a page Claude made

If Claude made you a web page — an artifact you downloaded, a single HTML file, or a folder of HTML, CSS and pictures — OpenSpace turns it into a real site that looks the same:

- Every section keeps its design. Its words, pictures and links become fields you change in the editor like anywhere else.
- The page's own colours and fonts become your site's styles, so new sections match.
- The top menu becomes your site's header (with its mobile menu); forms become working OpenSpace forms; videos become video blocks.
- Pictures (including background pictures) are copied at full quality.

In Studio, add it on the **What you have** step of Start with Claude, or in **Move my site → Upload a page**. In the Claude app, Claude can pass the page straight to OpenSpace. With the command line: `openspace import html my-page.html` (or a folder, a `.zip` or an address); add `--compare` to check the result against the original in a browser.

A few things don't carry over: scripts that do something special (a calculator, a booking widget) — the section stays, without the script; tell Claude what it did and it can rebuild it. Pages that build their look with a script (such as the Tailwind CDN) come across best through the command line, which renders them in a browser first.

## Your design system, kept with your site

Everything above — what you told us, your brand files, your colours, fonts and sizes, and the design rules you and Claude agree — is kept with your site as its **design system**. Claude reads it before every change, so a section added next month looks like it belongs. You never have to manage it; ask Claude to "update our design system" if your brand changes.
