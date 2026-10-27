---
title: Live in three minutes
description: Pick a template, sign in with GitHub, and your OpenSpace site is online — then make it yours.
---

OpenSpace gets you from nothing to a live, good-looking website in about three minutes, without installing anything.

## 1. Pick a template

Open **Studio** (the OpenSpace editor) at [studio.openspace.host](https://studio.openspace.host/templates) and browse the gallery. You don't need an account to look around or preview. There are [twenty templates](/templates/), each with three looks. Pick the one closest to what you do — you can change the look later without losing anything.

Optionally type your site's name and one line about what you do. They're written into the template for you.

## 2. Sign in with GitHub

GitHub is a free, safe place where your site's files live. **You own them**, under your own name. If you don't have an account yet, Studio walks you through making one and brings you straight back.

You'll see one authorization screen for the OpenSpace app. It lets OpenSpace create your site and save your edits; it only works with the sites it creates.

## 3. You're live

Studio shows "Setting up your site…" while it creates your site from the template, writes in your name and tagline, and puts it online. When it's done, you land in the editor with a link to your live site — something like `yourname.github.io/your-site` — ready to share.

## 4. Make it yours

A short checklist helps with the first edits:

- **Replace the logo** — Settings → General.
- **Change the main photo** — click it on the canvas and pick or upload an image.
- **Edit the headline** — click the text and type.
- **[Connect your domain](/guides/domains/)** — use your own address.
- **[Connect your AI](/connect-your-ai/)** — let Claude help.

Every edit is saved as you go. Your live site only changes when you press **Publish** — see [Publishing, history & rollback](/guides/publishing/).

## Where everything lives

Settings → *Your site's home* explains it in plain words:

- Your site's **files** are stored in your GitHub account.
- Your site is **published** by GitHub Pages (or by your own Cloudflare account, for stores and members-only pages).
- Your **form entries, subscribers and orders** are kept by the OpenSpace Hub, and you can export them any time.
- You can leave and keep everything.

## Prefer the command line?

Developers can create a site locally with the CLI instead:

```sh
npx -y @omniharmonic/openspace-cli new meadow my-site --title "Fernwood Yoga"
cd my-site && npm install && npm run dev
```

See [The openspace CLI](/developers/cli/) and the [Claude Code plugin](/connect-your-ai/claude-code/).
