# Page recipes

Preset sequences that work, with color themes for rhythm. Pass them straight to `create_page` (`presets` + `themes`), then replace every piece of demo copy with the owner's real content. Check `list_section_presets` for alternatives in each category — these are starting points, not rules.

## Home pages by site type

**Practitioner (yoga, therapy, coaching, bodywork)**
```json
{
  "presets": [
    "hero/split-image@1",
    "about/story-split@1",
    "services/image-cards@1",
    "testimonials/large-single@1",
    "faq/split@1",
    "cta/banner@1"
  ],
  "themes": ["light-accent", "light", "light", "light-accent", "light", "dark"]
}
```

**Nonprofit / community org**
```json
{
  "presets": [
    "hero/full-bleed-photo@1",
    "about/values@1",
    "stats/row@1",
    "services/icon-grid@1",
    "events/list@1",
    "cta/donate@1"
  ],
  "themes": ["dark", "light", "brand", "light", "light-accent", "dark"]
}
```

**Photographer / visual artist**
```json
{
  "presets": [
    "gallery/slideshow@1",
    "gallery/project-cards@1",
    "about/portrait-overlap@1",
    "testimonials/pair@1",
    "contact/simple@1"
  ],
  "themes": ["dark", "light", "light-accent", "light", "dark"]
}
```

**Consultant / freelancer**
```json
{
  "presets": [
    "hero/big-type@1",
    "logos/row@1",
    "services/alternating@1",
    "stats/cards@1",
    "testimonials/three-cards@1",
    "cta/split@1"
  ],
  "themes": ["light", "light", "light", "light-accent", "light", "dark"]
}
```

**Restaurant / café**
```json
{
  "presets": [
    "hero/full-bleed-photo@1",
    "about/quote-and-image@1",
    "gallery/carousel@1",
    "contact/location@1",
    "cta/photo-background@1"
  ],
  "themes": ["dark", "light", "light-accent", "light", "dark"]
}
```

**Product / startup**
```json
{
  "presets": [
    "hero/marquee-launch@1",
    "logos/row@1",
    "features/bento@1",
    "features/screenshot-callout@1",
    "testimonials/three-cards@1",
    "pricing/three-plans@1",
    "faq/split@1",
    "cta/banner@1"
  ],
  "themes": ["dark", "dark", "dark-accent", "dark", "dark", "dark-accent", "dark", "brand"]
}
```

**Writer / newsletter**
```json
{
  "presets": ["hero/signup@1", "blog/intro-list@1", "about/story-editorial@1", "newsletter/card@1"],
  "themes": ["light", "light", "light-accent", "dark"]
}
```

**Event / wedding**
```json
{
  "presets": [
    "hero/arch-window@1",
    "cta/countdown@1",
    "about/milestones@1",
    "contact/booking-request@1"
  ],
  "themes": ["light-accent", "brand", "light", "light-accent"]
}
```

**Maker shop**
```json
{
  "presets": [
    "hero/split-landscape@1",
    "products/grid@1",
    "about/workshop-layers@1",
    "testimonials/carousel@1",
    "newsletter/split-image@1"
  ],
  "themes": ["light-accent", "light", "light", "light-accent", "dark"]
}
```

## Inner pages

| Page           | Presets                                                                                          | Themes                                         |
| -------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| About          | `about/story-editorial@1`, `about/milestones@1`, `team/bios@1`, `cta/split@1`                    | light, light-accent, light, dark               |
| Services       | `hero/centered@1`, `services/price-list@1`, `services/steps@1`, `faq/centered@1`, `cta/banner@1` | light-accent, light, light-accent, light, dark |
| Pricing        | `hero/centered@1`, `pricing/three-plans@1`, `features/icon-row@1`, `faq/by-topic@1`              | light, light-accent, light, light-accent       |
| Contact        | `contact/form-split@1`, `contact/location@1`                                                     | light, light-accent                            |
| Journal / blog | `blog/intro-list@1`, `newsletter/banner@1`                                                       | light, dark                                    |
| Events         | `events/featured@1`, `events/calendar@1`                                                         | light-accent, light                            |
| Shop           | `products/wall@1`, `newsletter/banner@1`                                                         | light, dark                                    |

## Swapping one section

To replace a weak section without disturbing the rest:

1. `insert_section` the new preset with `at: {"after": "sec_old"}` and the same `colorTheme`.
2. Move the owner's real copy across with `update_block` (read it from `get_page` first).
3. `delete_section` the old section.
4. `screenshot` the new section at desktop and mobile.
