---
title: Privacy & data
description: What OpenSpace stores, where, for how long, and how visitors and owners stay in control.
---

OpenSpace is built to keep as little as possible, and to keep what it does hold under your control.

## Where things live

| What | Where | Who controls it |
|---|---|---|
| Pages, styles, images, posts, products (public content) | Your site's GitHub repository | You |
| Members-only pages | Your own Cloudflare storage (Cloudflare hosting) | You |
| Form entries, subscribers, members, orders, analytics counts | The OpenSpace Hub | You — export or delete any time |
| Payments and card details | Stripe, on your own account | You and Stripe |
| Cloudflare and Stripe keys for your site | Encrypted secrets on your repository (Cloudflare) or encrypted in the Hub (sovereign Stripe) | You |

## Visitors

- **No tracking cookies.** Analytics are cookieless and aggregate. Unique visitors are counted with a hash that includes a random value changed every day; raw IP addresses and browser details are never stored. See [Analytics](/grow/analytics/).
- **No third-party requests by default.** Video embeds load nothing from YouTube or Vimeo until the visitor presses play; maps are static images with an "Open in Maps" link.
- **Forms** collect only the fields you add. They can't ask for passwords or card numbers.
- **Newsletter** signups are double opt-in, and every email has a one-click unsubscribe.
- **Members** sign in with single-use links; no passwords exist.

## Owners

- **Photos** have hidden metadata — including GPS location — removed before upload.
- **GitHub access** uses short-lived tokens. The Hub stores only an encrypted refresh token; Studio keeps access tokens in memory, never in browser storage.
- **AI connections** are per site, publishing is off unless you allow it, and you can revoke any connection instantly.
- **Retention.** Form entries are kept 12 months by default (choose 1, 3 or 6 instead). When a site is deleted, its Hub data is kept 30 days and then purged.
- **Export and delete.** Settings → Export downloads everything the Hub holds for your site — entries, subscribers, members and orders as CSV. You can delete individual entries and people, erase one person's data on request, or delete the site.

## Security

Tokens and secrets are encrypted at rest; webhooks are signature-checked; checkout prices are always re-read from your published catalog; custom code never runs inside Studio's editor. To report a vulnerability, see `SECURITY.md` in the repository.
