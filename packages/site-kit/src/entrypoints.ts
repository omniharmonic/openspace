/**
 * Module specifiers Astro resolves from the site project for routes the integration injects.
 * This is the single table `openspace eject` rewrites to project-relative paths (it replaces
 * every `@openspace/site-kit/...` literal below), so keep it a plain object of string literals.
 */
export const ENTRYPOINTS = {
  "cloudflare/gated": "@openspace/site-kit/cloudflare/gated",
  "cloudflare/auth-callback": "@openspace/site-kit/cloudflare/auth-callback",
  "cloudflare/password": "@openspace/site-kit/cloudflare/password",
  "images-manifest": "@openspace/site-kit/images-manifest",
} as const;

export type EntrypointName = keyof typeof ENTRYPOINTS;
