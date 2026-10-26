---
title: Analytics
description: Privacy-first, cookieless visitor analytics for OpenSpace sites — visits, pages, sources, devices and form conversions.
---

OpenSpace includes simple, **cookieless** analytics. There's no cookie banner to add, because there are no cookies and nothing that identifies a person.

## How it works

Each page view sends a tiny (about 1 KB) beacon with the page, the referring site, a screen-size class (phone, tablet or desktop) and any campaign tags in the address. To count unique visitors without tracking anyone, the Hub combines the visitor's IP address and browser with a **random value that changes every day**, hashes it, and keeps only the hash. The raw IP address and browser details are never stored, and because the value changes daily, nobody can follow a visitor from one day to the next. Bots are ignored.

## Reading your numbers

Studio's **Analytics** screen shows, for today, the last 7, 30 or 90 days, or a custom range:

- **Visits**, **people**, **pages viewed** (and pages per visit) and **form sign-ups** (with a conversion rate).
- **Top pages**, **sources**, **referring sites**, **devices** and **countries**.
- A **conversions** table for your forms and events.

Every chart has a table view. Owners can also get a **weekly digest** email.

## Limits and choices

- The public Hub counts up to **300,000 page views a month** per site; beyond that it samples (one in ten views, weighted), and Studio says so.
- Turn analytics **off** at any time in Settings — the beacon is then left out of your pages entirely.
- Prefer another tool? Sites on Cloudflare hosting can use Cloudflare Web Analytics instead.
