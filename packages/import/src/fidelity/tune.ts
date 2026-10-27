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
  "colors",
  "buttons",
  "layout",
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
  for (const preset of on("type") ? new Set(Object.values(PRESET_OF)) : []) {
    const label = Object.entries(PRESET_OF).find(([, p]) => p === preset)?.[0] as string;
    const step: TypeStep = { ...(scale[preset] ?? {}) };
    let touched = false;
    for (const phone of [false, true]) {
      if (phone && preset === "nav") continue;
      const list = measured.filter(
        (m) =>
          m.viewport < 700 === phone && m.original.presets[preset] && m.imported.presets[preset],
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
      const list = measured.filter(
        (m) => m.viewport >= 700 && m.original.presets[preset] && m.imported.presets[preset],
      );
      const failing = list.filter((m) =>
        m.comparison.checks.some((c) => c.what === `${label} letter spacing and case` && !c.ok),
      );
      if (list.length && failing.length * 2 >= list.length) {
        const ls = median(list.map((m) => m.original.presets[preset]?.letterSpacing as number));
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
      if (!f || fams.length < 2 || !fams.every((x) => norm(x) === norm(f))) continue;
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
  const pm = on("rhythm") ? pad(phone) : undefined;
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
  const inks = new Map<string, { text: string[]; heading: string[] }>();
  for (const m of on("colors") ? desk : []) {
    const page = pageOf(doc, m.path);
    if (!page || m.imported.sections.length !== page.sections.length) continue;
    for (const s of m.comparison.sections) {
      if (s.importedIndex === undefined) continue;
      const o = m.original.sections[s.index];
      const i = m.imported.sections[s.importedIndex];
      const section = page.sections[s.importedIndex];
      if (!o || !i || !section || o.backgroundImage) continue;
      const theme = section.style.colorTheme ?? "light";
      const e = inks.get(theme) ?? { text: [], heading: [] };
      if (o.textColor && i.textColor && colorDistance(o.textColor, i.textColor) >= 16)
        e.text.push(o.textColor);
      if (
        o.heading?.color &&
        i.heading?.color &&
        colorDistance(o.heading.color, i.heading.color) >= 16
      )
        e.heading.push(o.heading.color);
      inks.set(theme, e);
    }
  }
  for (const [theme, e] of inks)
    for (const role of ["text", "heading"] as const) {
      const list = e[role];
      const first = list[0];
      // Only a color the original used throughout that theme.
      if (!first || list.length < 2 || !list.every((c) => colorDistance(c, first) < 12)) continue;
      setRole(doc, theme, role, first);
      changes.push(`${role} on ${theme} sections ${first}, as on the original`);
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
    for (const m of desk) {
      const page = pageOf(doc, m.path);
      if (!page || m.imported.sections.length !== page.sections.length) continue;
      const used = new Set<number>();
      for (const s of m.comparison.sections) {
        if (s.importedIndex === undefined || s.score >= COMPONENT_THRESHOLD) continue;
        if (used.has(s.importedIndex)) continue;
        const o = m.original.sections[s.index];
        const old = page.sections[s.importedIndex];
        if (!o || !old || !canGenerate(o)) continue;
        // One original section per imported section (an article split in parts isn't recreated).
        if (m.comparison.sections.filter((x) => x.importedIndex === s.importedIndex).length > 1)
          continue;
        const name = `imported-${(page.slug || "home").replace(/[^a-z0-9]+/g, "-")}-${s.index + 1}`
          .replace(/-+/g, "-")
          .slice(0, 40)
          .replace(/-$/, "");
        const theme = themes?.[old.style.colorTheme ?? "light"] as
          | Record<string, string | undefined>
          | undefined;
        const gen = componentFromBlueprint({
          name,
          label: `${s.heading ?? "Section"} (as on the original)`.slice(0, 60),
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
                },
              }
            : {}),
          link: linkFor(m.original.url),
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
