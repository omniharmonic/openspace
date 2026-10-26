# Commonplace — Product Docs

**Squarespace-quality websites you own, for free.** An open-source visual website builder on Astro + GitHub Pages, with a block editor, exquisite templates, and AI editing through your own agent via MCP.

*Prepared by Benjamin Life (@omniharmonic). Working name — verify before public use.*

| Doc | What's in it |
|---|---|
| [01 — PRD](01-PRD.md) | Vision, principles, personas, the full Squarespace parity map, MVP requirements, constraints, metrics, risks |
| [02 — Technical Architecture](02-ARCHITECTURE.md) | Repo and content model, Grid/Stack layout engine, block system, Studio editor, draft room, GitHub App, build/deploy, the Hub, MCP server, forms, email, members, commerce, security |
| [03 — Implementation Plan](03-IMPLEMENTATION-PLAN.md) | Spikes, seven phases to parity and beyond, milestones, acceptance criteria, dispatch-ready Phase 1 tickets, quality gates, budget, risk register |
| [04 — Templates & Design System](04-TEMPLATES-AND-DESIGN-SYSTEM.md) | Token system, OKLCH color, typography, section presets, 12 launch templates, quality bar, agent design guidance |

## The shape of it in five lines

1. Every site is a public repo in the owner's GitHub account: content as JSON/Markdoc, tokens, media, and a thin Astro shell over a versioned `site-kit` package.
2. **Studio** edits the content visually, rendering the exact same components the live site uses; publishing squashes a draft branch into `main` and GitHub Actions deploys.
3. A tiny shared **Hub** on Cloudflare handles sign-in, live drafts, the MCP server, forms, newsletters, analytics, members and checkout — costing cents per thousand sites.
4. Content sites publish free on **GitHub Pages**; stores and member sites publish to the owner's own free **Cloudflare** account (GitHub Pages' terms exclude commerce).
5. The owner's own Claude edits the site through typed, validated operations — the commons never pays for AI.
