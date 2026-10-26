---
title: Forms & newsletter
description: Collect messages, bookings and newsletter subscribers on a static OpenSpace site — with spam protection, an inbox, notifications and CSV export.
---

Your published site is static — fast and free to host — and the OpenSpace **Hub** quietly handles the parts that need a server: form entries and newsletter signups.

## Forms

Add a **Form** block (or a contact section) and build the form in the inspector. Field types:

- text, email, phone and long text
- drop-down select, checkboxes and radio buttons
- date
- **file upload**: choose which kinds of file it accepts (images, PDF, documents, spreadsheets, audio, video) and the largest size (up to 25 MB)

Each field can be required or optional, half or full width. After sending, visitors see a **success message** or go to a page you choose.

For safety, forms can't ask for passwords or card numbers — payments always happen on Stripe's own pages.

### What happens when someone sends a form

- The form is a real HTML form, so it works even with JavaScript turned off; with JavaScript, it validates inline and sends without leaving the page.
- **Spam protection**: invisible Cloudflare Turnstile checks, a hidden honeypot field and rate limits. Spam is filtered out and doesn't count against your quota.
- If the Hub is ever unreachable, the form keeps the message, retries, and shows your email address as a fallback — your site keeps working either way.

### Your inbox

Studio's **Form inbox** lists entries per form, with search and *All / Unread / Spam* views. Open an entry to read it (it's marked read), reply by email, mark several read or delete them, and **export CSV** for one form or all.

Files sent with a form are **kept privately by OpenSpace, never in your site's files** (on GitHub Pages and Cloudflare alike). An entry shows each file as a **download link** that works for an hour; open the entry again for a fresh one. Files are deleted with their entry, and count toward your file storage on the **Usage** screen.

In the inbox **settings**, choose notifications — **right away**, a **daily digest**, or **never** — the address they go to, and how long entries are kept: **1, 3, 6 or 12 months** (12 by default). Each entry shows the date it will be deleted.

## Newsletter signups

Add a **Newsletter** block — or a newsletter section, or an email signup in your [pop-up](/guides/pages-and-navigation/#announcement-bar-and-pop-up) — to collect subscribers.

- **Double opt-in**: new subscribers get an email ("Confirm your subscription to Fernwood Yoga") and are only added once they click. Confirmation links last seven days.
- Every email has a **one-click unsubscribe** link that works in mail apps too.
- The signup answer is the same whether an address is new or already subscribed, so nobody can probe your list.

### Subscribers

Studio's **Subscribers** screen shows counts, search and filters by status and tag. Add or remove **tags** in bulk, unsubscribe or delete people, and **export CSV**. **Import** a CSV file or pasted list — you'll be asked to confirm these people agreed to hear from you — and see which rows were skipped and why.

To send newsletters, see [Email campaigns](/grow/campaigns/).

## Limits on the public Hub

| Resource | Per site |
|---|---|
| Form entries | 1,000 a month (spam doesn't count) |
| Stored entries | 12 months (or shorter, your choice) |
| Subscribers | 5,000 (raised on request) |
| Emails sent by the Hub (confirmations, notifications, sign-in links) | 500 a month |

[Self-hosted Hubs](/self-hosting/) set their own limits.
