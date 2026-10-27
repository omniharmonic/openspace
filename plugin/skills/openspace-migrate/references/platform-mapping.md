# WordPress, Wix, Webflow and any other site → OpenSpace

How `openspace import wordpress` and `openspace import url` read a site, and what to check afterwards. (Squarespace has its own page: `squarespace-mapping.md`.)

## Detection

`openspace import <url>` reads the home page and looks for the generator meta tag, asset hosts and platform markup: WordPress (`wp-content`, the REST API link), Wix (`static.wixstatic.com`, `#SITE_HEADER`), Webflow (`data-wf-page`, `website-files.com`), Framer, Carrd, Shopify, Ghost, Weebly, GoDaddy, Jimdo, Hostinger. Squarespace and WordPress have their own importers; the others use the generic one with platform hints. `--platform` overrides detection.

## WordPress

| WordPress | OpenSpace |
| --- | --- |
| Pages (REST `wp/v2/pages` or the export) | Pages at the same paths (`/about/team/` → `/about/team`) |
| Posts | A blog collection named after the posts page (`/news`), else `journal`; date, author, categories, tags, excerpt, featured image; drafts from the export |
| Static front page / latest posts on the front | Home page / a home page listing the journal |
| Paragraph, heading, list, quote, code, preformatted | Text (rich text) |
| Cover (`wp-block-cover`) | Section with a photo background → `hero/full-bleed-photo@1` when it opens the page |
| Columns, media & text | Stack section with the same column proportions |
| Group with a background, full-width blocks | Their own section (theme from the background color) |
| Image, gallery | Image, gallery (largest rendition ≤ 2400 px, alt text and captions kept) |
| Buttons | Buttons (first primary, the rest secondary) |
| Pullquote, quote with citation | Testimonial / quote |
| Embed (YouTube, Vimeo), iframe | Video, or a sandboxed Embed |
| Table | Table block (≤ 6 columns, 40 rows), else text rows |
| Details | Accordion |
| Separator, spacer | Line, spacing |
| Latest posts / query loop | Summary block listing the journal |
| Classic editor HTML | Rich text split around images and embeds |
| `[caption]`, `[gallery]`, `[embed]`, `[video]`, `[audio]` (export) | Image with caption, gallery, video, audio |
| Other shortcodes, page builders (Elementor, Divi, WPBakery…) | Content kept where it is HTML; the shortcode is removed and reported; builder layouts are approximated |
| Yoast (REST yoast_head_json), Rank Math (getHead), export meta | Page and post SEO title, description, share image, noindex |
| Permalinks, `/category/x/`, `/tag/x/` | 301 redirects to the new addresses |
| Menus | Header navigation from the live site (or the export's primary menu) |
| Contact Form 7 / other rendered forms | Form block (fields, labels, required, options) |
| WooCommerce cart/checkout/account pages | Not imported (reported) |

Not moved: plugins' functionality, comments, users, custom post types, WooCommerce products and orders, private content (unless in the export).

## Wix

- Static HTML is read from the sitemap (`pages-sitemap.xml`, `blog-posts-sitemap.xml`); blog posts (`/post/slug`) become a journal collection with redirects.
- Strips and columns become sections and stack columns; absolute positioning is not kept — check spacing and alignment in the parity pass.
- Letter-spaced menu labels (`H O M E`) are tidied; dropdowns become folders.
- Images come from `static.wixstatic.com` at up to 2400 px.
- Some pages are built by JavaScript: if the report says pages had little content, use `--render`.
- Not moved: Wix apps (Stores, Bookings, Events, Members, Forum), Velo code, animations.

## Webflow

- Webflow's HTML is clean: sections, `w-row`/`w-layout-grid` columns, `w-dropdown` menus, `w-button` buttons and `w-form` forms map directly. Classes the CSS hides on desktop (mobile-only copies) are skipped.
- CMS items under one path with article metadata (e.g. `/blog/slug`) become a collection; other CMS collections are imported as pages.
- Not moved: interactions and animations, Ecommerce, Memberships, custom code embeds (reported).

## Any other site (Carrd, Framer, hand-made HTML)

- Main content is found readability-style (`<main>`, `role=main`, or the body without header, footer, menus, sidebars, cookie banners and hidden elements).
- Each top-level section becomes an OpenSpace section; side-by-side children become columns; repeated cards become a Columns block; image grids become galleries; `blockquote`/testimonial cards become testimonials; FAQ lists and `<details>` become accordions; forms keep their fields; Google Maps iframes become map blocks.
- Sections are matched to the closest preset by role: **hero** (first section with the page heading and a photo, image or button), **features** (cards), **gallery**, **testimonials**, **cta** (short heading + button), **contact** (a form).
- The look: background, text and brand colors from the CSS (buttons, links, `--primary`-style variables), fonts from CSS and Google Fonts links, button shape from the border radius — snapped to OpenSpace palettes and pairings. With `--render` the computed styles are used.
