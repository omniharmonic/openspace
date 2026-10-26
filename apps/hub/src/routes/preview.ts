import type { SiteDocument } from "@openspace/schema";
import { type Context, Hono } from "hono";
import { getSite, getSiteForUser } from "../db/sites";
import { escapeHtml, type RenderMode } from "../services/renderer";
import { loadSiteDocument } from "../services/site-files";
import { findPageBySlug, readSiteDocument } from "../services/sites";
import type { AppEnv } from "../types";

/**
 * Dev preview server: a "live site" without GitHub Pages.
 *
 * - `GET /s/:siteId/*` — the published version (main)
 * - `GET /p/:siteId/*` — the draft (`os/draft`), collaborators only
 * - `GET /t/:templateId/*?look=` — a template, for the gallery
 * - `GET /_os/behaviors/:name.js` — behavior modules referenced by rendered pages
 */
export const previewRoutes = new Hono<AppEnv>();

const BEHAVIORS_BASE = "/_os/behaviors";

/**
 * Rendered site pages are owner content served from the Hub's origin. A CSP sandbox without
 * `allow-same-origin` gives them an opaque origin, so they can never read Hub cookies or call
 * credentialed Hub APIs, while still running behaviors, opening links and submitting forms.
 */
export const PREVIEW_CSP = "sandbox allow-scripts allow-popups allow-forms";

for (const prefix of ["/s/*", "/p/*", "/t/*"]) {
  previewRoutes.use(prefix, async (c, next) => {
    // Dev preview only: with real GitHub, sites are served by Pages (and reading every file per
    // request would be too slow until Task 15's DraftRoom caching).
    if (!c.var.config.useDevGitHub) return c.notFound();
    await next();
    c.header("Content-Security-Policy", PREVIEW_CSP);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
  });
}

function htmlPage(c: Context<AppEnv>, status: 401 | 403 | 404, title: string, message: string) {
  return c.html(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:560px;margin:15vh auto;padding:0 16px;color:#1d1d1f}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`,
    status,
  );
}

function restPath(c: Context<AppEnv>, prefix: string): string {
  const path = decodeURIComponent(c.req.path);
  return path.length > prefix.length ? path.slice(prefix.length) : "";
}

async function render(
  c: Context<AppEnv>,
  doc: SiteDocument,
  path: string,
  mode: RenderMode,
  basePath: string,
) {
  const page = findPageBySlug(doc, path);
  if (!page || (mode === "published" && page.access?.password))
    return htmlPage(c, 404, "Page not found", "There's no page at this address.");
  const html = await c.var.services.renderer.renderPage({
    doc,
    page,
    mode,
    basePath,
    behaviorsBase: BEHAVIORS_BASE,
  });
  c.header("Cache-Control", mode === "draft" ? "no-store" : "public, max-age=10");
  if (mode === "draft") c.header("X-Robots-Tag", "noindex");
  return c.html(html);
}

const published = async (c: Context<AppEnv>) => {
  const siteId = c.req.param("siteId") as string;
  const site = await getSite(c.var.services.db, siteId);
  if (!site || site.archived_at !== null)
    return htmlPage(c, 404, "Site not found", "This site doesn't exist or was deleted.");
  const snap = await readSiteDocument(c.var.services, site, "published");
  return render(c, snap.doc, restPath(c, `/s/${siteId}`), "published", `/s/${siteId}`);
};
previewRoutes.get("/s/:siteId", published);
previewRoutes.get("/s/:siteId/*", published);

const draft = async (c: Context<AppEnv>) => {
  const siteId = c.req.param("siteId") as string;
  const user = c.var.user;
  if (!user)
    return htmlPage(
      c,
      401,
      "Sign in to preview",
      "Draft previews are only for people working on this site.",
    );
  const site = await getSiteForUser(c.var.services.db, siteId, user.id);
  if (!site)
    return htmlPage(c, 404, "Site not found", "This site doesn't exist or you don't have access.");
  const snap = await readSiteDocument(c.var.services, site, "draft", user);
  return render(c, snap.doc, restPath(c, `/p/${siteId}`), "draft", `/p/${siteId}`);
};
previewRoutes.get("/p/:siteId", draft);
previewRoutes.get("/p/:siteId/*", draft);

const template = async (c: Context<AppEnv>) => {
  const id = c.req.param("templateId") as string;
  const tpl = await c.var.services.templates.load(id);
  if (!tpl) return htmlPage(c, 404, "Template not found", "That template doesn't exist.");
  const doc = loadSiteDocument(tpl.files);
  const lookId = c.req.query("look");
  const look = tpl.meta.looks.find((l) => l.id === lookId) ?? tpl.meta.looks[0];
  // Preview only (nothing is persisted): show the template in the chosen look.
  const previewDoc: SiteDocument = look ? { ...doc, styles: look.styles } : doc;
  return render(c, previewDoc, restPath(c, `/t/${id}`), "template", `/t/${id}`);
};
previewRoutes.get("/t/:templateId", template);
previewRoutes.get("/t/:templateId/*", template);

previewRoutes.get(`${BEHAVIORS_BASE}/:file`, async (c) => {
  const file = c.req.param("file");
  const name = file.endsWith(".js") ? file.slice(0, -3) : file;
  if (!/^[a-z0-9-]+$/.test(name)) return c.notFound();
  const source = await c.var.services.renderer.behavior(name);
  if (source === null) return c.notFound();
  return c.body(source, 200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=300",
  });
});
