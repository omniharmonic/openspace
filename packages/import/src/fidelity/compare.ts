/**
 * Visual/typographic fidelity: two look probes (the original page and the imported page, same
 * viewport) → a per-page and per-section diff a person or the migrate skill can act on: fonts per
 * role, type sizes, tracking and case, content width and section padding, and per section its
 * background, heading and text styles, column count, eyebrow rule, italic lines and image
 * placement. Each failed check names the Site Styles setting (`set_styles`) that would close it.
 */
import { metricDistance } from "./font-match";
import type { LookProbe, ProbeSection, ProbeText } from "./probe";

/**
 * How alike two fonts are as drawn: 1 for the same family; for different families of the same
 * kind (serif, sans, mono; small caps or not), partial credit by how close their measured
 * x-height, cap height and width are — so an open stand-in for a licensed font counts as nearly
 * the same, and an unrelated font doesn't.
 */
export function fontCredit(a: string, b: string, o?: LookProbe, i?: LookProbe): number {
  if (norm(a) === norm(b)) return 1;
  const ma = o?.fonts?.[a];
  const mb = i?.fonts?.[b];
  if (!ma || !mb) return 0;
  if ((ma.category ?? "sans-serif") !== (mb.category ?? "sans-serif")) return 0;
  if (Boolean(ma.smallCaps) !== Boolean(mb.smallCaps)) return 0;
  const d = metricDistance(ma, mb);
  return d <= 0.04 ? 0.85 : d <= 0.07 ? 0.7 : d <= 0.11 ? 0.5 : d <= 0.16 ? 0.25 : 0;
}

export interface FidelityCheck {
  area: "fonts" | "type" | "layout" | "buttons" | "section";
  what: string;
  original: string;
  imported: string;
  ok: boolean;
  /**
   * Partial credit (0–1) for a check that isn't the same but close: a licensed font replaced by
   * an open one whose measured shape is near it. Scored as `weight × credit`.
   */
  credit?: number;
  /** What to change (plain words, with the Site Styles path when there is one). */
  fix?: string;
  weight: number;
}

export interface SectionComparison {
  /** Original section index (0-based) and its heading. */
  index: number;
  heading?: string;
  /** The imported section it matched, or undefined when nothing matched. */
  importedIndex?: number;
  checks: FidelityCheck[];
  score: number;
}

export interface PageComparison {
  path: string;
  original: string;
  imported: string;
  viewport: number;
  /** 0–100: the checks (75%) and how alike the two pages look as pictures (25%), when measured. */
  score: number;
  /** 0–100 from the checks alone. */
  structure?: number;
  /** 0–1 perceptual similarity of the two full-page screenshots (see `visualSimilarity`). */
  visual?: number;
  /** The score before rounding (auto-tuning compares these). */
  exact?: number;
  checks: FidelityCheck[];
  sections: SectionComparison[];
  /**
   * The same page scored by the strict v3 scorer, without the corrections (see `corrections`),
   * reported side by side for transparency. `checks` is its check score before rounding.
   */
  strict?: { score: number; exact: number; structure: number; checks: number };
  /** What the corrected scorer read differently from strict v3 on this page (plain words). */
  corrections?: string[];
}

export interface FidelityReport {
  /** 0–100, weighted over every page and viewport (the corrected scorer). */
  score: number;
  /** The same before rounding. */
  exact?: number;
  /** The strict v3 score of the same pages (no corrections), for comparison. */
  strict?: { score: number; exact: number };
  /** Which scorer `score` comes from. Absent on reports made before the corrections. */
  scorer?: typeof SCORER;
  pages: PageComparison[];
}

/**
 * The scorer `score` comes from: v3 with three documented miscalibrations corrected (navigation
 * in a header whose colour theme is named "brand", off-screen slides counted as columns, a
 * picture-only band on a phone that can't match the section holding it with its words). The
 * strict v3 score is reported beside it. See docs/qa/import-fidelity.md.
 */
export const SCORER = "v3.1-corrected" as const;

export type ScoreMode = "corrected" | "strict";

export interface CompareOptions {
  /** Relative size difference still counted as the same (default 0.12). */
  sizeTolerance?: number;
}

const norm = (s: string | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
const jaccard = (a: string, b: string) => {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
};
const hexRgb = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
/** Perceptual-ish distance between two #rrggbb colors (0–~441). */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexRgb(a) as [number, number, number];
  const [r2, g2, b2] = hexRgb(b) as [number, number, number];
  const rm = (r1 + r2) / 2;
  return (
    Math.sqrt(
      (2 + rm / 256) * (r1 - r2) ** 2 +
        4 * (g1 - g2) ** 2 +
        (2 + (255 - rm) / 256) * (b1 - b2) ** 2,
    ) / 1.73
  );
}

const px = (n: number | undefined) => (n === undefined ? "—" : `${Math.round(n * 10) / 10}px`);
const within = (a: number, b: number, tol: number) => Math.abs(a - b) <= Math.max(1, a * tol);

const PRESET_LABEL: Record<string, string> = {
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  body: "Body text",
  lead: "Lead text",
  small: "Small text",
  eyebrow: "Eyebrows",
  button: "Buttons",
  nav: "Navigation",
  wordmark: "Site title",
};
const ROLE_OF: Record<string, "heading" | "body" | "label"> = {
  h1: "heading",
  h2: "heading",
  h3: "heading",
  body: "body",
  lead: "body",
  small: "body",
  eyebrow: "label",
  button: "label",
  nav: "label",
  wordmark: "label",
};

/** A preset as the given scorer reads it (the corrected one also sees `corrections.nav`). */
function presetOf(p: LookProbe, k: keyof LookProbe["presets"], mode: ScoreMode) {
  const v = p.presets[k];
  if (v || mode === "strict" || k !== "nav") return v;
  return p.corrections?.nav;
}

function typeChecks(
  o: LookProbe,
  i: LookProbe,
  tol: number,
  mode: ScoreMode = "corrected",
): FidelityCheck[] {
  const out: FidelityCheck[] = [];
  const mobile = o.viewport < 700;
  const sizeKey = mobile ? "sizeMobile" : "size";
  const seenFont = new Set<string>();
  for (const k of [
    "h1",
    "h2",
    "h3",
    "body",
    "lead",
    "eyebrow",
    "button",
    "nav",
    "wordmark",
  ] as const) {
    const a = presetOf(o, k, mode);
    const b = presetOf(i, k, mode);
    if (!a) continue;
    // Phones show the menu, not the navigation bar; h3s set as small caps labels aren't headings.
    if (k === "nav" && mobile) continue;
    if ((k === "h1" || k === "h2" || k === "h3") && a.case === "uppercase" && a.size < 16) continue;
    if (!b) {
      if (k === "lead" || k === "h3") continue;
      out.push({
        area: "type",
        what: `${PRESET_LABEL[k]}: present`,
        original: `${a.family} ${px(a.size)}`,
        imported: "not found",
        ok: false,
        weight: 1,
      });
      continue;
    }
    const role = ROLE_OF[k] as string;
    if (!seenFont.has(role) && !(k === "h3" && a.case === "uppercase")) {
      seenFont.add(role);
      const credit = fontCredit(a.family, b.family, o, i);
      const same = credit === 1;
      out.push({
        area: "fonts",
        what: `${role === "heading" ? "Heading" : role === "body" ? "Body" : "Label"} font`,
        original: a.family,
        imported: credit > 0 && !same ? `${b.family} (close stand-in)` : b.family,
        ok: same,
        ...(same ? {} : { credit }),
        ...(same
          ? {}
          : {
              fix: `Site Styles → choices.typography.${role} = { family: "${a.family}" } (Google Fonts), or upload it in Site Styles → Your fonts.`,
            }),
        weight: 3,
      });
    }
    const sameSize = within(a.size, b.size, tol);
    out.push({
      area: "type",
      what: `${PRESET_LABEL[k]} size`,
      original: px(a.size),
      imported: px(b.size),
      ok: sameSize,
      ...(sameSize
        ? {}
        : { fix: `choices.typography.scale.${k}.${sizeKey} = ${Math.round(a.size)}` }),
      weight: k === "h1" || k === "h2" || k === "body" ? 2 : 1,
    });
    if (k === "eyebrow" || k === "button" || k === "nav" || k === "wordmark") {
      const ls = Math.abs(a.letterSpacing - b.letterSpacing) <= 0.04;
      const cs = a.case === b.case || (k === "nav" && a.case === "none");
      out.push({
        area: k === "button" ? "buttons" : "type",
        what: `${PRESET_LABEL[k]} letter spacing and case`,
        original: `${a.letterSpacing}em, ${a.case}`,
        imported: `${b.letterSpacing}em, ${b.case}`,
        ok: ls && cs,
        ...(ls && cs
          ? {}
          : {
              fix: `choices.typography.scale.${k} = { letterSpacing: ${a.letterSpacing}, case: "${a.case}" }`,
            }),
        weight: 1,
      });
    }
  }
  return out;
}

function layoutChecks(o: LookProbe, i: LookProbe): FidelityCheck[] {
  const out: FidelityCheck[] = [];
  const mobile = o.viewport < 700;
  const a = o.layout;
  const b = i.layout;
  if (!mobile && a.contentWidth && b.contentWidth) {
    const ok = within(a.contentWidth, b.contentWidth, 0.06);
    out.push({
      area: "layout",
      what: "Content width",
      original: px(a.contentWidth),
      imported: px(b.contentWidth),
      ok,
      ...(ok ? {} : { fix: `choices.layout.contentWidth = ${Math.round(a.contentWidth)}` }),
      weight: 2,
    });
  }
  if (a.sectionPadding && b.sectionPadding) {
    const ok = within(a.sectionPadding, b.sectionPadding, 0.25);
    out.push({
      area: "layout",
      what: "Section padding",
      original: px(a.sectionPadding),
      imported: px(b.sectionPadding),
      ok,
      ...(ok
        ? {}
        : {
            fix: `choices.layout.${mobile ? "sectionPaddingMobile" : "sectionPadding"} = ${Math.round(a.sectionPadding)}`,
          }),
      weight: 1,
    });
  }
  if (o.buttons && i.buttons) {
    const ok =
      Math.abs(o.buttons.radius - i.buttons.radius) <= 3 ||
      (o.buttons.radius > 20 && i.buttons.radius > 20);
    out.push({
      area: "buttons",
      what: "Button corners",
      original: px(o.buttons.radius),
      imported: px(i.buttons.radius),
      ok,
      ...(ok
        ? {}
        : {
            fix: `choices.shape = "${o.buttons.radius === 0 ? "sharp" : o.buttons.radius > 20 ? "round" : "soft"}"`,
          }),
      weight: 1,
    });
  }
  return out;
}

const textStyle = (t: ProbeText) => `${t.family} ${px(t.size)}${t.italic ? " italic" : ""}`;

/** Match original sections to imported ones: same heading, else similar words, else order. */
export function matchSections(o: ProbeSection[], i: ProbeSection[]): (number | undefined)[] {
  const taken = new Set<number>();
  const out: (number | undefined)[] = o.map(() => undefined);
  // Exact heading matches first.
  o.forEach((s, k) => {
    if (!s.heading) return;
    const j = i.findIndex(
      (t, n) => !taken.has(n) && t.heading && norm(t.heading.text) === norm(s.heading?.text),
    );
    if (j >= 0) {
      out[k] = j;
      taken.add(j);
    }
  });
  o.forEach((s, k) => {
    if (out[k] !== undefined) return;
    let best = -1;
    let score = 0.34;
    i.forEach((t, n) => {
      if (taken.has(n)) return;
      const sc = jaccard(
        `${s.heading?.text ?? ""} ${s.text}`,
        `${t.heading?.text ?? ""} ${t.text}`,
      );
      if (sc > score) {
        score = sc;
        best = n;
      }
    });
    if (best >= 0) {
      out[k] = best;
      taken.add(best);
    }
  });
  // An original section whose words all sit inside one imported section (an article the original
  // split around its pictures, kept as one text section): matched to it, even if it's taken.
  o.forEach((s, k) => {
    if (out[k] !== undefined) return;
    const A = words(`${s.heading?.text ?? ""} ${s.words ?? s.text}`);
    if (A.size < 4) return;
    let best = -1;
    let score = 0.6;
    i.forEach((t, n) => {
      const B = words(`${t.heading?.text ?? ""} ${t.words ?? t.text}`);
      let hit = 0;
      for (const w of A) if (B.has(w)) hit++;
      if (hit / A.size > score) {
        score = hit / A.size;
        best = n;
      }
    });
    if (best >= 0) out[k] = best;
  });
  // Between two matched neighbours, a single unmatched section on each side is the same one
  // (a product grid, a sign-up band): matched by position.
  o.forEach((_, k) => {
    if (out[k] !== undefined) return;
    let pk = k - 1;
    while (pk >= 0 && out[pk] === undefined) pk--;
    let nk = k + 1;
    while (nk < o.length && out[nk] === undefined) nk++;
    const lo = pk >= 0 ? (out[pk] as number) : -1;
    const hi = nk < o.length ? (out[nk] as number) : i.length;
    const gapO = nk - pk - 1;
    const free = [];
    for (let n = lo + 1; n < hi; n++) if (!taken.has(n)) free.push(n);
    if (gapO === 1 && free.length === 1) {
      out[k] = free[0];
      taken.add(free[0] as number);
    }
  });
  return out;
}

/** Columns as the given scorer counts them (the corrected one: only what's on screen). */
const columnsOf = (s: ProbeSection, mode: ScoreMode) =>
  mode === "corrected" ? (s.columnsOnScreen ?? s.columns) : s.columns;

function sectionChecks(
  a0: ProbeSection,
  b0: ProbeSection,
  tol: number,
  o?: LookProbe,
  i?: LookProbe,
  mode: ScoreMode = "corrected",
): FidelityCheck[] {
  const a = { ...a0, columns: columnsOf(a0, mode) };
  const b = { ...b0, columns: columnsOf(b0, mode) };
  const out: FidelityCheck[] = [];
  const add = (c: Omit<FidelityCheck, "area">) => out.push({ area: "section", ...c });
  if (a.background && b.background && !a.backgroundImage) {
    const d = colorDistance(a.background, b.background);
    add({
      what: "Background",
      original: a.background,
      imported: b.background,
      ok: d < 16,
      ...(d < 16
        ? {}
        : {
            fix: `Give the section its own background color (style.background = { type: "color", color: "${a.background}" }).`,
          }),
      weight: 2,
    });
  }
  if (a.heading && b.heading) {
    const size = within(a.heading.size, b.heading.size, tol);
    const credit = size ? fontCredit(a.heading.family, b.heading.family, o, i) : 0;
    add({
      what: "Heading",
      original: textStyle(a.heading),
      imported: textStyle(b.heading),
      ok: credit === 1,
      ...(credit < 1 ? { credit } : {}),
      weight: 2,
    });
  }
  if (a.body && b.body) {
    const size = within(a.body.size, b.body.size, tol);
    const credit = size ? fontCredit(a.body.family, b.body.family, o, i) : 0;
    add({
      what: "Text",
      original: textStyle(a.body),
      imported: textStyle(b.body),
      ok: credit === 1,
      ...(credit < 1 ? { credit } : {}),
      weight: 2,
    });
  }
  if (a.textColor && b.textColor) {
    const d = colorDistance(a.textColor, b.textColor);
    add({
      what: "Text color",
      original: a.textColor,
      imported: b.textColor,
      ok: d < 28,
      weight: 1,
    });
  }
  if (a.columns !== b.columns) {
    add({
      what: "Columns",
      original: String(a.columns),
      imported: String(b.columns),
      ok: Math.abs(a.columns - b.columns) <= 0,
      fix:
        a.columns > b.columns
          ? "Lay the text out in columns (a stack layout with more columns, or the text block's Columns style)."
          : "Fewer columns: merge them into one stack column.",
      weight: 2,
    });
  } else
    add({
      what: "Columns",
      original: String(a.columns),
      imported: String(b.columns),
      ok: true,
      weight: 2,
    });
  if (a.eyebrow) {
    const ok = !!b.eyebrow && (!a.rule || !!b.rule);
    add({
      what: "Eyebrow and rule",
      original: `${a.eyebrow.text}${a.rule ? " + rule" : ""}`,
      imported: b.eyebrow ? `${b.eyebrow.text}${b.rule ? " + rule" : ""}` : "none",
      ok,
      ...(ok
        ? {}
        : {
            fix:
              a.rule && b.eyebrow
                ? 'Heading block variant "eyebrow-rule".'
                : "Add the eyebrow to the heading block.",
          }),
      weight: 1,
    });
  }
  if (a.italicLines > 0) {
    const ok = b.italicLines > 0;
    add({
      what: "Italic lines",
      original: String(a.italicLines),
      imported: String(b.italicLines),
      ok,
      ...(ok ? {} : { fix: "Set the closing/pull line in italics (lead style)." }),
      weight: 1,
    });
  }
  if (a.image) {
    const ok =
      !!b.image &&
      b.image.side === a.image.side &&
      Math.abs(b.image.widthShare - a.image.widthShare) <=
        Math.max(0.08, a.image.widthShare * 0.35);
    add({
      what: "Image placement",
      original: `${a.image.side}, ${Math.round(a.image.widthShare * 100)}% wide`,
      imported: b.image ? `${b.image.side}, ${Math.round(b.image.widthShare * 100)}% wide` : "none",
      ok,
      ...(ok ? {} : { fix: "Adjust the stack column spans (image column) or the image's side." }),
      weight: 1,
    });
    if (a.image.aspect && b.image?.aspect) {
      const r = b.image.aspect / a.image.aspect;
      const same = r > 0.85 && r < 1.18;
      add({
        what: "Image crop",
        original: `${a.image.aspect}:1`,
        imported: `${b.image.aspect}:1`,
        ok: same,
        ...(same
          ? {}
          : { fix: "Use the original's image proportions (the block's aspect ratio)." }),
        weight: 1,
      });
    }
  }
  const hr = b.height / Math.max(1, a.height);
  add({
    what: "Height",
    original: px(a.height),
    imported: px(b.height),
    ok: hr > 0.7 && hr < 1.35,
    weight: 1,
  });
  return out;
}

const exactScore = (checks: FidelityCheck[]) => {
  const total = checks.reduce((n, c) => n + c.weight, 0);
  if (!total) return 100;
  const got = checks.reduce((n, c) => n + c.weight * (c.ok ? 1 : Math.min(1, c.credit ?? 0)), 0);
  return (100 * got) / total;
};
const scoreOf = (checks: FidelityCheck[]) => Math.round(exactScore(checks));

/** Share of a page's score that comes from how alike the screenshots look. */
export const VISUAL_WEIGHT = 0.25;

/** Fold a perceptual similarity (0–1) into a page comparison's score. */
export function withVisual(p: PageComparison, visual: number): PageComparison {
  const structure = p.structure ?? p.score;
  const base = p.exact ?? structure;
  const v = Math.max(0, Math.min(1, visual));
  const exact = (1 - VISUAL_WEIGHT) * base + VISUAL_WEIGHT * 100 * v;
  const strictExact = p.strict
    ? (1 - VISUAL_WEIGHT) * p.strict.checks + VISUAL_WEIGHT * 100 * v
    : undefined;
  return {
    ...p,
    structure,
    visual: Math.round(v * 1000) / 1000,
    exact,
    score: Math.round(exact),
    ...(p.strict && strictExact !== undefined
      ? { strict: { ...p.strict, exact: strictExact, score: Math.round(strictExact) } }
      : {}),
  };
}

/** A section made of a picture alone: no heading and (next to) no words. */
const pictureOnly = (s: ProbeSection) =>
  !s.heading &&
  (s.text ?? "").replace(/\s+/g, "").length < 3 &&
  Boolean(s.image || s.backgroundImage);

/**
 * Corrected scorer only: on a phone, a picture-only band of the original (a Squarespace index row
 * whose photo stacks above its words) has no section of its own on the new page — the picture
 * sits in the section that holds it with its words. Find that section: between the imported
 * matches of the band's matched neighbours (inclusive), one with a picture, nearest in position.
 */
function pictureHost(
  k: number,
  match: (number | undefined)[],
  o: LookProbe,
  i: LookProbe,
): number | undefined {
  let pk = k - 1;
  while (pk >= 0 && match[pk] === undefined) pk--;
  let nk = k + 1;
  while (nk < match.length && match[nk] === undefined) nk++;
  const lo = pk >= 0 ? (match[pk] as number) : 0;
  const hi = nk < match.length ? (match[nk] as number) : i.sections.length - 1;
  const at = (o.sections[k]?.top ?? 0) / Math.max(1, o.height);
  let best: number | undefined;
  let gap = Number.POSITIVE_INFINITY;
  for (let n = Math.min(lo, hi); n <= Math.max(lo, hi); n++) {
    const t = i.sections[n];
    if (!t || !(t.image || t.backgroundImage)) continue;
    const d = Math.abs(t.top / Math.max(1, i.height) - at);
    if (d < gap) {
      gap = d;
      best = n;
    }
  }
  return best;
}

function comparePage(
  original: LookProbe,
  imported: LookProbe,
  tol: number,
  mode: ScoreMode,
  notes?: string[],
): { checks: FidelityCheck[]; sections: SectionComparison[]; exact: number } {
  const checks = [
    ...typeChecks(original, imported, tol, mode),
    ...layoutChecks(original, imported),
  ];
  if (
    notes &&
    original.viewport >= 700 &&
    !original.presets.nav !== !presetOf(original, "nav", mode)
  )
    notes.push('The original\'s navigation sits in a header themed "brand": read as navigation.');
  if (notes && !imported.presets.nav && presetOf(imported, "nav", mode) && original.viewport >= 700)
    notes.push(
      'The new site\'s navigation sits in a header themed "brand" (os-theme-brand): read as navigation, not as a logo.',
    );
  const match = matchSections(original.sections, imported.sections);
  const phone = original.viewport < 700;
  const sections: SectionComparison[] = original.sections.map((s, k) => {
    const j = match[k];
    const other = j === undefined ? undefined : imported.sections[j];
    let c: FidelityCheck[];
    let shared: number | undefined;
    if (other) {
      c = sectionChecks(s, other, tol, original, imported, mode);
      if (notes && mode === "corrected") {
        const was = [s.columns, other.columns];
        const now = [columnsOf(s, mode), columnsOf(other, mode)];
        if ((was[0] !== was[1]) !== (now[0] !== now[1]))
          notes.push(
            `Section ${k + 1}: columns counted on screen only (${was[0]} → ${was[1]} counted as ${now[0]} → ${now[1]}; off-screen slides aren't columns).`,
          );
      }
    } else if (mode === "corrected" && phone && pictureOnly(s)) {
      shared = pictureHost(k, match, original, imported);
      c = [];
    } else c = [];
    if (shared !== undefined) {
      const host = imported.sections[shared] as ProbeSection;
      notes?.push(
        `Section ${k + 1} (a picture alone on a phone) is the picture of section ${shared + 1}, which holds it with its words.`,
      );
      c = [
        {
          area: "section",
          what: "Present",
          original: "(a picture)",
          imported: `with its words in section ${shared + 1}`,
          ok: true,
          weight: 4,
        },
      ];
      const sa = s.image?.aspect;
      const sb = host.image?.aspect;
      if (sa && sb) {
        const r = sb / sa;
        const same = r > 0.85 && r < 1.18;
        c.push({
          area: "section",
          what: "Image crop",
          original: `${sa}:1`,
          imported: `${sb}:1`,
          ok: same,
          ...(same
            ? {}
            : { fix: "Use the original's image proportions (the block's aspect ratio)." }),
          weight: 1,
        });
      }
    } else if (!other)
      c = [
        {
          area: "section" as const,
          what: "Present",
          original: s.heading?.text ?? s.text.slice(0, 40),
          imported: "no matching section",
          ok: false,
          fix: "Bring this section across (or check it was merged into another).",
          weight: 4,
        },
      ];
    const at = j ?? shared;
    return {
      index: k,
      ...(s.heading ? { heading: s.heading.text } : {}),
      ...(at !== undefined ? { importedIndex: at } : {}),
      checks: c,
      score: scoreOf(c),
    };
  });
  const all = [...checks, ...sections.flatMap((s) => s.checks)];
  return { checks, sections, exact: exactScore(all) };
}

/**
 * Compare one page's original and imported probes (same viewport). `score` is the corrected
 * scorer's; `strict` is the strict v3 score of the same measurements, reported beside it.
 */
export function compareLooks(
  original: LookProbe,
  imported: LookProbe,
  path: string,
  opts: CompareOptions = {},
): PageComparison {
  const tol = opts.sizeTolerance ?? 0.12;
  const notes: string[] = [];
  const page = comparePage(original, imported, tol, "corrected", notes);
  const strict = comparePage(original, imported, tol, "strict");
  return {
    path,
    original: original.url,
    imported: imported.url,
    viewport: original.viewport,
    score: Math.round(page.exact),
    structure: Math.round(page.exact),
    exact: page.exact,
    checks: page.checks,
    sections: page.sections,
    strict: {
      score: Math.round(strict.exact),
      exact: strict.exact,
      structure: Math.round(strict.exact),
      checks: strict.exact,
    },
    ...(notes.length ? { corrections: notes } : {}),
  };
}

export function fidelityReport(pages: PageComparison[]): FidelityReport {
  const mean = (f: (p: PageComparison) => number) =>
    pages.length ? pages.reduce((n, p) => n + f(p), 0) / pages.length : 100;
  const exact = mean((p) => p.exact ?? p.score);
  const strict = mean((p) => p.strict?.exact ?? p.exact ?? p.score);
  return {
    score: Math.round(exact),
    exact: Math.round(exact * 100) / 100,
    strict: { score: Math.round(strict), exact: Math.round(strict * 100) / 100 },
    scorer: SCORER,
    pages,
  };
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** The report as Markdown (FIDELITY-REPORT.md). */
export function fidelityMarkdown(
  report: FidelityReport,
  opts: {
    images?: Record<string, string[]>;
    tuning?: {
      before: number;
      changes: string[];
      withoutComponents?: number;
      withComponents?: number;
    };
  } = {},
): string {
  const lines = [
    "# Visual fidelity",
    "",
    `Overall match: **${report.score}/100** — fonts, type sizes, spacing and each section measured in a browser on both sites (75%), and how alike the pages look as pictures (25%). How it's scored: docs/qa/import-fidelity.md.`,
    "",
    ...(report.strict
      ? [
          `Scored two ways, side by side: **${report.score}/100 corrected**, ${report.strict.score}/100 by the strict v3 scorer. The corrected score reads three things the strict one gets wrong (navigation in a header themed "brand", off-screen slides counted as columns, a picture-only band on a phone); the pages below list where it did.`,
          "",
        ]
      : []),
  ];
  if (opts.tuning) {
    lines.push(
      `Auto-tuning raised it from ${opts.tuning.before}/100${opts.tuning.changes.length ? ":" : " (nothing it tried helped, so nothing was changed)."}`,
      "",
      ...opts.tuning.changes.slice(0, 30).map((c) => `- ${c}`),
      "",
      ...(opts.tuning.withoutComponents !== undefined
        ? [
            opts.tuning.withComponents !== undefined
              ? `Without custom components: ${opts.tuning.withoutComponents}/100; with the sections recreated as components: ${opts.tuning.withComponents}/100.`
              : `Recreating low-scoring sections as custom components didn't raise the score (${opts.tuning.withoutComponents}/100), so none were kept.`,
            "",
          ]
        : []),
    );
  }
  for (const p of report.pages) {
    lines.push(
      `## ${p.path} at ${p.viewport}px — ${p.score}/100${p.strict && p.strict.score !== p.score ? ` (strict v3: ${p.strict.score}/100)` : ""}`,
      "",
    );
    if (p.corrections?.length)
      lines.push("Corrected scoring on this page:", "", ...p.corrections.map((c) => `- ${c}`), "");
    if (p.visual !== undefined)
      lines.push(
        `Checks ${p.structure ?? p.score}/100 · looks alike ${Math.round(p.visual * 100)}/100 (screenshots compared).`,
        "",
      );
    lines.push(`Original: ${p.original}  `, `Imported: ${p.imported}`, "");
    const imgs = opts.images?.[`${p.path}@${p.viewport}`];
    if (imgs?.length) {
      lines.push(...imgs.map((src) => `![side by side](${src})`), "");
    }
    const fails = p.checks.filter((c) => !c.ok);
    lines.push("| Check | Original | Imported | |", "|---|---|---|---|");
    for (const c of p.checks)
      lines.push(
        `| ${cell(c.what)} | ${cell(c.original)} | ${cell(c.imported)} | ${c.ok ? "same" : c.credit ? `close (${Math.round(c.credit * 100)}%)` : "**differs**"} |`,
      );
    lines.push("", "| # | Section | Match | Differences |", "|---|---|---|---|");
    for (const s of p.sections) {
      const diffs = s.checks
        .filter((c) => !c.ok)
        .map((c) => `${c.what}: ${c.original} → ${c.imported}`);
      lines.push(
        `| ${s.index + 1} | ${cell(s.heading ?? "(no heading)")} | ${s.score} | ${cell(diffs.join("; ") || "—")} |`,
      );
    }
    const fixes = [
      ...new Set(
        [...fails, ...p.sections.flatMap((s) => s.checks.filter((c) => !c.ok))]
          .map((c) => c.fix)
          .filter((f): f is string => !!f),
      ),
    ];
    if (fixes.length)
      lines.push("", "What would close the gap:", "", ...fixes.map((f) => `- ${f}`));
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
