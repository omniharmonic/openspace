/**
 * Visual/typographic fidelity: two look probes (the original page and the imported page, same
 * viewport) → a per-page and per-section diff a person or the migrate skill can act on: fonts per
 * role, type sizes, tracking and case, content width and section padding, and per section its
 * background, heading and text styles, column count, eyebrow rule, italic lines and image
 * placement. Each failed check names the Site Styles setting (`set_styles`) that would close it.
 */
import type { LookProbe, ProbeSection, ProbeText } from "./probe";

export interface FidelityCheck {
  area: "fonts" | "type" | "layout" | "buttons" | "section";
  what: string;
  original: string;
  imported: string;
  ok: boolean;
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
  score: number;
  checks: FidelityCheck[];
  sections: SectionComparison[];
}

export interface FidelityReport {
  /** 0–100, weighted over every page and viewport. */
  score: number;
  pages: PageComparison[];
}

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

function typeChecks(o: LookProbe, i: LookProbe, tol: number): FidelityCheck[] {
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
    const a = o.presets[k];
    const b = i.presets[k];
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
      const same = norm(a.family) === norm(b.family);
      out.push({
        area: "fonts",
        what: `${role === "heading" ? "Heading" : role === "body" ? "Body" : "Label"} font`,
        original: a.family,
        imported: b.family,
        ok: same,
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

function sectionChecks(a: ProbeSection, b: ProbeSection, tol: number): FidelityCheck[] {
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
    const ok =
      norm(a.heading.family) === norm(b.heading.family) &&
      within(a.heading.size, b.heading.size, tol);
    add({
      what: "Heading",
      original: textStyle(a.heading),
      imported: textStyle(b.heading),
      ok,
      weight: 2,
    });
  }
  if (a.body && b.body) {
    const ok = norm(a.body.family) === norm(b.body.family) && within(a.body.size, b.body.size, tol);
    add({ what: "Text", original: textStyle(a.body), imported: textStyle(b.body), ok, weight: 2 });
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

const scoreOf = (checks: FidelityCheck[]) => {
  const total = checks.reduce((n, c) => n + c.weight, 0);
  if (!total) return 100;
  return Math.round((100 * checks.filter((c) => c.ok).reduce((n, c) => n + c.weight, 0)) / total);
};

/** Compare one page's original and imported probes (same viewport). */
export function compareLooks(
  original: LookProbe,
  imported: LookProbe,
  path: string,
  opts: CompareOptions = {},
): PageComparison {
  const tol = opts.sizeTolerance ?? 0.12;
  const checks = [...typeChecks(original, imported, tol), ...layoutChecks(original, imported)];
  const match = matchSections(original.sections, imported.sections);
  const sections: SectionComparison[] = original.sections.map((s, k) => {
    const j = match[k];
    const other = j === undefined ? undefined : imported.sections[j];
    const c = other
      ? sectionChecks(s, other, tol)
      : [
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
    return {
      index: k,
      ...(s.heading ? { heading: s.heading.text } : {}),
      ...(j !== undefined ? { importedIndex: j } : {}),
      checks: c,
      score: scoreOf(c),
    };
  });
  const all = [...checks, ...sections.flatMap((s) => s.checks)];
  return {
    path,
    original: original.url,
    imported: imported.url,
    viewport: original.viewport,
    score: scoreOf(all),
    checks,
    sections,
  };
}

export function fidelityReport(pages: PageComparison[]): FidelityReport {
  const score = pages.length
    ? Math.round(pages.reduce((n, p) => n + p.score, 0) / pages.length)
    : 100;
  return { score, pages };
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** The report as Markdown (FIDELITY-REPORT.md). */
export function fidelityMarkdown(
  report: FidelityReport,
  opts: { images?: Record<string, string[]> } = {},
): string {
  const lines = [
    "# Visual fidelity",
    "",
    `Overall match: **${report.score}/100** (fonts, type sizes, spacing and each section, measured in a browser on both sites).`,
    "",
  ];
  for (const p of report.pages) {
    lines.push(`## ${p.path} at ${p.viewport}px — ${p.score}/100`, "");
    lines.push(`Original: ${p.original}  `, `Imported: ${p.imported}`, "");
    const imgs = opts.images?.[`${p.path}@${p.viewport}`];
    if (imgs?.length) {
      lines.push(...imgs.map((src) => `![side by side](${src})`), "");
    }
    const fails = p.checks.filter((c) => !c.ok);
    lines.push("| Check | Original | Imported | |", "|---|---|---|---|");
    for (const c of p.checks)
      lines.push(
        `| ${cell(c.what)} | ${cell(c.original)} | ${cell(c.imported)} | ${c.ok ? "same" : "**differs**"} |`,
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
