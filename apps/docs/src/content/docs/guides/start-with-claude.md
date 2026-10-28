---
title: Start with Claude
description: Make your website in a conversation with Claude — it asks about your idea, designs the site with you, puts it online with OpenSpace and gives you the link to edit it. Nothing to install.
---

There are three ways to begin with OpenSpace: **start from a template**, **move a site you already have**, or **start with Claude**. Start with Claude is for when you have an idea (and maybe a brand) but no site yet.

It all happens **inside Claude** — on claude.ai or in the Claude desktop app. Claude asks you a few questions, suggests a direction, designs your site (not a template) and puts it online on free hosting through OpenSpace. When it's live, Claude gives you two links: your site, and the editor in OpenSpace Studio where you can change any word or photo yourself. Nothing to install.

## 1. Connect OpenSpace to Claude (once)

Open [Start with Claude](https://studio.openspace.host/start) in Studio (next to the templates, and on your sites page). If Claude is already connected, Studio says so and you can skip to step 2. Otherwise, about two minutes:

1. In Claude, open **Settings → Connectors** and choose **Add custom connector**.
2. Name it **OpenSpace** and paste `https://hub.openspace.host/mcp`. Choose **Add**, then **Connect**.
3. Sign in with GitHub (the free place your site's files are kept — it's yours). On the next screen:
   - **Create new sites and edit the sites it creates** is on — leave it on. Any site Claude makes is always Claude's to edit, so permissions can never get out of step.
   - **All my sites, including ones I make later** is optional: tick it if you'd like Claude to help with every site you have or make, including ones you start in Studio.
   - **Allow publishing** stays off unless you choose it; Claude still asks before every publish.
4. Choose **Allow**.

Step-by-step with pictures: [The Claude app](/connect-your-ai/claude-app/).

## 2. Open Claude and say hello

Studio gives you a ready first message — choose **Open Claude with this message** (claude.ai opens a new chat with it filled in; press send), or **Copy the message** and paste it into a new chat in the desktop app. You can also just say "make me a website for my pottery studio" in any chat with the OpenSpace connector on, or pick **Make a new website with me** from the connector's prompts if your Claude app shows them.

## 3. Talk it through

Claude leads, one or two questions at a time:

- **What is the site for?** Your business, project or cause, the way you'd tell a friend.
- **Who visits, and what should they do?** Book a class, buy, sign up, get in touch, read.
- **How should it feel?** Three words — warm, calm, bold, playful, elegant…
- **What do you already have?** A logo, photos, colours, wording, an old site, sites you love. Drop files straight into the chat.
- **Which pages do you need?**

Then Claude describes a direction — colours, type, layout, the page list — and checks it with you before building. It may show you a quick preview.

## 4. Claude builds it and puts it online

Claude designs the site itself — its own pages, colours and type made for you, with your words, checked on phones — and sends it to OpenSpace. Every section becomes editable in Studio.

- **The edit link works straight away.** You can open the editor while the site is still being published.
- **The live site takes about a minute.** The first version is being published on free GitHub Pages hosting; until then, the address shows "not found". Claude tells you while it waits and checks until it's live — you don't need to do anything.
- **The very first time**, GitHub may need one click from you to let OpenSpace create your site's home there. Claude gives you the link.

When it's live, Claude gives you the **live link** and the **link to edit it in OpenSpace**, and offers to keep refining with you in the conversation. Every change Claude makes after that goes to your draft — you see it in Studio and publish when you're ready (or let Claude publish, if you allowed it).

Prefer a template? Tell Claude — it can start from the closest OpenSpace template dressed in your brand instead.

## If Claude says it can't edit a site

Claude only edits the sites you allowed. If you made a site in Studio after connecting Claude (without **All my sites**), Claude says so and gives you a link — **Allow Claude to edit _your site_** — that opens Studio: choose **Allow** (one click, and only you can do it). Studio also offers **Let Claude edit this site** right after you create a site, and **Settings → Connect your AI → Apps with access** has the **All my sites** and **Can create sites** switches.

## Prefer a quick form instead?

The form is still there: on the Start with Claude page, choose **Prefer a quick form instead?** ([studio.openspace.host/start/form](https://studio.openspace.host/start/form)). Fill in three questions — what it's for, who it's for, how it should feel — sign in with GitHub, and bring any files you have. A good site goes live straight away (the closest template in your brand, or your own page made editable), and Studio then shows you how to hand it to Claude.

### Bring anything you already have (all optional)

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

#### Where design-token files come from

A "design-token file" is just a list of your brand's colours, fonts and sizes that design tools can export. OpenSpace reads all the common kinds:

- **A Claude Design System** — ask Claude for "my design system as a design-tokens JSON file" (W3C design tokens). Download the file Claude makes.
- **Canva** — from your Brand Kit, note your colours and fonts, or export them; a simple file like `{"colors": [{"name": "Blush", "hex": "#F4C7C3"}], "fonts": [{"usage": "Heading", "family": "Abril Fatface"}]}` works.
- **Figma** — export your variables or styles with Tokens Studio (Figma Tokens) or a design-tokens plugin.
- **Style Dictionary** files, or any hand-written JSON with groups such as `color`, `font`, `type` and `space`.

Your colours are checked for readability: if a colour is too light for text on your background, OpenSpace nudges it just enough to read well, and tells you. Fonts that are free on Google Fonts are used as they are; a licensed font (say, one you bought) is replaced by the closest free pairing until you upload it in **Site Styles → Your fonts**.

### Your site is live — hand it to Claude

After the form, Studio shows the steps to connect Claude (if it isn't yet), offers **Let Claude edit this site** when Claude is connected but doesn't have this site, and gives you a ready-made message. In Claude Code, add the plugin (`/plugin marketplace add omniharmonic/openspace`, then `/plugin install openspace@openspace`) and run `/openspace:design-from-scratch`.

## Bring a page Claude made

If Claude made you a web page — an artifact you downloaded, a single HTML file, or a folder of HTML, CSS and pictures — OpenSpace turns it into a real site that looks the same:

- Every section keeps its design. Its words, pictures and links become fields you change in the editor like anywhere else.
- The page's own colours and fonts become your site's styles, so new sections match.
- The top menu becomes your site's header (with its mobile menu); forms become working OpenSpace forms; videos become video blocks.
- Pictures (including background pictures) are copied at full quality.

In the Claude app, Claude passes the page straight to OpenSpace (that is how Start with Claude works). In Studio, add it on the **What you have** step of the quick form, or in **Move my site → Upload a page**. With the command line: `openspace import html my-page.html` (or a folder, a `.zip` or an address); add `--compare` to check the result against the original in a browser.

A few things don't carry over: scripts that do something special (a calculator, a booking widget) — the section stays, without the script; tell Claude what it did and it can rebuild it. Pages that build their look with a script (such as the Tailwind CDN) come across best through the command line, which renders them in a browser first.

## Your design system, kept with your site

Everything above — what you told us, your brand files, your colours, fonts and sizes, and the design rules you and Claude agree — is kept with your site as its **design system**. Claude reads it before every change, so a section added next month looks like it belongs. You never have to manage it; ask Claude to "update our design system" if your brand changes.
