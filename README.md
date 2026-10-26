# OpenSpace

OpenSpace is an open-source, Squarespace-class website builder with a Figma-grade visual editor and first-class Claude integration over MCP. Sites are plain files (`openspace.json` plus JSON content) that build to fast static pages with almost no JavaScript, and every edit, whether made in the Studio, by the CLI or by Claude, goes through the same validated operations.

## Quickstart

```sh
pnpm i && pnpm dev
```

Requires Node 22 and pnpm 10. Everything runs locally with no external accounts: GitHub, Cloudflare, Stripe, email and Turnstile all sit behind interfaces with dev implementations.

Other commands: `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format`, `pnpm e2e`.

## Architecture map

| Path                    | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `apps/studio`           | Visual editor (Vite + React). AGPL-3.0-only            |
| `apps/hub`              | API worker (Hono on Cloudflare Workers). AGPL-3.0-only |
| `apps/www`, `apps/docs` | Marketing and documentation sites                      |
| `packages/schema`       | Content model: zod schemas, ids, block definitions     |
| `packages/ops`          | The only way documents are mutated                     |
| `packages/theme`        | Design tokens and the contrast solver                  |
| `packages/blocks`       | Block library                                          |
| `packages/renderer`     | The single renderer that turns documents into HTML     |
| `packages/site-kit`     | Astro build kit for published sites                    |
| `packages/email-render` | Email rendering                                        |
| `packages/mcp-tools`    | MCP tool definitions                                   |
| `packages/cli`          | The `openspace` command                                |
| `packages/lint`         | Design and content checks                              |
| `templates/*`           | Starter shell and site templates                       |
| `plugin`                | Claude Code plugin                                     |
| `tools/*`, `e2e`        | Visual tests, fixtures, Playwright end-to-end tests    |

## Documentation

Product docs live in [docs/product](docs/product/README.md): PRD, architecture, implementation plan, and templates and design system.

## Licenses

MIT for packages and templates ([LICENSE](LICENSE)), AGPL-3.0-only for `apps/studio` and `apps/hub` ([LICENSE-AGPL](LICENSE-AGPL)), CC-BY-4.0 for documentation and template designs.
