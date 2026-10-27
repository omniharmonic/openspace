# Squarespace → OpenSpace mapping

What `openspace import squarespace` reads and what each part becomes.

## Sources

| Source | Used for |
| --- | --- |
| Page HTML (every page in the sitemap and navigation) | Sections, blocks, header, navigation, footer, SEO meta, item pages (posts, products, events) |
| `sitemap.xml` | Which pages and items exist |
| `?format=json` (only with `--owner`) | Collection items with full data (tags, categories, excerpts, authors, variants, sale prices, event dates and places), SEO titles/descriptions, social accounts, site description |
| WordPress export (`--export`) | Blog posts: complete bodies, drafts, authors, categories, tags, featured images |
| `site.css` + body classes | Palette, fonts, type sizes, button shape and style, header behaviour |
| robots.txt | Honoured for every request; `?format=json` is read only in owner mode |

## Sections and layout

| Squarespace | OpenSpace |
| --- | --- |
| 7.1 page section (classic editor rows/columns) | Stack section per column structure, column spans kept (up to four) |
| 7.1 Fluid Engine section | Grid section on the same 24/8-column grid, desktop and mobile placements kept, overlap (`z`) kept |
| Gallery section | Gallery block (grid, masonry, slideshow, carousel, strips) |
| List section (simple, carousel, banner) | Columns block with image, heading, text and button per item |
| 7.0 page / index-page sections | Stack sections from the page's layout |
| Section theme | Color theme (White/White bold → Light, Light → Light accent, Dark → Dark accent, Black → Dark, Bright → Brand; unthemed → the site's default) |
| Background image + overlay | Section image background with a black overlay raised to the WCAG minimum for its text |
| Background video | Not imported (reported); the image fallback is used when present |
| Section height / content width | Padding and min-height tokens; layout width (narrow, content, wide, full) |

## Blocks

| Squarespace block | OpenSpace block |
| --- | --- |
| Text, Markdown | Text (rich text: headings, paragraphs incl. large/small styles, lists, quotes, bold/italic/underline/strike/code, links rewritten to new addresses; centred text keeps its alignment) |
| Image | Image (downloaded, alt text and caption kept, link rewritten) |
| Gallery | Gallery (one image → Image) |
| Button | Button (primary/secondary/tertiary) |
| Form | Form with matching fields (name, email, phone, text, textarea, select, radio, checkbox, date, file, address → textarea, website/number/time → text); hidden and likert fields are reported; password and card fields are never created |
| Newsletter | Newsletter signup (subscribers are not moved) |
| Video (YouTube, Vimeo) | Video (embed) |
| Map | Map with coordinates and address |
| Code, Embed | Embed (sandboxed iframe; reported) |
| Quote | Quote (or a text block with a blockquote when very long) |
| Accordion | Accordion |
| Summary | Summary (or Events for an events collection) |
| Product | Product block for an imported product |
| Spacer | Spacer (dropped inside grid sections, where placement spaces things) |
| Line | Line |
| Social links | Social links (from the site's social profiles) |
| Audio | Audio (file downloaded into `media/files/`) |
| Menu, Instagram, Calendar, Tag cloud, Archive, Search, scheduling, donations and other app blocks | Not mapped: their text is kept as a text block when there is any, and each is listed in the report |

Linked Squarespace files (`/s/…pdf`) are downloaded into `media/files/` and links point at them.

## Collections and site settings

| Squarespace | OpenSpace |
| --- | --- |
| Blog | Blog collection (same name as the Squarespace URL slug): title, date, author, categories, tags, excerpt, featured image, SEO, draft status; body as Markdown + blocks |
| Events | Events collection: start/end with time zone, all-day, location; past events too (owner mode) |
| Store products | Products collection: price (minor units), sale price → compare-at, SKU, options, variants and availability, images. Physical/digital only; services and gift cards reported |
| Portfolio (7.1) | Portfolio collection with each project's sections as its body |
| Navigation, folders, external links, header button | Navigation (pages, collections, folders, links, a primary button) |
| Logo, social accounts, site title and description | Logo, social profiles, title, tagline and SEO defaults |
| Page SEO title/description/social image, hidden from search | Page SEO fields, `noindex` |
| `/home` alias, date-based post URLs, `/shop/p/` product URLs, renamed slugs | 301 redirects to the new addresses |

## Not imported

Orders, customers, inventory levels, discounts, gift cards, shipping and tax settings; newsletter subscribers and campaigns; form submissions; member accounts and members-only content; password-protected page content; blog comments; Acuity scheduling; donations; digital downloads; analytics history; custom CSS and Code Injection (listed in the report, never copied); Squarespace template code.
