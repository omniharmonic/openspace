# Non-technical onboarding — "it has to just work"

Status: implemented (branch `just-works`), October 2026. Owner directive: a non-technical person
goes from "I have a site / I want a site" to a live site they can edit — as easy as Squarespace or
easier, in plain words, with every technical decision made for them.

## Principles

1. **Wow first.** One click or one address → a live site on free GitHub Pages, visible in the
   editor immediately. Nothing (Cloudflare, Stripe, email, a domain) may set or require anything
   before that first live version. Enforced in code:
   - Hub `POST /api/sites/:id/hosting` refuses Cloudflare until the site has been live
     (`409 not_live_yet`) and refuses a move whose next publish would fail (`409 missing_secrets`),
     each with one plain sentence.
   - `openspace new|import --target cloudflare` refuse with an explanation; the local MCP
     `import_site` tool only accepts `github-pages`; the Hub creates and imports on GitHub Pages.
   - Claude skills (plugin and Claude app) never switch hosting during set-up or a move.
2. **Visual parity on GitHub Pages, even with a shop.** GitHub Pages' terms exclude sites
   primarily for commercial transactions (ADR-8), so checkout, donations, member sign-in and
   password pages run on the owner's own Cloudflare account. On GitHub Pages those blocks render a
   designed "opening soon" note in the site's own colours and type — never a broken form. If the
   owner names a current shop or donation page, the note links there (a site redirect from
   `/shop-elsewhere` or `/give-elsewhere`; no schema change, so older sites keep building).
3. **Progressive, guided set-up.** Everything else becomes **Finish setting up**: a checklist
   generated from the site's content, state and the importer's `content/setup-checklist.json`.
   Each item: a one-sentence why, a time estimate, and a guided helper that automates everything
   possible. Each completion is celebrated.
4. **No downtime, automatic rollback.** Moving to Cloudflare keeps the GitHub Pages version live;
   the site's address moves only after the Worker answers; a failed Cloudflare publish switches the
   site back by itself and says so plainly.
5. **Plain language.** No repository, branch, commit, build, deploy, workflow, GitHub Actions, MCP,
   CNAME, "API token" or "account ID" in non-Advanced UI (enforced by `apps/studio/src/test/copy.test.tsx`).
   Unavoidable words (a "record" for a domain, a Cloudflare "key") are explained in one sentence.

## Surfaces

| Surface | Where | What it does |
| --- | --- | --- |
| Finish setting up | Settings → first tab (`/sites/:id/settings/setup`); editor top-bar chip "Finish setting up · N left"; dashboard card chip; ⌘K | The checklist and its helpers |
| Cloudflare helper | Shop / donations / members / password-page helpers; Settings → Hosting | Free sign-up link → Cloudflare's token page with every permission pre-filled → paste once → Studio checks the key, finds the account and its workers.dev address (registering one if missing), flags R2/permission problems with a fix link, seals the key in the browser, moves, follows the move to "confirmed" |
| Stripe helper | Shop / donations | Stripe-hosted onboarding in a new tab, re-checked on return. When this server has no platform Stripe key (production today): "Card payments are almost ready on OpenSpace…" — the site keeps its opening-soon note; own-keys path offered for the comfortable |
| Domain helper | Finish setting up → Use your own domain → Settings → Domain | Existing registrar-aware wizard with friendlier copy ("records" explained, "make it secure (the padlock)") |
| First-run tour | Editor, on `?welcome=1` (after creation or a move) or `?tour=1` | Four stops: edit anything / publish when ready / finish setting up whenever / **"Your site is live — and it's yours."** + "You'll save about $X a year compared with {platform}" (landing-page prices) or "No monthly fee. No lock-in." |
| Need a hand? | Editor rail (life-ring) | What to do now in context (being set up / publish needs attention + Try again / next setup step + Show me how), Finish setting up, replay the tour, ask Claude, the short guide |

### Checklist items

| Kind | Found from | Done when | Helper | Time |
| --- | --- | --- | --- | --- |
| store | products in collections, product blocks, import | on Cloudflare **and** payments ready | Cloudflare + Stripe (+ "point to your current shop") | 10 min |
| donations | donation blocks not in link mode, import | on Cloudflare and payments ready | same (+ current donation page) | 10 min |
| members | member-login blocks, members-only pages, import | on Cloudflare | Cloudflare (+ email note) | 10 min |
| password-pages | password pages, import | on Cloudflare | Cloudflare | 10 min |
| forms-email / newsletter | form / newsletter blocks, import | acknowledged | where to find entries / subscribers | 1–2 min |
| domain | always | a domain is connected | domain helper | 15 min |
| analytics | import | acknowledged | visitor stats, no cookie banner | 1 min |
| comments / custom-code / other | import | acknowledged | the importer's detail + "ask Claude" | 5 min |

Cloudflare-backed items show "Once your site is live" until the first live version.

### Importer contract (`content/setup-checklist.json`, agreed with hosted-import)

```json
{ "version": 1, "source": "import", "from": "Squarespace",
  "items": [{ "id": "store", "kind": "store", "title": "Turn on your shop",
              "detail": "…", "where": ["/shop"], "count": 12, "status": "todo" }] }
```

Served normalised by `GET /api/sites/:id/setup` (draft, then main); unknown kinds become `other`.

## Journeys

### 1. New from a template
1. Gallery → template → name + one line → sign in with GitHub (install the OpenSpace app; if
   skipped, the site waits with a "One more step" button — onboard-install).
2. "Setting up your site…" — Copying the design / Adding your name / Giving it a free web address
   / Putting the first version online. A failure says what happened and that nothing else changed.
3. Editor opens with the tour; last stop: "Your site is live — and it's yours." + Copy link.
4. Finish setting up chip: "Use your own domain" (and whatever the template's content implies —
   a shop for Kiln). Nothing is required.

### 2. Move from Squarespace with a store
1. "Move my site" (Studio, hosted import) or "move my site" to Claude (migrate skill). Always
   GitHub Pages; products import as catalog pages.
2. First publish goes live at visual parity; product and donation blocks show the designed
   "Online ordering opens here soon." note. The publish never fails because of the shop.
3. Tour ends on "You'll save about $348 a year compared with Squarespace" (Core plan, since the
   site sells).
4. Finish setting up: Open your shop (12 products) → optional "point to your current shop" (old
   Squarespace store URL; the note links there) → Cloudflare helper (sign up, create key with
   pre-filled permissions, paste once, move — Pages version stays live) → Stripe → "Your shop is
   open" celebration. Then domain, forms, newsletter, anything the importer flagged.

### 3. Make an existing GitHub Pages site editable
1. hosted-import converts the repo in place (branch + pull request, plain-language) or imports it
   into a new site; Jekyll/plain HTML sources are read from source.
2. The site stays on GitHub Pages; the converted version publishes at parity; the tour and Finish
   setting up follow as above (domain is usually already connected → done).

### 4. Connect Claude with no installs
1. Studio → Connect your AI → Claude app: add the custom connector
   `https://hub.openspace.host/mcp`; consent offers "Create new sites" even with zero sites
   (onboard-install), so the first-run trap is gone.
2. Optional Claude app skills (zip uploads) for migrate / web design / content (remote-claude);
   screenshots run on the Hub (Browser Rendering) — no Node, npx or Playwright locally.
3. Claude's dialogue follows the same rules: plain words, never switch hosting, celebrate the
   live site, then a short "when you're ready" list that matches Finish setting up.

## Open questions / follow-ups

- The production Hub has no Stripe Connect platform key yet: the shop helper says so honestly; when
  the key is configured the Connect button appears with no code change.
- After a confirmed move, the old GitHub Pages copy stays up (stale but harmless) — a later
  improvement could replace it with a redirect-only page.
- Cloudflare R2 needs a one-time "purchase" of the free plan (a card on file at Cloudflare); the
  helper detects it and links straight to the page, but it is the one step we can't automate.
