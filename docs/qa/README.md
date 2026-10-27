# Quality assurance

Results of the design, mobile, performance and accessibility pass (build plan Task 29), and
how to repeat each check. Each page lists what was measured, what we fixed and what's left.

| Page | What it covers |
|---|---|
| [studio.md](studio.md) | Studio design review at 1440 / 834 / 390 in light and dark: findings, fixes and before/after screenshots ([studio/](studio/)) |
| [lighthouse.md](lighthouse.md) | Lighthouse (mobile) on all twelve template demos, built through site-kit; Studio first load, JavaScript, typing and canvas latency |
| [stress.md](stress.md) | Template stress tests (doc 04 §8.2): every section preset with 3× / 0.3× copy, missing / tall / wide images, 1 / 2 / 5 / 12 items, long names, wide logos, at 320–1920 px and 200% zoom |
| [accessibility.md](accessibility.md) | axe on Studio's main screens (light and dark) and the keyboard walkthrough of core editing |
| [templates/](templates/) | Template screenshots (Task 9) and stress samples |

## Repeating the checks

Studio checks run against a mock build (no accounts needed):

```sh
VITE_MOCK_API=1 pnpm --filter @omniharmonic/openspace-studio build
pnpm --filter @omniharmonic/openspace-studio preview            # http://localhost:4173

pnpm --filter @omniharmonic/openspace-studio tour [url] [outDir]  # screenshots of every surface + overflow audit
pnpm --filter @omniharmonic/openspace-studio check:phone         # 360/390/430: no sideways scroll, 44px targets
pnpm --filter @omniharmonic/openspace-studio check:a11y          # axe (light + dark) + keyboard walkthrough
pnpm --filter @omniharmonic/openspace-studio check:perf          # first load, JS per route, typing, canvas
```

Template checks live in `tools/visual-tests`:

```sh
cd tools/visual-tests
node scripts/build-templates.mjs                    # astro build of each template via site-kit
node scripts/lighthouse.mjs --runs=3                # Lighthouse mobile, median of 3
OS_STRESS=$PWD/out/stress pnpm exec vitest run src/stress.render.test.ts
node scripts/stress.mjs                             # overflow / clipped text at 7 sizes
```

All of these use Playwright's Chromium from the `e2e` package. Lighthouse uses the same
Chromium unless `CHROME_PATH` is set.
