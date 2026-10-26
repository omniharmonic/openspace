---
title: Email campaigns
description: Write and send email newsletters to your OpenSpace subscribers, designed with your site's blocks and sent through your own email provider.
---

Campaigns are newsletters to your [subscribers](/grow/forms-and-newsletter/#subscribers), written in Studio with email-safe versions of your site's blocks and sent through **your own email provider**.

## Why your own sender?

Marketing email is the one thing that would make a free service expensive, and deliverability depends on the sender's reputation. So campaigns go out through a provider you connect once — **Resend**, **Postmark**, **Amazon SES** or **Cloudflare** — whose free tiers cover most small lists. The reputation is yours, and the commons doesn't pay for anyone's marketing.

## Set up sending (owners)

Open **Campaigns → Sending setup**:

1. Pick a provider and enter the *from* name and address, a reply-to address and the provider's credentials. Credentials are encrypted and never shown again.
2. Add the DNS records shown — **SPF**, **DKIM** and **DMARC** — at your domain, and press **Check records**. Each sender shows *Ready to send*, *Needs DNS records* or *Not checked yet*. Sending needs a verified custom domain.
3. Copy the one-time **bounce webhook address** into your provider, so bounces and spam complaints are handled for you.

## Write a campaign

- **Subject**, **preview text** and **audience**: everyone, or subscribers with certain tags (any or all of them). A live count shows how many people will receive it.
- Compose with **email-safe blocks**: text, heading, image, button, quote, columns, line, divider, spacer and social links. Drafts save as you type.
- **Preview** in desktop, phone and **dark mode**, with the inbox line as people will see it. Any rendering warnings are listed.
- Send yourself a **test**, then **Send now** or **Schedule** (designers and owners), each with a confirmation showing the audience size.

Every email includes a one-click **unsubscribe** link and the standard headers mail apps use for their own unsubscribe button. Hard bounces and spam complaints are unsubscribed automatically.

## Reports

After sending, a campaign shows **delivered**, **clicked** (and the click rate per link), **bounced** and **marked as spam**. **Opens aren't counted unless you turn on "Count opens"** for that campaign — OpenSpace is privacy-first, and open tracking needs a tracking pixel.
