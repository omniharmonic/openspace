# Templates polish — QA

An art-director pass over the 20 templates and 277 section presets after
[templates v2](templates-v2.md) (branch `template-polish`, October 27, 2026). Every template's
home page and one inner page was reviewed at 1440 and 390 in its first look, every home page in
its other two looks at 1440, and a sample of presets in each category in two gallery looks
(soft/pill and sharp/outline). Before/after comparisons of the home pages that changed most are
in [templates/polish/](templates/polish/).

## Known issues fixed

| Issue | Before | After |
|---|---|---|
| **Logo walls** (Orbit home) | 6 logos in an auto-fit grid of 5: TANDEM alone on a second row | Logo walls choose their columns from the item count (`balancedColumns`: fewest rows, then as even as possible — 6 → 3 + 3), lay out as equal cells, and centre any shorter last row. The grid variant draws collapsed hairlines so a centred row still closes. A still marquee (reduced motion) wraps as a balanced wall without the edge fade that cut off the first and last names. |
| **Darkroom photography** | A portrait & editorial photographer showing a desert landscape project (*Dry Season*: dunes, buttes, a desert road) in the hero strip and project grid; the editorial card showed a male street photographer as Mara | *Dry Season* became *First Light* — bakers and shopkeepers before dawn, for the same magazine. *Faces of the Guild* shows craftspeople in their workshops; *After Hours* gets a night-shift workshop photo. The hero strip uses non-cover project photos so nothing repeats in the grid below it. |

## Systemic fixes (blocks and presets)

- **Balanced rows everywhere a count is known.** The same helper now picks the wide-screen
  columns for collection summaries (grid and masonry wall), column cards, icon lists, team grids
  and photo galleries. Field Notes' archive wall had four posts in three masonry columns — two,
  two and an empty column; it is now 2 + 2 (and, with the content change below, three in a row).
- **CTA card.** `cta/card-centered` drew a bordered card around the headline and put both buttons
  outside it, underneath. It is now a centred group under a short accent rule, so the words and
  both actions read as one ask (Orbit and Gather home pages).
- **Card over photo.** `cta/card-over-photo` used the section's own theme for its card, so where
  it left the photo it melted into the background; it now takes the raised theme (Commons).
- **Team circles** were `auto-fill`, stranding a three-person team at the left under a centred
  heading; the tracks now collapse and centre.
- **Justified strips** stopped a short last row at about half the width; it now closes up when
  the row is nearly full, without letting a single last photo balloon.
- **Masonry** preset: six photos alternating portrait and landscape so the three columns end
  together (seven left one column a photo short).
- **Overlay cards** (services as photo tiles): a deeper scrim behind the title and text, which
  sat on the pale parts of the salon photos.

## Photos: off-brief and repeated

26 new Unsplash photos (catalog 164 → 190). As before, each URL returned HTTP 200, the
original size comes from imgix `fm=json`, and the photographer's name, username and photo page
were read from the photo's own Unsplash page (all free under the Unsplash License, none
Unsplash+). Templates self-host them at publish time; the Lighthouse builds below downloaded
every one through `OPENSPACE_REMOTE_IMAGES=download`.

| Template / preset | Problem | Fix |
|---|---|---|
| Darkroom | Desert landscapes for a portrait photographer; a man as "Mara" | People at work: bakers, shopkeeper, wood carver, workshop owners |
| Atelier | Slideshow repeated the four project covers shown directly below it | Slides use each project's other photos |
| Beacon | News cards repeated the hero and programme photos; stats band repeated a programme photo | Tree planting, a child with harvested chard, a plane-tree canopy; seedlings as the band texture |
| Encore | Tour strip opened with the hero's crowd photo | A synth player in violet haze |
| Harbor | Food pantry shown as a rooftop dinner; home repairs as a large suburban house | Volunteers packing groceries; a repair volunteer at a mitre saw |
| Hearth | Kitchen carousel repeated the hero's pizza and herb photos and showed a grain bowl | Fresh pasta and ragù |
| Kiln | Studio section and every workshop reused product shots | The wheel, studio shelves, a wheel lesson, a hand-building class, glazing |
| Meadow | Breath workshop reused the hero photo | Two students resting into a stretch |
| Link | A home cook's feed of cakes, croissants and lattes | Weeknight dishes (pasta, a grain bowl, steak) alongside the baking |
| Field Notes | Vermont essays shown as Asian terraced hills, a forest path and poppies; recent list and archive wall showed the same four essays | A Vermont hayfield, a stone wall in snow, an old apple tree; two older essays so the home lists the three newest and the archive the three oldest |
| Commons | Hudson Valley farms opened on the same terraced hills | A farm under autumn trees |
| Kitchen presets (`features/alternating-rows`, `hero/bento`) | A stool for "aftercare" and in the bento | A woodworker at the bench |
| `services/image-cards` (garden) | "Full garden builds" showed a clapboard house | Raised garden beds |
| `gallery/wide-carousel` | "Around the lodge" mixed desert and alpine | Alpine lakes, valley, cliffs and hills |

## Reviewed and left as is

- Two-line wordmarks in logo rows ("Twin Rivers / Outfitters", "The Modern / House Review"):
  equal cells mean a long name wraps instead of pushing a neighbour onto its own row. Read as
  lockups; preferred to an orphan.
- Signal's hero ticker wraps 4 + 1 when motion is reduced (it scrolls otherwise).
- Shop product grids are one column on phones (summary grids are 1-up below 36rem); a 2-up
  phone grid would suit shops but squeeze blog cards — a candidate for a product-only variant.
- `cta/card-over-photo` and `about/portrait-overlap` keep their button under the card: grid
  rows grow with content, so overlaying the button inside the card would collide with long copy.

## Quality gates (all green)

- **Unit and template tests** — `pnpm turbo run typecheck test --force --concurrency=4`: all 41
  tasks pass (the Hub's `DraftRoom flushing` timing test failed once under load and passed on
  rerun). Templates: design check with no errors or warnings, SEO check, every photo credited,
  no portrait for two people, and **axe: zero serious or critical** on every page.
- **Design check over every preset** in every theme: clean (`packages/lint`).
- **Stress** (`tools/visual-tests`): 11,683 renders at 7 sizes — no overflow or clipped text.
- **Lighthouse (mobile, median of 3)** for the 13 changed templates: Performance 100,
  Accessibility 100, Best practices 100, SEO 100, LCP 1.20–1.80 s, CLS 0. Table in
  [lighthouse.md](lighthouse.md#templates-polish-october-27-2026).
- **e2e** (`E2E_HUB_PORT=9017 E2E_STUDIO_PORT=5417 pnpm e2e`): 31 passed, including axe on every
  template demo home in every look.
- `pnpm exec biome check .`: no errors (3 pre-existing warnings in Studio).

## Repeating the review

```sh
OS_TEMPLATE_RENDER=/tmp/render OS_LOOKS=3 pnpm --filter @omniharmonic/openspace-templates exec vitest run render
cd tools/visual-tests
node scripts/template-shots.mjs /tmp/render ../../docs/qa/templates --pages=home,services --widths=1440,834,390
node scripts/template-shots.mjs /tmp/render ../../apps/www/media/templates --looks     # look sheets
node scripts/template-shots.mjs /tmp/render ../../apps/www/media/showcase --showcase   # 1280 × 800
```

Screenshots are captured at 1× and downsized afterwards: a fractional device scale draws
hairline seams between sections that aren't on the page.
