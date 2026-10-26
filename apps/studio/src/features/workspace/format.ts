/** Formatting helpers shared by the content, marketing and commerce surfaces. */

/** Digits after the decimal point for a currency (JPY 0, USD 2, …). */
export function currencyDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** Minor units → "$24.00". */
export function money(minor: number, currency: string, locale?: string): string {
  const digits = currencyDigits(currency);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
      minor / 10 ** digits,
    );
  } catch {
    return `${(minor / 10 ** digits).toFixed(digits)} ${currency}`;
  }
}

/** "24", "24.5", "24.50" (major units, as typed) → minor units; null when not a number. */
export function parseMoney(text: string, currency: string): number | null {
  const cleaned = text
    .replace(/[^\d.,-]/g, "")
    .replace(/,(?=\d{3}\b)/g, "")
    .replace(",", ".");
  if (!cleaned || !/^-?\d*(?:\.\d*)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 10 ** currencyDigits(currency));
}

/** Minor units → "24.00" for an input field. */
export function moneyInput(minor: number | null | undefined, currency: string): string {
  if (minor === null || minor === undefined) return "";
  const d = currencyDigits(currency);
  return (minor / 10 ** d).toFixed(d);
}

export function number(n: number): string {
  return new Intl.NumberFormat().format(n);
}

/** 1234 → "1.2k" for tight places (axis ticks, tiles). */
export function compact(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
    n,
  );
}

export function percent(fraction: number, digits = 1): string {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(fraction);
}

export function date(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(
    undefined,
    opts ?? { day: "numeric", month: "short", year: "numeric" },
  );
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "just now", "5 min ago", "yesterday", "3 days ago", else a date. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.round((now - t) / 1000);
  if (s < 0) return date(iso);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 2 * 86_400) return "yesterday";
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} days ago`;
  return date(iso);
}

/** Seconds → "45:10" or "1:02:03". */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(r).padStart(2, "0")}`;
}

/** "45:10", "1:02:03", "2710", "45m" → seconds (null when unreadable). */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const hm = /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/i.exec(t);
  if (hm && (hm[1] || hm[2] || hm[3]))
    return Number(hm[1] ?? 0) * 3600 + Number(hm[2] ?? 0) * 60 + Number(hm[3] ?? 0);
  const parts = t.split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isInteger(p) || p < 0) || parts.length > 3) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/** "contact-form" → "Contact form". */
export function humanize(key: string): string {
  const s = key.replace(/[-_]+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : key;
}
