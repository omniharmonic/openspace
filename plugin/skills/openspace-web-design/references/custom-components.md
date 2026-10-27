# Custom components

A custom component is a site-level section design — `content/components/<name>.json` — with its own
template, scoped CSS and optional behaviour JavaScript, exposing **typed fields** that owners edit in
Studio like any block. Instances are blocks of type `component/<name>` inside ordinary sections, so
themes, padding, hidden, lock, layers, undo and publishing all work as usual.

Use them for bespoke moments only. Presets stay the default.

## Definition

```json
{
  "name": "split-feature",
  "label": "Split feature",
  "description": "A large statement beside a tall photo, with up to four short points.",
  "version": 1,
  "category": "about",
  "fields": {
    "eyebrow": {
      "kind": "text",
      "label": "Small line above",
      "maxLength": 60,
      "optional": true
    },
    "headline": {
      "kind": "text",
      "label": "Headline",
      "maxLength": 100
    },
    "body": {
      "kind": "richText",
      "label": "Text",
      "marks": [
        "bold",
        "italic",
        "link"
      ],
      "blocks": [
        "paragraph"
      ]
    },
    "photo": {
      "kind": "image",
      "label": "Photo",
      "aspect": "4:5"
    },
    "points": {
      "kind": "list",
      "label": "Points",
      "max": 4,
      "itemLabel": "title",
      "fields": {
        "title": {
          "kind": "text",
          "maxLength": 50
        },
        "text": {
          "kind": "text",
          "maxLength": 140,
          "multiline": true
        }
      }
    }
  },
  "defaults": {
    "eyebrow": "Why people stay",
    "headline": "Small classes, real attention",
    "body": "Never more than twelve people on the mat, so every class adapts to the room.",
    "photo": {
      "src": "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&q=80",
      "alt": "A woman meditating on a wooden deck at sunrise",
      "width": 800,
      "height": 930
    },
    "points": [
      {
        "title": "Twelve mats",
        "text": "Every class is capped, so teachers can help each person."
      }
    ]
  },
  "template": "<div class=\"sf\">\n  <div class=\"sf__copy\">\n    {{#if eyebrow}}<p class=\"sf__eyebrow\">{{eyebrow}}</p>{{/if}}\n    <h2 class=\"sf__title\" id=\"{{@uid}}-title\">{{headline}}</h2>\n    {{rich body class=\"sf__body\"}}\n    <ul class=\"sf__points\" aria-labelledby=\"{{@uid}}-title\">{{#each points}}<li><strong>{{title}}</strong> {{text}}</li>{{/each}}</ul>\n  </div>\n  <figure class=\"sf__media\">{{image photo sizes=\"(max-width: 767px) 100vw, 40vw\" aspect=\"4:5\"}}</figure>\n</div>",
  "css": ".sf { display: grid; grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: var(--os-space-2xl); align-items: center; }\n.sf__eyebrow { margin: 0 0 var(--os-space-sm); font-family: var(--os-font-label); color: var(--os-eyebrow-color); }\n.sf__title { margin: 0; font-family: var(--os-font-heading); font-size: var(--os-type-h1-font-size); color: var(--os-color-heading); }\n.sf__body { margin-top: var(--os-space-md); color: var(--os-color-text); }\n.sf__points { display: grid; gap: var(--os-space-sm); margin: var(--os-space-lg) 0 0; padding: 0; list-style: none; color: var(--os-color-text-muted); }\n.sf__media { margin: 0; overflow: hidden; border-radius: var(--os-radius-image); }\n@media (max-width: 767px) { .sf { grid-template-columns: minmax(0, 1fr); gap: var(--os-space-xl); } }",
  "section": {
    "width": "wide",
    "padding": {
      "d": "2xl",
      "m": "xl"
    }
  },
  "ai": {
    "purpose": "A statement with a photo and a few proof points.",
    "whenToUse": "About or services pages that need one strong, editorial moment.",
    "avoid": "More than four points; long paragraphs."
  }
}
```

Field kinds: `text` (`maxLength`, `multiline`), `richText` (`marks`, `blocks`), `image` (`aspect`; values carry `alt` and a focal point), `link`, `select` (`options`), `boolean`, `number` (`min`, `max`, `step`, `unit`), `color` (a palette token such as `accent` or `neutral-200`), `list` (`fields`, `min`, `max`, `itemLabel`; nested at most two levels). Field names are camelCase. `defaults` must be a complete valid instance — it is the sample content a new section starts with. With MCP tools rich text may be given as Markdown (as `body` above).

## Template language

| Write | Gets |
|---|---|
| `{{headline}}`, `{{../headline}}` inside a loop | text, always escaped (rich text prints as plain text) |
| `{{rich body class="lead"}}` | the rich text, with inline editing in Studio |
| `{{image photo sizes="(max-width: 767px) 100vw, 45vw" aspect="4:5" loading="eager" fit="cover"}}` | a responsive picture with width/height and the focal point |
| `{{button cta label=ctaLabel variant="primary"}}` | the Site Styles button (`primary`, `secondary`, `tertiary`) |
| `{{#link cta class="card"}}…{{/link}}` | a link around anything |
| `href="{{href cta}}"` | a resolved link address in an attribute |
| `style="--tint: {{color accent}}; --i: {{@index}}"` | custom properties only |
| `{{#if x}}…{{else}}…{{/if}}`, `{{#if tone == "bold"}}`, `{{#unless x}}` | conditions |
| `{{#each points}}…{{@index}} {{@number}} {{@first}} {{@last}}…{{else}}…{{/each}}` | loops over list fields |
| `id="{{@uid}}-title"` with `aria-labelledby="{{@uid}}-title"` | ids (always include `{{@uid}}`) |
| `{{! a comment }}` | nothing |

Allowed elements: `div span section article aside header footer nav h1–h6 p ul ol li dl dt dd figure figcaption blockquote cite q em strong b i small mark br hr time abbr sup sub a button details summary` and inline `svg` drawing elements. **Not allowed**: `script style img picture video audio iframe form input link meta`, `on*` attributes, `{{{raw}}}`, `javascript:` links. `<button>` needs `type="button"` (JS-enhanced controls only). Attributes: `class role title lang dir hidden tabindex(0/-1) aria-* data-*` (not `data-os-*`), SVG presentation attributes.

## CSS

Scoped automatically: `:scope` is the component root (`.os-c--<name>`), every other selector is prefixed with it, and `@keyframes` names are made unique. `@media`, `@supports` and `@container` work; `@import`, remote `url()` (except fonts.gstatic.com and small `data:` images), `html`/`body`/`:root` selectors are refused.

- Colours: `var(--os-color-background | surface | surface-raised | text | text-muted | heading | accent | accent-text | border | focus | link)` and scales `var(--os-color-accent-500)`, `var(--os-color-neutral-200)`. Pair text and background roles the theme solves for contrast (text on background, accent-text on accent).
- Type: `var(--os-font-heading | body | label)`, `var(--os-type-<display|h1|h2|h3|h4|lead|body|small|eyebrow>-<font-size|line-height|letter-spacing|font-weight|text-transform>)`, `var(--os-eyebrow-color)`.
- Space and shape: `var(--os-space-<3xs…3xl>)`, `var(--os-radius-<sm|md|lg|card|image|button|full>)`, `var(--os-shadow-<sm|md|lg>)`, motion `var(--os-motion-ease)`, `var(--os-motion-duration-<fast|base|slow>)`.
- Breakpoints: `(max-width: 767px)` phones, `(min-width: 768px)` tablets and up, `(min-width: 1200px)` desktops, `(max-width: 1199px)`.
- Motion: any `animation`/`@keyframes` needs `@media (prefers-reduced-motion: reduce) { … }` that turns it off.

## JavaScript (optional)

The body of `function (root, ctx)`, run once per instance on the published page after load (never in the Studio editor; Studio previews it in a sandbox). `ctx.reducedMotion` is true when the visitor prefers less motion; `ctx.uid` is the instance id. Enhance markup that already works without JS: toggle classes and attributes, observe intersections, handle clicks and keys. No `fetch`/network, `eval`, `innerHTML`, storage, navigation or loading other code. Budget: 6 KB per component, 12 KB per page.

## Quality gates (publish blocks on errors)

Valid definition; template ≤ 24 KB, CSS ≤ 16 KB, JS ≤ 6 KB; reduced motion honoured; links and buttons have names; nothing focusable inside `aria-hidden`; token pairs meet contrast. Warnings: fixed colours, unused fields, non-standard breakpoints, fixed widths or `position: fixed` on phones, skipped heading levels, undecorated SVGs. `preview_component` and `design_check` list them.

## Versioning

Compatible changes (new optional fields, CSS, template) need nothing special. Renaming or removing fields: raise `version` and pass `migrate` to `update_component`, e.g. `{"rename": {"title": "headline"}, "set": {"tone": "calm"}, "remove": ["subtitle"]}`; every section using the component is upgraded in the same step. Publishing sites that use components needs site-kit 0.1.11 or later; if the site is older, publishing explains how to update.
