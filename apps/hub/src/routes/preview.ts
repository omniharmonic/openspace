import { esc } from "@omniharmonic/openspace-email-render";
import {
  componentPreview,
  type ImageMap,
  parseComponentPreviewPath,
  type ResolvedImage,
} from "@omniharmonic/openspace-renderer";
import { COLOR_THEMES, type Page, type SiteDocument } from "@omniharmonic/openspace-schema";
import { type Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { getSite, getSiteForUser, type SiteRow } from "../db/sites";
import { getUserRow, toUser } from "../db/users";
import { DRAFT_BRANCH, MAIN_BRANCH, parseRepo } from "../github/types";
import { base64url, sha256Hex, timingSafeEqual } from "../lib/crypto";
import { clientIp, parseFields, rateKeyIp, single } from "../lib/public";
import { requireHmacKey } from "../public-env";
import { roomStub, unwrapRoom } from "../room";
import { gatedContext, isGatedPage, readOpenedDocumentFiles } from "../services/gated-content";
import { verifyJwt } from "../services/member-keys";
import {
  checkPagePassword,
  getMember,
  type MemberRow,
  PREVIEW_MEMBER_COOKIE,
  PREVIEW_PASSWORD_COOKIE,
  PREVIEW_SESSION_TTL_SEC,
  readPreviewValue,
  signPreviewValue,
} from "../services/members";
import { escapeHtml, type RenderMode } from "../services/renderer";
import { verifyShotToken } from "../services/screenshots";
import { loadSiteDocument } from "../services/site-files";
import { readSiteDocument } from "../services/sites";
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
    // The published site (`/s/`) is a dev stand-in for GitHub Pages: with real GitHub, Pages
    // serves it (and reading every file from GitHub per request would be too slow). Templates
    // (`/t/`, bundled in the Hub) and drafts (`/p/`, read from the DraftRoom) work everywhere.
    if (c.req.path.startsWith("/s/") && !c.var.config.useDevGitHub) return c.notFound();
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
  givenImageMap?: ImageMap,
) {
  let imageMap = givenImageMap;
  const renderer = c.var.services.renderer;
  const now = new Date(c.var.services.now());
  const found = renderer.findPage({ doc, path, now });
  if (!found) return htmlPage(c, 404, "Page not found", "There's no page at this address.");
  const page = found.page;
  const isGated = isGatedPage(page);
  if (mode === "published") {
    // Dev preview enforces the same gates as the Cloudflare site Worker (arch §9.4): gated content
    // is never served without a member session / the page password.
    const gated = await gate(c, page, basePath);
    if (gated) return gated;
    // Images only gated pages use are served with a signature (sandboxed pages send no cookies).
    if (isGated && !imageMap)
      imageMap = await signedImageMap(c, basePath.split("/")[2] as string, doc, "s", "gated-media");
  }
  const html = await renderer.renderPage({
    doc,
    path,
    mode,
    basePath,
    hubUrl: c.var.config.hubUrl,
    now,
    ...(imageMap ? { imageMap } : {}),
  });
  if (html === null) return htmlPage(c, 404, "Page not found", "There's no page at this address.");
  c.header(
    "Cache-Control",
    mode === "draft" ? "no-store" : isGated ? "private, no-store" : "public, max-age=10",
  );
  if (mode === "draft") c.header("X-Robots-Tag", "noindex");
  return c.html(html);
}

// ---- media in previews --------------------------------------------------------------------------

/** Draft media URLs are signed: sandboxed preview pages have an opaque origin and send no cookies. */
const MEDIA_URL_TTL_MS = 60 * 60 * 1000;

async function mediaSignature(
  c: Context<AppEnv>,
  siteId: string,
  path: string,
  exp: number,
  purpose: "draft-media" | "gated-media" = "draft-media",
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireHmacKey(c.var.services.pub.config)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${purpose}|${siteId}|${path}|${exp}`),
  );
  return base64url(new Uint8Array(mac)).slice(0, 32);
}

/** Image map for a draft: every repo image → a signed `/p/:id/media/…` URL (an hour, aligned). */
const draftImageMap = (c: Context<AppEnv>, siteId: string, doc: SiteDocument) =>
  signedImageMap(c, siteId, doc, "p", "draft-media");

/** Every repo image → a signed `/<p|s>/:id/media/…?exp&sig` URL (an hour, aligned). */
async function signedImageMap(
  c: Context<AppEnv>,
  siteId: string,
  doc: SiteDocument,
  prefix: "p" | "s",
  purpose: "draft-media" | "gated-media",
): Promise<ImageMap> {
  const now = c.var.services.now();
  const exp = Math.ceil((now + MEDIA_URL_TTL_MS) / MEDIA_URL_TTL_MS) * MEDIA_URL_TTL_MS;
  const map: Record<string, ResolvedImage> = {};
  for (const [path, meta] of Object.entries(doc.media ?? {})) {
    if (meta.kind !== "image" || !meta.width || !meta.height) continue;
    const sig = await mediaSignature(c, siteId, path, exp, purpose);
    map[path] = {
      src: `/${prefix}/${siteId}/${path}?exp=${exp}&sig=${sig}`,
      width: meta.width,
      height: meta.height,
      ...(meta.placeholder ? { placeholder: meta.placeholder } : {}),
    };
  }
  return map;
}

const MEDIA_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  mp4: "video/mp4",
  webm: "video/webm",
};

async function serveRepoMedia(
  c: Context<AppEnv>,
  site: SiteRow,
  path: string,
  branch: string,
  cache: string,
) {
  if (!/^media\/[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(path) || path.includes(".."))
    return c.notFound();
  const owner = await getUserRow(c.var.services.db, site.owner_id);
  const gh = c.var.services.github({ site, user: owner ? toUser(owner) : null });
  const repo = parseRepo(site.repo);
  const ref = (await gh.getRef(repo, branch)) ? branch : MAIN_BRANCH;
  const bytes = await gh.readFileBytes(repo, path, ref);
  if (!bytes) return c.notFound();
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return new Response(bytes, {
    headers: {
      "Content-Type": MEDIA_TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": cache,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      // Preview pages are sandboxed (opaque origin): let them load the bytes.
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}

/**
 * Published media (`/s/:id/media/…`): public, like the live site's files — except files only
 * members-only / password pages use, which need the signed URL the (gate-checked) page carries.
 */
previewRoutes.get("/s/:siteId/media/*", async (c) => {
  const site = await getSite(c.var.services.db, c.req.param("siteId"));
  if (!site || site.archived_at !== null) return c.notFound();
  const path = restPath(c, `/s/${site.id}/`);
  const { doc } = await readSiteDocument(c.var.services, site, "published");
  if (gatedOnlyMedia(doc).has(path)) {
    const exp = Number(c.req.query("exp") ?? "0");
    const sig = c.req.query("sig") ?? "";
    if (
      !Number.isFinite(exp) ||
      exp < c.var.services.now() ||
      !(await timingSafeEqual(sig, await mediaSignature(c, site.id, path, exp, "gated-media")))
    )
      return c.notFound();
    return serveRepoMedia(c, site, path, MAIN_BRANCH, "private, max-age=600");
  }
  return serveRepoMedia(c, site, path, MAIN_BRANCH, "public, max-age=60");
});

/** Draft media (`/p/:id/media/…?exp&sig`): a signed URL from the draft preview's image map. */
previewRoutes.get("/p/:siteId/media/*", async (c) => {
  const site = await getSite(c.var.services.db, c.req.param("siteId"));
  if (!site || site.archived_at !== null) return c.notFound();
  const path = restPath(c, `/p/${site.id}/`);
  const exp = Number(c.req.query("exp") ?? "0");
  const sig = c.req.query("sig") ?? "";
  if (
    !Number.isFinite(exp) ||
    exp < c.var.services.now() ||
    !(await timingSafeEqual(sig, await mediaSignature(c, site.id, path, exp)))
  )
    return c.notFound();
  return serveRepoMedia(c, site, path, DRAFT_BRANCH, "private, max-age=600");
});

const PASSWORD_RULE = { name: "page-password", limit: 10, windowSec: 600 };
const PASSWORD_PAGE_RULE = { name: "page-password-page", limit: 300, windowSec: 600 };

// ---- dev preview gating (Task 18) -------------------------------------------------------------

const isMembersPath = (slug: string) => slug === "members" || slug.startsWith("members/");

/** `media/…` paths a JSON value mentions. */
function mediaPaths(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (/^media\/[A-Za-z0-9]/.test(value)) into.add(value.split(/[?#]/)[0] as string);
  } else if (Array.isArray(value)) for (const v of value) mediaPaths(v, into);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) mediaPaths(v, into);
  return into;
}

/** Media used only by members-only / password pages (never by anything public). */
export function gatedOnlyMedia(doc: SiteDocument): Set<string> {
  const gated = new Set<string>();
  const open = new Set<string>();
  for (const page of Object.values(doc.pages)) mediaPaths(page, isGatedPage(page) ? gated : open);
  mediaPaths(doc.site, open);
  mediaPaths(doc.styles, open);
  mediaPaths(doc.collections, open);
  for (const p of open) gated.delete(p);
  return gated;
}

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

/**
 * The signed-in member (purpose-bound `member` cookie; a page-password cookie never counts),
 * re-checked against the directory on every request: blocked or deleted members lose access at
 * once, and tier changes apply immediately.
 */
async function memberSession(c: Context<AppEnv>, siteId: string): Promise<MemberRow | null> {
  const v = await readPreviewValue(c.var.services, siteId, getCookie(c, PREVIEW_MEMBER_COOKIE));
  if (v?.kind !== "member" || typeof v.sub !== "string") return null;
  const m = await getMember(c.var.services.db, siteId, v.sub);
  return m?.status === "active" ? m : null;
}

async function gate(c: Context<AppEnv>, page: Page, basePath: string): Promise<Response | null> {
  const siteId = basePath.split("/")[2] as string;
  const path = c.req.path;
  if (page.access?.members || isMembersPath(page.slug)) {
    const member = await memberSession(c, siteId);
    c.header("Cache-Control", "private, no-store");
    if (member) {
      const tiers = page.access?.tiers ?? [];
      if (!tiers.length || (member.tier !== null && tiers.includes(member.tier))) return null;
      return htmlPage(c, 403, page.title, "This page is for members on another membership plan.");
    }
    const login = new URL(`${c.var.config.hubUrl}/m/${siteId}/login`);
    login.searchParams.set("return", path);
    return c.redirect(login.toString(), 303);
  }
  if (page.access?.password) {
    const v = await readPreviewValue(c.var.services, siteId, getCookie(c, PREVIEW_PASSWORD_COOKIE));
    if (v?.kind === "pw" && Array.isArray(v.pages) && (v.pages as unknown[]).includes(page.id))
      return null;
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
  const value = await signPreviewValue(c.var.services, siteId, { kind: "member", sub: member.id });
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
  // Password guessing: per visitor (IPv4 / IPv6 /64), plus a ceiling per real protected page
  // (only once the page id is known to have a password, so junk ids can't burn a real page's
  // budget or create limiter state).
  const who = (
    await sha256Hex(`${requireHmacKey(c.var.services.pub.config)}|${rateKeyIp(clientIp(c))}`)
  ).slice(0, 24);
  const hasPage =
    /^pg_[0-9a-z]{10}$/.test(pageId) &&
    !!(await c.var.services.db
      .prepare("SELECT 1 AS x FROM page_passwords WHERE site_id = ? AND page_id = ?")
      .bind(siteId, pageId)
      .first());
  const rules: Array<readonly [string, typeof PASSWORD_RULE]> = [
    [`${siteId}|${who}`, PASSWORD_RULE],
  ];
  if (hasPage) rules.push([`${siteId}|${pageId}|*`, PASSWORD_PAGE_RULE]);
  for (const [key, rule] of rules) {
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
    ...new Set([
      ...(prev?.kind === "pw" && Array.isArray(prev.pages) ? (prev.pages as string[]) : []),
      pageId,
    ]),
  ].slice(-50);
  const value = await signPreviewValue(c.var.services, siteId, { kind: "pw", pages });
  c.header(
    "Set-Cookie",
    `${PREVIEW_PASSWORD_COOKIE}=${value}; ${cookieAttrs(c, basePath, PREVIEW_SESSION_TTL_SEC)}`,
  );
  return c.redirect(back.replace(/[?&]os_password=error/, ""), 303);
});

const behavior = async (c: Context<AppEnv>) => {
  const file = c.req.param("file") ?? "";
  const name = file.endsWith(".js") ? file.slice(0, -3) : file;
  if (!/^[a-z0-9-]+$/.test(name)) return c.notFound();
  const source = await c.var.services.renderer.behavior(name);
  if (source === null) return c.notFound();
  return c.body(source, 200, {
    "Content-Type": "text/javascript; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=300",
    // Module scripts are CORS fetches; sandboxed preview pages have an opaque origin.
    "Access-Control-Allow-Origin": "*",
  });
};
previewRoutes.get(`${BEHAVIORS_BASE}/:file`, behavior);
// Rendered pages load behaviors from `<basePath>/_os/behaviors/` (as on a published site).
previewRoutes.get(`/s/:siteId${BEHAVIORS_BASE}/:file`, behavior);
previewRoutes.get(`/p/:siteId${BEHAVIORS_BASE}/:file`, behavior);
previewRoutes.get(`/t/:templateId${BEHAVIORS_BASE}/:file`, behavior);

const published = async (c: Context<AppEnv>) => {
  const siteId = c.req.param("siteId") as string;
  const site = await getSite(c.var.services.db, siteId);
  if (!site || site.archived_at !== null)
    return htmlPage(c, 404, "Site not found", "This site doesn't exist or was deleted.");
  const version = c.req.query("version");
  if (version !== undefined) {
    // Studio history preview (`/s/:id/?version=<sha>`): a version that was published (a commit on
    // main), rendered like the live site. Never cached, never indexed.
    const doc = await readPublishedVersion(c, site, version);
    if (!doc)
      return htmlPage(c, 404, "Version not found", "That version of the site doesn't exist.");
    const res = await render(c, doc, restPath(c, `/s/${siteId}`), "published", `/s/${siteId}`);
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.set("X-Robots-Tag", "noindex");
    return res;
  }
  const snap = await readSiteDocument(c.var.services, site, "published");
  return render(c, snap.doc, restPath(c, `/s/${siteId}`), "published", `/s/${siteId}`);
};

/** The document of a published version (a sha or unique prefix on main's history), or null. */
async function readPublishedVersion(
  c: Context<AppEnv>,
  site: SiteRow,
  version: string,
): Promise<SiteDocument | null> {
  const wanted = version.toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(wanted)) return null;
  const owner = await getUserRow(c.var.services.db, site.owner_id);
  const gh = c.var.services.github({ site, user: owner ? toUser(owner) : null });
  const repo = parseRepo(site.repo);
  const history = await gh.listCommits(repo, { ref: MAIN_BRANCH, limit: 200 });
  const matches = history.filter((h) => h.sha.startsWith(wanted));
  if (matches.length !== 1 || !matches[0]) return null;
  const files = await readOpenedDocumentFiles(
    gatedContext(c.var.services, site.id),
    gh,
    repo,
    matches[0].sha,
  );
  return loadSiteDocument(files);
}
previewRoutes.get("/s/:siteId", published);
previewRoutes.get("/s/:siteId/*", published);

const draft = async (c: Context<AppEnv>) => {
  const siteId = c.req.param("siteId") as string;
  const user = c.var.user;
  // The MCP screenshot browser carries a short-lived token bound to this site (never a session).
  const shot = c.req.query("os_shot");
  const viaShot =
    !user &&
    !!shot &&
    (await verifyShotToken(
      requireHmacKey(c.var.services.pub.config),
      siteId,
      shot,
      c.var.services.now(),
    ));
  if (!user && !viaShot)
    return htmlPage(
      c,
      401,
      "Sign in to preview",
      "Draft previews are only for people working on this site.",
    );
  const site = user
    ? await getSiteForUser(c.var.services.db, siteId, user.id)
    : await getSite(c.var.services.db, siteId);
  if (!site || site.archived_at !== null)
    return htmlPage(c, 404, "Site not found", "This site doesn't exist or you don't have access.");
  // The live draft (the room's document, including edits not yet saved to the draft branch).
  const { doc } = await unwrapRoom(roomStub(c.env, siteId).getDocument(siteId));
  const rest = restPath(c, `/p/${siteId}`);
  // A custom component on its own (`/_os/component/<name>/`): MCP preview_component screenshots.
  const component = parseComponentPreviewPath(rest, new URL(c.req.url).searchParams);
  if (component) {
    if (!doc.components?.[component.name])
      return htmlPage(c, 404, "Component not found", "This site has no component by that name.");
    const preview = componentPreview(doc, component.name, {
      ...(component.fields ? { fields: component.fields } : {}),
      ...(component.colorTheme && (COLOR_THEMES as readonly string[]).includes(component.colorTheme)
        ? { colorTheme: component.colorTheme as (typeof COLOR_THEMES)[number] }
        : {}),
    });
    return render(
      c,
      preview.doc,
      `/${preview.page.slug}/`,
      "draft",
      `/p/${siteId}`,
      await draftImageMap(c, siteId, preview.doc),
    );
  }
  return render(c, doc, rest, "draft", `/p/${siteId}`, await draftImageMap(c, siteId, doc));
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
