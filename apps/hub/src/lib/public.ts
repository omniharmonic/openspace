/**
 * Helpers for the public, per-site endpoints called from published sites (`/f`, `/n`, `/a`).
 *
 * - CORS allowlist = the site's origins (deploy URL, custom domain ± www). In dev, also the Hub
 *   and Studio, and `Origin: null` (sandboxed dev previews at /s and /p send an opaque origin).
 * - Responses use the shape the renderer's form/newsletter behaviors read —
 *   `{ ok, message?, redirect?, errors? }` — plus the Hub's `error: { code, message }` envelope.
 */
import type { Context, MiddlewareHandler } from "hono";
import { getSite, type SiteRow } from "../db/sites";
import type { HubConfig } from "../env";
import type { AppEnv } from "../types";
import { siteOrigins } from "./cors";
import { HttpError } from "./errors";

export type FieldValues = Record<string, string | string[]>;

/** Active (not archived) site for a public route, or 404. */
export async function publicSite(db: D1Database, siteId: string): Promise<SiteRow> {
  const site = /^st_[0-9a-z]{4,40}$/.test(siteId) ? await getSite(db, siteId) : null;
  if (!site || site.archived_at)
    throw new HttpError(404, "not_found", "This site isn't accepting submissions.");
  return site;
}

export function allowedOrigins(site: Pick<SiteRow, "url" | "domain">, config: HubConfig): string[] {
  return siteOrigins(site, config);
}

/**
 * Whether a request's Origin may use this site's public endpoints. Absent origins (curl, some
 * no-JS posts) are allowed — Turnstile, honeypot, rate limits and quotas still apply. `null`
 * (sandboxed or privacy-redirected documents) is allowed too; concrete foreign origins are not.
 */
export function originAllowed(
  origin: string | undefined,
  site: Pick<SiteRow, "url" | "domain">,
  config: HubConfig,
): boolean {
  if (!origin || origin === "null") return true;
  return allowedOrigins(site, config).includes(origin);
}

/** Non-credentialed CORS for `/:prefix/:siteId…` public routes. */
export function publicSiteCors(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const origin = c.req.header("origin");
    const siteId = c.req.param("siteId");
    let allow: string | null = null;
    if (origin) {
      if (origin === "null") allow = c.var.config.devMode ? "null" : null;
      else if (siteId) {
        const site = await getSite(c.var.services.db, siteId).catch(() => null);
        if (site && allowedOrigins(site, c.var.config).includes(origin)) allow = origin;
      }
    }
    if (c.req.method === "OPTIONS") {
      const headers: Record<string, string> = { Vary: "Origin" };
      if (allow) {
        headers["Access-Control-Allow-Origin"] = allow;
        headers["Access-Control-Allow-Methods"] = "POST, GET, PUT, OPTIONS";
        headers["Access-Control-Allow-Headers"] = "Content-Type, Accept";
        headers["Access-Control-Max-Age"] = "600";
      }
      return new Response(null, { status: 204, headers });
    }
    await next();
    c.res.headers.append("Vary", "Origin");
    if (allow) c.res.headers.set("Access-Control-Allow-Origin", allow);
  };
}

export function clientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "0.0.0.0"
  );
}

/** Expand an IPv6 address to 8 hextets (no zone, no embedded IPv4). Null if it isn't one. */
function expandIpv6(ip: string): string[] | null {
  const addr = ip.split("%")[0]?.toLowerCase() ?? "";
  if (!addr.includes(":") || !/^[0-9a-f:.]+$/.test(addr)) return null;
  const [head = "", tail, ...rest] = addr.split("::");
  if (rest.length) return null;
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  if (tail === undefined && h.length !== 8) return null;
  const fill = 8 - h.length - t.length;
  if (fill < 0) return null;
  return [...h, ...Array(tail === undefined ? 0 : fill).fill("0"), ...t].map((x) =>
    x.replace(/^0+(?=.)/, ""),
  );
}

/**
 * The rate-limit identity of a client: the IPv4 address, or the IPv6 /64 prefix (one household
 * or device usually controls a whole /64, so per-address keys are trivially evaded).
 */
export function rateKeyIp(ip: string): string {
  // IPv4-mapped IPv6 (`::ffff:1.2.3.4`, `0:0:0:0:0:ffff:1.2.3.4`) is the IPv4 client: key by it,
  // so the same visitor can't get a second budget by switching notation.
  const mapped = ip
    .trim()
    .toLowerCase()
    .match(/^(?:0{0,4}:){0,5}:?(?:0{0,4}:)?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1] as string;
  const v6 = expandIpv6(ip);
  return v6 ? `${v6.slice(0, 4).join(":")}::/64` : ip;
}

/** JSON response wanted (fetch from the behaviors) vs. a no-JS HTML form post (redirect). */
export function wantsJson(c: Context): boolean {
  const accept = c.req.header("accept") ?? "";
  const type = c.req.header("content-type") ?? "";
  return accept.includes("application/json") || type.includes("application/json");
}

const MAX_BODY = 256 * 1024;

/**
 * Parse urlencoded, multipart or JSON bodies into field → value(s). `name[]` keys (checkbox
 * groups, multi-selects) become arrays under `name`. File parts are dropped unless `opts.files`
 * collects them (no-JS form uploads; the JS path uploads to R2 through presigned URLs first).
 */
/** Read at most `max` bytes of the body, failing as soon as the stream exceeds it. */
export async function readBodyLimited(req: Request, max = MAX_BODY): Promise<Uint8Array> {
  const tooLarge = () => new HttpError(413, "too_large", "That submission is too large.");
  if (Number(req.headers.get("content-length") ?? 0) > max) throw tooLarge();
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const ch of chunks) {
    out.set(ch, at);
    at += ch.byteLength;
  }
  return out;
}

export async function parseFields(
  c: Context,
  opts: {
    /** Body size limit (default 256 KB). */
    max?: number;
    /** Collects multipart file parts (no-JS form uploads); otherwise they are dropped. */
    files?: Map<string, File>;
  } = {},
): Promise<FieldValues> {
  const type = (c.req.header("content-type") ?? "").toLowerCase();
  const out: FieldValues = {};
  const add = (rawKey: string, value: unknown) => {
    const isArray = rawKey.endsWith("[]");
    const key = isArray ? rawKey.slice(0, -2) : rawKey;
    if (!key || key.length > 64) return;
    const values = (Array.isArray(value) ? value : [value])
      .filter((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      .map((v) => String(v).slice(0, 20_000));
    if (!values.length) return;
    const prev = out[key];
    if (isArray || Array.isArray(value) || prev !== undefined) {
      out[key] = [...(prev === undefined ? [] : Array.isArray(prev) ? prev : [prev]), ...values];
    } else out[key] = values[0] as string;
  };
  try {
    const bytes = await readBodyLimited(c.req.raw, opts.max);
    if (type.includes("application/json") || type.startsWith("text/plain")) {
      const text = new TextDecoder().decode(bytes);
      const body = text ? (JSON.parse(text) as unknown) : {};
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new HttpError(400, "invalid_request", "Expected a JSON object.");
      for (const [k, v] of Object.entries(body)) add(k, v);
    } else if (
      type.includes("multipart/form-data") ||
      type.includes("application/x-www-form-urlencoded")
    ) {
      const form = await new Response(bytes, {
        headers: { "Content-Type": c.req.header("content-type") ?? "" },
      }).formData();
      for (const [k, v] of form.entries()) {
        if (typeof v === "string") add(k, v);
        else if (opts.files && v.size > 0 && k.length <= 64) opts.files.set(k, v);
      }
    } else {
      throw new HttpError(
        415,
        "unsupported_media_type",
        "Send the form as a normal form post or JSON.",
      );
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "invalid_request", "We couldn't read that submission.");
  }
  return out;
}

export function single(v: string | string[] | undefined): string | null {
  if (v === undefined) return null;
  return Array.isArray(v) ? (v[v.length - 1] ?? null) : v;
}

/**
 * Where a no-JS post returns to: the page it came from (`_source`, a path below the site or an
 * absolute URL on one of the site's origins), with `?<param>=<status>#<anchor>`. Never redirects
 * to a foreign origin.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: strip control characters
const CONTROL_RE = /[\u0000-\u001f\u007f]/g;

/** Remove characters URL parsers silently drop (tab, CR, LF and other controls) before checks. */
export function cleanUrlInput(s: string | null | undefined): string | null {
  if (!s) return null;
  const v = s.replace(CONTROL_RE, "").trim();
  return v || null;
}

/** A site-relative path joined below the site's base path, or null if it isn't one. */
export function sitePath(baseUrl: string, raw: string | null): URL | null {
  const source = cleanUrlInput(raw);
  if (!source || !/^\/(?![/\\])/.test(source) || source.includes("\\")) return null;
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  const path =
    basePath && (source === basePath || source.startsWith(`${basePath}/`))
      ? source
      : `${basePath}${source}`;
  try {
    const u = new URL(path, base.origin);
    return u.origin === base.origin ? u : null;
  } catch {
    return null;
  }
}

/**
 * Where a no-JS post returns to: the page it came from (`_source`, a path below the site or an
 * absolute URL on one of the site's origins), with `?<param>=<status>#<anchor>`. Never redirects
 * to a foreign origin: the final URL's origin is checked after it is built.
 */
export function returnUrl(
  baseUrl: string,
  allowed: string[],
  source: string | null,
  referer: string | null,
  param: string,
  status: string,
  anchor?: string | null,
): string {
  const base = new URL(baseUrl);
  const ok = (u: URL) =>
    (u.protocol === "https:" || u.protocol === "http:") &&
    (u.origin === base.origin || allowed.includes(u.origin));
  const tryAbsolute = (raw: string | null) => {
    const s = cleanUrlInput(raw);
    if (!s || !/^https?:\/\//i.test(s)) return null;
    try {
      const u = new URL(s);
      return ok(u) ? u : null;
    } catch {
      return null;
    }
  };
  let target = sitePath(baseUrl, source) ?? tryAbsolute(source) ?? tryAbsolute(referer);
  if (!target || !ok(target)) target = new URL(base.href);
  target.searchParams.set(param, status);
  const a = anchor && /^[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(anchor) ? anchor : null;
  target.hash = a ? a : "";
  return target.toString();
}

/**
 * Per-request return info for no-JS posts (set once the body is parsed) so `publicErrors` can
 * redirect rejections back to the page. Keyed weakly by the request object.
 */
const noJsReturn = new WeakMap<Request, { source: string | null; anchor: string | null }>();

export function rememberReturn(c: Context, source: string | null, anchor: string | null) {
  noJsReturn.set(c.req.raw, { source, anchor });
}

export interface PublicFailure {
  status: 400 | 403 | 404 | 413 | 415 | 422 | 429;
  code: string;
  message: string;
  errors?: Record<string, string>;
}

export function failureBody(f: PublicFailure) {
  return {
    ok: false,
    message: f.message,
    ...(f.errors ? { errors: f.errors } : {}),
    error: { code: f.code, message: f.message, ...(f.errors ? { details: f.errors } : {}) },
  };
}

/** Run `p` after the response when the runtime allows it; inline otherwise (tests, app.request). */
export function background(c: Context<AppEnv>, p: Promise<unknown>): Promise<void> {
  const safe = p.then(
    () => undefined,
    (err) => c.var.log?.warn("background task failed", { err }),
  );
  try {
    c.executionCtx.waitUntil(safe);
    return Promise.resolve();
  } catch {
    return safe;
  }
}

/**
 * Re-shape Hub errors on public routes into what the site behaviors read (`message`, `errors`)
 * while keeping the `error` envelope.
 */
export function publicErrors(
  param?: "os_form" | "os_newsletter" | "os_member" | "os_checkout",
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    const err = c.error;
    if (!(err instanceof HttpError) || err.status >= 500) return;
    if (param && c.req.method === "POST" && !wantsJson(c)) {
      const siteId = c.req.param("siteId");
      const site = siteId ? await getSite(c.var.services.db, siteId).catch(() => null) : null;
      if (site) {
        let kept = noJsReturn.get(c.req.raw);
        if (!kept && !c.req.raw.bodyUsed) {
          // Rejected before the handler read the body (e.g. quota middleware): recover the
          // return path from the form post itself.
          const f = await parseFields(c).catch(() => null);
          if (f)
            kept = {
              source: single(f._source) ?? single(f.source),
              anchor: single(f._anchor),
            };
        }
        const base = siteBaseUrlOf(site, c.var.config.hubUrl);
        const location = returnUrl(
          base,
          allowedOrigins(site, c.var.config),
          kept?.source ?? null,
          c.req.header("referer") ?? null,
          param,
          "error",
          kept?.anchor ?? null,
        );
        c.res = undefined;
        c.res = new Response(null, { status: 303, headers: { Location: location } });
        return;
      }
    }
    const details =
      err.details && typeof err.details === "object" && !Array.isArray(err.details)
        ? (err.details as Record<string, string>)
        : undefined;
    const res = new Response(
      JSON.stringify(
        failureBody({
          status: err.status as PublicFailure["status"],
          code: err.code,
          message: err.message,
          ...(details ? { errors: details } : {}),
        }),
      ),
      { status: err.status, headers: { "Content-Type": "application/json; charset=UTF-8" } },
    );
    for (const [k, v] of c.res.headers)
      if (k.toLowerCase().startsWith("access-control") || k === "vary" || k === "retry-after")
        res.headers.set(k, v);
    c.res = undefined;
    c.res = res;
  };
}

/** Same as `services/email#siteBaseUrl` (kept here to avoid a lib → services import). */
function siteBaseUrlOf(site: Pick<SiteRow, "url" | "domain">, hubUrl: string): string {
  if (site.url) return site.url.endsWith("/") ? site.url : `${site.url}/`;
  if (site.domain) return `https://${site.domain}/`;
  return `${hubUrl}/`;
}

/** Hostnames a site is served from (Turnstile `hostname` must be one of them). */
export function siteHostnames(site: Pick<SiteRow, "url" | "domain">, config: HubConfig): string[] {
  return allowedOrigins(site, config).map((o) => new URL(o).hostname);
}

let turnstileWarned = false;

/** Warn (once per isolate) when a production Hub has no Turnstile secret configured. */
export function warnMissingTurnstile(c: Context<AppEnv>) {
  if (turnstileWarned || c.var.config.devMode || c.var.services.pub.config.turnstile.secret) return;
  turnstileWarned = true;
  c.var.log.warn(
    "TURNSTILE_SECRET is not set: public forms and signups rely on the honeypot, rate limits and quotas only",
  );
}
