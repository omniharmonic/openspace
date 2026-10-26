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
        headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS";
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

/** JSON response wanted (fetch from the behaviors) vs. a no-JS HTML form post (redirect). */
export function wantsJson(c: Context): boolean {
  const accept = c.req.header("accept") ?? "";
  const type = c.req.header("content-type") ?? "";
  return accept.includes("application/json") || type.includes("application/json");
}

const MAX_BODY = 256 * 1024;

/**
 * Parse urlencoded, multipart or JSON bodies into field → value(s). `name[]` keys (checkbox
 * groups, multi-selects) become arrays under `name`. File parts are dropped (no FR-30 field type
 * accepts files; uploads would go to R2 via presigned URLs).
 */
export async function parseFields(c: Context): Promise<FieldValues> {
  const len = Number(c.req.header("content-length") ?? 0);
  if (len > MAX_BODY) throw new HttpError(413, "too_large", "That submission is too large.");
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
    if (type.includes("application/json") || type.startsWith("text/plain")) {
      const text = await c.req.text();
      if (text.length > MAX_BODY)
        throw new HttpError(413, "too_large", "That submission is too large.");
      const body = text ? (JSON.parse(text) as unknown) : {};
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new HttpError(400, "invalid_request", "Expected a JSON object.");
      for (const [k, v] of Object.entries(body)) add(k, v);
    } else if (
      type.includes("multipart/form-data") ||
      type.includes("application/x-www-form-urlencoded")
    ) {
      const form = await c.req.formData();
      for (const [k, v] of form.entries()) if (typeof v === "string") add(k, v);
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
  const basePath = base.pathname.replace(/\/+$/, "");
  let target: URL | null = null;
  const tryAbsolute = (s: string | null) => {
    if (!s) return null;
    try {
      const u = new URL(s);
      return allowed.includes(u.origin) || u.origin === base.origin ? u : null;
    } catch {
      return null;
    }
  };
  if (source && /^\/(?!\/)/.test(source) && !source.includes("\\")) {
    const path =
      basePath && (source === basePath || source.startsWith(`${basePath}/`))
        ? source
        : `${basePath}${source}`;
    target = new URL(path, base.origin);
  } else target = tryAbsolute(source) ?? tryAbsolute(referer) ?? new URL(base.href);
  target.searchParams.set(param, status);
  const a = anchor && /^[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(anchor) ? anchor : null;
  target.hash = a ? a : "";
  return target.toString();
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
export function publicErrors(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    const err = c.error;
    if (err instanceof HttpError && err.status < 500) {
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
    }
  };
}
