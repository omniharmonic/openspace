---
title: Budget alerts and abuse handling
description: How a Hub operator keeps an OpenSpace Hub inside its Cloudflare plan, hears about runaway usage early, and handles abuse reports and campaign warm-up.
---

This page is for people who **run an OpenSpace Hub** (the stewards of the public Hub, or anyone [self-hosting](/self-hosting/)). Site owners don't need any of it.

## Budget alerts

The Hub is designed to stay inside Cloudflare's **Workers Paid base plan ($5/month)** for thousands of active sites. Once a day (the `0 4 * * *` cron) the Hub measures its **month-to-date usage** from its own counters and compares it with your plan allowances:

| Resource | Measured from | Default allowance |
|---|---|---|
| `requests` | Analytics beacons, form posts, emails and MCP operations the Hub handled | 10,000,000 |
| `analyticsEvents` | Analytics Engine data points (pageviews) | 10,000,000 |
| `emails` | Transactional email plus campaign sends | 50,000 |
| `storageBytes` | Everything in the `UPLOADS` R2 bucket (form uploads, digital products, setup assets) | 10 GB |

When any resource reaches **80%** of its allowance, the Hub records an alert (once per resource per month, in the Hub database), logs a warning, and emails **`ALERT_EMAIL`**. Without `ALERT_EMAIL` the alert is still recorded and logged.

These numbers are **lower bounds** for Cloudflare's billing meters: requests that never reach the Hub (static pages on GitHub Pages or a site's own Worker) are free and aren't counted. Keep an eye on the Cloudflare dashboard too.

Change the allowances with `PLAN_ALLOWANCES_JSON` when your plan covers more, for example:

```sh
npx wrangler secret put PLAN_ALLOWANCES_JSON --env production
# {"emails": 200000, "storageBytes": 53687091200}
```

To slow a busy Hub down, lower the per-site limits with `QUOTAS_JSON` (form submissions, transactional email, analytics pageviews, upload storage and MCP operations).

## Abuse reports

Set **`ABUSE_EMAIL`** to a monitored mailbox. It appears in the footer of **every campaign email** ("Report abuse: …"), and Studio shows it to site owners next to their sending limit. When a report comes in, an operator can take down a site's Hub services (forms, newsletter, campaigns) by archiving the site; GitHub's own policies apply to the repository and Pages site.

## Campaign volume caps and warm-up

Campaign email is where abuse would hurt the commons most, so sending starts slowly:

- A site may email **`CAMPAIGN_DAILY_BASE`** recipients per UTC day (default **100**) at first.
- The limit **doubles for every earlier day** the site sent campaign mail in the last 60 days, up to **`CAMPAIGN_DAILY_MAX`** (default **50,000**).
- Over the last 30 days (once at least 50 messages went out), more than **5% bounces** or more than **0.3% spam complaints** **pause** the site's sending: it can't start campaigns and queued recipients wait. Studio tells the owner why. Sending resumes as the window moves on.

Campaigns that exceed today's limit keep their remaining recipients queued; the minute cron (or the campaign Queue) continues them the next day.
