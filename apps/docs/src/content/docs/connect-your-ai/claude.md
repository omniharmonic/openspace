---
title: Claude & Claude Desktop
description: Connect Claude on the web or Claude Desktop to your OpenSpace site with a custom connector.
---

Claude on the web (claude.ai) and Claude Desktop connect to OpenSpace as a **custom connector**. Custom connectors are available on Claude's paid plans; your workspace admin may need to allow them on Team and Enterprise plans.

## Add the connector

1. In Claude, open **Settings → Connectors** and choose **Add custom connector**.
2. Name it **OpenSpace** and paste the address from Studio → Settings → Connect your AI:
   - `https://hub.openspace.host/mcp` to **sign in** and choose sites, or
   - your **personal link** (`https://hub.openspace.host/mcp/t/…`) for one site without signing in.
3. If you used the sign-in address, Claude opens OpenSpace: sign in with GitHub, tick the sites Claude may edit, and decide whether to **Allow publishing** (off by default). Press **Allow**. A personal link skips this step: there's no sign-in, and it edits the draft only unless the site owner allows that link to publish.
4. In a new chat, make sure the OpenSpace connector is turned on in the tools menu.

Claude Desktop uses the same Settings → Connectors screen, and connectors you add on the web appear there too.

If your site runs on a [self-hosted Hub](/self-hosting/), use that Hub's address instead, such as `https://hub.example.org/mcp`.

## A good first conversation

> Look at my OpenSpace site and tell me what you'd improve on the home page. Don't change anything yet.

Then:

> Make the hero headline shorter and warmer, swap the services section for one with photos, and check it on mobile. Keep my words where you can.

Claude reads the design guidance that ships with OpenSpace — start from presets, one main action per screen, deliberate color rhythm, two typefaces, **never invent facts, testimonials or prices** — so it composes with your site's styles rather than inventing its own.

Open Studio alongside the chat to watch the changes arrive, then **Accept** or **Undo all**. When you're happy, publish in Studio — or, if you allowed it, tell Claude "publish it" and confirm.

## Prompts built in

The connector offers ready-made prompts in Claude's prompt menu:

- **Design a page** — compose a new page (or redesign one) from section presets, with your real copy.
- **Restyle the site** — change the whole look through Site Styles, for a mood you describe.
- **Write a blog post** — a draft in your voice.
- **Iterate on a design** — a tight look → check → edit loop on one page.

## Troubleshooting

- **"Not allowed to publish"** — publish from Studio, or, for a sign-in connection, turn on **Can publish** for Claude in Studio → Settings → Connect your AI → Apps with access. A personal link is draft-only unless the site owner turns on **Allow this link to publish** on that link.
- **An edit was rejected** — Claude sees exactly why (for example a field that's too long) and usually corrects itself. Nothing changes on a rejected edit.
- **Claude can't see a site** — the connection only covers the sites you ticked; reconnect to change them. Contributors can't connect an AI.
- **Screenshots** — Claude on the Hub can't take screenshots yet; it reads the rendered page and gives you a preview link instead. The [Claude Code plugin](/connect-your-ai/claude-code/) can screenshot local sites.
