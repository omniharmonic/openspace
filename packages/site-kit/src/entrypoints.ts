/**
 * Module specifiers Astro resolves from the site project for routes the integration injects.
 * This is the single table `openspace eject` rewrites to project-relative paths (it replaces
 * every `@omniharmonic/openspace-site-kit/...` literal below), so keep it a plain object of string literals.
 */
export const ENTRYPOINTS = {
  "cloudflare/gated": "@omniharmonic/openspace-site-kit/cloudflare/gated",
  "cloudflare/auth-callback": "@omniharmonic/openspace-site-kit/cloudflare/auth-callback",
  "cloudflare/password": "@omniharmonic/openspace-site-kit/cloudflare/password",
  "images-manifest": "@omniharmonic/openspace-site-kit/images-manifest",
} as const;

export type EntrypointName = keyof typeof ENTRYPOINTS;
