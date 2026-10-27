/** Small, self-contained HTML pages the Hub serves to visitors (confirm, unsubscribe). */
import { esc } from "@omniharmonic/openspace-email-render";

export function publicPage(opts: {
  title: string;
  heading: string;
  body: string;
  /** Raw HTML appended after the paragraph (already escaped by the caller). */
  extraHtml?: string;
  link?: { href: string; label: string } | null;
}): string {
  const link =
    opts.link && /^https?:\/\//.test(opts.link.href)
      ? `<p><a class="btn" href="${esc(opts.link.href)}">${esc(opts.link.label)}</a></p>`
      : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(opts.title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f7f6f3;--fg:#1d1c1a;--muted:#5c5a55;--card:#fff;--line:#e3e1dc;--accent:#2f5d50}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#f1efe9;--muted:#b3b0a8;--card:#1f1f1d;--line:#34332f;--accent:#8cc5b2}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
main{max-width:480px;width:100%;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:32px}
h1{font-size:22px;line-height:1.3;margin:0 0 12px}p{margin:0 0 16px;color:var(--muted)}
.btn,button{display:inline-block;background:var(--accent);color:var(--card);border:0;border-radius:999px;padding:10px 20px;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
button:focus-visible,.btn:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
</style></head><body><main><h1>${esc(opts.heading)}</h1><p>${esc(opts.body)}</p>${opts.extraHtml ?? ""}${link}</main></body></html>`;
}

export const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-store",
};

/**
 * For pages whose form POST answers with a redirect to another origin (DevStripe → the shop,
 * magic link → the site's callback). Browsers apply `form-action` to redirect targets, so it is
 * left out; the forms post to the page's own URL.
 */
export const PAGE_HEADERS_REDIRECTING = {
  ...PAGE_HEADERS,
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
};
