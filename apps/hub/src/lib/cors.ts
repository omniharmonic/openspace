import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { SiteRow } from "../db/sites";
import type { HubConfig } from "../env";

function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Origins allowed to call credentialed Studio APIs (/api/*, /auth/*): Studio only. The Hub's own
 * origin is deliberately excluded — it serves owner content (sandboxed dev previews).
 */
export function studioOrigins(config: HubConfig): string[] {
  return [config.studioOrigin];
}

/** Credentialed CORS for Studio. */
export function studioCors(config: HubConfig): MiddlewareHandler {
  const allowed = studioOrigins(config);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    credentials: true,
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  });
}

/**
 * Origins a published site's public calls may come from (forms, newsletter, analytics):
 * its deploy URL, its custom domain (and www.) and, in dev, the Hub preview and Studio.
 */
export function siteOrigins(site: Pick<SiteRow, "url" | "domain">, config: HubConfig): string[] {
  const out = new Set<string>();
  const deploy = originOf(site.url);
  if (deploy) out.add(deploy);
  if (site.domain) {
    out.add(`https://${site.domain}`);
    out.add(
      site.domain.startsWith("www.")
        ? `https://${site.domain.slice(4)}`
        : `https://www.${site.domain}`,
    );
  }
  if (config.devMode) {
    out.add(config.studioOrigin);
    const hub = originOf(config.hubUrl);
    if (hub) out.add(hub);
  }
  return [...out];
}

/** Non-credentialed CORS for public per-site routes (`/f/:siteId/…` etc., Task 16). */
export function siteCors(
  config: HubConfig,
  lookup: (siteId: string) => Promise<Pick<SiteRow, "url" | "domain"> | null>,
): MiddlewareHandler {
  return async (c, next) => {
    const siteId = c.req.param("siteId");
    const site = siteId ? await lookup(siteId) : null;
    const allowed = site ? siteOrigins(site, config) : [];
    return cors({
      origin: (origin) => (allowed.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
      maxAge: 600,
    })(c, next);
  };
}
