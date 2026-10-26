---
name: openspace-content
description: This skill should be used when the user asks to "write a blog post", "add a post", "draft a journal entry", "add an event", "list our upcoming events", "add a product", "update a price", "publish a post", "add a podcast episode", "add a project to the portfolio", or otherwise manages collection content (blog posts, events, products, projects, episodes) on an OpenSpace site through the openspace MCP tools.
version: 0.1.0
---

# Managing OpenSpace content

Long-form content lives in **collections**: blog posts, events, portfolio projects, podcast episodes and products. Each item is a Markdoc file (`content/collections/<name>/<slug>.mdoc`) with typed frontmatter and a Markdown body. Collection lists, item pages, feeds (RSS/Atom, iCal, podcast RSS) and structured data are generated from them when the site is published. Pages show collections through list blocks (summary, events, products) and the blog/events/products section presets.

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
    "start": "2026-11-21T14:00:00",
    "end": "2026-11-21T16:00:00",
    "timezone": "America/Los_Angeles",
    "location": { "name": "Fernwood Studio", "address": "2218 SE Division St, Portland, OR" },
    "registrationUrl": "https://cal.com/fernwood/equinox",
    "price": "$45"
  }
}
```

`start`/`end` are ISO dates (all-day: `"2026-11-21"` with `"allDay": true`) or date-times; `end` can't be before `start`. Online events use `"location": {"online": true, "url": "https://…"}`. Past events drop out of "upcoming" lists automatically; an iCal feed is generated.

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
- **Podcast** (`podcast` kind): `frontmatter.audio` `{src, duration (seconds), mime}` plus optional `episode`, `season`, `episodeType`, `explicit`; `date` is required. The podcast feed includes Apple and Spotify tags.

## Edit and publish content

- `update_post` with `slug` (and `collection`): `set` frontmatter fields (`null` removes one) and/or replace `body`.
- To publish a draft post: `update_post` `set: {"status": "published"}`, then the site must be published — `publish` with `confirm: true`, only when the owner asks.
- To feature content on a page, add a list section: `insert_section` with a `blog/latest-grid@1`, `events/list@1` or `products/grid@1` preset and `collection` set.
- `get_draft_diff` summarises the unpublished changes for the owner.

## Validation errors

Invalid frontmatter is rejected with the field path (for example `price.currency: Expected an ISO 4217 currency like USD`). Fix the field and call again; nothing was saved.
