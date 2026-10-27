# Releasing the npm packages

OpenSpace publishes ten packages under the `@omniharmonic` npm scope, named
`@omniharmonic/openspace-<name>`. They are versioned in lockstep (all `0.1.0` today). The CLI
binary is still `openspace`, and sites still use `openspace.json`.

| Package | Folder | Needed by a site at runtime |
| --- | --- | --- |
| `@omniharmonic/openspace-schema` | `packages/schema` | yes (via site-kit) |
| `@omniharmonic/openspace-theme` | `packages/theme` | yes (via site-kit) |
| `@omniharmonic/openspace-renderer` | `packages/renderer` | yes (via site-kit) |
| `@omniharmonic/openspace-blocks` | `packages/blocks` | yes (via site-kit) |
| `@omniharmonic/openspace-site-kit` | `packages/site-kit` | yes (direct dependency) |
| `@omniharmonic/openspace-cli` | `packages/cli` | dev dependency; also `npx -y @omniharmonic/openspace-cli mcp` |
| `@omniharmonic/openspace-ops` | `packages/ops` | no (library) |
| `@omniharmonic/openspace-lint` | `packages/lint` | no (library) |
| `@omniharmonic/openspace-mcp-tools` | `packages/mcp-tools` | no (library) |
| `@omniharmonic/openspace-email-render` | `packages/email-render` | no (library, used by the Hub) |

Not published (marked `private`): `@omniharmonic/openspace-templates` and
`@omniharmonic/openspace-template-starter`. The CLI bundles what it needs from them (see below).
Apps, `e2e`, `tools/*` and `plugin` are private too.

## How the packages are laid out

- Inside the monorepo every package's `exports` point at `src/*.ts`, so dev, typecheck and
  tests run on sources with no build step.
- `publishConfig.exports` (and `publishConfig.bin` for the CLI) point at `dist/`. pnpm swaps
  these in when it packs or publishes, so the published `package.json` only references built
  JavaScript and `.d.ts` files. `files` ships `dist`, `README.md` and `LICENSE`.
- `workspace:*` dependencies are rewritten to the exact version (`0.1.0`) at pack time.
- `@omniharmonic/openspace-site-kit` also ships `src/` (without tests) so `openspace eject` can
  copy the kit's source into a site. Its exports still point at `dist/`.
- `@omniharmonic/openspace-cli` bundles every `@omniharmonic/openspace-*` package it uses into
  `dist/` (they are devDependencies), so installing the CLI pulls only `@modelcontextprotocol/sdk`,
  `commander`, `react` and `react-dom`. Its build (`tsup && node scripts/bundle-templates.mjs`)
  also copies the starter shell (`dist/starter/`) and the twelve launch templates' site files
  (`dist/templates/<id>/`), which is how `openspace new <template>` works outside a checkout.

## Publish order

Dependencies first. `pnpm -r publish` works this order out for itself; it is listed here for a
manual or partial release:

1. `@omniharmonic/openspace-schema`
2. `@omniharmonic/openspace-theme` (schema)
3. `@omniharmonic/openspace-ops` (schema)
4. `@omniharmonic/openspace-email-render` (schema, theme)
5. `@omniharmonic/openspace-renderer` (schema, theme)
6. `@omniharmonic/openspace-blocks` (schema, theme, renderer)
7. `@omniharmonic/openspace-lint` (schema, theme, blocks, ops)
8. `@omniharmonic/openspace-site-kit` (schema, theme, renderer, blocks)
9. `@omniharmonic/openspace-mcp-tools` (all of the above except email-render)
10. `@omniharmonic/openspace-cli` (self-contained; publish last so a site's lockfile never points
    at a CLI newer than its site-kit)

## Commands

```sh
# 0. Clean tree on main, logged in to npm as a member of the @omniharmonic org.
git status
npm whoami

# 1. Bump every publishable package to the same version (example: 0.1.1).
pnpm -r --filter "./packages/*" exec npm version 0.1.1 --no-git-tag-version
# Starter shells pin "^0.1.0" for site-kit and cli: update templates/starter/site/package.json and
# templates/starter/variants/cloudflare/package.json on a minor/major bump, then
pnpm --filter @omniharmonic/openspace-hub embed:starter

# 2. Install, build, verify.
pnpm install
pnpm turbo run build --filter "./packages/*"
pnpm turbo run typecheck test --force --concurrency=4
pnpm exec biome check .

# 3. Look at what would be published (nothing is uploaded).
pnpm -r publish --dry-run --access public --no-git-checks

# 4. Publish (dependency order, skips versions that already exist on the registry).
pnpm -r publish --access public

# 5. Tag.
git tag v0.1.1 && git push --tags
```

`pnpm publish` does not build: always run step 2 first, or the tarballs will be missing `dist/`
or carry a stale one.

## Checking a release before publishing

Pack the packages and build a site from the tarballs, outside the monorepo, so nothing resolves
from the workspace:

```sh
OUT=$(mktemp -d)
for p in schema theme renderer blocks ops lint mcp-tools email-render site-kit cli; do
  (cd packages/$p && pnpm pack --pack-destination "$OUT/tarballs")
done
cd "$OUT"
npx -y --package="$OUT/tarballs/omniharmonic-openspace-cli-0.1.0.tgz" openspace new meadow site
cd site
# Point @omniharmonic/openspace-site-kit and -cli at file:<tarball>, and add an npm "overrides"
# entry mapping every @omniharmonic/openspace-* name to its tarball, then:
npm install
npx openspace check --ci
npm run build          # Astro 7.4 needs Node >= 22.23.4
npx openspace mcp .    # speak MCP over stdio: initialize, then tools/list
```

Repeat with `openspace new harbor cf-site --target cloudflare` for the Cloudflare variant.
