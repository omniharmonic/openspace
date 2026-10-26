import { esc } from "@openspace/email-render";
import type { Page, SiteDocument } from "@openspace/schema";
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { getSite, getSiteForUser } from "../db/sites";
import { sha256Hex } from "../lib/crypto";
import { clientIp, parseFields, rateKeyIp, single } from "../lib/public";
import { requireHmacKey } from "../public-env";
import { verifyJwt } from "../services/member-keys";
import {
  checkPagePassword,
  getMember,
  PREVIEW_MEMBER_COOKIE,
  PREVIEW_PASSWORD_COOKIE,
  PREVIEW_SESSION_TTL_SEC,
  readPreviewValue,
  signPreviewValue,
} from "../services/members";
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

function htmlPage(
  c: Context<AppEnv>,
  status: 401 | 403 | 404 | 429,
  title: string,
  message: string,
) {
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
  if (!page) return htmlPage(c, 404, "Page not found", "There's no page at this address.");
  if (mode === "published") {
    // Dev preview enforces the same gates as the Cloudflare site Worker (arch §9.4): gated content
    // is never served without a member session / the page password.
    const gated = await gate(c, page, basePath);
    if (gated) return gated;
  }
  const html = await c.var.services.renderer.renderPage({
    doc,
    page,
    mode,
    basePath,
    behaviorsBase: BEHAVIORS_BASE,
  });
  const isGated = !!(page.access?.members || page.access?.password || isMembersPath(page.slug));
  c.header(
    "Cache-Control",
    mode === "draft" ? "no-store" : isGated ? "private, no-store" : "public, max-age=10",
  );
  if (mode === "draft") c.header("X-Robots-Tag", "noindex");
  return c.html(html);
}

const PASSWORD_RULE = { name: "page-password", limit: 10, windowSec: 600 };
const PASSWORD_PAGE_RULE = { name: "page-password-page", limit: 100, windowSec: 600 };

// ---- dev preview gating (Task 18) -------------------------------------------------------------

const isMembersPath = (slug: string) => slug === "members" || slug.startsWith("members/");

function cookieAttrs(c: Context<AppEnv>, basePath: string, maxAge: number): string {
  return `Path=${basePath}/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${c.var.config.secureCookies ? "; Secure" : ""}`;
}

/** A path below this preview site (the only allowed post-sign-in destination). */
function previewReturn(basePath: string, raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (
    v.startsWith(`${basePath}/`) &&
    !v.includes("\\") &&
    !v.includes("//") &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: reject control characters
    !/[\u0000-\u001f]/.test(v)
  )
    return v;
  return `${basePath}/`;
}

async function memberSession(c: Context<AppEnv>, siteId: string): Promise<boolean> {
  const v = await readPreviewValue(c.var.services, siteId, getCookie(c, PREVIEW_MEMBER_COOKIE));
  if (!v || typeof v.sub !== "string") return false;
  const m = await getMember(c.var.services.db, siteId, v.sub);
  return m?.status === "active";
}

async function gate(c: Context<AppEnv>, page: Page, basePath: string): Promise<Response | null> {
  const siteId = basePath.split("/")[2] as string;
  const path = c.req.path;
  if (page.access?.members || isMembersPath(page.slug)) {
    if (await memberSession(c, siteId)) return null;
    const login = new URL(`${c.var.config.hubUrl}/m/${siteId}/login`);
    login.searchParams.set("return", path);
    c.header("Cache-Control", "private, no-store");
    return c.redirect(login.toString(), 303);
  }
  if (page.access?.password) {
    const v = await readPreviewValue(c.var.services, siteId, getCookie(c, PREVIEW_PASSWORD_COOKIE));
    if (Array.isArray(v?.pages) && (v.pages as unknown[]).includes(page.id)) return null;
    const error = c.req.query("os_password") === "error";
    c.header("Cache-Control", "private, no-store");
    return c.html(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(page.title)}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:28rem;margin:15vh auto;padding:0 16px;color:#1d1d1f}input,button{font:inherit;padding:8px 12px}</style></head><body><h1>${escapeHtml(page.title)}</h1><p>This page is protected. Enter the password to continue.</p><form method="post" action="${esc(`${basePath}/_os/auth/password`)}"><input type="hidden" name="page" value="${esc(page.id)}"><input type="hidden" name="return" value="${esc(path)}"><label for="os-pw">Password</label><br><input id="os-pw" name="password" type="password" required autocomplete="current-password"${error ? ' aria-invalid="true" aria-describedby="os-pw-error"' : ""}>${error ? '<p id="os-pw-error">That password didn&#39;t work. Try again.</p>' : ""} <button type="submit">Continue</button></form></body></html>`,
      401,
    );
  }
  return null;
}

/** Magic-link landing for the dev preview: what the site Worker's `/_os/auth/callback` does. */
previewRoutes.get("/s/:siteId/_os/auth/callback", async (c) => {
  const siteId = c.req.param("siteId");
  const basePath = `/s/${siteId}`;
  const site = await getSite(c.var.services.db, siteId);
  const claims = site
    ? await verifyJwt(c.var.services, c.req.query("token") ?? "", { audience: siteId })
    : null;
  const member =
    claims && typeof claims.sub === "string"
      ? await getMember(c.var.services.db, siteId, claims.sub)
      : null;
  if (member?.status !== "active")
    return htmlPage(
      c,
      401,
      "Sign-in link",
      "This sign-in link has expired or isn't valid. Please request a new one.",
    );
  const value = await signPreviewValue(c.var.services, siteId, { sub: member.id });
  c.header(
    "Set-Cookie",
    `${PREVIEW_MEMBER_COOKIE}=${value}; ${cookieAttrs(c, basePath, PREVIEW_SESSION_TTL_SEC)}`,
  );
  c.header("Cache-Control", "private, no-store");
  return c.redirect(previewReturn(basePath, c.req.query("return")), 303);
});

previewRoutes.post("/s/:siteId/_os/auth/password", async (c) => {
  const siteId = c.req.param("siteId");
  const basePath = `/s/${siteId}`;
  const f = await parseFields(c);
  const pageId = single(f.page) ?? "";
  const back = previewReturn(basePath, single(f.return));
  // Password guessing: per visitor (IPv4 / IPv6 /64) and a ceiling per page.
  const who = (
    await sha256Hex(`${requireHmacKey(c.var.services.pub.config)}|${rateKeyIp(clientIp(c))}`)
  ).slice(0, 24);
  for (const [key, rule] of [
    [`${siteId}|${who}`, PASSWORD_RULE],
    [`${siteId}|${pageId}|*`, PASSWORD_PAGE_RULE],
  ] as const) {
    const rate = await c.var.services.pub.rateLimit.hit(key, rule);
    if (!rate.ok) {
      c.header("Retry-After", String(rate.retryAfter));
      return htmlPage(c, 429, "Too many attempts", "Please wait a few minutes and try again.");
    }
  }
  const row = /^pg_[0-9a-z]{10}$/.test(pageId)
    ? await c.var.services.db
        .prepare("SELECT hash FROM page_passwords WHERE site_id = ? AND page_id = ?")
        .bind(siteId, pageId)
        .first<{ hash: string }>()
    : null;
  if (!row || !(await checkPagePassword(single(f.password) ?? "", row.hash)))
    return c.redirect(`${back}${back.includes("?") ? "&" : "?"}os_password=error`, 303);
  const prev = await readPreviewValue(
    c.var.services,
    siteId,
    getCookie(c, PREVIEW_PASSWORD_COOKIE),
  );
  const pages = [
    ...new Set([...(Array.isArray(prev?.pages) ? (prev.pages as string[]) : []), pageId]),
  ].slice(-50);
  const value = await signPreviewValue(c.var.services, siteId, { pages });
  c.header(
    "Set-Cookie",
    `${PREVIEW_PASSWORD_COOKIE}=${value}; ${cookieAttrs(c, basePath, PREVIEW_SESSION_TTL_SEC)}`,
  );
  return c.redirect(back.replace(/[?&]os_password=error/, ""), 303);
});

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
