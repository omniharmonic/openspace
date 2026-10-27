# Contributing to OpenSpace

Thanks for helping build OpenSpace.

## Setup

Requirements: Node 22.23.4+ (Node 24 recommended) and pnpm 10.

```sh
pnpm install
pnpm dev          # run Studio and Hub locally (no external accounts needed)
```

## Before you open a pull request

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All four must pass. `pnpm format` applies Biome formatting.

## Conventions

- Commits use conventional-commit subjects, for example `feat(schema): add Section type`.
- TypeScript is strict and ESM only.
- Naming: product "OpenSpace", npm scope `@omniharmonic/openspace-*`, CSS prefix `--os-` / `os-`, data attributes `data-os-*`.
- All document edits go through `@omniharmonic/openspace-ops` and are validated by `@omniharmonic/openspace-schema`.
- External services sit behind an interface with a dev implementation, so everything runs locally without secrets.
- Do not commit `node_modules`, build output or secrets.

## Licensing

Contributions are licensed under the license of the directory they touch: MIT for packages and templates, AGPL-3.0-only for `apps/studio` and `apps/hub`, CC-BY-4.0 for docs and template designs.
