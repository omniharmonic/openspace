/**
 * What a browser measured on the live site (`LookProbe`, desktop and phone) → Site Styles
 * typography and page rhythm, plus folding a measured or token look into the source theme
 * (`SqTheme`) so the shared theme mapper can carry it over.
 */
import type {
  LayoutChoices,
  TypeScalePreset,
  TypeStep,
  TypographyChoices,
  WebFont,
} from "@omniharmonic/openspace-schema";
import { fontCategory } from "../map/theme";
import type { SqTheme } from "../types";
import { servedByLicensedHost } from "./font-match";
import type { LookProbe, ProbeText } from "./probe";
import type { TokenLook } from "./tokens";

const norm = (s: string | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Generic stacks only: system fonts with a name (Georgia, Helvetica, Arial, Times) are carried
// over through their metric-compatible open twins (font-match.ts).
const GENERIC =
  /^(?:serif|sans-serif|monospace|system-ui|ui-\w+|-apple-system|blinkmacsystemfont)$/i;

/** Rough RGB distance between two #rrggbb colors. */
const colorGap = (a: string, b: string) => {
  const p = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16) || 0);
  const [x, y] = [p(a), p(b)];
  return Math.sqrt(x.reduce((n, v, i) => n + (v - (y[i] ?? 0)) ** 2, 0));
};

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function stepOf(t: ProbeText, mobile?: ProbeText, opts: { weight?: boolean } = {}): TypeStep {
  return {
    size: round(Math.min(220, Math.max(9, t.size))),
    ...(mobile && mobile.size >= 9 && mobile.size <= 160 ? { sizeMobile: round(mobile.size) } : {}),
    ...(t.lineHeight >= 0.7 && t.lineHeight <= 3 ? { lineHeight: round(t.lineHeight, 2) } : {}),
    ...(Math.abs(t.letterSpacing) >= 0.005 && t.letterSpacing <= 1 && t.letterSpacing >= -0.2
      ? { letterSpacing: round(t.letterSpacing, 3) }
      : { letterSpacing: 0 }),
    case: t.case,
    ...(opts.weight && t.weight >= 100 && t.weight <= 900
      ? { weight: Math.round(t.weight / 100) * 100 }
      : {}),
  };
}

/** A measured look (desktop probe + optional phone probe) → typography and rhythm. */
export function lookFromProbe(d: LookProbe, m?: LookProbe): TokenLook | undefined {
  const P = d.presets;
  const M = m?.presets ?? {};
  // Fonts per role: headings from h1/h2, running text from the body, labels from eyebrows,
  // buttons and navigation when they use a third family.
  const headingT = P.h2 ?? P.h1;
  const fam = (t?: ProbeText) => (t && !GENERIC.test(t.family) ? t.family : undefined);
  const heading = fam(P.h1) ?? fam(P.h2);
  const body = fam(P.body);
  const labelCands = [P.eyebrow, P.button, P.nav].map(fam).filter((f): f is string => !!f);
  const label = labelCands.find((f) => norm(f) !== norm(body) && norm(f) !== norm(heading));
  const fonts: TokenLook["fonts"] = {
    ...(heading ? { heading } : {}),
    ...(body ? { body } : {}),
    ...(label ? { label } : {}),
  };
  const italicUsed = d.sections.some((s) => s.italicLines > 0);
  const web = (family: string, weights: number[], italic: boolean): WebFont => {
    const ws = [...new Set(weights.map((w) => Math.round(w / 100) * 100))]
      .filter((w) => w >= 100 && w <= 900)
      .sort((a, b) => a - b);
    return {
      family,
      category: fontCategory(family),
      ...(ws.length ? { weights: ws.slice(0, 4) } : {}),
      ...(italic ? { italic: true } : {}),
    };
  };
  const typography: TypographyChoices = {};
  if (heading)
    typography.heading = web(
      heading,
      [P.h1, P.h2, P.h3]
        .filter((t): t is ProbeText => !!t && norm(t.family) === norm(heading))
        .map((t) => t.weight),
      italicUsed,
    );
  if (body) typography.body = web(body, [P.body?.weight ?? 400, 600], italicUsed);
  if (label)
    typography.label = web(
      label,
      [P.eyebrow, P.button, P.nav]
        .filter((t): t is ProbeText => !!t && norm(t.family) === norm(label))
        .map((t) => t.weight),
      false,
    );
  const roleOf = (t: ProbeText): TypeStep["font"] =>
    norm(t.family) === norm(heading)
      ? "heading"
      : norm(t.family) === norm(label)
        ? "label"
        : "body";

  const scale: Partial<Record<TypeScalePreset, TypeStep>> = {};
  const isHeadingLike = (t?: ProbeText) =>
    !!t && t.case !== "uppercase" && P.body !== undefined && t.size >= P.body.size;
  if (P.h1) scale.h1 = stepOf(P.h1, M.h1, { weight: true });
  if (isHeadingLike(P.h2)) scale.h2 = stepOf(P.h2 as ProbeText, M.h2, { weight: true });
  if (isHeadingLike(P.h3)) scale.h3 = stepOf(P.h3 as ProbeText, M.h3, { weight: true });
  if (P.body) scale.body = { ...stepOf(P.body, M.body), letterSpacing: 0, case: "none" };
  // Between h2 and the body, fill the steps on the site's own ratio.
  const top = scale.h2?.size ?? scale.h1?.size;
  const base = scale.body?.size;
  if (top && base && top > base) {
    const r = top / base;
    const fill = (k: number): TypeStep => {
      const size = round(base * r ** k);
      return { size, lineHeight: round(1.05 + 0.25 * (1 - k), 2), letterSpacing: 0, case: "none" };
    };
    if (!scale.h3) scale.h3 = fill(0.55);
    scale.h4 = fill(0.3);
    if (headingT) {
      const w = Math.round(headingT.weight / 100) * 100;
      for (const p of ["h3", "h4"] as const)
        scale[p] = { ...scale[p], font: "heading", ...(w >= 100 && w <= 900 ? { weight: w } : {}) };
    }
  }
  if (scale.h1) scale.display = { ...scale.h1 };
  if (P.lead) scale.lead = { ...stepOf(P.lead, M.lead), font: roleOf(P.lead) };
  if (P.small) scale.small = stepOf(P.small, M.small);
  if (P.eyebrow)
    scale.eyebrow = { ...stepOf(P.eyebrow, M.eyebrow, { weight: true }), font: roleOf(P.eyebrow) };
  if (P.button)
    scale.button = { ...stepOf(P.button, M.button, { weight: true }), font: roleOf(P.button) };
  // Navigation on phones is the menu (different by design): desktop only.
  if (P.nav) scale.nav = { ...stepOf(P.nav, undefined, { weight: true }), font: roleOf(P.nav) };
  if (P.wordmark)
    scale.wordmark = {
      ...stepOf(P.wordmark, M.wordmark, { weight: true }),
      font: roleOf(P.wordmark),
    };
  if (Object.keys(scale).length) typography.scale = scale;

  // Eyebrows in a muted color: their color differs from the running text in most sections.
  const withEyebrow = d.sections.filter((s) => s.eyebrow?.color && s.body?.color);
  const muted = withEyebrow.filter((s) => s.eyebrow?.color !== s.body?.color).length;
  if (withEyebrow.length && muted > withEyebrow.length / 2) typography.eyebrowColor = "muted";

  const layout: LayoutChoices = {};
  const L = d.layout;
  const mobileLeft = m?.layout.left;
  // A centred column (the phone layout keeps a small gutter): its width is the content width.
  if (
    L.contentWidth &&
    L.contentWidth >= 480 &&
    L.contentWidth <= 2400 &&
    L.contentWidth < d.viewport - 40
  )
    layout.contentWidth = Math.round(L.contentWidth / 8) * 8;
  // The content on a raised card over a different page background (a blog theme's white
  // panel): the card surface, the page color around it, and the measure the card sets.
  const page = d.pageBackground;
  const panels = d.sections.filter(
    (s) =>
      page &&
      s.background &&
      s.left !== undefined &&
      s.width !== undefined &&
      s.left >= 24 &&
      s.left + s.width <= d.viewport - 24 &&
      s.raised === true &&
      colorGap(s.background, page) >= 10,
  );
  if (page && d.viewport >= 768 && panels.length && panels.length * 2 >= d.sections.length) {
    layout.surface = "card";
    layout.pageBackground = page;
    const measures = panels.map((s) => s.textWidth).filter((w): w is number => !!w);
    const w = measures.sort((a, b) => a - b)[Math.floor(measures.length / 2)];
    if (w && w >= 480 && w <= 1600) layout.contentWidth = Math.round(w / 8) * 8;
  }
  if (L.sectionPadding && L.sectionPadding >= 16 && L.sectionPadding <= 320)
    layout.sectionPadding = Math.round(L.sectionPadding);
  if (layout.sectionPadding && m?.layout.sectionPadding && m.layout.sectionPadding <= 240)
    layout.sectionPaddingMobile = Math.round(
      Math.min(m.layout.sectionPadding, layout.sectionPadding),
    );
  if (mobileLeft && mobileLeft >= 8 && mobileLeft <= 48) {
    layout.gutterMobile = Math.round(mobileLeft);
    layout.gutter = Math.max(layout.gutterMobile, 32);
  }
  if (!Object.keys(typography).length && !Object.keys(layout).length) return undefined;
  // Every weight and the italics a role's text uses (variable fonts load the same axes).
  const allText = [
    P.h1,
    P.h2,
    P.h3,
    P.lead,
    P.body,
    P.small,
    P.eyebrow,
    P.button,
    P.nav,
    P.wordmark,
  ];
  for (const role of ["heading", "body", "label"] as const) {
    const f = typography[role];
    if (!f) continue;
    const ts = allText.filter((t): t is ProbeText => !!t && norm(t.family) === norm(f.family));
    const ws = [
      ...new Set([...(f.weights ?? []), ...ts.map((t) => Math.round(t.weight / 100) * 100)]),
    ]
      .filter((w) => w >= 100 && w <= 900)
      .sort((a, b) => a - b);
    if (ws.length) f.weights = ws.slice(0, 6);
    if (ts.some((t) => t.italic) || d.fonts?.[f.family]?.italic) f.italic = true;
  }
  const hosts = servedByLicensedHost(d.fontRequests ?? []);
  return {
    typography,
    layout,
    fonts,
    ...(d.eyebrowRule ? { eyebrowRule: true } : {}),
    ...(d.fonts && Object.keys(d.fonts).length ? { metrics: { ...m?.fonts, ...d.fonts } } : {}),
    ...(hosts.length ? { fontHosts: hosts } : {}),
    ...(d.logoHeight && d.logoHeight >= 16 && d.logoHeight <= 240
      ? {
          logoHeight: {
            d: d.logoHeight,
            ...(m?.logoHeight && m.logoHeight >= 16 && m.logoHeight <= 240
              ? { m: m.logoHeight }
              : {}),
          },
        }
      : {}),
    ...(d.footerBackground ? { footerBackground: d.footerBackground } : {}),
    ...(d.footerColumns && d.footerColumns >= 2 && d.footerColumns <= 4
      ? {
          footerColumns: d.footerColumns,
          ...(d.footerText &&
          d.footerText.size <= 14 &&
          (d.footerText.case === "uppercase" || d.footerText.letterSpacing >= 0.08)
            ? { footerLabels: true }
            : {}),
        }
      : {}),
    ...(d.sidebar
      ? {
          sidebar: {
            side: d.sidebar.side,
            ...(d.sidebar.background ? { background: d.sidebar.background } : {}),
          },
        }
      : {}),
  };
}

/**
 * Fold a measured or token look into the source theme. `fill` (a browser measurement after a
 * design-token file) only adds what the theme doesn't have yet: a design system's own values win.
 */
export function applyLook(
  theme: SqTheme,
  look: TokenLook,
  source: string,
  mode: "override" | "fill" = "override",
): void {
  const fill = mode === "fill";
  theme.typography = fill
    ? mergeTypography(look.typography, theme.typography ?? {})
    : mergeTypography(theme.typography, look.typography);
  theme.layout = fill
    ? { ...look.layout, ...(theme.layout ?? {}) }
    : { ...(theme.layout ?? {}), ...look.layout };
  const keep = (has: unknown) => fill && !!has;
  if (look.fonts.heading && !keep(theme.typography?.heading && theme.fonts.heading))
    theme.fonts.heading = {
      family: theme.typography?.heading?.family ?? look.fonts.heading,
      ...(look.typography.scale?.h2?.weight ? { weight: look.typography.scale.h2.weight } : {}),
    };
  if (look.fonts.body && !keep(theme.typography?.body && theme.fonts.body))
    theme.fonts.body = { family: theme.typography?.body?.family ?? look.fonts.body };
  if (look.fonts.label && !keep(theme.labelFont)) theme.labelFont = { family: look.fonts.label };
  if (look.eyebrowRule !== undefined && !keep(theme.eyebrowRule !== undefined))
    theme.eyebrowRule = look.eyebrowRule;
  if (look.sidebar?.side === "left" && !keep(theme.headerLayout)) {
    theme.headerLayout = "sidebar";
    if (look.sidebar.background) theme.headerBackground = look.sidebar.background;
  }
  if (look.logoHeight && !keep(theme.logoHeight)) theme.logoHeight = look.logoHeight;
  if (look.footerBackground && !keep(theme.footerBackground))
    theme.footerBackground = look.footerBackground;
  if (look.footerColumns && !keep(theme.footerColumns)) {
    theme.footerColumns = look.footerColumns;
    if (look.footerLabels) theme.footerLabels = true;
  }
  if (look.metrics) theme.fontMetrics = { ...look.metrics, ...(theme.fontMetrics ?? {}) };
  if (look.fontHosts)
    theme.fontHosts = [...new Set([...(theme.fontHosts ?? []), ...look.fontHosts])];
  const s = theme.typography?.scale;
  if (s?.h1?.size) theme.sizes.h1 = s.h1.size / 16;
  if (s?.body?.size) theme.sizes.normal = s.body.size / 16;
  theme.lookSource = theme.lookSource ? `${theme.lookSource} and ${source}` : source;
}

function mergeTypography(
  a: TypographyChoices | undefined,
  b: TypographyChoices,
): TypographyChoices {
  if (!a) return b;
  return {
    ...a,
    ...b,
    ...(a.scale || b.scale ? { scale: { ...(a.scale ?? {}), ...(b.scale ?? {}) } } : {}),
  };
}
