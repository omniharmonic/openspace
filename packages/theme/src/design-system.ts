/**
 * Design-system import (Start with Claude): read a design-token file in whatever shape it comes —
 * W3C Design Tokens (DTCG), Style Dictionary, Tokens Studio / Figma Tokens, a Canva brand kit
 * export, or a plain hand-written JSON like `{ color: {…}, font: {…}, type: {…}, space: {…} }` —
 * into the site's design-system record tokens, then map those tokens onto Site Styles (palette,
 * exact role colours as overrides, fonts per role, the type scale, page rhythm, shape, buttons),
 * with the contrast solver checking every pair and every change said in plain words.
 *
 * Pure: no network. Whether a font is on Google Fonts is answered by the caller (`isGoogleFont`).
 */
import {
  type DesignColor,
  type DesignFont,
  type DesignSystem,
  type DesignTokens,
  type DesignTypeStep,
  LayoutChoicesSchema,
  type Styles,
  type TypeScalePreset,
  type TypeStep,
  TypeStepSchema,
  type TypographyChoices,
  type WebFont,
} from "@omniharmonic/openspace-schema";
import { deltaEOK, isColor, oklchToHex, parseColor } from "./color";
import { compileStyles } from "./compile";
import { contrastRatio } from "./contrast";
import { type FontCategory, TYPE_PAIRINGS, type TypePairing } from "./pairings";

export type TokenFormat =
  | "dtcg"
  | "style-dictionary"
  | "tokens-studio"
  | "canva"
  | "figma"
  | "plain"
  | "css";

export interface ReadTokensResult {
  tokens: DesignTokens;
  format: TokenFormat;
  /** Plain sentences: what was read and what was left out. */
  notes: string[];
  /** Usage rules the file states (e.g. a "grounds" table: which label colour on which ground). */
  rules: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

interface Leaf {
  path: string[];
  value: unknown;
  type?: string;
  description?: string;
}

const META_KEYS = new Set([
  "type",
  "$type",
  "description",
  "$description",
  "comment",
  "attributes",
  "$extensions",
  "extensions",
  "name",
  "id",
  "filePath",
  "isSource",
  "original",
  "path",
]);

/** A Style Dictionary / Tokens Studio token: `{ value, type?, description? }` and nothing else. */
function isValueToken(o: Obj): boolean {
  if (!("value" in o)) return false;
  return Object.keys(o).every((k) => k === "value" || META_KEYS.has(k));
}

/** Flatten any token tree into leaves (paths), noting the format on the way. */
function flatten(input: unknown): { leaves: Leaf[]; format: TokenFormat } {
  const leaves: Leaf[] = [];
  let dtcg = false;
  let sd = false;
  let studio = false;
  let canva = false;
  const walk = (node: unknown, path: string[], inherited?: string) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => {
        if (typeof item === "string" || typeof item === "number")
          leaves.push({
            path: [...path, String(i + 1)],
            value: item,
            ...(inherited ? { type: inherited } : {}),
          });
        else if (isObj(item)) {
          // `[{ name, hex }]` (brand kits), `[{ name|family, usage }]` (font lists).
          const label =
            (typeof item.name === "string" && item.name) ||
            (typeof item.label === "string" && item.label) ||
            (typeof item.usage === "string" && item.usage) ||
            (typeof item.role === "string" && item.role) ||
            String(i + 1);
          const v =
            item.hex ?? item.color ?? item.value ?? item.$value ?? item.family ?? item.fontFamily;
          if (v !== undefined && (typeof v === "string" || typeof v === "number" || isObj(v))) {
            canva ||= "hex" in item || "family" in item;
            const isFont = "family" in item || "fontFamily" in item;
            leaves.push({
              path: [...path, label],
              value: v,
              ...(isFont ? { type: "fontFamily" } : inherited ? { type: inherited } : {}),
            });
          } else walk(item, [...path, label], inherited);
        }
      });
      return;
    }
    if (!isObj(node)) {
      if (node !== undefined && node !== null)
        leaves.push({ path, value: node, ...(inherited ? { type: inherited } : {}) });
      return;
    }
    if ("$value" in node) {
      dtcg = true;
      const type = typeof node.$type === "string" ? node.$type : inherited;
      leaves.push({
        path,
        value: node.$value,
        ...(type ? { type } : {}),
        ...(typeof node.$description === "string" ? { description: node.$description } : {}),
      });
      return;
    }
    if (isValueToken(node)) {
      const type = typeof node.type === "string" ? node.type : inherited;
      if (
        type &&
        /^(?:fontFamilies|fontWeights|lineHeights|letterSpacing|fontSizes|paragraphSpacing|textCase|borderRadius|boxShadow|spacing|sizing|typography)$/.test(
          type,
        )
      )
        studio = true;
      else sd = true;
      leaves.push({
        path,
        value: node.value,
        ...(type ? { type } : {}),
        ...(typeof node.description === "string" ? { description: node.description } : {}),
      });
      return;
    }
    const type = typeof node.$type === "string" ? node.$type : inherited;
    for (const [k, v] of Object.entries(node)) {
      if (k === "$themes" || k === "$metadata") {
        studio = true;
        continue;
      }
      if (k.startsWith("$")) continue;
      walk(v, [...path, k], type);
    }
  };
  walk(input, []);
  const format: TokenFormat = dtcg
    ? "dtcg"
    : studio
      ? "tokens-studio"
      : sd
        ? "style-dictionary"
        : canva
          ? "canva"
          : "plain";
  return { leaves, format };
}

/** Resolve `{group.token}` aliases (DTCG, Style Dictionary, Tokens Studio). */
function resolveAliases(leaves: Leaf[]): void {
  const byPath = new Map<string, Leaf>();
  for (const l of leaves) byPath.set(l.path.join(".").toLowerCase(), l);
  const resolve = (v: unknown, depth: number): unknown => {
    if (typeof v === "string") {
      const whole = /^\{([^{}]+)\}$/.exec(v.trim());
      if (whole && depth < 8) {
        const key = (whole[1] as string).replace(/\.value$/, "").toLowerCase();
        const hit = byPath.get(key);
        return hit ? resolve(hit.value, depth + 1) : v;
      }
      if (/\{[^{}]+\}/.test(v) && depth < 8)
        return v.replace(/\{([^{}]+)\}/g, (m, k: string) => {
          const hit = byPath.get(k.replace(/\.value$/, "").toLowerCase());
          const r = hit ? resolve(hit.value, depth + 1) : undefined;
          return typeof r === "string" || typeof r === "number" ? String(r) : m;
        });
      return v;
    }
    if (isObj(v)) {
      const out: Obj = {};
      for (const [k, x] of Object.entries(v)) out[k] = resolve(x, depth + 1);
      return out;
    }
    if (Array.isArray(v)) return v.map((x) => resolve(x, depth + 1));
    return v;
  };
  for (const l of leaves) l.value = resolve(l.value, 0);
}

// --- values ------------------------------------------------------------------------------------

const COLOR_RE =
  /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^()]*\))$/i;

/** A CSS colour → `#rrggbb` (alpha dropped), or undefined. */
export function colorHex(v: unknown): string | undefined {
  if (isObj(v)) {
    // DTCG 2025 colour objects: { colorSpace, components, hex? }.
    if (typeof v.hex === "string") return colorHex(v.hex);
    return undefined;
  }
  if (typeof v !== "string") return undefined;
  let s = v.trim().toLowerCase();
  if (!COLOR_RE.test(s)) return undefined;
  if (/^#[0-9a-f]{4}$/.test(s)) s = s.slice(0, 4);
  if (/^#[0-9a-f]{8}$/.test(s)) s = s.slice(0, 7);
  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(s);
  if (fn) {
    const parts = (fn[2] as string)
      .replace(/\s*\/\s*[\d.]+%?\s*$/, "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(0, 3);
    s = `${(fn[1] as string).replace(/a$/, "")}(${parts.join(", ")})`;
  }
  const ok = /^oklch|^oklab|^lab|^lch/.test(s) ? s.replace(/\s*\/\s*[\d.]+%?\s*\)$/, ")") : s;
  try {
    if (!isColor(ok)) return undefined;
    return oklchToHex(parseColor(ok));
  } catch {
    return undefined;
  }
}

/** `"96px"` → 96, `"1.5rem"` → 24, `12` → 12; `clamp()` → the largest size. */
export function pxValue(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (isObj(v)) {
    if ("value" in v && "unit" in v && typeof v.value === "number")
      return v.unit === "rem" || v.unit === "em" ? v.value * 16 : v.value;
    return undefined;
  }
  if (typeof v !== "string") return undefined;
  const all = [...v.matchAll(/(-?\d*\.?\d+)\s*(px|rem|em|pt)\b/g)].map((m) =>
    m[2] === "px" ? Number(m[1]) : m[2] === "pt" ? Number(m[1]) * (4 / 3) : Number(m[1]) * 16,
  );
  if (all.length) return Math.max(...all);
  const n = Number(v.trim());
  return Number.isFinite(n) && v.trim() !== "" ? n : undefined;
}

function pxMin(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const all = [...v.matchAll(/(-?\d*\.?\d+)\s*(px|rem|em)\b/g)].map((m) =>
    m[2] === "px" ? Number(m[1]) : Number(m[1]) * 16,
  );
  return all.length > 1 ? Math.min(...all) : undefined;
}

const GENERIC_FAMILY =
  /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-\w+|-apple-system|blinkmacsystemfont|segoe ui|helvetica(?: neue)?|arial|georgia|times(?: new roman)?|inherit|initial|courier(?: new)?|roboto|var\(.*)$/i;

/** First real family of a stack: `'EB Garamond', Georgia, serif` → `EB Garamond`. */
export function firstFamily(stack: unknown): string | undefined {
  const s = Array.isArray(stack) ? stack.join(", ") : typeof stack === "string" ? stack : "";
  const parts = s
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
  return parts.find((f) => !GENERIC_FAMILY.test(f)) ?? parts.find((f) => /roboto/i.test(f));
}

const SERIF_HINT =
  /serif|garamond|baskerville|caslon|playfair|lora|merriweather|georgia|times|bodoni|didot|freight(?! sans)|minion|crimson|cormorant|spectral|domine|prata|libre (?:baskerville|caslon)|tiempos|canela|ogg|recoleta|fraunces|newsreader|literata|gloock|abril|zilla|bitter|alegreya(?! sans)|ivar|lyon|sabon|cardo|vollkorn|instrument serif|dm serif|young serif|eb garamond|source serif|noto serif|pt serif|roboto slab|arvo|rockwell/i;

export function familyCategory(family: string): FontCategory {
  if (/mono|courier|code/i.test(family)) return "monospace";
  if (/sans|grotesk|grotesque|gothic/i.test(family)) return "sans-serif";
  return SERIF_HINT.test(family) ? "serif" : "sans-serif";
}

// --- classification ----------------------------------------------------------------------------

const lastName = (path: string[]) =>
  path
    .filter(
      (p) =>
        !/^(?:color|colors|colour|colours|palette|value|values|base|brand-?colors?|global|core|primitives?|semantic|tokens?|sys|ref)$/i.test(
          p,
        ),
    )
    .slice(-2)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || path.join("-").toLowerCase();

const isColorPath = (p: string) => /colou?r|palette|brand|fill|ink|paper|surface/i.test(p);
const isFontPath = (p: string) => /font|family|typeface|fonts/i.test(p);
const isTypePath = (p: string) =>
  /typography|type-?scale|^type\b|font-?size|text-?style|fontsize/i.test(p);
const isSpacePath = (p: string) =>
  /space|spacing|layout|size|sizing|gap|gutter|padding|width|container/i.test(p);
const isRadiusPath = (p: string) => /radius|radii|rounded|corner/i.test(p);
const isShadowPath = (p: string) => /shadow|elevation/i.test(p);

/** Colour role from the token's name/path (most specific first). */
function roleFromName(full: string): DesignColor["role"] | undefined {
  const s = full.toLowerCase();
  const end = s.split(/[.\-_/ ]/).pop() ?? s;
  if (/(?:^|[.\-_/])(?:on-?(?:primary|accent|brand))/.test(s)) return "accent-text";
  if (
    /(?:^|[.\-_/])(?:text|fg|foreground|copy|body)(?:[.\-_/](?:muted|subtle|secondary|tertiary|light|soft))/.test(
      s,
    ) ||
    /muted|subtle/.test(end)
  )
    return "text-muted";
  if (
    /(?:^|[.\-_/])(?:bg|background|backgrounds|canvas|page|paper)(?:$|[.\-_/])/.test(s) &&
    !/(?:bg|background)[.\-_/]?(?:accent|primary|brand)/.test(s)
  )
    return /surface|card|raised|elevated|alt|secondary|subtle/.test(s) ? "surface" : "background";
  if (/surface|card|panel/.test(s)) return /raised|elevated/.test(s) ? "surface-raised" : "surface";
  if (/heading|headline|title|display/.test(s)) return "heading";
  if (
    /(?:^|[.\-_/])(?:text|fg|foreground|ink|copy|body|on-?background|on-?surface)(?:$|[.\-_/])/.test(
      s,
    )
  )
    return "text";
  if (/border|divider|stroke|outline|hairline|line|rule/.test(s)) return "border";
  if (/link/.test(s)) return "link";
  if (/focus|ring/.test(s)) return "focus";
  if (/success|positive/.test(s)) return "success";
  if (/warning|caution/.test(s)) return "warning";
  if (/danger|error|negative|destructive/.test(s)) return "danger";
  if (/primary|brand|accent|action|cta|highlight|key/.test(s)) return "brand";
  if (/secondary|tertiary/.test(s)) return "secondary";
  return undefined;
}

const L = (hex: string) => parseColor(hex).l;
const C = (hex: string) => parseColor(hex).c;

type TypeRole =
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "lead"
  | "body"
  | "small"
  | "eyebrow"
  | "button"
  | "nav"
  | "wordmark";

function typeRoleOf(name: string): TypeRole | undefined {
  const n = name.toLowerCase();
  if (/^(?:h|heading-?|headline-?)([1-6])$/.exec(n) || /(?:^|[-_.])h([1-6])$/.exec(n)) {
    const lvl = Number((/([1-6])$/.exec(n) as RegExpExecArray)[1]);
    return lvl === 1 ? "h1" : lvl === 2 ? "h2" : lvl === 3 ? "h3" : "h4";
  }
  if (/wordmark|logo|site-?title/.test(n)) return "wordmark";
  if (/display|hero|jumbo|giant|headline-?(?:xl|lg|large)|title-?(?:xl|lg)/.test(n))
    return "display";
  if (/eyebrow|overline|kicker|label|caps|tag/.test(n)) return "eyebrow";
  if (/button|btn|cta/.test(n)) return "button";
  if (/nav|menu/.test(n)) return "nav";
  if (/lead|lede|intro|quote|subtitle|subhead|standfirst|body-?xl/.test(n)) return "lead";
  if (/small|caption|fine|footnote|body-?(?:sm|small|xs)|text-?(?:sm|xs)|meta/.test(n))
    return "small";
  if (/headline|heading|title/.test(n)) return "h2";
  if (/body|text|paragraph|copy|base|regular|default|md|medium/.test(n)) return "body";
  return undefined;
}

/** T-shirt sizes (`fontSize.sm`, `text-2xl`) → roles, when a scale has no role names. */
const TSHIRT: Record<string, TypeRole> = {
  xs: "small",
  sm: "small",
  base: "body",
  md: "body",
  lg: "lead",
  xl: "h4",
  "2xl": "h3",
  "3xl": "h2",
  "4xl": "h1",
  "5xl": "display",
  "6xl": "display",
  "7xl": "display",
};

const FONT_ROLE_HINTS: Record<"heading" | "body" | "label" | "mono", RegExp> = {
  mono: /mono|code/i,
  label: /label|ui|caps|eyebrow|kicker|nav|button|accent|tertiary/i,
  heading: /display|heading|headline|title|serif-?display|primary-?heading|brand|secondary/i,
  body: /body|text|base|copy|paragraph|primary|sans|default|regular/i,
};

/**
 * Read a design-token file (any common shape) into the design-system record's tokens.
 * Throws a plain-language error when nothing usable is in it.
 */
export function readDesignTokens(input: unknown): ReadTokensResult {
  const notes: string[] = [];
  const rules: string[] = [];
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      throw new Error("That file isn't valid JSON. Export your design tokens as a .json file.");
    }
  }
  if (!isObj(input) && !Array.isArray(input))
    throw new Error("That file doesn't hold any design tokens.");
  const { leaves, format } = flatten(input);
  resolveAliases(leaves);

  // --- colours ---
  const colors: Record<string, DesignColor> = {};
  const colorOrder: { name: string; hex: string; path: string }[] = [];
  for (const l of leaves) {
    const path = l.path.join(".");
    if (l.type && l.type !== "color" && !/^colou?r$/i.test(l.type)) continue;
    if (!l.type && !isColorPath(path) && typeof l.value === "string" && !/^#/.test(l.value))
      continue;
    const hex = colorHex(l.value);
    if (!hex) continue;
    if (/grounds?\./i.test(path)) continue;
    let name = lastName(l.path);
    while (colors[name]) name = `${name}-2`;
    if (colorOrder.length >= 60) break;
    colors[name] = { value: hex };
    colorOrder.push({ name, hex, path });
  }
  // Roles: by name first.
  const taken = new Set<string>();
  for (const c of colorOrder) {
    const role = roleFromName(c.path);
    if (
      role &&
      !(role !== "brand" && taken.has(role)) &&
      !(role === "brand" && taken.has("brand"))
    ) {
      (colors[c.name] as DesignColor).role = role;
      taken.add(role);
    }
  }
  // A "grounds" table (`{ paper: { background: "paper", text: "ink", label: "moss" } }`).
  const grounds = isObj((input as Obj).grounds) ? ((input as Obj).grounds as Obj) : undefined;
  if (grounds) {
    const byName = (n: unknown) =>
      typeof n === "string"
        ? colorOrder.find(
            (c) =>
              c.name === n.toLowerCase() || c.path.toLowerCase().endsWith(`.${n.toLowerCase()}`),
          )
        : undefined;
    const entries = Object.entries(grounds).filter((e): e is [string, Obj] => isObj(e[1]));
    const light = entries
      .map(([k, g]) => ({ k, g, bg: byName(g.background) }))
      .filter((x) => x.bg)
      .sort((a, b) => L((b.bg as { hex: string }).hex) - L((a.bg as { hex: string }).hex));
    const main = light[0];
    if (main && !taken.has("background")) {
      const bg = main.bg as { name: string };
      (colors[bg.name] as DesignColor).role = "background";
      taken.add("background");
      const text = byName(main.g.text);
      if (text && !taken.has("text")) {
        (colors[text.name] as DesignColor).role = "text";
        taken.add("text");
      }
    }
    for (const [k, g] of entries) {
      const parts = ["background", "text", "label", "rule"]
        .filter((p) => typeof g[p] === "string")
        .map((p) => `${p} ${g[p]}`);
      if (parts.length) rules.push(`On the ${k} ground: ${parts.join(", ")}.`);
    }
  }
  // Then by lightness/chroma for what names didn't settle.
  const free = colorOrder.filter((c) => !colors[c.name]?.role);
  if (!taken.has("background")) {
    const bg = [...free].filter((c) => L(c.hex) > 0.8).sort((a, b) => L(b.hex) - L(a.hex))[0];
    if (bg) {
      (colors[bg.name] as DesignColor).role = "background";
      taken.add("background");
    }
  }
  if (!taken.has("text")) {
    const t = [...free]
      .filter((c) => !colors[c.name]?.role && L(c.hex) < 0.4 && C(c.hex) < 0.08)
      .sort((a, b) => L(a.hex) - L(b.hex))[0];
    if (t) {
      (colors[t.name] as DesignColor).role = "text";
      taken.add("text");
    }
  }
  if (!taken.has("brand")) {
    const b = [...free]
      .filter((c) => !colors[c.name]?.role && C(c.hex) >= 0.04 && L(c.hex) > 0.2 && L(c.hex) < 0.85)
      .sort((a, b2) => C(b2.hex) - C(a.hex))[0];
    if (b) {
      (colors[b.name] as DesignColor).role = "brand";
      taken.add("brand");
    }
  }
  // A `brand` role on a pale tint (a "primary-50") is not the brand: prefer a mid step.
  // (Nothing to do when the file named its own brand.)

  // --- fonts ---
  const fonts: NonNullable<DesignTokens["fonts"]> = {};
  const weights: Record<string, number> = {};
  const familyLeaves: { path: string; stack: string }[] = [];
  for (const l of leaves) {
    const path = l.path.join(".");
    if (l.type === "fontWeight" || l.type === "fontWeights" || (/weight/i.test(path) && !l.type)) {
      const w = pxValue(l.value) ?? weightName(l.value);
      if (w) weights[lastName(l.path)] = w;
      continue;
    }
    const isFamily =
      l.type === "fontFamily" ||
      l.type === "fontFamilies" ||
      (!l.type && isFontPath(path) && !/size|weight|height|spacing|style/i.test(path));
    if (!isFamily) continue;
    const stack = Array.isArray(l.value)
      ? l.value.join(", ")
      : typeof l.value === "string"
        ? l.value
        : undefined;
    if (!stack || colorHex(stack) || pxValue(stack) !== undefined) continue;
    familyLeaves.push({ path, stack });
  }
  // Typography composites (DTCG `typography`, Tokens Studio, `{ fontFamily, fontSize }` objects).
  const composites: { name: string; v: Obj }[] = [];
  for (const l of leaves)
    if (isObj(l.value) && ("fontFamily" in l.value || "fontSize" in l.value))
      composites.push({ name: lastName(l.path), v: l.value });
  for (const comp of composites)
    if (comp.v.fontFamily)
      familyLeaves.push({
        path: comp.name,
        stack: String(
          Array.isArray(comp.v.fontFamily) ? comp.v.fontFamily.join(", ") : comp.v.fontFamily,
        ),
      });
  const assignFont = (
    role: "heading" | "body" | "label" | "mono",
    stack: string,
    weight?: number,
  ) => {
    if (fonts[role]) return;
    const family = firstFamily(stack);
    if (!family) return;
    const cat = familyCategory(family);
    fonts[role] = {
      family,
      stack,
      category: cat,
      ...(weight ? { weights: [weight] } : {}),
    } as DesignFont;
  };
  for (const role of ["mono", "label", "heading", "body"] as const)
    for (const f of familyLeaves)
      if (FONT_ROLE_HINTS[role].test(f.path.split(".").slice(-2).join("."))) {
        const used = Object.values(fonts).some((x) => x?.stack === f.stack && role !== "body");
        if (role === "label" && used) continue;
        assignFont(role, f.stack, weightFor(weights, f.path));
        break;
      }
  // Unnamed families: first = body (or heading when serif display), second = the other.
  const rest = familyLeaves.filter((f) => !Object.values(fonts).some((x) => x?.stack === f.stack));
  for (const f of rest) {
    if (!fonts.body) assignFont("body", f.stack);
    else if (!fonts.heading) assignFont("heading", f.stack);
  }
  if (!fonts.heading && fonts.body) fonts.heading = { ...fonts.body };
  if (fonts.label && fonts.body && fonts.label.family === fonts.body.family) delete fonts.label;

  // --- type scale ---
  const type: Record<string, DesignTypeStep> = {};
  const addStep = (role: TypeRole, step: DesignTypeStep, size: number) => {
    const prev = type[role];
    if (!prev || (prev.size ?? 0) < size) type[role] = step;
  };
  const toStep = (
    name: string,
    raw: unknown,
  ): { step: DesignTypeStep; size: number } | undefined => {
    const o = isObj(raw) ? raw : { size: raw };
    const sizeRaw = o.desktop ?? o.fontSize ?? o.size ?? o.max ?? o.$value ?? o.value;
    const size = pxValue(sizeRaw);
    if (!size || size < 6 || size > 240) return undefined;
    const mobile = pxValue(o.mobile ?? o.min ?? o.sizeMobile) ?? pxMin(sizeRaw);
    const lhRaw = o.lineHeight;
    let lh =
      typeof lhRaw === "number"
        ? lhRaw
        : typeof lhRaw === "string"
          ? Number.parseFloat(lhRaw)
          : undefined;
    if (typeof lhRaw === "string" && /px$/.test(lhRaw) && lh) lh = lh / size;
    if (typeof lhRaw === "string" && /%$/.test(lhRaw) && lh) lh = lh / 100;
    const ls = emValue(o.letterSpacing ?? o.tracking, size);
    const tc = String(o.transform ?? o.textTransform ?? o.textCase ?? o.case ?? "").toLowerCase();
    const weight = pxValue(o.fontWeight ?? o.weight) ?? weightName(o.fontWeight);
    const fontName = String(o.font ?? o.fontFamily ?? "");
    const font = fontName
      ? FONT_ROLE_HINTS.mono.test(fontName)
        ? "mono"
        : fonts.heading &&
            fontName.includes(fonts.heading.family) &&
            fonts.heading.family !== fonts.body?.family
          ? "heading"
          : fonts.label && fontName.includes(fonts.label.family)
            ? "label"
            : FONT_ROLE_HINTS.label.test(fontName) && !fontName.includes(",")
              ? "label"
              : FONT_ROLE_HINTS.heading.test(fontName) && !fontName.includes(",")
                ? "heading"
                : "body"
      : undefined;
    const step: DesignTypeStep = {
      size: round1(size),
      ...(mobile && mobile >= 6 && mobile < size ? { sizeMobile: round1(mobile) } : {}),
      ...(lh && lh >= 0.6 && lh <= 4 ? { lineHeight: round2(lh) } : {}),
      ...(ls !== undefined && ls >= -0.5 && ls <= 2 ? { letterSpacing: round3(ls) } : {}),
      ...(weight && weight >= 100 && weight <= 900
        ? { weight: Math.round(weight / 100) * 100 }
        : {}),
      ...(/^(?:uppercase|lowercase|capitalize|none)$/.test(tc)
        ? { case: tc as DesignTypeStep["case"] }
        : {}),
      ...(font ? { font: font as DesignTypeStep["font"] } : {}),
    };
    void name;
    return { step, size };
  };
  for (const comp of composites) {
    const role = typeRoleOf(comp.name);
    const r = toStep(comp.name, comp.v);
    if (role && r) addStep(role, r.step, r.size);
  }
  // `type: { "display-xl": { desktop, mobile, lineHeight, font } }` groups.
  const typeGroups: Obj[] = [];
  for (const key of ["type", "typography", "typeScale", "text", "textStyles"]) {
    const g = (input as Obj)[key];
    if (isObj(g)) typeGroups.push(g);
  }
  for (const g of typeGroups)
    for (const [name, raw] of Object.entries(g)) {
      if (!isObj(raw) || "$value" in raw || "value" in raw) continue;
      const role = typeRoleOf(name);
      const r = toStep(name, raw);
      if (role && r) addStep(role, r.step, r.size);
    }
  // Plain size tokens (`fontSize.sm`, `font-size-lg`, `text-2xl`).
  for (const l of leaves) {
    const path = l.path.join(".");
    if (
      !(
        l.type === "fontSize" ||
        l.type === "fontSizes" ||
        /font-?size|fontsize|text-?size|(?:^|\.)size\.font|(?:^|\.)font\.size/i.test(path)
      ) ||
      isObj(l.value)
    )
      continue;
    const name = (l.path[l.path.length - 1] ?? "").toLowerCase();
    const role = typeRoleOf(name) ?? TSHIRT[name.replace(/^text-/, "")];
    const r = toStep(name, l.value);
    if (role && r && !type[role]) addStep(role, r.step, r.size);
  }
  // A scale with only display sizes: make the ladder (display, h1, h2).
  if (!type.h1 && type.display && !type.h2) type.h1 = { ...type.display };

  // --- space ---
  const space: NonNullable<DesignTokens["space"]> = {};
  const scale: Record<string, number> = {};
  for (const l of leaves) {
    const path = l.path.join(".");
    const name = (l.path[l.path.length - 1] ?? "").toLowerCase();
    if (
      !(isSpacePath(path) || l.type === "spacing" || l.type === "dimension" || l.type === "sizing")
    )
      continue;
    if (isRadiusPath(path) || isTypePath(path) || /font|line-?height|letter/i.test(path)) continue;
    const v = pxValue(l.value);
    if (v === undefined || v < 0) continue;
    const key = name.replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase());
    if (
      /^(?:contentmax|maxwidth|container|contentwidth|content|pagewidth|wrapper|wrap|maxw)/i.test(
        key,
      ) &&
      v >= 480
    )
      space.contentWidth ??= Math.round(v);
    else if (/^(?:narrow|narrowmax|narrowwidth|prose|measure|readable)/i.test(key) && v >= 360)
      space.narrowWidth ??= Math.round(v);
    else if (
      /^section(?:pad|padding|y|gap)?(?:desktop|lg)?$/i.test(key) ||
      /^sectionpaddesktop$/i.test(key)
    )
      space.sectionPadding ??= Math.round(v);
    else if (/^section(?:pad|padding|y)?(?:mobile|sm)$/i.test(key))
      space.sectionPaddingMobile ??= Math.round(v);
    else if (/^gutter(?:desktop)?$|^pagepadding$|^pagegutter$/i.test(key))
      space.gutter ??= Math.round(v);
    else if (/^gutter(?:mobile|sm)$/i.test(key)) space.gutterMobile ??= Math.round(v);
    else if (v <= 400 && Object.keys(scale).length < 24) scale[lastName(l.path)] = round1(v);
  }
  if (Object.keys(scale).length) space.scale = scale;

  // --- radius / shadow ---
  const radius: Record<string, number> = {};
  const shadow: Record<string, string> = {};
  for (const l of leaves) {
    const path = l.path.join(".");
    if (l.type === "borderRadius" || isRadiusPath(path)) {
      const v = /full|pill|round/i.test(String(l.value)) ? 9999 : pxValue(l.value);
      if (v !== undefined && v >= 0 && Object.keys(radius).length < 12)
        radius[l.path.length > 1 ? (l.path[l.path.length - 1] as string).toLowerCase() : "base"] =
          Math.min(v, 9999);
    } else if (l.type === "shadow" || l.type === "boxShadow" || isShadowPath(path)) {
      const s =
        typeof l.value === "string" ? l.value : isObj(l.value) ? shadowCss(l.value) : undefined;
      if (s && Object.keys(shadow).length < 8) shadow[lastName(l.path)] = s.slice(0, 200);
    }
  }
  for (const k of Object.keys(radius))
    if (/^(?:radius|radii|rounded|border-?radius)$/.test(k)) {
      radius.base = radius[k] as number;
      delete radius[k];
    }

  const tokens: DesignTokens = {
    ...(Object.keys(colors).length ? { colors } : {}),
    ...(Object.keys(fonts).length ? { fonts } : {}),
    ...(Object.keys(type).length ? { type } : {}),
    ...(Object.keys(space).length ? { space } : {}),
    ...(Object.keys(radius).length ? { radius } : {}),
    ...(Object.keys(shadow).length ? { shadow } : {}),
  };
  if (!Object.keys(tokens).length)
    throw new Error(
      "We couldn't find any colours, fonts or sizes in that file. Design-token files usually have groups like color, font and spacing.",
    );
  const count = (o: object | undefined) => (o ? Object.keys(o).length : 0);
  notes.push(
    `Read ${count(colors)} colour${count(colors) === 1 ? "" : "s"}, ${count(fonts)} font role${count(fonts) === 1 ? "" : "s"}, ${count(type)} text size${count(type) === 1 ? "" : "s"}${count(space) ? " and the page spacing" : ""} (${FORMAT_LABEL[format]}).`,
  );
  return { tokens, format, notes, rules };
}

const FORMAT_LABEL: Record<TokenFormat, string> = {
  dtcg: "W3C design tokens",
  "style-dictionary": "Style Dictionary tokens",
  "tokens-studio": "Tokens Studio / Figma tokens",
  canva: "a brand kit",
  figma: "Figma variables",
  plain: "a design-token file",
  css: "the page's CSS",
};

function weightName(v: unknown): number | undefined {
  const s = String(v ?? "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  const map: Record<string, number> = {
    thin: 100,
    hairline: 100,
    extralight: 200,
    ultralight: 200,
    light: 300,
    regular: 400,
    normal: 400,
    book: 400,
    medium: 500,
    semibold: 600,
    demibold: 600,
    bold: 700,
    extrabold: 800,
    ultrabold: 800,
    black: 900,
    heavy: 900,
  };
  return map[s];
}

function weightFor(weights: Record<string, number>, path: string): number | undefined {
  const key = path.split(".").pop()?.toLowerCase() ?? "";
  return weights[key] ?? weights[lastName(path.split("."))];
}

function emValue(v: unknown, size: number): number | undefined {
  if (typeof v === "number") return Math.abs(v) > 2 ? v / size : v;
  if (typeof v !== "string") return undefined;
  const m = /(-?\d*\.?\d+)\s*(em|px|%|rem)?/.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (m[2] === "px") return n / size;
  if (m[2] === "rem") return (n * 16) / size;
  if (m[2] === "%") return n / 100;
  return n;
}

function shadowCss(o: Obj): string | undefined {
  const x = pxValue(o.offsetX ?? o.x) ?? 0;
  const y = pxValue(o.offsetY ?? o.y) ?? 0;
  const blur = pxValue(o.blur) ?? 0;
  const spread = pxValue(o.spread) ?? 0;
  const color = typeof o.color === "string" ? o.color : "rgba(0,0,0,.15)";
  return `${x}px ${y}px ${blur}px ${spread}px ${color}`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

// --- tokens → Site Styles -------------------------------------------------------------------------

export interface DesignStylesOptions {
  /** Whether Google Fonts serves a family (so Site Styles can self-host it). Default: curated only. */
  isGoogleFont?: (family: string) => boolean;
}

export interface DesignStylesResult {
  styles: Styles;
  notes: string[];
  /** Colours the contrast solver moved so every pair stays readable. */
  contrast: NonNullable<NonNullable<DesignSystem["mapping"]>["contrast"]>;
}

const CURATED_FAMILIES = new Set(
  TYPE_PAIRINGS.flatMap((p) => [p.heading.family, p.body.family]).map((f) => f.toLowerCase()),
);

function colorOf(tokens: DesignTokens, role: string): string | undefined {
  for (const c of Object.values(tokens.colors ?? {})) if (c.role === role) return colorHex(c.value);
  return undefined;
}

function nearestPairing(fonts: DesignTokens["fonts"]): TypePairing {
  const h = fonts?.heading?.family;
  const b = fonts?.body?.family ?? h;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  let best = TYPE_PAIRINGS[0] as TypePairing;
  let bestScore = -1;
  for (const p of TYPE_PAIRINGS) {
    let score = 0;
    if (h && norm(p.heading.family) === norm(h)) score += 4;
    else if (h && p.heading.category === familyCategory(h)) score += 1.5;
    if (b && norm(p.body.family) === norm(b)) score += 3;
    else if (b && p.body.category === familyCategory(b)) score += 1;
    if (h && b && norm(h) === norm(b) && norm(p.heading.family) === norm(p.body.family))
      score += 0.75;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

const TYPE_ROLES: readonly TypeScalePreset[] = [
  "display",
  "h1",
  "h2",
  "h3",
  "h4",
  "lead",
  "body",
  "small",
  "eyebrow",
  "button",
  "nav",
  "wordmark",
];

/**
 * Map design-system tokens onto Site Styles, starting from `base` (a template look, or the
 * imported site's styles): brand palette, exact role colours, fonts, type scale, rhythm, shape.
 * The contrast solver runs on the result; what it changes is returned in plain words.
 */
export function designSystemStyles(
  tokens: DesignTokens,
  base: Styles,
  opts: DesignStylesOptions = {},
): DesignStylesResult {
  const notes: string[] = [];
  const isGoogle = (f: string) =>
    CURATED_FAMILIES.has(f.toLowerCase()) || (opts.isGoogleFont?.(f) ?? false);
  const choices = structuredClone(base.choices);
  const overrides: Record<string, unknown> = structuredClone(
    (base.overrides ?? {}) as Record<string, unknown>,
  );
  const colorOverrides: Record<string, unknown> = isObj(overrides.color)
    ? (overrides.color as Obj)
    : {};
  const setColor = (path: string[], hex: string) => {
    let o = colorOverrides;
    for (const k of path.slice(0, -1)) {
      if (!isObj(o[k])) o[k] = {};
      o = o[k] as Obj;
    }
    o[path[path.length - 1] as string] = { $value: hex, $type: "color" };
  };

  // Palette.
  const brand = colorOf(tokens, "brand") ?? colorOf(tokens, "accent");
  const background = colorOf(tokens, "background");
  const text = colorOf(tokens, "text");
  if (brand) {
    choices.palette = { ...choices.palette, brand, source: "brand" };
    notes.push(`Your brand colour ${brand} leads the palette (buttons, links and accents).`);
  }
  if (background) {
    const c = parseColor(background);
    choices.palette.neutral = c.c < 0.004 ? "pure" : c.h >= 170 && c.h <= 300 ? "cool" : "warm";
  }
  // Exact role colours on the light theme (and the dark theme from the darkest/lightest pair).
  const roleMap: [string, string][] = [
    ["background", "background"],
    ["surface", "surface"],
    ["surface-raised", "surface-raised"],
    ["text", "text"],
    ["text-muted", "text-muted"],
    ["heading", "heading"],
    ["border", "border"],
    ["link", "link"],
    ["accent-text", "accent-text"],
  ];
  for (const [tokenRole, styleRole] of roleMap) {
    const hex = colorOf(tokens, tokenRole);
    if (hex) setColor([styleRole], hex);
  }
  if (brand) setColor(["accent"], brand);
  if (background && text && L(background) > 0.6 && L(text) < 0.4) {
    setColor(["dark", "background"], text);
    setColor(["dark", "text"], background);
    setColor(["dark", "heading"], background);
    notes.push(`Dark sections use your ${text} as the ground with ${background} text.`);
  }
  if (background) notes.push(`Page background ${background}${text ? `, text ${text}` : ""}.`);
  if (Object.keys(colorOverrides).length) overrides.color = colorOverrides;

  // Fonts.
  const fonts = tokens.fonts;
  if (fonts?.heading || fonts?.body) {
    const pairing = nearestPairing(fonts);
    choices.pairing = pairing.id;
    const typography: TypographyChoices = { ...(choices.typography ?? {}) };
    const used: string[] = [];
    const missing: string[] = [];
    for (const role of ["heading", "body", "label"] as const) {
      const f = fonts[role];
      if (!f) continue;
      if (isGoogle(f.family)) {
        const cat =
          f.category === "monospace"
            ? "monospace"
            : f.category === "serif"
              ? "serif"
              : "sans-serif";
        const web: WebFont = {
          family: f.family.replace(/[^A-Za-z0-9 ]/g, "").slice(0, 60),
          category: cat,
          ...(f.weights?.length
            ? {
                weights: [
                  ...new Set(
                    [
                      ...(f.weights ?? []),
                      role === "body" ? 400 : 0,
                      role === "body" ? 600 : 0,
                    ].filter((w) => w >= 100),
                  ),
                ]
                  .sort((a, b) => a - b)
                  .slice(0, 6),
              }
            : {}),
          ...(role !== "label" && cat === "serif" ? { italic: true } : {}),
        };
        if (/^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/.test(web.family)) {
          typography[role] = web;
          if (!used.includes(f.family)) used.push(f.family);
        }
      } else if (!missing.includes(f.family)) missing.push(f.family);
    }
    if (used.length)
      notes.push(
        `Your fonts (${used.join(", ")}) are used as they are — free on Google Fonts and published with the site.`,
      );
    if (missing.length)
      notes.push(
        `${missing.join(" and ")} ${missing.length > 1 ? "aren't" : "isn't"} a free web font, so ${pairing.heading.family} / ${pairing.body.family} stand in for now. If you have a licence, upload the font files in Site Styles → Your fonts.`,
      );
    // Type scale.
    const scale: Partial<Record<TypeScalePreset, TypeStep>> = { ...(typography.scale ?? {}) };
    for (const role of TYPE_ROLES) {
      const s = tokens.type?.[role];
      if (!s) continue;
      const fontRole =
        s.font === "mono" ? "body" : s.font === "label" && !typography.label ? "body" : s.font;
      const step = TypeStepSchema.safeParse({
        ...(s.size !== undefined ? { size: clamp(s.size, 9, 220) } : {}),
        ...(s.sizeMobile !== undefined ? { sizeMobile: clamp(s.sizeMobile, 9, 160) } : {}),
        ...(s.lineHeight !== undefined ? { lineHeight: clamp(s.lineHeight, 0.7, 3) } : {}),
        ...(s.letterSpacing !== undefined
          ? { letterSpacing: clamp(s.letterSpacing, -0.2, 1) }
          : {}),
        ...(s.case ? { case: s.case } : {}),
        ...(s.weight ? { weight: s.weight } : {}),
        ...(fontRole ? { font: fontRole } : {}),
      });
      if (step.success && Object.keys(step.data).length) scale[role] = step.data;
    }
    if (Object.keys(scale).length) {
      typography.scale = scale;
      notes.push(
        `Text sizes kept: ${TYPE_ROLES.filter((r) => scale[r]?.size)
          .slice(0, 6)
          .map((r) => `${r} ${scale[r]?.size}px`)
          .join(", ")}.`,
      );
    }
    if (Object.keys(typography).length) choices.typography = typography;
  }

  // Rhythm.
  const sp = tokens.space;
  if (sp) {
    const layout = LayoutChoicesSchema.safeParse({
      ...(choices.layout ?? {}),
      ...(sp.contentWidth && sp.contentWidth >= 480
        ? { contentWidth: Math.round(clamp(sp.contentWidth, 480, 2400)) }
        : {}),
      ...(sp.narrowWidth && sp.narrowWidth >= 360
        ? { narrowWidth: Math.round(clamp(sp.narrowWidth, 360, 1600)) }
        : {}),
      ...(sp.sectionPadding !== undefined
        ? { sectionPadding: Math.round(clamp(sp.sectionPadding, 0, 320)) }
        : {}),
      ...(sp.sectionPadding !== undefined && sp.sectionPaddingMobile !== undefined
        ? { sectionPaddingMobile: Math.round(clamp(sp.sectionPaddingMobile, 0, 240)) }
        : {}),
      ...(sp.gutter !== undefined ? { gutter: Math.round(clamp(sp.gutter, 0, 160)) } : {}),
      ...(sp.gutter !== undefined && sp.gutterMobile !== undefined
        ? { gutterMobile: Math.round(clamp(sp.gutterMobile, 0, 80)) }
        : {}),
    });
    if (layout.success && Object.keys(layout.data).length) {
      choices.layout = layout.data;
      const pad = layout.data.sectionPadding;
      if (pad !== undefined)
        choices.density = pad < 64 ? "compact" : pad > 100 ? "airy" : "comfortable";
      notes.push(
        `Page rhythm kept${layout.data.contentWidth ? `: content ${layout.data.contentWidth}px wide` : ""}${pad !== undefined ? `, sections padded ${pad}px` : ""}.`,
      );
    }
  }

  // Shape and buttons.
  const r = tokens.radius;
  if (r) {
    const baseR = r.base ?? r.md ?? r.card ?? r.default ?? Object.values(r)[0];
    const buttonR = r.button ?? r.btn ?? baseR;
    if (baseR !== undefined) {
      choices.shape = baseR <= 1 ? "sharp" : baseR >= 14 ? "round" : "soft";
      notes.push(
        `Corners: ${choices.shape === "sharp" ? "square" : choices.shape === "round" ? "round" : "softly rounded"}, as in your tokens.`,
      );
    }
    if (buttonR !== undefined) {
      const outline = /outline/.test(choices.buttons);
      choices.buttons =
        buttonR >= 999 ? (outline ? "pill-outline" : "pill-solid") : outline ? "outline" : "solid";
    }
  }

  const styles: Styles = {
    ...base,
    choices,
    ...(Object.keys(overrides).length ? { overrides: overrides as Styles["overrides"] } : {}),
  };
  // Contrast: let the solver settle every pair and say what moved.
  const contrast: DesignStylesResult["contrast"] = [];
  try {
    const compiled = compileStyles(styles);
    for (const a of compiled.contrast.adjustments) {
      contrast.push({
        theme: a.theme,
        role: a.role,
        from: String(a.from),
        to: String(a.to),
        against: String(a.against),
      });
    }
    const light = compiled.tokens.themes.light;
    if (contrast.length) {
      const shown = contrast.filter((c) => c.theme === "light").slice(0, 3);
      notes.push(
        `${contrast.length} colour pairing${contrast.length === 1 ? " was" : "s were"} nudged so all text stays readable (WCAG AA)${shown.length ? `, e.g. ${shown.map((c) => `${c.role} ${c.from} → ${c.to}`).join(", ")}` : ""}.`,
      );
    }
    notes.push(`Body text contrast ${contrastRatio(light.text, light.background).toFixed(1)}:1.`);
  } catch {
    // Compile problems surface in openspace check.
  }
  return { styles, notes, contrast };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The tokens a Site Styles look already has (a template's look, an import's styles), so a site
 * without a token file still gets a design-system record Claude can keep to.
 */
export function tokensFromStyles(styles: Styles): DesignTokens {
  const compiled = compileStyles(styles);
  const t = compiled.tokens;
  const light = t.themes.light;
  const dark = t.themes.dark;
  const colors: Record<string, DesignColor> = {
    background: { value: light.background, role: "background" },
    surface: { value: light.surface, role: "surface" },
    text: { value: light.text, role: "text" },
    "text-muted": { value: light["text-muted"], role: "text-muted" },
    heading: { value: light.heading, role: "heading" },
    accent: { value: light.accent, role: "brand" },
    "accent-text": { value: light["accent-text"], role: "accent-text" },
    border: { value: light.border, role: "border" },
    "dark-background": { value: dark.background, usage: "Dark sections" },
  };
  const font = (spec: TypePairing["heading"]): DesignFont => ({
    family: spec.family,
    category: spec.category,
    weights: spec.weights,
    google: true,
  });
  const p = t.pairing;
  const root = t.vars.root;
  const px = (v: string | undefined) => (v ? pxValue(v) : undefined);
  const type: Record<string, DesignTypeStep> = {};
  for (const role of [
    "display",
    "h1",
    "h2",
    "h3",
    "h4",
    "lead",
    "body",
    "small",
    "eyebrow",
  ] as const) {
    const size = px(root[`--os-type-${role}-font-size`]);
    const min = root[`--os-type-${role}-font-size`]
      ? pxMin(root[`--os-type-${role}-font-size`])
      : undefined;
    const lh = Number.parseFloat(root[`--os-type-${role}-line-height`] ?? "");
    if (size)
      type[role] = {
        size: round1(size),
        ...(min && min < size ? { sizeMobile: round1(min) } : {}),
        ...(Number.isFinite(lh) && lh >= 0.6 && lh <= 4 ? { lineHeight: lh } : {}),
      };
  }
  const contentWidth = px(root["--os-width-content"]);
  const narrowWidth = px(root["--os-width-narrow"]);
  return {
    colors,
    fonts: {
      heading: font(p.heading),
      body: font(p.body),
      ...(p.label ? { label: font(p.label) } : {}),
    },
    ...(Object.keys(type).length ? { type } : {}),
    space: {
      ...(contentWidth ? { contentWidth } : {}),
      ...(narrowWidth ? { narrowWidth } : {}),
    },
    radius: { base: px(root["--os-radius-md"]) ?? 0, button: px(root["--os-radius-button"]) ?? 0 },
  };
}

/** Distance between two colours (0 = same), for "is this the brand colour?" checks. */
export function colorDistance(a: string, b: string): number {
  try {
    return deltaEOK(parseColor(a), parseColor(b));
  } catch {
    return 1;
  }
}
