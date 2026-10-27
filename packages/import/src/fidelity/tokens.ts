/**
 * A design-token file (`design-tokens.json`, `tokens.json`: Style Dictionary / DTCG-ish or a
 * hand-written `{ font, type, space }` file) → Site Styles typography and page rhythm: the font
 * per role, the type scale (desktop and phone sizes, line height, tracking, case), content width,
 * section padding and gutter. Names are read by meaning (`display-xl`, `body-lg`, `label`,
 * `button`, `contentMax`, `sectionPadDesktop`…), so it works for any file shaped like that.
 */
import type {
  LayoutChoices,
  TypeScalePreset,
  TypeStep,
  TypographyChoices,
} from "@omniharmonic/openspace-schema";
import { fontCategory } from "../map/theme";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** `"96px"` → 96, `"1.5rem"` → 24, `12` → 12. */
export function px(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (isObj(v) && "$value" in v) return px(v.$value);
  if (typeof v !== "string") return undefined;
  // A clamp()/min()/max(): the largest size (desktop).
  const all = [...v.matchAll(/(-?\d*\.?\d+)\s*(px|rem|em)\b/g)].map((m) =>
    m[2] === "px" ? Number(m[1]) : Number(m[1]) * 16,
  );
  if (all.length) return Math.max(...all);
  const n = Number(v.trim());
  return Number.isFinite(n) && v.trim() !== "" ? n : undefined;
}

/** `"0.30em"` → 0.3, `"2px"` at 12px → 0.167, `0.2` → 0.2. */
function em(v: unknown, size?: number): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return undefined;
  const m = /(-?\d*\.?\d+)\s*(em|px|%)?/.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (m[2] === "px") return size ? Math.round((n / size) * 1000) / 1000 : undefined;
  if (m[2] === "%") return n / 100;
  return n;
}

/** The first family of a CSS font stack: `'EB Garamond', Georgia, serif` → `EB Garamond`. */
export function firstFamily(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  for (const raw of stack.split(",")) {
    const f = raw.trim().replace(/^["']|["']$/g, "");
    if (
      f &&
      !/^(?:serif|sans-serif|monospace|system-ui|ui-\w+|-apple-system|georgia|helvetica|arial|times(?: new roman)?|inherit|var\(.*)$/i.test(
        f,
      )
    )
      return f;
  }
  return undefined;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : isObj(v) && typeof v.$value === "string" ? v.$value : undefined;

export interface TokenLook {
  typography: TypographyChoices;
  layout: LayoutChoices;
  /** Families by role, for the pairing fallback. */
  fonts: { heading?: string; body?: string; label?: string };
  eyebrowRule?: boolean;
}

const ROLE_KEYS = {
  heading: ["display", "heading", "headings", "headline", "title", "serif-display"],
  body: ["body", "text", "base", "copy", "paragraph"],
  label: ["label", "labels", "ui", "caps", "eyebrow", "kicker", "accent", "nav", "button"],
} as const;

/** Read a design-token file's typography and rhythm (undefined when it has none). */
export function lookFromTokens(t: Obj): TokenLook | undefined {
  const font = (
    isObj(t.font) ? t.font : isObj(t.fonts) ? t.fonts : isObj(t.fontFamily) ? t.fontFamily : {}
  ) as Obj;
  const weights = (
    isObj(font.weights) ? font.weights : isObj(t.fontWeight) ? t.fontWeight : {}
  ) as Obj;
  const fonts: TokenLook["fonts"] = {};
  const fontKey: Partial<Record<keyof typeof ROLE_KEYS, string>> = {};
  for (const role of ["heading", "body", "label"] as const)
    for (const k of ROLE_KEYS[role]) {
      const fam = firstFamily(str(font[k]));
      if (fam) {
        fonts[role] = fam;
        fontKey[role] = k;
        break;
      }
    }
  const weightOf = (role: keyof typeof ROLE_KEYS): number | undefined => {
    const k = fontKey[role];
    const w = k ? px(weights[k]) : undefined;
    return w && w >= 100 && w <= 900 ? Math.round(w / 100) * 100 : undefined;
  };
  const typography: TypographyChoices = {};
  const webFont = (role: keyof typeof ROLE_KEYS) => {
    const family = fonts[role];
    if (!family) return undefined;
    const w = weightOf(role);
    const extra =
      role === "label"
        ? Object.entries(weights)
            .filter(([k]) => /^(?:label|ui|caps|button|nav)/i.test(k))
            .map(([, v]) => px(v))
        : [];
    const ws = [
      ...new Set(
        [w ?? (role === "heading" ? undefined : 400), ...extra]
          .filter((x): x is number => !!x && x >= 100 && x <= 900)
          .map((x) => Math.round(x / 100) * 100),
      ),
    ].sort((a, b) => a - b);
    const cat = fontCategory(family);
    return {
      family,
      category: cat,
      ...(ws.length ? { weights: role === "label" ? ws.slice(0, 3) : ws } : {}),
      ...(role !== "label" && cat === "serif" ? { italic: true } : {}),
    };
  };
  const heading = webFont("heading");
  const body = webFont("body");
  const label = fonts.label && fonts.label !== fonts.body ? webFont("label") : undefined;
  if (heading) typography.heading = heading;
  if (body) typography.body = body;
  if (label) typography.label = label;

  // --- the type scale -------------------------------------------------------------------------
  const type = (
    isObj(t.type)
      ? t.type
      : isObj(t.typography)
        ? t.typography
        : isObj(t.typeScale)
          ? t.typeScale
          : {}
  ) as Obj;
  interface Entry {
    name: string;
    size: number;
    mobile?: number;
    step: TypeStep;
  }
  const entries: Entry[] = [];
  for (const [name, raw] of Object.entries(type)) {
    if (!isObj(raw)) continue;
    const size = px(raw.desktop ?? raw.size ?? raw.fontSize ?? raw.max ?? raw.$value);
    if (!size || size < 9 || size > 220) continue;
    const mobile = px(raw.mobile ?? raw.min ?? raw.sizeMobile);
    const lh = typeof raw.lineHeight === "number" ? raw.lineHeight : px(raw.lineHeight);
    const ls = em(raw.letterSpacing ?? raw.tracking, size);
    const tf = str(raw.transform ?? raw.textTransform ?? raw.case);
    const role = str(raw.font ?? raw.fontFamily);
    const fontRole =
      role && (ROLE_KEYS.heading as readonly string[]).includes(role)
        ? "heading"
        : role && (ROLE_KEYS.label as readonly string[]).includes(role)
          ? "label"
          : role && (ROLE_KEYS.body as readonly string[]).includes(role)
            ? "body"
            : undefined;
    const step: TypeStep = {
      size: Math.round(size * 10) / 10,
      ...(mobile && mobile >= 9 && mobile <= 160
        ? { sizeMobile: Math.round(mobile * 10) / 10 }
        : {}),
      ...(lh && lh >= 0.7 && lh <= 3 ? { lineHeight: lh } : {}),
      ...(ls !== undefined && ls >= -0.2 && ls <= 1 ? { letterSpacing: ls } : {}),
      ...(tf && /^(?:uppercase|lowercase|capitalize|none)$/.test(tf)
        ? { case: tf as TypeStep["case"] }
        : {}),
      ...(fontRole ? { font: fontRole } : {}),
    };
    entries.push({ name: name.toLowerCase(), size, ...(mobile ? { mobile } : {}), step });
  }
  const scale: Partial<Record<TypeScalePreset, TypeStep>> = {};
  const pick = (re: RegExp) =>
    entries.filter((e) => re.test(e.name)).sort((a, b) => b.size - a.size);
  for (const lvl of ["h1", "h2", "h3", "h4"] as const) {
    const e = entries.find((x) => x.name === lvl || x.name === `heading-${lvl.slice(1)}`);
    if (e) scale[lvl] = e.step;
  }
  const displays = pick(/^(?:display|headline|title|hero)/);
  const ladder = ["display", "h1", "h2", "h3"] as const;
  displays.slice(0, 4).forEach((e, i) => {
    const p = ladder[i] as TypeScalePreset;
    scale[p] ??= e.step;
  });
  if (!scale.display && scale.h1) scale.display = scale.h1;
  const lead = pick(/^(?:quote|lead|lede|intro|subhead|body-?xl)/)[0];
  if (lead) scale.lead = lead.step;
  const bodies = pick(/^(?:body|text|paragraph|copy|base)/);
  const bodyE =
    bodies.find((e) => /lg|large|default|^body$|^text$|^base$/.test(e.name)) ?? bodies[0];
  if (bodyE) scale.body = bodyE.step;
  const small =
    pick(/^(?:small|caption|body-?sm|text-?sm|fine)/)[0] ??
    bodies.find((e) => bodyE && e.size < bodyE.size);
  if (small) scale.small = small.step;
  const eyebrow = pick(/^(?:label|kicker|eyebrow|overline|caps)/)[0];
  if (eyebrow) scale.eyebrow = { font: label ? "label" : "body", ...eyebrow.step };
  const button = pick(/^(?:button|btn|cta)/)[0];
  if (button) scale.button = { font: label ? "label" : "body", ...button.step };
  const nav = pick(/^(?:nav|menu|navigation)/)[0] ?? eyebrow;
  if (nav) scale.nav = { font: label ? "label" : "body", ...nav.step };
  const wordmark = pick(/^(?:wordmark|logo|brand|site-?title)/)[0];
  if (wordmark) scale.wordmark = { font: label ? "label" : "heading", ...wordmark.step };
  // h4 (card titles): the lead/quote size when the file has no h4.
  if (!scale.h4 && lead) scale.h4 = { ...lead.step, font: "heading" };
  // Headings set in a weight of their own.
  const hw = weightOf("heading");
  if (hw)
    for (const p of ["display", "h1", "h2", "h3", "h4"] as const)
      if (scale[p]) scale[p] = { ...scale[p], weight: hw };
  if (Object.keys(scale).length) typography.scale = scale;

  // --- rhythm ---------------------------------------------------------------------------------
  const space = (
    isObj(t.space) ? t.space : isObj(t.spacing) ? t.spacing : isObj(t.layout) ? t.layout : {}
  ) as Obj;
  const val = (...keys: string[]) => {
    for (const [k, v] of Object.entries(space))
      if (keys.some((x) => k.toLowerCase() === x.toLowerCase())) return px(v);
    return undefined;
  };
  const layout: LayoutChoices = {};
  const content = val(
    "contentMax",
    "content-max",
    "maxWidth",
    "max-width",
    "container",
    "contentWidth",
  );
  if (content && content >= 480 && content <= 2400) layout.contentWidth = Math.round(content);
  const narrow = val("narrowMax", "narrow-max", "narrow", "narrowWidth");
  if (narrow && narrow >= 360 && narrow <= 1600) layout.narrowWidth = Math.round(narrow);
  const pad = val("sectionPadDesktop", "sectionPad", "section-pad", "sectionPadding", "section");
  if (pad && pad <= 320) layout.sectionPadding = Math.round(pad);
  const padM = val("sectionPadMobile", "section-pad-mobile", "sectionPaddingMobile");
  if (pad && padM && padM <= 240) layout.sectionPaddingMobile = Math.round(padM);
  const gutter = val("gutterDesktop", "gutter", "gutter-desktop");
  if (gutter && gutter <= 160) layout.gutter = Math.round(gutter);
  const gutterM = val("gutterMobile", "gutter-mobile");
  if (gutter && gutterM && gutterM <= 80) layout.gutterMobile = Math.round(gutterM);

  // Labels in their own (muted) color on every ground, and an accent rule under them.
  const grounds = isObj(t.grounds) ? Object.values(t.grounds).filter(isObj) : [];
  const muted = grounds.filter((g) => typeof g.label === "string" && g.label !== g.text).length;
  if (grounds.length && muted > grounds.length / 2) typography.eyebrowColor = "muted";
  const rule = Object.keys(space).some((k) => /^rule/i.test(k)) || grounds.some((g) => "rule" in g);

  if (!Object.keys(typography).length && !Object.keys(layout).length) return undefined;
  return { typography, layout, fonts, ...(rule && eyebrow ? { eyebrowRule: true } : {}) };
}
