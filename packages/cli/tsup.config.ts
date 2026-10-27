import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  // Workspace packages export TypeScript sources inside the monorepo, so the CLI bundles them
  // (they are devDependencies) and `dist/bin.js` runs anywhere. The starter shell and the
  // launch templates are data: scripts/bundle-templates.mjs copies them into dist/ after this.
  noExternal: [/^@omniharmonic\/openspace-/],
  // Bundled CommonJS dependencies call require() on Node built-ins.
  banner: {
    js: 'import { createRequire as __osCreateRequire } from "node:module"; const require = __osCreateRequire(import.meta.url);',
  },
});
