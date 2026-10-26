---
title: FAQ
description: Common questions about OpenSpace — cost, ownership, GitHub, AI, stores, leaving, and how it compares with Squarespace.
---

## Is OpenSpace really free?

Yes, and it's designed to stay that way. Your site is stored in your GitHub account and served free by GitHub Pages (or your own free Cloudflare account for stores and member sites). The shared Hub that handles forms, newsletters and analytics costs cents per thousand sites to run. There's no plan to upgrade to.

## So what would I pay for?

Only things you choose, paid to others: a **domain name** from any registrar, Stripe's **card fees** if you sell (OpenSpace takes no cut), and an email provider's paid tier if your newsletter outgrows its free one.

## Do I need to know how to code, or how GitHub works?

No. You need a free GitHub account — Studio walks you through making one — but you'll never see words like "repository" or "commit" unless you open Settings → Advanced.

## Who owns my site?

You do. The files are in your GitHub account, under your name, in open formats. Your form entries, subscribers, members and orders can be exported as spreadsheets at any time.

## What happens if OpenSpace disappears?

Your site keeps working. It's a standard Astro project that builds with standard tools, published from your own account. Forms show a friendly fallback with your email address if the Hub is unreachable, and anyone can [run their own Hub](/self-hosting/).

## Can I use it on my phone?

Yes. Studio works on phones and tablets — edit text, swap photos from your camera roll, add and reorder sections, check your inbox and publish. Precise grid layouts are easiest on a tablet or computer.

## Is my site's content public?

Your site's files are in a **public** repository — but everything in them is on your public website anyway. Private things — form entries, subscribers, members, orders and members-only pages — are never stored there. Don't put anything private in page content; `openspace check` refuses anything that looks like a password or API key.

## Do I have to use AI?

No. Everything can be done by hand in Studio. AI is optional and uses *your own* assistant — see [Connect your AI](/connect-your-ai/).

## Can my AI break my site?

It edits through typed, validated operations, so it can't write broken HTML or wreck a layout. Its changes land in a draft you can watch, undo in one click, or publish. It can only publish if you allowed it, and only after you confirm.

## Can I sell things?

Yes — physical and digital products, donations and paid memberships through Stripe, with no platform fee. Stores need [Cloudflare hosting](/grow/members/#hosting), which uses your own free Cloudflare account.

## Can I move my site from Squarespace?

Today, start from the closest template and copy your content across — Claude can help a lot with that. An importer is planned.

## Can I add custom code?

Designers and owners can add custom CSS and head or footer code in Settings → Advanced, and a Code block runs in a sandbox. For deeper changes, the site is a normal Astro project you can extend — or [eject](/developers/cli/#openspace-eject---yes).

## Where do I get help or report a problem?

Open an issue on [GitHub](https://github.com/omniharmonic/openspace/issues). To report an abusive site, see the repository's `SECURITY.md`.
