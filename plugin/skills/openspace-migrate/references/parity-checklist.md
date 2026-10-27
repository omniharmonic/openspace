# Visual parity checklist

Compare the original (`screenshot_url`) and the OpenSpace page (`screenshot`) at desktop (1440 px) and mobile (390 px). Work top to bottom; fix the first difference a visitor would notice before the next.

| Look at | Usual difference after import | Fix |
| --- | --- | --- |
| **Section order** | Classic-editor sections with several column layouts were split into one section per layout. | Usually fine. If two adjacent sections should read as one, give them the same `colorTheme` (`update_section`) or move blocks together (`move_block`). |
| **Hero** | Photo darker than the original: the overlay was raised so text stays readable (the report says by how much). | Keep it if the text sits on the photo. To lighten, move the text off the photo (a split hero preset such as `hero/split-landscape@1`) rather than lowering the overlay below the contrast minimum. |
| **Hero height** | Squarespace "large" sections fill the screen; imported heroes use `minHeight` 90vh desktop / 70vh mobile. | `update_section` `style.minHeight`, e.g. `{"d": "100svh", "m": "80svh"}`. |
| **Section surfaces** | Squarespace's eleven section themes (and other sites' section background colors) map onto five (White → Light, Light → Light accent, Dark → Dark accent, Black → Dark, Bright → Brand). | Adjust with `update_section` `colorTheme`; keep no more than three same-theme sections in a row. |
| **Colors** | Brand color comes from the Squarespace accent (elsewhere: buttons, links and `--primary`-style CSS variables); neutrals are tinted from the background. | `set_styles` `choices.palette.brand` with the exact brand hex; the contrast solver keeps it accessible. |
| **Fonts** | The nearest curated pairing replaces the original (often Adobe or custom) fonts. | Try neighbouring pairings with `set_styles` `choices.pairing`; licensed fonts can be uploaded in Studio → Site Styles → Fonts. |
| **Spacing** | Density is inferred from section heights. | `set_styles` `choices.density` (`compact`, `comfortable`, `airy`) — globally, not per section. |
| **Buttons** | Pill/rounded/square and solid/outline come across; Squarespace's per-button colors don't. | `set_styles` `choices.buttons` and `choices.shape`. |
| **Grid (Fluid Engine) sections** | Placements are kept on the same 24-column grid; rows are slightly shorter, so tall image cells can look squatter. | `place_in_grid` to give images more rows; then `auto_mobile_layout` and check mobile. |
| **Mobile order** | Squarespace's own mobile placements are kept where it had them; otherwise the auto layout reads top-to-bottom. | `place_in_grid` with `m`, or `auto_mobile_layout` after desktop changes. |
| **Galleries** | Grid galleries are square-cropped; slideshows and carousels keep their variant. | `update_block` `variant` / `aspect` on the gallery block. |
| **Text alignment** | Centred Squarespace text blocks get `style.align` centre. | `update_block` `style: {"align": {"d": "center"}}`, or `start`. |
| **Headings** | Several Heading 1s, skipped levels. | Change levels in the rich text (`# ` → `## `) without changing the words. |
| **Footer** | Footer sections were folded into one footer with up to four columns. | `update_block` on the footer blocks (`page: "footer"`), or a footer preset such as `footer/columns@1` with the content moved across. |
| **Header** | Layout (nav right / centred / split), sticky and transparent-over-hero settings come across; colors follow the theme. | `insert_section` with a header preset (e.g. `header/overlay@1`) or `update_site`. |

| **Script-built pages (Wix, Framer)** | A section is missing or nearly empty: its content was drawn by JavaScript. | Re-import with `--render`, or rebuild the section from a preset with the owner's copy (take the words from the original screenshot only with their go-ahead). |
| **Page-builder layouts (Elementor, Divi)** | Nested rows came out as one long column. | Insert the closest preset (`list_section_presets`) and move the content across with `update_block`. |
| **Preset-matched sections** | Sections the importer recognised (hero, features, gallery, testimonials, CTA, contact) use the nearest preset's spacing and theme, which may differ from the original's colors. | `update_section` `colorTheme`, or a neighbouring preset in the same category. |

Judge each pass: same first impression, same order of information, same primary action, nothing harder to read. Differences in pixel spacing don't matter; differences in hierarchy do.
