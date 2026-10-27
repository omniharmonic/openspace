# @omniharmonic/openspace-site-kit

The Astro integration every OpenSpace site uses: `astro.config.mjs` adds `openspace()` and `src/pages/[...slug].astro` renders through `@omniharmonic/openspace-site-kit/route`. It reads `openspace.json` and `content/`, and builds pages, images, feeds, search and (with `@astrojs/cloudflare`) gated pages. The `src/` folder ships alongside `dist/` so `openspace eject` can copy the source into a site.

Part of [OpenSpace](https://github.com/omniharmonic/openspace), an open-source website builder. Most sites only depend on `@omniharmonic/openspace-site-kit` (and `@omniharmonic/openspace-cli` as a dev dependency); the other packages come along as its dependencies.

Versions of the OpenSpace packages are released in lockstep.

## License

MIT
