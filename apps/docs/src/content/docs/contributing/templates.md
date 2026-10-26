---
title: Contributing templates
description: How to design and submit an OpenSpace template — data, not code — and the quality bar it must meet.
---

Templates are **data, not code**: page JSON, `styles.json`, section presets and media, all validated by the schema. You can design one without writing React.

## What a template is

Each template lives in `templates/<id>/` as a complete site — `openspace.json`, `content/site.json`, `content/styles.json`, `content/pages/*.json`, collections and `media/LICENSES.json` — plus `template.json` with its name, description, persona, mood, tags and **three looks** (palette, pairing and shape combinations).

In this repository, templates are generated from a short TypeScript file (`templates/<id>/src/build.ts`) using a small authoring kit: start from section presets with `fromPreset(…)`, rewrite their copy for your fictional owner, and let the kit validate every block. Then:

```sh
pnpm --filter @openspace/templates generate   # write the template files
pnpm --filter @openspace/templates test       # the quality gates below
```

## The quality bar

A template is accepted only when it passes all of these.

**Visual craft (design review)**
- Consistent vertical rhythm on the spacing scale; no ad-hoc values.
- A type hierarchy readable at a glance; at most two families.
- Alignment holds across sections.
- Images composed with focal points that survive every crop the presets use.
- Looks intentional in **all five color themes** and **all three looks**.

**Content**
- Real-feeling copy for a plausible fictional owner — never lorem ipsum, and no leftover preset demo text.
- Pages: home, about, a main offering page and a way to get in touch, plus pages for the type of site.
- Unique page descriptions of 50–160 characters.

**Media**
- Photography under licenses that allow redistribution (commissioned, CC0 or the Unsplash License), each credited in `media/LICENSES.json`.

**Technical gates (CI)**
- Valid against the schema and every block's definition; `openspace check` passes.
- The Design check reports no errors or warnings on any page, in any look.
- Zero contrast failures in every look.
- Lighthouse mobile Performance ≥ 95, Accessibility 100; no serious axe issues; under 30 KB of JavaScript on content pages.

## Submit

Open a pull request to `omniharmonic/openspace` with the template folder, screenshots of the home page in all three looks at desktop and phone widths, and the checklist above. A design reviewer from the stewarding group reviews the craft; CI runs the technical gates.

Accepted templates are credited to their designers in the gallery. Template designs are licensed CC BY 4.0, and any code MIT.
