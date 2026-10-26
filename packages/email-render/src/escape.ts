/** Escaping + URL safety helpers. Everything user-controlled passes through here. */

const HTML_ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape text for HTML text nodes and quoted attribute values. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESC[c] as string);
}

// Strip control chars and bidi overrides that could be used for spoofing.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional
const CONTROL_RE = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/g;

/** Single-line text (subjects, headers): collapse control chars and whitespace. */
export function oneLine(value: unknown): string {
  return String(value ?? "")
    .replace(CONTROL_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolve a link to an absolute, safe URL. Only http(s) and mailto survive; root-relative
 * paths (and bare `media/...` paths) are joined onto `baseUrl`. Anything else (javascript:,
 * data:, tel:, protocol-relative, unparseable) returns `null`.
 */
export function safeUrl(href: unknown, baseUrl?: string): string | null {
  if (typeof href !== "string") return null;
  const raw = href.replace(CONTROL_RE, "").trim();
  if (!raw) return null;
  if (/^mailto:/i.test(raw)) return /^mailto:[^\s<>"]+$/i.test(raw) ? raw : null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      if (!u.hostname) return null;
      return u.toString();
    } catch {
      return null;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//") || raw.startsWith("\\")) {
    return null;
  }
  if (!baseUrl) return null;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "http:" && base.protocol !== "https:") return null;
    const prefix = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
    const rel = raw.startsWith("/") ? raw.slice(1) : raw;
    const u = new URL(`${base.origin}${prefix}${rel}`);
    return u.toString();
  } catch {
    return null;
  }
}

/** Only `#rgb`/`#rrggbb`/`rgb()/hsl()` colors may be interpolated into style attributes. */
export function safeColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  return /^#[0-9a-f]{3,8}$/i.test(v) || /^(?:rgb|hsl)a?\([0-9.,%\s/]+\)$/i.test(v) ? v : fallback;
}
