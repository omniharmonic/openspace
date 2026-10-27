---
name: openspace-content
description: Write and manage OpenSpace site content with the OpenSpace connector: blog posts, events, products, portfolio projects and podcast episodes, as drafts, then publish when asked.
license: MIT
metadata:
  version: "0.2.0"
  for: claude.ai and Claude Desktop with the OpenSpace connector (https://hub.openspace.host/mcp)
---

# Managing OpenSpace content

Long-form content lives in **collections**: blog posts, events, portfolio projects, podcast episodes and products. Each item is a Markdoc file (`content/collections/<name>/<slug>.mdoc`) with typed frontmatter and a Markdown body. Collection lists, item pages, feeds (RSS/Atom, iCal, podcast RSS) and structured data are generated from them when the site is published. Pages show collections through list blocks (summary, events, products) and the blog/events/products section presets.

## Before starting

Use the OpenSpace connector's tools (`get_site`, `list_posts`, `create_post`…). If they are missing, explain how to connect in plain words: in Claude, **Settings → Connectors → Add custom connector**, name it OpenSpace, address `https://hub.openspace.host/mcp`, sign in and tick the site; then turn the connector on in this chat. Nothing needs installing. Edits land in the draft; the owner sees them in OpenSpace Studio and publishes from there (or asks you to).

## Find the collections

1. `get_site` lists the site's collections and their kinds (`blog`, `events`, `portfolio`, `podcast`, `products`). Templates use friendly names — Meadow's blog is `journal`, Kiln's shop is `shop`, Signal's is `changelog`.
2. `list_posts` with `collection` shows existing items, newest first (`withBody: true` for the text). Read two or three before writing, to match the owner's voice, length and categories.

## Write a blog post

Use `create_post`:

```json
{
  "collection": "journal",
  "title": "Opening day at the new studio",
  "body": "We're finally in the new space on Pearl Street…\n\n{% button href=\"/schedule\" %}See the schedule{% /button %}",
  "excerpt": "We're in. Here's what the first week looks like.",
  "categories": ["news"],
  "tags": ["studio"],
  "image": "media/2026/10/studio-open-k3f9.jpg",
  "imageAlt": "Morning light across the new studio floor",
  "status": "draft"
}
```

- `body` is Markdown. Markdoc tags embed blocks: `{% button href="/contact" variant="primary" %}Book{% /button %}`, `{% gallery layout="grid" images=["media/a.jpg", "media/b.jpg"] /%}`, `{% quote %}…{% /quote %}`. A lone `![alt](media/…)` line becomes an image block; `---` becomes a divider. Remote images need a size: `![alt](https://… "=1600x1067")`.
- New items are **drafts**. Set `status: "published"` only when the owner asks; it goes live with the next site publish. For a future date, `status: "scheduled"` with `publishAt` (ISO date-time).
- `slug` defaults to `<date>-<title>`; `date` defaults to today.
- Upload a featured image first with `upload_image` and use the returned `src` as `image`.

Write in the owner's voice, with real facts only. Never invent quotes, statistics, prices, dates, names or credentials — ask. Keep excerpts to one or two sentences; they appear in lists and feeds.

## Add an event

Events use the same tool with extra `frontmatter`:

```json
{
  "collection": "events",
  "title": "Autumn equinox restorative workshop",
  "body": "Two slow hours of supported poses and breath work…",
  "status": "published",
  "frontmatter": {
    "start": "2026-11-21T14:00:00-08:00",
    "end": "2026-11-21T16:00:00-08:00",
    "timezone": "America/Los_Angeles",
    "location": { "name": "Fernwood Studio", "address": "2218 SE Division St, Portland, OR" },
    "registrationUrl": "https://cal.com/fernwood/equinox",
    "price": "$45"
  }
}
```

`start`/`end` are ISO date-times **with a UTC offset** (`2026-11-21T14:00:00-08:00`, or `…Z`) — a bare `2026-11-21T14:00:00` is rejected — or, for all-day events, plain dates (`"2026-11-21"`) with `"allDay": true`. Add `timezone` (an IANA name such as `America/Los_Angeles`) so calendars show local time. `end` can't be before `start`. Online events use `"location": {"online": true, "url": "https://…"}`. Past events drop out of "upcoming" lists automatically; an iCal feed is generated.

## Add a product

Products need the Cloudflare hosting target to sell (GitHub Pages' terms exclude commerce); the catalog itself is public content. Prices are **minor units** with an ISO currency:

```json
{
  "collection": "shop",
  "title": "Speckled stoneware mug",
  "body": "Thrown on the wheel in small batches…",
  "status": "published",
  "frontmatter": {
    "price": { "amount": 3800, "currency": "USD" },
    "sku": "mug-speckled",
    "images": [
      { "src": "media/2026/10/mug-k3f9.jpg", "alt": "A speckled cream mug on a wooden shelf" }
    ],
    "options": [{ "name": "Glaze", "values": ["Oat", "Moss"] }],
    "variants": [
      { "sku": "mug-speckled-oat", "options": { "Glaze": "Oat" } },
      { "sku": "mug-speckled-moss", "options": { "Glaze": "Moss" }, "available": false }
    ]
  }
}
```

Prices on the site are display copy; checkout always re-reads them from the published catalog, so a price change takes effect at the next publish. Stock levels live in the Hub (Studio → Orders/Products), not in content. Never change a price without the owner's explicit instruction.

## Portfolio projects and podcast episodes

- **Portfolio** (`portfolio` kind): `frontmatter` with `client`, `role`, `year`, `gallery` (image values), `projectUrl`.
- **Podcast** (`podcast` kind): pass the episode `date` as the top-level `date` argument (required; defaults to today), and `frontmatter.audio` `{src, duration (seconds), mime}` plus optional `episode`, `season`, `episodeType`, `explicit`. The podcast feed includes Apple and Spotify tags.

```json
{
  "collection": "podcast",
  "title": "Slow mornings, episode two",
  "body": "A ten-minute practice for the first light of the day.",
  "date": "2026-11-02",
  "status": "draft",
  "frontmatter": {
    "audio": { "src": "media/podcast/slow-mornings-02.mp3", "duration": 612, "mime": "audio/mpeg" },
    "episode": 2
  }
}
```

The top-level `date` is used by every kind whose frontmatter has one: blog and podcast (required, default today) and portfolio (optional). Events and products have no `date`; events use `start`/`end`.

## Edit and publish content

- `update_post` with `slug` (and `collection`): `set` frontmatter fields (`null` removes one) and/or replace `body`.
- To publish a draft post: `update_post` `set: {"status": "published"}`, then the site must be published — `publish` with `confirm: true`, only when the owner asks.
- To feature content on a page, add a list section: `insert_section` with a `blog/latest-grid@1`, `events/list@1` or `products/grid@1` preset and `collection` set.
- `get_draft_diff` summarises the unpublished changes for the owner.

## Validation errors

Invalid frontmatter is rejected with the field path (for example `price.currency: Expected an ISO 4217 currency like USD`). Fix the field and call again; nothing was saved.
