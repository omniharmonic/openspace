/**
 * Security headers on every Hub response (HSTS, nosniff, Referrer-Policy, CSP with
 * frame-ancestors). Routes that set their own CSP keep it — the Hub's HTML pages (`lib/page.ts`,
 * MCP consent pages) and the sandboxed site previews (`/s/`, `/p/`, `/t/`), which Studio frames.
 * WebSocket upgrades (101) are left untouched: their headers are immutable.
 */
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../types";
import { studioOrigins } from "./cors";

/** API / JSON / file responses: nothing may load or frame them. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
/** HTML without its own policy: no framing, no plugins, no base tag tricks. */
export const HTML_FALLBACK_CSP = "frame-ancestors 'none'; base-uri 'none'; object-src 'none'";

const PREVIEW_PREFIXES = ["/s/", "/p/", "/t/"];

export function securityHeaders(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await next();
    const res = c.res;
    if (res.status === 101 || (res as Response & { webSocket?: unknown }).webSocket) return;
    const h = res.headers;
    try {
      if (c.var.config.secureCookies && !h.has("Strict-Transport-Security"))
        h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      if (!h.has("X-Content-Type-Options")) h.set("X-Content-Type-Options", "nosniff");
      if (!h.has("Referrer-Policy")) h.set("Referrer-Policy", "strict-origin-when-cross-origin");
      const path = c.req.path;
      const preview = PREVIEW_PREFIXES.some((p) => path.startsWith(p));
      const csp = h.get("Content-Security-Policy");
      if (preview) {
        // Studio frames template, draft and dev-site previews; nobody else may.
        const ancestors = `frame-ancestors 'self' ${studioOrigins(c.var.config).join(" ")}`;
        if (csp && !csp.includes("frame-ancestors"))
          h.set("Content-Security-Policy", `${csp}; ${ancestors}`);
        return;
      }
      if (!csp) {
        const html = (h.get("Content-Type") ?? "").includes("text/html");
        h.set("Content-Security-Policy", html ? HTML_FALLBACK_CSP : API_CSP);
      }
      if (!h.has("X-Frame-Options")) h.set("X-Frame-Options", "DENY");
    } catch {
      // Immutable headers (a passthrough Response): leave them as they are.
    }
  };
}
