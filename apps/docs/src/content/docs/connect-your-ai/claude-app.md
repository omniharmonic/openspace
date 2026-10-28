---
title: "No installs: the Claude app"
description: Use Claude on claude.ai or Claude Desktop to build, redesign or move your website into OpenSpace — just a browser and Claude, nothing to install.
---

Everything Claude can do with OpenSpace works from **Claude on the web (claude.ai) or Claude Desktop**, with nothing installed on your computer: no terminal, no Node, no browser add-ons. OpenSpace runs the heavy parts in the cloud — importing your old site, taking screenshots so Claude can see the design, publishing.

You need:

- an OpenSpace account — sign in at [studio.openspace.host](https://studio.openspace.host) with GitHub (free), and allow OpenSpace on your GitHub account when asked;
- a Claude plan that includes custom connectors and skills (Pro, Max, Team or Enterprise; on Team and Enterprise your admin may need to allow them).

## 1. Add the OpenSpace connector

1. In Claude, open **Settings → Connectors** and choose **Add custom connector**.
2. Name it **OpenSpace** and enter the address `https://hub.openspace.host/mcp`.
3. Claude opens OpenSpace in a new window. Sign in with GitHub and choose what Claude may do:
   - **Create new sites and edit the sites it creates** — on by default. A site Claude makes is always Claude's to edit.
   - **All my sites, including ones I make later** — optional. Claude can then edit every site you work on, including ones you start in Studio afterwards.
   - **Or pick the sites it can edit now** — if you'd rather choose site by site.
   - **Allow publishing** — off by default; you can always publish yourself in Studio, and Claude asks before every publish.
   Press **Allow**.
4. In a new chat, open the tools menu and make sure **OpenSpace** is on.

Don't have a site yet? That's the easiest start: say "make me a website" and Claude asks you about it, designs it and puts it online — see [Start with Claude](/guides/start-with-claude/). Claude can also move an existing site in for you (step 3 below).

### Changing what Claude can reach

- **Studio → Connect your AI → Apps with access** shows each connected app with **All my sites**, **Can create sites** and **Can publish** switches, and **Disconnect**.
- If Claude asks for a site it isn't allowed to edit, it gives you an **Allow** link. It opens Studio, where you choose **Allow** — one click, and only you (signed in) can do it; Claude can't give itself access.
- Right after you create a site in Studio, the welcome screen offers **Let Claude edit this site**.

More detail, personal links and troubleshooting: [Claude & Claude Desktop](/connect-your-ai/claude/).

## 2. Add the OpenSpace skills

Skills are short guides that teach Claude how to do a job well — here, how to move a site, how to design pages to a high standard, how to manage posts and events, and how to set up a site. Download the ones you want (each is a small `.zip` file — don't unzip it):

| Skill | What it teaches Claude | Download |
|---|---|---|
| **openspace-migrate** | Move a site from Squarespace, GitHub Pages, WordPress, Wix or anywhere, and match its look page by page with screenshots | [openspace-migrate.zip](/skills/openspace-migrate.zip) |
| **openspace-web-design** | Design and redesign pages: presets first, then a fast check, edit and screenshot loop | [openspace-web-design.zip](/skills/openspace-web-design.zip) |
| **openspace-content** | Blog posts, events, products, portfolio projects and podcast episodes | [openspace-content.zip](/skills/openspace-content.zip) |
| **openspace-site-setup** | Start a site, connect Claude, publish and connect a domain | [openspace-site-setup.zip](/skills/openspace-site-setup.zip) |

Then upload each one:

1. In Claude, open **Customize → Skills**.
2. Choose **+** (or **Add skill**) → **Upload a skill**, and pick the `.zip` file you downloaded.
3. Make sure the skill's switch is **on**.

If you don't see Skills, turn on **Code execution and file creation** in Claude's settings (under Capabilities) and look again. Skills you add on claude.ai also appear in Claude Desktop. Studio links to the same downloads under **Settings → Connect your AI → Claude app**.

## 3. Move your Squarespace site

Start a new chat with the OpenSpace connector on and say:

> Move my Squarespace site https://www.my-studio.com to OpenSpace. I own it. Keep my words and photos, and make it look as close to the original as you can.

Claude will:

1. take screenshots of your current site on desktop and phone, and describe it back to you;
2. ask before starting the import, then run it in the cloud (a few minutes) — it brings over pages, images, navigation, blog posts, forms and a redirect for every changed address, and creates your new OpenSpace site;
3. go page by page, comparing screenshots of the old and new pages side by side and adjusting the new one with OpenSpace's design tools until they match;
4. list what needs you: newsletter subscribers to export, any code snippets, commerce or member areas;
5. publish when you say so, then walk you through pointing your domain at the new site. Keep your Squarespace plan until the domain shows the new site.

Watch the changes arrive in Studio as Claude works; **Undo all** is always there. Details: [Move from Squarespace](/guides/migrate-from-squarespace/).

## 4. Make a GitHub Pages site editable

If you already have a site on GitHub Pages — plain HTML or Jekyll, at an address like `yourname.github.io/power-with` or your own domain — Claude can make it editable in Studio:

> My site https://life-culture.github.io/power-with is on GitHub Pages. Make it editable in OpenSpace Studio, keep the same content and look, and tell me what changes.

Claude asks whether to create a new OpenSpace site next to the old one (the safest choice: the old one keeps running until you switch) or to convert the existing site in place, when that's offered. Pages, Jekyll blog posts, the navigation and your images come across; the look is rebuilt with OpenSpace's designs and compared with screenshots of the original. Once you're happy, you edit it in Studio like any other OpenSpace site.

## More things to ask

- "Take a screenshot of my home page on a phone and tell me what feels cramped."
- "Redesign the About page to feel warmer — check it on desktop and mobile as you go."
- "Write a journal post from these notes, as a draft."
- "Compare my live site with the draft and summarise what will change when I publish."

## When something goes wrong

- **Claude says it can't see OpenSpace tools** — turn the OpenSpace connector on in the chat's tools menu, or add it again (step 1).
- **"Screenshots aren't available"** — your Hub hasn't turned them on (self-hosted Hubs: see [Self-hosting](/self-hosting/)). Claude carries on by reading the rendered page.
- **"That's a lot of screenshots"** — screenshots are limited to about forty every ten minutes; wait a few minutes or let Claude look at one section at a time.
- **Claude can't edit a site** — give it the **Allow** link Claude shows you, or turn on **All my sites** in Studio → Connect your AI → Apps with access.
- **"Still being set up" / "being published"** — a new site takes under a minute to set up and about a minute to go live. Editing works as soon as it's set up; Claude checks and tells you when it's live.

Prefer the terminal and a copy of the site on your own computer? The [Claude Code plugin](/connect-your-ai/claude-code/) is the power-user path.
