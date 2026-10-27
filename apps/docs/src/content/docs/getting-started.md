---
title: Live in three minutes
description: Pick a template, sign in with GitHub, and your OpenSpace site is online — then make it yours.
---

OpenSpace gets you from nothing to a live, good-looking website in about three minutes, without installing anything.

:::tip[Two other ways to begin]
**[Start with Claude](/guides/start-with-claude/)**: describe your idea and bring your brand (or a page Claude made) — your site goes live, then Claude designs it with you. **[Move your site](/guides/migrate-to-openspace/)**: bring a site you already have.
:::

## 1. Pick a template

Open **Studio** (the OpenSpace editor) at [studio.openspace.host](https://studio.openspace.host/templates) and browse the gallery. You don't need an account to look around or preview. There are [twenty templates](/templates/), each with three looks. Pick the one closest to what you do — you can change the look later without losing anything.

Optionally type your site's name and one line about what you do. They're written into the template for you.

## 2. Sign in with GitHub

GitHub is a free, safe place where your site's files live. **You own them**, under your own name. If you don't have an account yet, Studio walks you through making one and brings you straight back.

You'll see one screen asking to install the OpenSpace app on your GitHub account. It lets OpenSpace create your site and save your edits; it only works with the sites it creates. If you skip it, Studio shows a button to finish it later — nothing is lost.

## 3. You're live

Studio shows "Setting up your site…" while it creates your site from the template, writes in your name and tagline, and puts it online — on free hosting, with nothing else to sign up for. When it's done, a short tour shows you around the editor and ends on your live link — something like `yourname.github.io/your-site` — ready to share.

## 4. Make it yours

A short checklist helps with the first edits:

- **Replace the logo** — Settings → General.
- **Change the main photo** — click it on the canvas and pick or upload an image.
- **Edit the headline** — click the text and type.
- **[Connect your domain](/guides/domains/)** — use your own address.
- **[Connect your AI](/connect-your-ai/)** — let Claude help.

Every edit is saved as you go. Your live site only changes when you press **Publish** — see [Publishing, history & rollback](/guides/publishing/).

## 5. Finish setting up, whenever you like

Some things need one more account or a few minutes of your time, so they never hold up your first live version. **Finish setting up** (at the top of the editor, and on your site's card) lists only what your site needs, with why it matters and how long it takes:

- **Use your own domain** — a guided helper shows exactly what to copy where you bought it. About 15 minutes, mostly waiting.
- **Open your shop / take donations** — your products already show on the site, with a friendly "opening soon" note where the Buy button goes. Turning checkout on takes about 10 minutes: a free Cloudflare account (Studio opens Cloudflare with everything filled in — you paste one key) and Stripe for payments. Your site stays online the whole time; if anything goes wrong, it stays exactly where it was. Not ready? Point the note at your current shop meanwhile.
- **Member sign-in and password pages** — the same free Cloudflare step.
- **Form messages, newsletter sign-ups, visitor stats** — where to find them.

Stuck? **Need a hand?** (the life-ring at the bottom of the editor's left edge) says what to do next, replays the tour, and connects Claude.

## Where everything lives

Settings → *Your site's home* explains it in plain words:

- Your site's **files** are stored in your GitHub account.
- Your site is **published** by GitHub Pages for free (or, once you turn on a shop or members-only pages, by your own free Cloudflare account).
- Your **form entries, subscribers and orders** are kept by the OpenSpace Hub, and you can export them any time.
- You can leave and keep everything.

## Prefer the command line?

Developers can create a site locally with the CLI instead:

```sh
npx -y @omniharmonic/openspace-cli new meadow my-site --title "Fernwood Yoga"
cd my-site && npm install && npm run dev
```

See [The openspace CLI](/developers/cli/) and the [Claude Code plugin](/connect-your-ai/claude-code/).
