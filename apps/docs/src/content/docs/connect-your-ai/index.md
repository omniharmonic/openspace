---
title: Connect your AI
description: Let your own AI — Claude or any MCP-capable assistant — read and edit your OpenSpace site through safe, typed tools, with you in control of what goes live.
---

OpenSpace has no built-in, metered AI. Instead, you connect **your own** AI assistant — Claude, or any app that speaks the Model Context Protocol (MCP) — and it edits your site through the same safe operations Studio uses. OpenSpace never pays for, sees the cost of, or limits the model you choose.

Ask things like:

- "Make the hero feel warmer and add a testimonials section with these three quotes."
- "Write a journal post from my notes about the new Saturday class, as a draft."
- "Add a page for the autumn retreat, using the photos at these links."
- "Check the site on mobile and fix anything cramped."

## Three ways to connect

| You use | Connect with | Guide |
|---|---|---|
| **Claude** on the web or **Claude Desktop** | A custom connector pointed at the Hub | [Claude & Claude Desktop](/connect-your-ai/claude/) |
| **Claude Code** | The OpenSpace plugin (local files) or the Hub's remote server | [Claude Code plugin](/connect-your-ai/claude-code/) |
| **Other MCP apps** | The Hub URL or a personal link | Below |

## Sign-in or personal link?

Studio → **Settings → Connect your AI** gives you two kinds of address.

**Sign in (OAuth)** — `https://hub.openspace.host/mcp`. Your AI app opens an OpenSpace sign-in (with GitHub), then a consent screen: *Allow Claude to edit ☑ Fernwood Yoga ☐ Riverbend Collective · ☐ Allow publishing*. You choose the sites and whether publishing is allowed — it's **off by default**. Best for apps that support sign-in, like Claude.

**Personal link** — `https://hub.openspace.host/mcp/t/…`. A private address for **one site** that works without signing in. Give it a name ("Claude on my laptop"), choose whether it may publish, and copy it — the full link is shown only once. Treat it like a password: anyone with it can edit that site's draft. Each link shows when it was last used and can be turned off at any time.

Both appear under **Apps with access**, where you can switch **Can publish** on or off or **Disconnect** an app. Changes apply immediately.

## What your AI can and can't do

Your AI can read your site's structure and pages, edit text, add, move and remove sections and blocks, compose pages from section presets, restyle through Site Styles, manage pages and navigation, upload images from links, write blog posts and events, run the Design check, preview — and publish, **only** if you allowed it and **only** after you confirm in the conversation.

It can't:

- Write raw HTML into your pages, or break a layout: every edit is checked against the site's schema, and invalid edits are rejected with an explanation it can act on.
- Change custom code (custom CSS, head or footer code), your site's build files or its settings file.
- Do more than **your role** allows. The connection uses your *current* role on each site: an editor's AI can change content but not styles or layout, and contributors can't connect an AI.
- Delete a page, discard the draft, roll back or publish without an explicit confirmation.

## Watching and undoing

Edits from your AI land in the **draft**, never straight on your live site. In Studio you see them as they happen — "Claude is editing *Home*…" — and when it's done, a banner asks: **Claude made 4 changes to Home. Keep them?** with **Accept** and **Undo all**.

OpenSpace also saves a **snapshot before every AI session**, listed in [History](/guides/publishing/#history) as "Before an AI session", so you can always get back to how things were.

## Limits

To keep the shared Hub free, each connection can make up to **120 tool calls a minute** and **2,000 a day**, and each site up to **2,000 AI edits a day**. Self-hosted Hubs set their own limits.

## Other MCP apps

Any app that supports remote MCP servers over Streamable HTTP can connect: use the sign-in address if it supports OAuth, or a personal link if it doesn't. Coding agents working on a local copy of your site can also read its `AGENTS.md`, which explains the site's structure and rules.
