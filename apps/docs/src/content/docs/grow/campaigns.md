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

## Sending limits

New senders start small. Each site can send campaign email to **100 people a day** at first, and that limit **doubles for every day you've sent without trouble** (up to 50,000 a day), so a healthy list reaches full speed in about ten sending days. When a campaign is bigger than today's limit, it keeps going the next day on its own; **Campaigns** shows how many sends are left today.

If more than **5% of recent emails bounce** or more than **0.3% are marked as spam** (over the last 30 days), sending **pauses** for the site and Studio explains why. Clean up the list (remove old or mistyped addresses, and only email people who asked to hear from you); sending resumes as the window moves on. Hub operators can change the starting limit and the ceiling (`CAMPAIGN_DAILY_BASE`, `CAMPAIGN_DAILY_MAX`).

Every email's footer also shows the Hub operator's **abuse reporting address**, so recipients can report spam or phishing directly.

Every email includes a one-click **unsubscribe** link and the standard headers mail apps use for their own unsubscribe button. Hard bounces and spam complaints are unsubscribed automatically.

## Reports

After sending, a campaign shows **delivered**, **clicked** (and the click rate per link), **bounced** and **marked as spam**. **Opens aren't counted unless you turn on "Count opens"** for that campaign — OpenSpace is privacy-first, and open tracking needs a tracking pixel.
