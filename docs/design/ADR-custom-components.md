# ADR: Custom components (designer-authored sections with editable fields)

| | |
|---|---|
| **Status** | Accepted (implemented on branch `custom-components`) |
| **Date** | October 27, 2026 |
| **Reads with** | [02 — Architecture](../product/02-ARCHITECTURE.md) (ADR-2, ADR-3, ADR-9, §4.2, §5.2, §6.4, §12) · [BUILD-PLAN Global Constraints](../plan/BUILD-PLAN.md) |

## Context

Presets give every site a well-designed, editable structure, but they cap how distinctive a site
can be: a layered collage, a horizontal scroll story or an editorial hero with an animated reveal
can't be composed from stack/grid sections of library blocks. The owner direction (CONTEXT.md,
"wow-level fidelity + higher-end design") asks for bespoke sections authored by Claude or a
designer — their own markup, CSS and a little JavaScript — **without** losing the property that a
non-technical owner can still change every word and picture in Studio, and without weakening any
architectural rule: one renderer (ADR-3), ops-only mutations (ADR-2/9), stable ids, roles,
zero-JS-by-default pages, and the security model (§12).

## Decision

A **custom component** is a site-level, versioned *definition* that behaves like a block type the
site owns. Sections use it through ordinary block instances, so every existing section feature
(themes, padding, hidden, lock, layers, mobile layout, undo, rebase, publish) keeps working.

### 1. Data model

**Definition** — one file per component, `content/components/<name>.json`, loaded into
`SiteDocument.components[name]` (a new *optional* key, so documents without components are
unchanged byte for byte):

```jsonc
{
  "name": "editorial-hero",            // lowercase-hyphenated, ≤ 40 chars, = file name
  "label": "Editorial split hero",     // gallery + layers name
  "description": "Big serif headline beside a tall portrait that reveals on scroll.",
  "version": 1,                        // bump on breaking field changes (see §7)
  "category": "hero",                  // gallery grouping (preset categories)
  "fields": {                          // typed, JSON-serializable field specs
    "eyebrow":  { "kind": "text", "maxLength": 60, "optional": true },
    "headline": { "kind": "text", "maxLength": 120 },
    "body":     { "kind": "richText", "marks": ["bold","italic","link"], "blocks": ["paragraph"] },
    "photo":    { "kind": "image", "aspect": "4:5" },
    "cta":      { "kind": "link", "optional": true },
    "ctaLabel": { "kind": "text", "maxLength": 40, "optional": true },
    "tone":     { "kind": "select", "options": ["calm", "bold"] },
    "accent":   { "kind": "color" },
    "items":    { "kind": "list", "max": 12, "itemLabel": "title",
                  "fields": { "title": { "kind": "text" }, "photo": { "kind": "image" } } }
  },
  "defaults": { … },                   // a complete, valid instance (sample content for the gallery)
  "template": "<div class=\"hero\">…{{headline}}…</div>",
  "css": ":scope { … } .hero { … }",
  "js": "…",                           // optional progressive enhancement
  "section": { "width": "full", "padding": "none" },
  "ai": { "purpose": "…", "whenToUse": "…", "avoid": "…" },
  "migrations": { "1": { "rename": { "title": "headline" }, "set": {}, "remove": [] } }
}
```

Field kinds reuse the block field system exactly (`f.text`, `f.richText`, `f.image` (with focal
point), `f.link`, `f.select`, `f.boolean`, `f.number`, `f.color` (palette tokens only, never exact
colours), `f.list` with nested fields up to two levels). A spec compiles to `f.*` builders, so
validation, JSON Schema, Studio controls and MCP schemas are the ones blocks already have.

**Instance** — a block `{ "type": "component/<name>", "v": <definition version>, "fields": {…} }`.
`BLOCK_TYPE_RE` already allows a namespace, so no schema change is needed for instances. The
gallery inserts it as a one-block stack section whose `preset` is `component/<name>@<version>` and
whose width/padding come from the definition's `section` defaults.

**Registry** — `withComponents(registry, doc.components)` (schema) layers definitions over the
library registry: `component/<name>` resolves to a `BlockDefinition` compiled from the spec.
`@omniharmonic/openspace-ops` wraps the registry with the document's components inside `validate`,
`validateDocument` and `transformForRole`, so the Hub, MCP, CLI and Studio validate instances
without knowing components exist.

### 2. Template language (logic-light, no JavaScript)

Handlebars-shaped, parsed by the schema package into an AST (pure, no React):

| Syntax | Meaning |
|---|---|
| `{{headline}}`, `{{item.title}}`, `{{../headline}}` | text, **escaped** (rich text → plain text) |
| `{{rich body class="lead"}}` | rich text through the renderer's `<RichText>` (inline editing works) |
| `{{image photo sizes="50vw" aspect="4:5" loading="eager"}}` | `<Img>`: srcset, width/height (no layout shift), focal point |
| `{{button cta label=ctaLabel variant="primary"}}` | the Site Styles button |
| `{{#link cta class="card"}}…{{/link}}` | a resolved, base-path-aware `<a>` |
| `href="{{href cta}}"`, `style="--tint: {{color accent}}"` | attribute helpers (links resolved; colours → `var(--os-color-…)`) |
| `{{#if x}}…{{else}}…{{/if}}`, `{{#if tone == "bold"}}`, `{{#unless x}}` | conditionals |
| `{{#each items}}…{{@index}} {{@number}} {{@first}} {{@last}}…{{else}}…{{/each}}` | loops over list fields |
| `{{@uid}}` | a per-instance id prefix (for `id` / `aria-*` pairs) |
| `{{! comment }}` | ignored |

Rules enforced by the parser (errors are plain sentences with a line number):
- Only an allow-list of tags (`div span section article header footer h1–h6 p ul ol li dl dt dd
  figure figcaption blockquote cite q em strong b i small mark br hr time abbr sup sub a button
  details summary nav aside` and inline `svg` drawing elements). **No** `script style link meta
  iframe object embed form input img picture video audio template slot base` — images and links
  only through the helpers.
- Only allow-listed attributes: `class role title lang dir hidden open tabindex(≤0) datetime
  type=button aria-* data-*` (not `data-os-*`), SVG presentation attributes, `id` only containing
  `{{@uid}}`, `href` only as `{{href …}}` or a literal `#…`, `/…`, `https://…`, `mailto:`/`tel:`,
  `style` only as custom properties (`--name: value`). No `on*` handlers, no `srcdoc`, no `javascript:`.
- Every referenced field must exist with a matching kind (`rich` → richText, `#each` → list…).
- There is no raw-HTML output (`{{{ }}}` is a parse error). React escapes everything.

### 3. Rendering (one renderer)

- `expandTemplate(ast, fields)` (schema, pure) produces an element tree; the renderer's
  `ComponentView` turns it into React using the existing primitives (`RichText`, `Img`, `Button`,
  `Link`). It is used by the Studio canvas, the gallery thumbnails, the Hub preview, MCP
  render/screenshot, and site-kit builds — unchanged ADR-3.
- The instance root is `<div class="os-c os-c--<name>" data-os-component="<name>" data-os-c-v="…">`
  inside the normal `.os-block` wrapper, so section/block style overrides still apply.
- **Scoped CSS**: `scopeCss(name, css)` prefixes every selector with `.os-c--<name>` (`:scope`
  means the root), renames `@keyframes` to `os-c-<name>-<kf>`, keeps `@media`/`@supports`/
  `@container`, and refuses `@import`, `@font-face` with remote sources outside the allow-list,
  `url()` to non-allow-listed origins, `expression()`, `javascript:`, `behavior`, `-moz-binding`
  and `</style`. Published pages get one `<style data-os="components">` in `<head>` with the CSS
  of the components the page uses; the Studio canvas gets it inline per instance.
- **Tokens**: colours, type and spacing are expected to use theme variables
  (`var(--os-color-text)`, `var(--os-font-heading)`, `var(--os-space-lg)`…), so Site Styles and
  section colour themes restyle components like any block. Hard-coded colours are a lint warning.
- **Breakpoints**: media queries should use Global Constraint 7's breakpoints
  (`max-width: 767px`, `min-width: 768px`, `min-width: 1200px`, `max-width: 1199px`); others warn.

### 4. Behaviour JavaScript (optional, progressive enhancement)

- `js` is the *body* of `function (root, ctx)`, run once per instance after the page loads, with
  `ctx = { reducedMotion, uid }`. The markup must be complete and usable without it.
- Emitted only on published pages and the Hub's sandboxed preview, as one small inline module per
  component used on the page (no React, no loader change). Never in the Studio canvas (same-origin):
  Studio's **Component code** view previews it inside an `<iframe sandbox="allow-scripts">`
  `srcdoc` (opaque origin, no credentials), like code/embed blocks.
- Static guard (schema): refused if it contains network or code-loading APIs (`fetch`,
  `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `import(`, `import `, `eval`,
  `Function(`, `setTimeout("…")`, `Worker`, `serviceWorker`, `postMessage`), HTML injection
  (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`), storage/cookies, navigation
  (`location =`, `window.open`), or `</script`/`<!--`. This is a guard rail against accidents and
  prompt-injected output, **not** a sandbox: the trust model is the same as Advanced → Custom
  code (only owners and designers can author it; see §6).
- Budgets (lint, block publish): JS ≤ 6 KB, CSS ≤ 16 KB, template ≤ 24 KB per component; all
  component JS on a page ≤ 12 KB (inside the 30 KB page budget, Global Constraint 11).
  `prefers-reduced-motion` must be honoured: CSS with `animation`/`@keyframes` needs a
  `@media (prefers-reduced-motion: reduce)` block (error), transitions without it warn, and JS
  that animates must read `ctx.reducedMotion` (warning).

### 5. Editing

- **Owners/editors** select an instance and see its fields as normal inspector controls (text,
  rich text, image with focal point and alt, link, list with add/remove/reorder, select, number,
  colour swatches). Edits are `block.update` ops — they never touch code. Rich text edits inline on
  the canvas exactly as in library blocks.
- **Designers/owners** also get **Component code** (Content tab, collapsed): fields (JSON), template,
  CSS and JS editors with plain-language validation, a live sandboxed preview, and *Save* →
  `component.upsert`. The code view is hidden for editors and contributors and the ops are refused
  for them by `transformForRole` (Hub-enforced).
- **Add section → Designer components**: the site's components plus the opt-in example library.
  Inserting an example is `component.upsert` + `section.insert` (designers/owners); editors can
  insert instances of components the site already has (their section look is checked against the
  component's section defaults like a preset build).

### 6. Operations and roles

New ops: `component.upsert { component }` and `component.delete { name }`.
- Validated: definition schema, template parse + field references, CSS scoping rules, JS guard,
  `defaults` valid against the fields; `component.delete` is refused while instances exist.
- Invertible (upsert ↔ previous upsert/delete), rebased like `collection.upsert` (same name → LWW),
  summarized ("Changed the Editorial split hero design"), produced by `diff`.
- Roles: owner/designer only. Editors and contributors are refused (`"Only owners and designers can
  change a component's design"`). Instance field edits follow the usual block rules (editors can
  change fields on unlocked sections; on locked sections only text/rich text/image fields).

### 7. Versioning and migrations

`version` is bumped when fields change incompatibly. `migrations[n]` is declarative (`rename`,
`set` defaults, `remove`) — no code — and is compiled to the block migration functions the
registry already runs (`migrateBlock`), lazily in the renderer and eagerly by `update_component`,
which emits `block.update` ops for every instance in the same batch so the draft stays valid.
Without a migration, `update_component` refuses changes that would invalidate existing instances.

### 8. Back-compatibility and older site-kits

- Schema additions are optional: sites without components are unaffected; presets and templates
  are untouched.
- An older site-kit ignores `content/components/` and would silently drop instances (unknown block
  types render nothing in production). So publishing is **gated**: when the draft contains a
  component instance, the Hub (`assertPublishable`) and `openspace check` require site-kit
  ≥ `COMPONENTS_MIN_KIT` (0.1.11). The Hub reads `package-lock.json` (exact resolved version) or,
  without a lock file, checks that `package.json`'s range admits the minimum. Otherwise the publish
  is refused with `kit_update_needed` and a plain sentence ("This site uses a designer section that
  needs the latest OpenSpace update. Apply the update in Settings → Updates, then publish again.").
- An older CLI's `openspace check` (pinned in the site's own run) rejects the unknown block type,
  so a gate bypass fails loudly rather than shipping a page with a hole.

### 9. Presets, templates and importers

- Templates may ship `content/components/*.json`; their sections reference them like any site.
- Presets stay the default. Components are for bespoke moments; the web-design skills say so.
- Importers (later work, CONTEXT "Start with Claude") map unmappable source sections to a
  component (template + CSS from the source, fields for its text/images) instead of a
  screenshot or raw HTML embed.

### 10. Claude (MCP)

Shared tools (local CLI and Hub): `list_components`, `get_component`, `create_component`,
`update_component`, `preview_component` (renders an instance with sample or given fields; with
screenshots it returns desktop/mobile images via the existing screenshot providers, through
`/p/<site>/_os/component/<name>` on the Hub), and `insert_component` (a new section with an
instance). Results include lint findings so Claude fixes them before showing the owner.

### 11. What stays forbidden

Raw HTML output, inline event handlers, `<script>/<style>/<iframe>/<form>` in templates, remote
scripts, network access from component JS, `eval`/dynamic code, exact colours in colour fields,
component code edits by editors/contributors, executing component JS in the same-origin Studio
canvas, and publishing component instances with a site-kit that can't render them.

## Consequences

- Distinctive sections without an "eject": the page stays structured JSON, fields stay editable.
- One more concept for designers (and Claude) to learn; mitigated by the gallery examples, MCP
  tool descriptions and the skills ("prefer presets; components for bespoke moments; always expose
  editable fields; always on tokens").
- The JS guard is a lint, not a sandbox; the role gate and preview sandboxing are the boundary.
- Packages to release together: schema, ops, renderer, blocks, lint, mcp-tools, site-kit, cli
  (lock-step 0.1.11), then deploy Hub and Studio.
