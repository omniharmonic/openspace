---
title: Members
description: Members-only and password-protected pages, passwordless sign-in, free and paid membership tiers — and the Cloudflare hosting they need.
---

OpenSpace can put pages behind a sign-in — for a community, a course, client resources or paid members — and protect pages with a shared password.

## Hosting

GitHub Pages can only serve public files, and its terms rule out commerce and sensitive transactions. So members-only pages, password pages and [stores](/grow/store/) use **Cloudflare hosting**: your site runs on **your own free Cloudflare account**, as a small Worker with your pages served as static files. The free plan's 100,000 dynamic requests a day is plenty for small member sites and shops.

To switch (owners): **Settings → Hosting → Upgrade to Cloudflare hosting**.

1. Create a free Cloudflare account if you don't have one.
2. Follow the link to Cloudflare's API-token page — the right permissions are filled in for you — create the token and paste it back, with your account ID.
3. Studio **encrypts both values in your browser** with your site's own key and stores them as secrets on your site's repository. The OpenSpace Hub never sees them.
4. OpenSpace switches the site's publishing to Cloudflare and republishes. Your storage for members-only content is set up on the first publish.

You can switch back to GitHub Pages from the same screen. If you use a custom domain, move it to the new hosting with the guided DNS change.

## Members-only pages

In a page's settings, set **Who can see it → Members**. The page is edited in Studio like any other, but its content is **never put in your public repository** — it's kept in your own Cloudflare storage, and your site's Worker shows it only to signed-in members.

## Sign-in without passwords

Members sign in with a **magic link**: they enter their email, and the Hub sends a link that's valid for 15 minutes and works once. The link lands on your site's own domain, which checks it and sets a secure cookie. No passwords are created or stored anywhere.

Choose who can join in **Members → Members-only pages**:

- **Open** — anyone can sign up as a free member at their first sign-in.
- **Invite only** — only people you've added receive a link. Everyone sees the same message either way, so nobody can find out who's a member.

## Managing members

The **Members** screen lists people with their tier, status, join date and last sign-in. Add a member (optionally emailing them a sign-in link), move people between tiers, block or unblock sign-in, or remove them. Export the list as CSV from Settings → Export.

## Tiers and paid membership

Create **tiers** — a name, what members get, and whether it's free or paid. Paid tiers are monthly or yearly **Stripe subscriptions** on your own Stripe account (connect Stripe first, see [Store](/grow/store/#payments)). When a payment succeeds, the member gets that tier; if the subscription lapses or is cancelled, the tier is removed automatically. A tier can be closed to new members while keeping existing ones.

## Password-protected pages

Set **Who can see it → Password** for a simple shared password, Squarespace-style — handy for client proofs or a wedding's guest information. The password is set through the Hub, stored only as a secure hash, and never written into your site's content. Password pages also need Cloudflare hosting.
