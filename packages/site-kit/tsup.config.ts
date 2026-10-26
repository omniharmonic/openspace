import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/content/index.ts",
    "src/agents-md.ts",
    "src/ids.ts",
    "src/runtime/route.ts",
    "src/runtime/images-manifest.ts",
    "src/cloudflare/index.ts",
    "src/cloudflare/endpoints/gated.ts",
    "src/cloudflare/endpoints/auth-callback.ts",
    "src/cloudflare/endpoints/password.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  external: [/^virtual:/, /^astro:/, "cloudflare:workers"],
});
