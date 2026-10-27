---
name: openspace-site-setup
description: Help someone start an OpenSpace website from the Claude app with no installs: sign up in Studio, pick a template, connect Claude, publish, and connect a custom domain.
license: MIT
metadata:
  version: "0.2.0"
  for: claude.ai and Claude Desktop with the OpenSpace connector (https://hub.openspace.host/mcp)
---

# Setting up an OpenSpace site — browser and Claude only

OpenSpace is a free, open-source website builder. The owner works in **OpenSpace Studio** (https://studio.openspace.host) in their browser; Claude works on the same site through the **OpenSpace connector**. Nothing is installed on their computer. Sites live in the owner's own GitHub account and are published for free on GitHub Pages (or Cloudflare, for stores and member areas).

Talk in plain words: "your site", "publish", "the live site". Don't say "repository", "commit", "branch", "build" or "deploy" unless the owner does. Never suggest a terminal, Node, npm or the command line — that is a different, developer path.

## 1. Create the site in Studio

1. Open https://studio.openspace.host and **Sign in with GitHub**. (No GitHub account? Creating one is free; it's where their site's files are kept.)
2. When asked, **install OpenSpace on their GitHub account** and allow it. This is what lets OpenSpace create and publish the site. If site creation ever says it couldn't finish setting up, this step was skipped: Studio shows a button to install it, then **Try again**.
3. Pick a template by purpose (not by color — colors change later in one step):

| Template | For | Mood |
| --- | --- | --- |
| Meadow | Yoga, therapy, wellness | Calm, airy |
| Harbor | Nonprofits, community groups | Warm, civic |
| Atelier | Photographers, artists | Gallery-first |
| Ledger | Consultants, freelancers | Crisp, editorial |
| Hearth | Restaurants, cafés | Warm, appetizing |
| Signal | Products, startups | Bold, modern |
| Field Notes | Writers, newsletters | Reading-first |
| Encore | Musicians, podcasters | Expressive |
| Kiln | Makers, small shops | Tactile |
| Commons | Coalitions, cooperatives | Grounded |
| Vow | Weddings | Romantic |
| Link | Link-in-bio | Mobile-first |

More templates are in Studio's gallery (Darkroom, Orbit, Beacon, Fixwell, Keystone, Gather, Inkwell, Folio). `list_templates` shows them all once connected.

4. Name the site. It goes live on a free address in about three minutes.

**Already have a site elsewhere** (Squarespace, GitHub Pages, WordPress, Wix…)? Use the `openspace-migrate` skill instead: it imports the existing site in the cloud.

## 2. Connect Claude

1. In Claude: **Settings → Connectors → Add custom connector**. Name **OpenSpace**, address `https://hub.openspace.host/mcp`.
2. Claude opens OpenSpace: sign in, tick the sites Claude may edit, and decide whether Claude may **publish** (off by default — the owner can always publish from Studio). Press **Allow**.
3. In a chat, turn the OpenSpace connector on in the tools menu. Check with `list_sites` and `get_site`.

Alternative for one site without signing in: Studio → Settings → Connect your AI → **personal link**; paste it as the connector address. Treat it like a password.

Skills (this one, `openspace-web-design`, `openspace-migrate`, `openspace-content`) are uploaded once in Claude under **Customize → Skills**, from the zip files linked in Studio → Settings → Connect your AI.

## 3. Make it theirs

With the connector on, offer the owner a first pass: replace the template's sample words, people, prices and photos with theirs (ask for anything you don't know — never invent it), then restyle if they want a different mood (`apply_template_look`). The `openspace-web-design` skill has the full design loop, including screenshots taken in the cloud.

## 4. Publish

Edits land in the **draft**; the live site changes only on publish. The owner presses **Publish** in Studio, or Claude calls `publish` with `confirm: true` after the owner asks, if the connection may publish. The live site updates in a minute or two. `list_versions` and `rollback` (with `confirm: true`) bring back an earlier version.

## 5. Connect a custom domain

In Studio → Settings → **Domain**: enter the domain; the wizard recognises the registrar, shows the exact records with steps for that registrar, checks them every few seconds and turns on HTTPS when the certificate is ready. The owner makes the change at their registrar; Claude can explain each step but can't change DNS.

## Troubleshooting

- **"We couldn't finish setting up your site"** — OpenSpace isn't installed on their GitHub account yet. Studio offers **Install OpenSpace on GitHub**; after that, **Try again**.
- **The connector asks to pick a site but there are none** — create the site in Studio first, then connect again.
- **"Not allowed to publish"** — publish from Studio, or turn on publishing for Claude in Studio → Settings → Connect your AI.
- **Claude can't see a site** — the connection covers only the ticked sites; reconnect and tick it.
