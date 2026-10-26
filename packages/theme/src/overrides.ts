import type { DtcgGroup, DtcgToken, DtcgValue } from "@openspace/schema";
import { isColor } from "./color";
import { cssVar } from "./vars";

export interface FlatToken {
  /** Path segments, e.g. `["type", "display", "letterSpacing"]`. */
  path: string[];
  token: DtcgToken;
  /** `$type` from the token or the nearest enclosing group. */
  type: string | undefined;
}

const isToken = (v: unknown): v is DtcgToken =>
  typeof v === "object" && v !== null && !Array.isArray(v) && "$value" in v;

/** Flatten a DTCG group into tokens (sorted by path for deterministic output). */
export function flattenDtcg(group: DtcgGroup | undefined): FlatToken[] {
  const out: FlatToken[] = [];
  const walk = (node: DtcgGroup, path: string[], inherited: string | undefined) => {
    const groupType = typeof node.$type === "string" ? node.$type : inherited;
    for (const key of Object.keys(node).sort()) {
      if (key.startsWith("$")) continue;
      const child = node[key];
      if (isToken(child)) {
        out.push({ path: [...path, key], token: child, type: child.$type ?? groupType });
      } else if (typeof child === "object" && child !== null) {
        walk(child as DtcgGroup, [...path, key], groupType);
      }
    }
  };
  if (group) walk(group, [], undefined);
  return out;
}

const ALIAS_RE = /\{([^{}]+)\}/g;
/** A value that is exactly one alias, e.g. `{color.accent-500}`. */
export const SOLE_ALIAS_RE = /^\{([^{}]+)\}$/;

/** `{color.accent-500}` → `var(--os-color-accent-500)` */
export function resolveAliases(value: string): string {
  return value.replace(ALIAS_RE, (_, ref: string) => cssVar(...ref.split(".")));
}

/** Rejects anything that could escape a declaration or fetch remote resources. */
const UNSAFE_RE = /[;{}<>\\]|\/\*|\*\/|url\s*\(|expression\s*\(|@import|!important|javascript:/i;

export function isSafeCssValue(value: string): boolean {
  return value.trim().length > 0 && !UNSAFE_RE.test(value);
}

const UNIT_RE = /^(px|rem|em|%|vw|vh|svh|dvh|ch|ex|ms|s|deg|fr)$/;
const quoteFamily = (f: string) =>
  /^[a-z-]+$/i.test(f) || f.startsWith('"') ? f : `"${f.replace(/"/g, "")}"`;

function shadowLayer(v: DtcgValue): string | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const parts = ["offsetX", "offsetY", "blur", "spread"].map((k) => {
    const p = v[k];
    return p === undefined ? "0" : scalar(p, "dimension");
  });
  const color = v.color;
  if (parts.some((p) => p === null) || typeof color !== "string") return null;
  const layer = `${parts.join(" ")} ${resolveAliases(color)}`;
  return v.inset === true ? `inset ${layer}` : layer;
}

function scalar(v: DtcgValue, type: string | undefined): string | null {
  if (typeof v === "string") return resolveAliases(v.trim());
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    if (type === "dimension") return v === 0 ? "0" : `${v}px`;
    if (type === "duration") return `${v}ms`;
    return String(v);
  }
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    // DTCG 2025 object form: { value, unit }
    const { value, unit } = v as { value?: unknown; unit?: unknown };
    if (typeof value === "number" && typeof unit === "string" && UNIT_RE.test(unit)) {
      return `${value}${unit}`;
    }
  }
  return null;
}

/**
 * Convert a DTCG `$value` to a CSS value, or `null` if it can't be represented safely.
 * Composite `typography` tokens are expanded by the caller.
 */
export function dtcgToCss(value: DtcgValue, type: string | undefined): string | null {
  let out: string | null = null;
  if (Array.isArray(value)) {
    if (type === "cubicBezier" && value.length === 4 && value.every((n) => typeof n === "number")) {
      out = `cubic-bezier(${value.join(", ")})`;
    } else if (type === "fontFamily" || value.every((x) => typeof x === "string")) {
      out = value.map((f) => (typeof f === "string" ? quoteFamily(f) : "")).join(", ");
    } else if (type === "shadow") {
      const layers = value.map(shadowLayer);
      out = layers.every((l) => l !== null) ? layers.join(", ") : null;
    }
  } else if (type === "shadow") {
    out = shadowLayer(value);
  } else if (type === "fontFamily" && typeof value === "string") {
    out = value.includes(",") ? value : quoteFamily(value);
  } else {
    out = scalar(value, type);
  }
  if (out === null || !isSafeCssValue(out)) return null;
  if (type === "color" && !out.startsWith("var(") && !isColor(out)) return null;
  return out;
}
