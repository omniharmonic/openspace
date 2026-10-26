import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  // Workspace packages export TypeScript sources inside the monorepo, so the CLI bundles them
  // and `dist/bin.js` runs anywhere. The starter reads its own files at runtime, so it stays
  // external (its published form is already built).
  noExternal: [/^@openspace\/(?!template-starter)/],
  external: ["@openspace/template-starter"],
  // Bundled CommonJS dependencies call require() on Node built-ins.
  banner: {
    js: 'import { createRequire as __osCreateRequire } from "node:module"; const require = __osCreateRequire(import.meta.url);',
  },
});
