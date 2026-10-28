/**
 * One round of the import's auto-tuning: from a fidelity comparison (both sites measured in a
 * browser, per page, desktop and phone) to a changed site document — type sizes, tracking and
 * case per preset, content width and section padding, button corners, fonts that ended up
 * unrelated, and per page the section backgrounds, card columns, image columns and image crops
 * of the original. The CLI applies a round, renders again, measures again and keeps whichever
 * version scored best (bounded number of rounds), so a change that doesn't help is undone.
 */

import { componentIssues } from "@omniharmonic/openspace-lint";
import {
  type Block,
  checkComponent,
  componentSection,
  type Link,
  type Page,
  type Section,
  type SiteDocument,
  type TypeScalePreset,
  type TypeStep,
} from "@omniharmonic/openspace-schema";
import { compileStyles, SPACE_SCALES } from "@omniharmonic/openspace-theme";
import { colorDistance, type PageComparison } from "./compare";
import { canGenerate, componentFromBlueprint } from "./component-gen";
import { nearestOpenFont } from "./font-match";
import { applyLayoutHints } from "./hints";
import type { LookProbe, ProbeSection } from "./probe";

export interface TuneInput {
  path: string;
  viewport: number;
  original: LookProbe;
  imported: LookProbe;
  comparison: PageComparison;
}

/**
 * What a round may change. The CLI tries one group at a time and keeps it only when the score
 * goes up, so a good change never rides in with a bad one.
 */
export const TUNE_GROUPS = [
  "type",
  "fonts",
  "rhythm",
  "rhythm-phone",
  "widths",
  "chapters",
  "colors",
  "page-color",
  "buttons",
  "layout",
  "headings",
  "heights",
  "backgrounds",
  "crops",
  "phone-images",
  "components",
] as const;

/** Sections scoring below this (computer) are recreated as custom components, if that helps. */
export const COMPONENT_THRESHOLD = 60;
export type TuneGroup = (typeof TUNE_GROUPS)[number];

export interface TuneResult {
  doc: SiteDocument;
  /** What changed, in plain words (for the report). */
  changes: string[];
}

const PRESET_OF: Record<string, TypeScalePreset> = {
  "Heading 1": "h1",
  "Heading 2": "h2",
  "Heading 3": "h3",
  "Body text": "body",
  "Lead text": "lead",
  Eyebrows: "eyebrow",
  Buttons: "button",
  Navigation: "nav",
  "Site title": "wordmark",
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[Math.floor(s.length / 2)] as number) : undefined;
};
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const norm = (s: string | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const ASPECTS: [string, number][] = [
  ["1:1", 1],
  ["4:5", 0.8],
  ["2:3", 2 / 3],
  ["3:2", 1.5],
  ["16:9", 16 / 9],
  ["21:9", 21 / 9],
];

/** The nearest image-block aspect option to a measured crop (`original` when none is close). */
export function nearestAspect(ratio: number): string {
  let best = "original";
  let d = 0.12;
  for (const [name, r] of ASPECTS) {
    const x = Math.abs(Math.log(ratio / r));
    if (x < d) {
      d = x;
      best = name;
    }
  }
  return best;
}

const pageOf = (doc: SiteDocument, path: string): Page | undefined => {
  const slug = path.replace(/^\/+|\/+$/g, "");
  return Object.values(doc.pages).find((p) => p.slug === slug);
};

/**
 * One tuning step: the changes of the given groups (default: all). Pure: returns a new document
 * (the input is not changed).
 */
export function tuneRound(
  input: SiteDocument,
  measured: TuneInput[],
  groups: readonly TuneGroup[] = TUNE_GROUPS,
  opts: {
    /** Components: only these pages (the CLI tries one page at a time). */
    paths?: string[];
    /** Components: recreate sections scoring below this (default `COMPONENT_THRESHOLD`). */
    threshold?: number;
  } = {},
): TuneResult {
  const doc = structuredClone(input) as SiteDocument;
  const on = (g: TuneGroup) => groups.includes(g);
  const changes: string[] = [];
  const choices = doc.styles.choices;
  const typography = { ...(choices.typography ?? {}) };
  const scale: Partial<Record<TypeScalePreset, TypeStep>> = { ...(typography.scale ?? {}) };

  // --- type scale: sizes per preset (desktop and phone), tracking and case --------------------
  // A preset changes only when the original sets it consistently across pages (one size, within
  // 15%) and most pages that show it differ: a lead line on one page isn't the site's lead size.
  // Buttons: pages whose measured button is a content button (not a search or cookie button in
  // the chrome) speak for the site's button style, when there are any.
  const forPreset = (preset: string, list: TuneInput[]) => {
    if (preset !== "button") return list;
    const content = list.filter((m) => !m.original.buttons?.chrome);
    return content.length ? content : list;
  };
  for (const preset of on("type") ? new Set(Object.values(PRESET_OF)) : []) {
    const label = Object.entries(PRESET_OF).find(([, p]) => p === preset)?.[0] as string;
    const step: TypeStep = { ...(scale[preset] ?? {}) };
    let touched = false;
    for (const phone of [false, true]) {
      if (phone && preset === "nav") continue;
      const list = forPreset(
        preset,
        measured.filter(
          (m) =>
            m.viewport < 700 === phone && m.original.presets[preset] && m.imported.presets[preset],
        ),
      );
      if (!list.length) continue;
      const sizes = list.map((m) => m.original.presets[preset]?.size as number);
      const target = median(sizes) as number;
      const spread = (Math.max(...sizes) - Math.min(...sizes)) / target;
      const failing = list.filter((m) =>
        m.comparison.checks.some((c) => c.what === `${label} size` && !c.ok),
      ).length;
      if (spread > 0.15 || failing * 2 < list.length) continue;
      const key = phone ? "sizeMobile" : "size";
      const cur = step[key];
      if (cur && Math.abs(cur - target) / target <= 0.04) continue;
      step[key] = round(clamp(target, 9, phone ? 160 : 220));
      touched = true;
    }
    if (["eyebrow", "button", "nav", "wordmark"].includes(preset)) {
      const all = forPreset(
        preset,
        measured.filter((m) => m.original.presets[preset] && m.imported.presets[preset]),
      );
      const list = all.filter((m) => m.viewport >= 700);
      const fails = (m: TuneInput) =>
        m.comparison.checks.some((c) => c.what === `${label} letter spacing and case` && !c.ok);
      const failing = list.filter(fails);
      // Phones may track the same preset differently (one setting serves both): when they fail
      // and the two medians are close, the value between them passes on both (within 0.04em).
      const phones = all.filter((m) => m.viewport < 700);
      const phoneFailing = phones.filter(fails);
      if (
        list.length &&
        (failing.length * 2 >= list.length ||
          (phones.length && phoneFailing.length * 2 >= phones.length))
      ) {
        const lsDesk = median(list.map((m) => m.original.presets[preset]?.letterSpacing as number));
        const lsPhone = median(
          phones.map((m) => m.original.presets[preset]?.letterSpacing as number),
        );
        const ls =
          lsDesk !== undefined && lsPhone !== undefined && Math.abs(lsDesk - lsPhone) <= 0.075
            ? (lsDesk + lsPhone) / 2
            : lsDesk;
        const cases = list.map((m) => m.original.presets[preset]?.case);
        if (ls !== undefined && Math.abs((step.letterSpacing ?? -1) - ls) > 0.01) {
          step.letterSpacing = round(clamp(ls, -0.2, 1), 3);
          touched = true;
        }
        const c = cases[0];
        if (c && cases.every((x) => x === c) && step.case !== c) {
          step.case = c;
          touched = true;
        }
      }
    }
    if (touched) {
      scale[preset] = step;
      changes.push(
        `${preset}: ${[
          step.size ? `${step.size}px` : "",
          step.sizeMobile ? `${step.sizeMobile}px on phones` : "",
          step.letterSpacing !== undefined ? `tracking ${step.letterSpacing}em` : "",
          step.case && step.case !== "none" ? step.case : "",
        ]
          .filter(Boolean)
          .join(", ")}`,
      );
    }
  }
  // Headings set in another role's font on the original (Bedford's capitalised proxima h2s
  // under garamond h1s): the preset uses that role, as it did.
  if (on("type")) {
    const origs = measured.filter((m) => m.viewport >= 700).map((m) => m.original.presets);
    /** The family most pages use for a role. */
    const familyOf = (pick: (p: LookProbe["presets"]) => string | undefined) => {
      const count = new Map<string, number>();
      for (const f of origs.map(pick)) if (f) count.set(f, (count.get(f) ?? 0) + 1);
      return [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
    };
    const heading = familyOf((p) => (p.h1 ?? p.h2)?.family);
    const body = familyOf((p) => p.body?.family);
    const label = familyOf((p) => (p.eyebrow ?? p.button ?? p.nav)?.family);
    for (const preset of ["h2", "h3"] as const) {
      const fams = origs.map((p) => p[preset]?.family).filter((f): f is string => !!f);
      const f = fams[0];
      if (!f || !fams.every((x) => norm(x) === norm(f))) continue;
      const role =
        norm(f) === norm(heading)
          ? undefined
          : norm(f) === norm(label)
            ? ("label" as const)
            : norm(f) === norm(body)
              ? ("body" as const)
              : undefined;
      if (!role || scale[preset]?.font === role) continue;
      const sample = origs.map((p) => p[preset]).find(Boolean);
      scale[preset] = {
        ...(scale[preset] ?? {}),
        font: role,
        ...(sample
          ? { case: sample.case, letterSpacing: round(clamp(sample.letterSpacing, -0.2, 1), 3) }
          : {}),
      };
      changes.push(`${preset}: in the ${role} font, as on the original`);
    }
  }
  if (Object.keys(scale).length) typography.scale = scale;

  // --- fonts that came out unrelated (no close stand-in): the nearest open match ---------------
  for (const m of on("fonts") ? measured.filter((x) => x.viewport >= 700) : []) {
    for (const c of m.comparison.checks) {
      if (c.area !== "fonts" || c.ok || (c.credit ?? 0) > 0) continue;
      const role = /^Heading/.test(c.what) ? "heading" : /^Body/.test(c.what) ? "body" : "label";
      const match = nearestOpenFont(c.original, m.original.fonts?.[c.original]);
      if (norm(typography[role]?.family) === norm(match.family)) continue;
      // A new family: regular and bold (weights it surely has; the import fits them at publish).
      typography[role] = { family: match.family, category: match.category, weights: [400, 700] };
      changes.push(`${role} font: ${match.family} for ${c.original}`);
    }
  }
  // --- each label preset in the role whose font the original used for it ---------------------
  // (a site title set in the sans label font while buttons use the serif heading font): the
  // preset's font role follows the family measured on the original, when a role has it.
  if (on("fonts")) {
    const roleFamily = (r: "heading" | "body" | "label") =>
      norm(
        typography[r]?.family ??
          (r === "label" ? (typography.body?.family ?? undefined) : undefined),
      );
    for (const preset of ["eyebrow", "button", "nav", "wordmark"] as const) {
      const fams = forPreset(
        preset,
        measured.filter((m) => m.viewport >= 700 && m.original.presets[preset]),
      )
        .map((m) => m.original.presets[preset]?.family)
        .filter((f): f is string => !!f);
      const f = fams[0];
      if (!f || !fams.every((x) => norm(x) === norm(f))) continue;
      const want = (["label", "heading", "body"] as const).find(
        (r) => roleFamily(r) && roleFamily(r) === norm(f),
      );
      if (!want) continue;
      const cur = scale[preset]?.font ?? "label";
      const curFamily = roleFamily(cur);
      if (cur === want || curFamily === norm(f)) continue;
      scale[preset] = { ...(scale[preset] ?? {}), font: want };
      changes.push(`${preset}: in the ${want} font (${f}), as on the original`);
    }
    if (Object.keys(scale).length) typography.scale = scale;
  }
  choices.typography = typography;

  // --- page rhythm and buttons -----------------------------------------------------------------
  const layout = { ...(choices.layout ?? {}) };
  const desk = measured.filter((m) => m.viewport >= 700);
  const phone = measured.filter((m) => m.viewport < 700);
  // Content width: the original's, when its pages agree and most of ours differ.
  const widths = desk
    .filter((m) => m.original.layout.contentWidth && m.imported.layout.contentWidth)
    .map((m) => ({
      w: m.original.layout.contentWidth as number,
      off: m.comparison.checks.some((c) => c.what === "Content width" && !c.ok),
    }));
  const cw = median(widths.map((x) => x.w));
  if (
    on("rhythm") &&
    cw &&
    cw >= 480 &&
    cw <= 2400 &&
    widths.filter((x) => x.off).length * 2 >= widths.length &&
    widths.every((x) => Math.abs(x.w - cw) / cw <= 0.08) &&
    layout.contentWidth !== Math.round(cw / 8) * 8
  ) {
    layout.contentWidth = Math.round(cw / 8) * 8;
    changes.push(`content width ${layout.contentWidth}px`);
  }
  // Per page: a page whose words sit in a narrower (or the site's) column than ours — its
  // sections take the content width, or the narrow width set to the original's measure.
  if (on("widths")) {
    const content = layout.contentWidth;
    for (const m of desk) {
      const check = m.comparison.checks.find((c) => c.what === "Content width" && !c.ok);
      const want = m.original.layout.contentWidth;
      const have = m.imported.layout.contentWidth;
      const page = pageOf(doc, m.path);
      if (!check || !want || !have || !page || want >= have) continue;
      let width: "content" | "narrow" | undefined;
      if (content && Math.abs(content - want) / want <= 0.06) width = "content";
      else if (want >= 360 && want <= 1600) {
        layout.narrowWidth ??= Math.round(want / 8) * 8;
        if (Math.abs(layout.narrowWidth - want) / want <= 0.06) width = "narrow";
      }
      if (!width) continue;
      let n = 0;
      for (const section of page.sections) {
        if (section.layout.mode !== "stack" || section.layout.width === "full") continue;
        if (
          section.style.background?.type === "image" ||
          section.style.background?.type === "video"
        )
          continue;
        const cur = section.layout.width ?? "content";
        if (cur === width) continue;
        if (width === "content") delete section.layout.width;
        else section.layout.width = width;
        delete section.preset;
        n++;
      }
      if (n) changes.push(`${m.path}: ${n} section(s) at the ${width} width, as on the original`);
    }
  }
  // Per page: consecutive sections of ours whose words all sit in one band of the original (an
  // article the import split into chapters, which the original shows as one panel) join again.
  if (on("chapters")) {
    const bag = (t: string) =>
      new Set(
        t
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length > 3),
      );
    for (const m of desk) {
      const page = pageOf(doc, m.path);
      if (!page || m.imported.sections.length !== page.sections.length) continue;
      const keep = new Set(page.sections.map((_, j) => j));
      for (const o of m.original.sections) {
        const mine = bag(`${o.heading?.text ?? ""} ${o.words ?? o.text}`);
        if (mine.size < 20) continue;
        const inside = m.imported.sections
          .map((x, j) => {
            const theirs = bag(`${x.heading?.text ?? ""} ${x.words ?? x.text}`);
            let n = 0;
            for (const w of theirs) if (mine.has(w)) n++;
            return theirs.size >= 3 && n / theirs.size >= 0.85 ? j : -1;
          })
          .filter((j) => j >= 0);
        // Runs of neighbours that can join (plain one-column sections of one look).
        let run: number[] = [];
        const join = () => {
          if (run.length >= 2) {
            const [first, ...rest] = run.map((j) => page.sections[j] as Section);
            for (const r of rest) {
              first?.blocks.push(...r.blocks);
              keep.delete(page.sections.indexOf(r));
            }
            changes.push(`${m.path}: ${run.length} sections joined into one, as on the original`);
          }
          run = [];
        };
        for (const j of inside) {
          const a = page.sections[j] as Section;
          const prev = run.length
            ? (page.sections[run[run.length - 1] as number] as Section)
            : undefined;
          const plain =
            a.layout.mode === "stack" &&
            a.layout.columns.d.length === 1 &&
            !a.anchor &&
            a.style.background?.type !== "image" &&
            a.style.background?.type !== "video";
          const same =
            prev &&
            j === (run[run.length - 1] as number) + 1 &&
            (prev.style.colorTheme ?? "light") === (a.style.colorTheme ?? "light") &&
            prev.layout.mode === "stack" &&
            (prev.layout.width ?? "content") ===
              (a.layout.mode === "stack" ? (a.layout.width ?? "content") : "");
          if (plain && (!run.length || same)) run.push(j);
          else {
            join();
            if (plain) run.push(j);
          }
        }
        join();
      }
      if (keep.size !== page.sections.length)
        page.sections = page.sections.filter((_, j) => keep.has(j));
    }
  }
  const pad = (list: TuneInput[]) =>
    median(
      list
        .filter((m) => m.comparison.checks.some((c) => c.what === "Section padding" && !c.ok))
        .map((m) =>
          m.original.layout.sectionPadding && m.imported.layout.sectionPadding
            ? m.original.layout.sectionPadding / m.imported.layout.sectionPadding
            : 0,
        )
        .filter((n) => n > 0),
    );
  const pd = on("rhythm") ? pad(desk) : undefined;
  const pm = on("rhythm-phone") ? pad(phone) : undefined;
  if (pd) {
    const base =
      layout.sectionPadding ??
      median(desk.map((m) => m.imported.layout.sectionPadding ?? 0).filter(Boolean));
    if (base) {
      layout.sectionPadding = Math.round(clamp(base * clamp(pd, 0.6, 1.6), 0, 200));
      changes.push(`section padding ${layout.sectionPadding}px`);
    }
  }
  if (pm) {
    const base =
      layout.sectionPaddingMobile ??
      median(phone.map((m) => m.imported.layout.sectionPadding ?? 0).filter(Boolean));
    if (base) {
      layout.sectionPaddingMobile = Math.round(clamp(base * clamp(pm, 0.6, 1.6), 0, 140));
      changes.push(`section padding on phones ${layout.sectionPaddingMobile}px`);
    }
  }
  if (Object.keys(layout).length) choices.layout = layout;
  const corners = !on("buttons")
    ? undefined
    : desk
        .map((m) => m.comparison.checks.find((c) => c.what === "Button corners" && !c.ok))
        .find(Boolean);
  if (corners) {
    const r = Number.parseFloat(corners.original);
    const shape = r === 0 ? "sharp" : r > 20 ? "round" : "soft";
    if (choices.shape !== shape) {
      choices.shape = shape;
      changes.push(`button corners ${shape}`);
    }
  }

  // --- text and heading colors per section theme (bone on obsidian, ink on paper) ---------------
  // Every matched section's original and imported color per theme and role (not only the
  // failing ones): the color chosen is the original's that the most sections would pass with.
  type Pair = { o: string; i: string };
  const inks = new Map<string, { text: Pair[]; heading: Pair[]; background: Pair[] }>();
  for (const m of on("colors") || on("page-color") ? desk : []) {
    const page = pageOf(doc, m.path);
    if (!page || m.imported.sections.length !== page.sections.length) continue;
    for (const s of m.comparison.sections) {
      if (s.importedIndex === undefined) continue;
      const o = m.original.sections[s.index];
      const i = m.imported.sections[s.importedIndex];
      const section = page.sections[s.importedIndex];
      if (!o || !i || !section || o.backgroundImage) continue;
      const theme = section.style.colorTheme ?? "light";
      const e = inks.get(theme) ?? { text: [], heading: [], background: [] };
      // The theme's own background (no section color of its own): the original's page color.
      if (o.background && i.background && !section.style.background)
        e.background.push({ o: o.background, i: i.background });
      if (o.textColor && i.textColor) e.text.push({ o: o.textColor, i: i.textColor });
      if (o.heading?.color && i.heading?.color)
        e.heading.push({ o: o.heading.color, i: i.heading.color });
      inks.set(theme, e);
    }
  }
  for (const [theme, e] of inks)
    for (const role of [
      ...(on("colors") ? (["text", "heading"] as const) : []),
      ...(on("page-color") ? (["background"] as const) : []),
    ]) {
      const list = e[role];
      // The check's own tolerance (backgrounds 16, text 28; headings are judged like text).
      const tol = role === "background" ? 16 : 28;
      const passes = (c: (p: Pair) => string) =>
        list.filter((p) => colorDistance(p.o, c(p)) < tol).length;
      const now = passes((p) => p.i);
      let best: string | undefined;
      let bestN = now;
      for (const cand of new Set(list.map((p) => p.o))) {
        const n = passes(() => cand);
        if (n > bestN) {
          best = cand;
          bestN = n;
        }
      }
      if (!best || list.length < 2) continue;
      if (!setRole(doc, theme, role, best)) continue;
      changes.push(
        `${role} on ${theme} sections ${best}, as on the original (${bestN} of ${list.length} sections)`,
      );
    }

  // --- buttons per section theme: the original's own fill (a clay button on a dark band) --------
  const fills = new Map<string, string[]>();
  for (const m of on("buttons") ? desk : []) {
    const page = pageOf(doc, m.path);
    if (!page || m.imported.sections.length !== page.sections.length) continue;
    for (const s of m.comparison.sections) {
      if (s.importedIndex === undefined) continue;
      const o = m.original.sections[s.index];
      const i = m.imported.sections[s.importedIndex];
      const section = page.sections[s.importedIndex];
      if (!o?.button || !i?.button || !section) continue;
      if (colorDistance(o.button, i.button) < 16) continue;
      const theme = section.style.colorTheme ?? "light";
      fills.set(theme, [...(fills.get(theme) ?? []), o.button]);
    }
  }
  for (const [theme, list] of fills) {
    // Only when the original used one fill for that theme throughout.
    const first = list[0] as string;
    if (!list.every((c) => colorDistance(c, first) < 16)) continue;
    if (!setRole(doc, theme, "accent", first)) continue;
    changes.push(`buttons on ${theme} sections ${first}, as on the original`);
  }

  // --- per page: sections as the original laid them out ---------------------------------------
  let themes: Record<string, { background?: string }> | undefined;
  try {
    themes = compileStyles(doc.styles).tokens.themes as Record<string, { background?: string }>;
  } catch {
    themes = undefined;
  }
  // --- banners: a photo section as tall as the original's (padding that fits its words, and the
  // original's height as the minimum, on computer and phone) -------------------------------------
  if (on("heights")) {
    const scaleOf = SPACE_SCALES[choices.density] ?? SPACE_SCALES.comfortable;
    const tokens = Object.entries(scaleOf).sort((a, b) => a[1] - b[1]);
    const fit = (o: ProbeSection, i: ProbeSection) => {
      if (i.contentTop === undefined || i.contentBottom === undefined) return undefined;
      const content = i.contentBottom - i.contentTop;
      const room = (o.height - content) / 2;
      const token = [...tokens].reverse().find(([, px]) => px <= room)?.[0] ?? "none";
      return { token, height: Math.round(o.height) };
    };
    for (const m of desk) {
      const page = pageOf(doc, m.path);
      if (!page || m.imported.sections.length !== page.sections.length) continue;
      const mp = phone.find((x) => x.path === m.path);
      for (const s of m.comparison.sections) {
        if (s.importedIndex === undefined) continue;
        const h = s.checks.find((c) => c.what === "Height");
        const o = m.original.sections[s.index];
        const i = m.imported.sections[s.importedIndex];
        const section = page.sections[s.importedIndex];
        if (!h || h.ok || !o?.backgroundImage || !i || !section) continue;
        if (
          section.style.background?.type !== "image" &&
          section.style.background?.type !== "video"
        )
          continue;
        const d = fit(o, i);
        if (!d) continue;
        const ps = mp?.comparison.sections.find((x) => x.importedIndex === s.importedIndex);
        const po = ps ? mp?.original.sections[ps.index] : undefined;
        const pi = mp?.imported.sections[s.importedIndex];
        const p = po?.backgroundImage && pi ? fit(po, pi) : undefined;
        section.style.padding = { d: d.token as never, ...(p ? { m: p.token as never } : {}) };
        section.style.minHeight = {
          d: `${clamp(d.height, 10, 9999)}px` as never,
          ...(p ? { m: `${clamp(p.height, 10, 9999)}px` as never } : {}),
        };
        changes.push(`${m.path}: section ${s.index + 1} ${d.height}px tall, as on the original`);
      }
    }
  }

  // --- per section: a heading sized (or set as a label) unlike the site's preset for its level --
  // (a page title smaller than the home page's, "PRESS AND PODCASTS" set as a small tracked
  // label): the heading block takes the preset whose measured size matches on computer and phone.
  if (on("headings")) {
    const presetSizes = (list: TuneInput[]) => {
      const out = new Map<string, { size: number; family: string }>();
      for (const k of ["display", "h1", "h2", "h3", "h4", "lead", "eyebrow"] as const) {
        const xs = list
          .map((m) => m.imported.presets[k])
          .filter((t): t is NonNullable<typeof t> => !!t);
        const size = median(xs.map((t) => t.size));
        if (size && xs[0]) out.set(k, { size, family: xs[0].family });
      }
      return out;
    };
    const deskSizes = presetSizes(desk);
    const phoneSizes = presetSizes(phone);
    const fits = (a: number, b: number) => Math.abs(a - b) <= Math.max(1, a * 0.1);
    for (const m of desk) {
      const page = pageOf(doc, m.path);
      if (!page || m.imported.sections.length !== page.sections.length) continue;
      const mp = phone.find((x) => x.path === m.path);
      for (const s of m.comparison.sections) {
        if (s.importedIndex === undefined) continue;
        const hc = s.checks.find((c) => c.what === "Heading");
        if (!hc || hc.ok) continue;
        const o = m.original.sections[s.index]?.heading;
        const i = m.imported.sections[s.importedIndex]?.heading;
        const section = page.sections[s.importedIndex];
        if (!o || !i || !section || fits(o.size, i.size)) continue;
        const po = mp?.original.sections.find((x) => norm(x.heading?.text) === norm(o.text))
          ?.heading?.size;
        const label = o.size < 18 && (o.case === "uppercase" || o.letterSpacing >= 0.05);
        const pick = [...deskSizes]
          .filter(([k, v]) => {
            if (!fits(o.size, v.size)) return false;
            if ((k === "eyebrow") !== label) return false;
            const ph = phoneSizes.get(k);
            return po === undefined || !ph || fits(po, ph.size);
          })
          .sort(([, a], [, b]) => Math.abs(a.size - o.size) - Math.abs(b.size - o.size))[0]?.[0];
        if (!pick) continue;
        const block = section.blocks.find(
          (b: Block) => b.type === "heading" && norm(String(b.fields.text ?? "")) === norm(i.text),
        );
        // A card's or a column's heading (blocks with a heading style slot).
        const holder = block
          ? undefined
          : section.blocks.find(
              (b: Block) =>
                (b.type === "card" && norm(String(b.fields.heading ?? "")) === norm(i.text)) ||
                (b.type === "columns" &&
                  Array.isArray(b.fields.items) &&
                  (b.fields.items as { heading?: string }[]).some(
                    (x) => norm(x.heading) === norm(i.text),
                  )),
            );
        if (holder && pick !== "lead") {
          const style = (holder.style ?? {}) as NonNullable<Block["style"]>;
          if (style.typography?.heading === pick) continue;
          holder.style = {
            ...style,
            typography: { ...(style.typography ?? {}), heading: pick },
          } as Block["style"];
          changes.push(
            `${m.path}: "${o.text.slice(0, 40)}" set at the ${pick} size, as on the original`,
          );
          continue;
        }
        if (!block) {
          // A heading inside rich text: the heading node's own preset (display, h1–h4, eyebrow).
          let done = false;
          for (const b of section.blocks) {
            if (b.type !== "text" || done) continue;
            const doc = b.fields.content as
              | {
                  content?: {
                    type: string;
                    attrs?: Record<string, unknown>;
                    content?: { text?: string }[];
                  }[];
                }
              | undefined;
            for (const node of doc?.content ?? []) {
              const words = (node.content ?? []).map((x) => x.text ?? "").join("");
              if (node.type !== "heading" || norm(words) !== norm(i.text)) continue;
              if (pick === "lead" || node.attrs?.preset === pick) break;
              node.attrs = { ...(node.attrs ?? {}), preset: pick };
              done = true;
              break;
            }
          }
          if (done)
            changes.push(
              `${m.path}: "${o.text.slice(0, 40)}" set at the ${pick} size, as on the original`,
            );
          continue;
        }
        if (["display", "h1", "h2", "h3", "h4"].includes(pick)) {
          if (block.fields.size === pick) continue;
          block.fields.size = pick;
        } else {
          const style = (block.style ?? {}) as NonNullable<Block["style"]>;
          if (style.typography?.heading === pick) continue;
          block.style = {
            ...style,
            typography: { ...(style.typography ?? {}), heading: pick },
          } as Block["style"];
        }
        changes.push(
          `${m.path}: "${o.text.slice(0, 40)}" set at the ${pick} size, as on the original`,
        );
      }
    }
  }
  for (const m of on("layout") || on("backgrounds") || on("crops") ? desk : []) {
    const page = pageOf(doc, m.path);
    if (!page) continue;
    const hints = !on("layout")
      ? []
      : applyLayoutHints(page.sections, {
          viewport: m.original.viewport,
          ...(m.original.layout.contentWidth
            ? { contentWidth: m.original.layout.contentWidth }
            : {}),
          sections: m.original.sections,
          themeBackground: (name) => themes?.[name]?.background,
        });
    for (const h of hints) changes.push(`${m.path}: ${h}`);
    // Sections matched by position (no shared heading): backgrounds and image crops.
    if (m.imported.sections.length !== page.sections.length) continue;
    for (const s of m.comparison.sections) {
      if (s.importedIndex === undefined) continue;
      const o = m.original.sections[s.index] as ProbeSection;
      const section = page.sections[s.importedIndex] as Section | undefined;
      if (!section) continue;
      const bg = on("backgrounds")
        ? s.checks.find((c) => c.what === "Background" && !c.ok)
        : undefined;
      if (
        bg &&
        o.background &&
        /^#[0-9a-f]{6}$/i.test(o.background) &&
        !o.backgroundImage &&
        section.style.background?.type !== "image" &&
        section.style.background?.type !== "video"
      ) {
        const themeBg = themes?.[section.style.colorTheme ?? "light"]?.background;
        if (!themeBg || colorDistance(themeBg, o.background) >= 16) {
          section.style.background = { type: "color", color: o.background };
          changes.push(`${m.path}: section ${s.index + 1} background ${o.background}`);
        }
      }
      const crop = on("crops") ? s.checks.find((c) => c.what === "Image crop" && !c.ok) : undefined;
      if (crop && o.image?.aspect) {
        const aspect = nearestAspect(o.image.aspect);
        const images = section.blocks.filter((b: Block) => b.type === "image");
        if (images.length === 1 && section.layout.mode === "stack") {
          const img = images[0] as Block;
          if (img.fields.aspect !== aspect) {
            img.fields.aspect = aspect;
            changes.push(`${m.path}: section ${s.index + 1} image crop ${aspect}`);
          }
        }
      }
    }
  }
  // Phones: an image the original kept narrow (a book cover) isn't stretched to the full width —
  // the image block gets side room on phones (its padding slot).
  const space = SPACE_SCALES[choices.density] ?? SPACE_SCALES.comfortable;
  for (const m of on("phone-images") ? phone : []) {
    const page = pageOf(doc, m.path);
    if (!page || m.imported.sections.length !== page.sections.length) continue;
    for (const s of m.comparison.sections) {
      if (s.importedIndex === undefined) continue;
      const o = m.original.sections[s.index];
      const i = m.imported.sections[s.importedIndex];
      const section = page.sections[s.importedIndex];
      if (!o?.image || !i?.image || !section || o.image.side !== "center") continue;
      const extra = i.image.widthShare - o.image.widthShare;
      if (extra < 0.15) continue;
      const images = section.blocks.filter((b: Block) => b.type === "image");
      if (images.length !== 1) continue;
      const img = images[0] as Block;
      const want = (extra * m.viewport) / 2;
      const [token] = Object.entries(space).sort(
        ([, a], [, b]) => Math.abs(a - want) - Math.abs(b - want),
      )[0] as [string, number];
      const style = (img.style ?? {}) as NonNullable<Block["style"]>;
      if (style.padding && (style.padding as { m?: string }).m === token) continue;
      img.style = {
        ...style,
        padding: { d: (style.padding as { d?: string } | undefined)?.d ?? "none", m: token },
      } as Block["style"];
      changes.push(
        `${m.path}: the image in section ${s.index + 1} narrower on phones, as on the original`,
      );
    }
  }
  // --- sections presets can't reproduce: recreated as custom components ------------------------
  if (on("components")) {
    const origs = desk.map((m) => m.original.presets);
    const pick = (f: (p: LookProbe["presets"]) => string | undefined) =>
      origs.map(f).find((x): x is string => !!x);
    const roles = {
      heading: pick((p) => (p.h1 ?? p.h2)?.family),
      body: pick((p) => p.body?.family),
      label: pick((p) => (p.eyebrow ?? p.button ?? p.nav)?.family),
    };
    const pages = Object.values(doc.pages);
    const linkFor =
      (base: string) =>
      (href: string): Link | undefined => {
        if (!href || href.startsWith("#")) return undefined;
        let u: URL;
        try {
          u = new URL(href, base);
        } catch {
          return undefined;
        }
        if (u.origin === new URL(base).origin) {
          const slug =
            u.pathname
              .replace(/^\/+|\/+$/g, "")
              .split("/")
              .pop() ?? "";
          const page = pages.find((p) => p.slug === slug);
          if (page) return { type: "page", page: page.id } as Link;
        }
        if (u.protocol === "mailto:") return { type: "email", email: u.pathname } as Link;
        return u.protocol === "https:" ? ({ type: "url", url: u.toString() } as Link) : undefined;
      };
    for (const m of desk.filter((x) => !opts.paths || opts.paths.includes(x.path))) {
      const page = pageOf(doc, m.path);
      if (!page || m.imported.sections.length !== page.sections.length) continue;
      const used = new Set<number>();
      for (const s of m.comparison.sections) {
        if (s.importedIndex === undefined || s.score >= (opts.threshold ?? COMPONENT_THRESHOLD))
          continue;
        if (used.has(s.importedIndex)) continue;
        const o = m.original.sections[s.index];
        const old = page.sections[s.importedIndex];
        if (!o || !old || !canGenerate(o)) continue;
        // One original section per imported section (an article split in parts isn't recreated).
        if (m.comparison.sections.filter((x) => x.importedIndex === s.importedIndex).length > 1)
          continue;
        // Nor one whose words also live in another imported section (the original's band spans
        // two of ours): recreating it would show those words twice.
        const bag = (t: string) =>
          new Set(
            t
              .toLowerCase()
              .split(/[^a-z0-9]+/)
              .filter((w) => w.length > 3),
          );
        const mine = bag(`${o.heading?.text ?? ""} ${o.words ?? o.text}`);
        const shared = m.imported.sections.some((x, j) => {
          if (j === s.importedIndex) return false;
          const theirs = bag(x.words ?? x.text);
          if (theirs.size < 4) return false;
          let n = 0;
          for (const w of theirs) if (mine.has(w)) n++;
          return n / theirs.size >= 0.5;
        });
        if (shared) continue;
        const name = `imported-${(page.slug || "home").replace(/[^a-z0-9]+/g, "-")}-${s.index + 1}`
          .replace(/-+/g, "-")
          .slice(0, 40)
          .replace(/-$/, "");
        const theme = themes?.[old.style.colorTheme ?? "light"] as
          | Record<string, string | undefined>
          | undefined;
        const gen = componentFromBlueprint({
          name,
          label: sectionLabel(
            s.heading ?? o.heading?.text,
            o.blueprint,
            page.title || (page.slug ? page.slug : "Home"),
            s.index + 1,
          ),
          section: o,
          roles,
          ...(theme
            ? {
                colors: {
                  text: theme.text,
                  heading: theme.heading,
                  "text-muted": theme["text-muted"],
                  accent: theme.accent,
                  link: theme.link,
                  surface: theme.surface,
                  border: theme.border,
                  background: theme.background,
                },
              }
            : {}),
          link: linkFor(m.original.url),
          origin: new URL(m.original.url).origin,
        });
        if (!gen) continue;
        const check = checkComponent(gen.def);
        if (!check.ok) continue;
        const before = { components: doc.components, section: old };
        used.add(s.importedIndex);
        doc.components = { ...(doc.components ?? {}), [name]: gen.def };
        const fresh = componentSection(gen.def, { fields: gen.fields });
        page.sections[s.importedIndex] = {
          ...fresh,
          id: old.id,
          ...(old.anchor ? { anchor: old.anchor } : {}),
          style: { ...old.style },
          layout: { ...fresh.layout, width: "wide" },
        };
        // The component gates (contrast, headings, accessibility, budgets) must pass.
        const blocking = componentIssues(doc, page.id).filter(
          (i) => i.severity === "error" && JSON.stringify(i).includes(name),
        );
        if (blocking.length) {
          if (before.components) doc.components = before.components;
          else delete doc.components;
          page.sections[s.importedIndex] = before.section;
          continue;
        }
        changes.push(
          `${m.path}: section ${s.index + 1}${s.heading ? ` "${s.heading.slice(0, 40)}"` : ""} recreated as a custom component`,
        );
      }
    }
  }
  return { doc, changes };
}

/** Set `color.<theme>.<role>` in the Designer overrides; false when it's already that color. */
function setRole(doc: SiteDocument, theme: string, role: string, value: string): boolean {
  const overrides = (doc.styles.overrides ?? {}) as Record<string, unknown>;
  const color = (overrides.color ?? {}) as Record<string, unknown>;
  const scoped = (color[theme] ?? {}) as Record<string, unknown>;
  const current = (scoped[role] as { $value?: string } | undefined)?.$value;
  if (current && colorDistance(current, value) < 8) return false;
  scoped[role] = { $type: "color", $value: value };
  color[theme] = scoped;
  overrides.color = color;
  doc.styles.overrides = overrides as SiteDocument["styles"]["overrides"];
  return true;
}

/**
 * A recreated section's name in Studio (wave 4: every one was "Section (as on the original)"):
 * its heading, else its first words, else "<Page> section <n>".
 */
export function sectionLabel(
  heading: string | undefined,
  blueprint: ReadonlyArray<{ kind: string; text?: string }> | undefined,
  pageTitle: string,
  n: number,
): string {
  const first =
    heading?.trim() ||
    blueprint?.find((i) => i.kind === "heading" && i.text?.trim())?.text ||
    blueprint?.find((i) => i.kind === "text" && i.text?.trim())?.text;
  const words = (first ?? "").replace(/\s+/g, " ").trim();
  if (!words) return `${pageTitle} section ${n}`.slice(0, 60);
  const short = words.length > 40 ? `${words.slice(0, 40).replace(/\s+\S*$/, "")}…` : words;
  const cased = /[a-z]/.test(short) ? short : short.charAt(0) + short.slice(1).toLowerCase();
  return cased.slice(0, 60);
}
