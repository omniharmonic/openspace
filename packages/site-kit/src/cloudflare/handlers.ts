/**
 * Request handlers for the Cloudflare target's dynamic routes (arch §9.4): gated pages
 * (`/members/*` and pages flagged `access.members` / `access.password`), the magic-link
 * landing `/_os/auth/callback` and the shared-password form `/_os/auth/password`. Pure
 * functions of `(request, env, context)` so they are testable without workerd; the Astro
 * endpoints in `./endpoints` bind them to `cloudflare:workers`' env.
 *
 * Worker environment:
 * - `OS_SESSION_SECRET` (secret, ≥ 32 chars) signs the site's own session cookies.
 * - `OS_GATED` (R2 bucket) holds gated page JSON at `pages/<slug>.json` — gated content is never
 *   in the public repo.
 * - `OS_PAGE_PASSWORDS` (secret) JSON `{ "<pageId>": "pbkdf2$…" }` from `hashPagePassword`.
 * - `ASSETS` (static assets binding) serves `/_os/images.json`, the build-time image map that
 *   gives gated pages' local images the same responsive sources as static pages.
 *
 * Magic-link replay: the callback is stateless, so a sign-in link works until its `exp`. The Hub
 * issues these tokens with a short expiry (minutes) for exactly that reason; the resulting
 * session lives in the site's own signed cookie.
 *
 * Misconfiguration (no session secret, Hub keys unreachable) answers 503 with a plain notice,
 * never a misleading "your link expired" or a raw 500.
 */
import { escapeHtml, type ImageMap } from "@openspace/renderer";
import { type Page, PageSchema, type SiteDocument } from "@openspace/schema";
import type { DeployLocation } from "../deploy";
import { stableId } from "../ids";
import { collectionsContextValueFor, renderDocument, type SiteAssets } from "../render";
import { publishableDoc } from "../routes";
import {
  checkPagePassword,
  GateConfigError,
  GateError,
  getCookie,
  type Jwk,
  MEMBER_COOKIE,
  PASSWORD_COOKIE,
  readSigned,
  SESSION_TTL,
  safeReturnPath,
  sessionSecretOk,
  setCookie,
  signValue,
  verifyHubToken,
} from "./gate";

export interface R2Like {
  get(key: string): Promise<{ text(): Promise<string> } | null>;
}

export interface AssetsLike {
  fetch(request: Request | string): Promise<Response>;
}

export interface GateEnv {
  OS_SESSION_SECRET?: string;
  OS_GATED?: R2Like;
  OS_PAGE_PASSWORDS?: string;
  ASSETS?: AssetsLike;
}

export interface GateContext {
  /** The full source document (gated pages included). */
  doc: SiteDocument;
  location: DeployLocation;
  assets?: SiteAssets;
  fontStylesheets?: string[] | undefined;
  hubUrl?: string | undefined;
  turnstileSiteKey?: string | undefined;
  /** Image map override (tests); default: `/_os/images.json` from the ASSETS binding. */
  imageMap?: ImageMap;
  /** Fetch the Hub's JWKS (injected for tests; default `fetch(<hub>/.well-known/jwks.json)`). */
  fetchJwks?: () => Promise<{ keys: Jwk[] }>;
  now?: number;
}

const PRIVATE = { "cache-control": "private, no-store" };

const redirect = (location: string, cookies: string[] = []) => {
  const headers = new Headers({ location, ...PRIVATE });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 303, headers });
};

/** Site-relative slug of a request path: `/repo/members/plans/` → `members/plans`. */
export function slugFromPath(pathname: string, basePath: string): string {
  let p = pathname;
  if (basePath && (p === basePath || p.startsWith(`${basePath}/`))) p = p.slice(basePath.length);
  return p.replace(/^\/+|\/+$/g, "").replace(/\/index\.html$/, "");
}

/** The gated page for a slug: R2 first (`pages/<slug>.json`), then the document. */
export async function findGatedPage(
  slug: string,
  env: GateEnv,
  doc: SiteDocument,
): Promise<Page | undefined> {
  const obj = await env.OS_GATED?.get(`pages/${slug || "home"}.json`);
  if (obj) {
    const parsed = PageSchema.safeParse(JSON.parse(await obj.text()));
    if (parsed.success) return parsed.data;
  }
  const page = Object.values(doc.pages).find((p) => p.slug === slug);
  if (page) return page;
  // `/members/*` pages that only exist in R2 are members-only by definition.
  return undefined;
}

function hubOrigin(doc: SiteDocument) {
  return doc.config.hub.replace(/\/+$/, "");
}

let manifest: Promise<ImageMap> | undefined;

/** The build-time image map (`/_os/images.json`), loaded once per Worker isolate. */
async function imageManifest(request: Request, env: GateEnv, ctx: GateContext): Promise<ImageMap> {
  if (ctx.imageMap) return ctx.imageMap;
  if (!env.ASSETS) return {};
  manifest ??= env.ASSETS.fetch(
    new URL(`${ctx.location.basePath}/_os/images.json`, request.url).toString(),
  )
    .then((r) => (r.ok ? (r.json() as Promise<ImageMap>) : {}))
    .catch(() => {
      manifest = undefined;
      return {};
    });
  return manifest;
}

function renderGated(ctx: GateContext, page: Page, imageMap: ImageMap, extraMain?: string): string {
  const now = new Date(ctx.now ?? Date.now());
  const live = publishableDoc(ctx.doc, now);
  // Gated pages are never part of the static document; add this one so its links resolve.
  const doc = { ...live, pages: { ...live.pages, [page.id]: page } } as SiteDocument;
  const html = renderDocument({
    doc,
    page,
    location: ctx.location,
    imageMap,
    ...(ctx.assets ? { assets: ctx.assets } : {}),
    ...(ctx.fontStylesheets ? { fontStylesheets: ctx.fontStylesheets } : {}),
    ...(ctx.hubUrl ? { hubUrl: ctx.hubUrl } : {}),
    ...(ctx.turnstileSiteKey ? { turnstileSiteKey: ctx.turnstileSiteKey } : {}),
    collections: collectionsContextValueFor(doc, now),
    extraHead: '<meta name="robots" content="noindex">',
  });
  return extraMain ? html.replace("</main>", `${extraMain}</main>`) : html;
}

const htmlResponse = (html: string, status = 200) =>
  new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...PRIVATE },
  });

/** 503 for a Worker that isn't fully set up (the owner fixes it in Studio → Settings). */
export function unavailable(what: string): Response {
  return htmlResponse(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Temporarily unavailable</title><p>${escapeHtml(what)} isn’t available right now. Please try again later.</p></html>`,
    503,
  );
}

async function passwordPages(
  cookieHeader: string | null,
  env: GateEnv,
  ctx: GateContext,
): Promise<string[]> {
  const v = await readSigned(
    getCookie(cookieHeader, PASSWORD_COOKIE),
    env.OS_SESSION_SECRET ?? "",
    ctx.now,
  );
  return Array.isArray(v?.pages) ? (v.pages as string[]) : [];
}

/** Serve a gated page: members need a valid session, password pages a remembered password. */
export async function handleGatedPage(
  request: Request,
  env: GateEnv,
  ctx: GateContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (!sessionSecretOk(env.OS_SESSION_SECRET)) return unavailable("This page");
  const slug = slugFromPath(url.pathname, ctx.location.basePath);
  const page = await findGatedPage(slug, env, ctx.doc);
  const membersOnly =
    !page || page.access?.members || slug === "members" || slug.startsWith("members/");
  if (!page) return htmlResponse("<!doctype html><title>Not found</title><p>Not found.</p>", 404);
  const cookies = request.headers.get("cookie");
  if (membersOnly) {
    const session = await readSigned(
      getCookie(cookies, MEMBER_COOKIE),
      env.OS_SESSION_SECRET ?? "",
      ctx.now,
    );
    if (!session) {
      const login = new URL(`${hubOrigin(ctx.doc)}/m/${ctx.doc.config.siteId}/login`);
      login.searchParams.set("return", url.pathname);
      return redirect(login.toString());
    }
    return htmlResponse(renderGated(ctx, page, await imageManifest(request, env, ctx)));
  }
  // Password page.
  const unlocked = await passwordPages(cookies, env, ctx);
  if (unlocked.includes(page.id))
    return htmlResponse(renderGated(ctx, page, await imageManifest(request, env, ctx)));
  const error = url.searchParams.get("os_password") === "error";
  const prompt: Page = {
    id: stableId("pg", `password:${page.id}`),
    title: page.title,
    slug: page.slug,
    seo: { noindex: true },
    sections: [],
  };
  const form = `<section class="os-section os-theme-light"><div class="os-container" style="max-width:28rem;margin:auto;padding:4rem 1rem">
<h1 class="os-type-h2">${escapeHtml(page.title)}</h1>
<p>This page is protected. Enter the password to continue.</p>
<form class="os-form" method="post" action="${escapeHtml(`${ctx.location.basePath}/_os/auth/password`)}">
<input type="hidden" name="page" value="${escapeHtml(page.id)}">
<input type="hidden" name="return" value="${escapeHtml(url.pathname)}">
<label class="os-label" for="os-pw">Password</label>
<input class="os-input" id="os-pw" name="password" type="password" required autocomplete="current-password"${error ? ' aria-invalid="true" aria-describedby="os-pw-error"' : ""}>
${error ? '<p class="os-field__error" id="os-pw-error">That password didn’t work. Try again.</p>' : ""}
<button class="os-button os-button--primary" type="submit">Continue</button>
</form></div></section>`;
  return htmlResponse(renderGated(ctx, prompt, {}, form), error ? 401 : 200);
}

/** POST `/_os/auth/password`: check the shared password and remember the unlocked page. */
export async function handlePasswordSubmit(
  request: Request,
  env: GateEnv,
  ctx: GateContext,
): Promise<Response> {
  if (!sessionSecretOk(env.OS_SESSION_SECRET)) return unavailable("This page");
  const form = await request.formData();
  const pageId = String(form.get("page") ?? "");
  const password = String(form.get("password") ?? "");
  const back = safeReturnPath(String(form.get("return") ?? ""), ctx.location.basePath);
  let hashes: Record<string, string> = {};
  try {
    hashes = JSON.parse(env.OS_PAGE_PASSWORDS ?? "{}") as Record<string, string>;
  } catch {
    hashes = {};
  }
  if (!(await checkPagePassword(password, hashes[pageId]))) {
    return redirect(`${back}${back.includes("?") ? "&" : "?"}os_password=error`);
  }
  const pages = new Set(await passwordPages(request.headers.get("cookie"), env, ctx));
  pages.add(pageId);
  const token = await signValue(
    { pages: [...pages] },
    env.OS_SESSION_SECRET ?? "",
    SESSION_TTL,
    ctx.now,
  );
  return redirect(back, [
    setCookie(PASSWORD_COOKIE, token, { maxAge: SESSION_TTL, path: `${ctx.location.basePath}/` }),
  ]);
}

/** GET `/_os/auth/callback?token=…&return=…`: verify the Hub's magic-link token, start a session. */
export async function handleAuthCallback(
  request: Request,
  env: GateEnv,
  ctx: GateContext,
): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const back = safeReturnPath(url.searchParams.get("return"), ctx.location.basePath);
  if (!token)
    return htmlResponse(
      "<!doctype html><title>Sign-in link</title><p>This sign-in link is incomplete.</p>",
      400,
    );
  if (!sessionSecretOk(env.OS_SESSION_SECRET)) return unavailable("Signing in");
  const hub = hubOrigin(ctx.doc);
  let jwks: { keys: Jwk[] };
  try {
    jwks = await (
      ctx.fetchJwks ??
      (async () => {
        const r = await fetch(`${hub}/.well-known/jwks.json`);
        if (!r.ok) throw new Error(`JWKS ${r.status}`);
        return (await r.json()) as { keys: Jwk[] };
      })
    )();
    if (!Array.isArray(jwks?.keys)) throw new Error("JWKS has no keys");
  } catch {
    return unavailable("Signing in");
  }
  try {
    const claims = await verifyHubToken(token, jwks, {
      issuer: new URL(hub).origin,
      audience: ctx.doc.config.siteId,
      ...(ctx.now !== undefined ? { now: ctx.now } : {}),
    });
    const session = await signValue(
      {
        sub: claims.sub,
        ...(claims.tier ? { tier: claims.tier } : {}),
        ...(claims.email ? { email: claims.email } : {}),
      },
      env.OS_SESSION_SECRET ?? "",
      SESSION_TTL,
      ctx.now,
    );
    return redirect(back, [
      setCookie(MEMBER_COOKIE, session, { maxAge: SESSION_TTL, path: `${ctx.location.basePath}/` }),
    ]);
  } catch (e) {
    if (e instanceof GateConfigError) return unavailable("Signing in");
    if (e instanceof GateError)
      return htmlResponse(
        `<!doctype html><title>Sign-in link</title><p>This sign-in link has expired or isn’t valid (${escapeHtml(e.message)}). Please request a new one.</p>`,
        401,
      );
    throw e;
  }
}
