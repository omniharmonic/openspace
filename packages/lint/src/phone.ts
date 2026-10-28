import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import {
  FOOTER,
  findSection,
  type Op,
  type SiteDocument,
  validate,
} from "@omniharmonic/openspace-ops";
import {
  type Block,
  fallbackMobileRects,
  type GridLayout,
  type Page,
  phoneColumns,
  phonePadding,
  type Section,
  STACK_UNITS,
} from "@omniharmonic/openspace-schema";
import { compileStyles, SPACE_SCALES } from "@omniharmonic/openspace-theme";
import { blockText, isTextBlock } from "./content";
import { type CheckOptions, type Issue, issue, opMeta, sortIssues } from "./issue";
import { autoMobileLayout, autoMobileLayoutOps, readingOrder } from "./mobile";
import type { PhoneFinding, PhoneFindingKind, PhoneProbeResult } from "./phone-probe";

/**
 * The Phone check: everything that makes a page worse on a phone than on the desktop it was
 * designed on — the Squarespace promise ("a change on desktop works on mobile") checked rather
 * than hoped for.
 *
 * Two halves, one vocabulary (rule ids `phone-*`, plain-language messages, fixes as ops):
 *
 * - {@link phoneCheck}: static rules over the document and theme (deterministic, instant, run as
 *   part of the Design check everywhere): sections whose phone layout is missing or stale,
 *   columns squeezed side by side, padding that leaves a phone screen empty, heading words too
 *   long for a phone line, oversized logos, custom CSS fixed wider than a phone.
 * - {@link phoneIssuesFromProbe}: what a real browser measured at 360 and 390 px
 *   (`PHONE_PROBE_SCRIPT`) — sideways scrolling, cut-off or overlapping text, small text and tap
 *   targets, text over photos — turned into the same kind of issues, each with a fix where one
 *   can be expressed as edits.
 *
 * {@link fixForPhones} applies every phone fix at once ("Fix everything for phones").
 */

export const PHONE_RULE_PREFIX = "phone-";
export const isPhoneRule = (rule: string) => rule.startsWith(PHONE_RULE_PREFIX);
export const isPhoneIssue = (i: Pick<Issue, "rule">) => isPhoneRule(i.rule);

/** Phone screen used for static estimates (CSS px). */
const PHONE = 360;
/** Average glyph width as a share of the font size (generous, so estimates err towards "fits"). */
const GLYPH = 0.48;
const GLYPH_CAPS = 0.62;

type Where = { page: string; section: Section };

function* sectionsOf(doc: SiteDocument, pageId?: string): Generator<Where> {
  const pages = pageId
    ? [doc.pages[pageId as Page["id"]]].filter((p): p is Page => !!p)
    : Object.values(doc.pages);
  for (const p of pages)
    for (const s of p.sections) if (!s.hidden) yield { page: p.id, section: s };
  yield { page: FOOTER, section: doc.site.footer };
}

/** `clamp(2rem, …, 3rem)` / `2rem` / `24px` → px at the smallest (phone) size. */
export function phonePx(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const v = value.trim();
  const m = /^clamp\(\s*([\d.]+)(rem|px)/.exec(v) ?? /^([\d.]+)(rem|px)$/.exec(v);
  if (!m) return undefined;
  return Number(m[1]) * (m[2] === "rem" ? 16 : 1);
}

const words = (s: string) => s.match(/[\p{L}\p{N}]{2,}/gu)?.length ?? 0;

class PhoneCtx {
  issues: Issue[] = [];
  meta: ReturnType<typeof opMeta>;
  root: Record<string, string>;
  space: Record<string, number>;
  gutter: number;

  constructor(
    readonly doc: SiteDocument,
    readonly options: CheckOptions,
  ) {
    this.meta = opMeta(options);
    this.root = compileStyles(doc.styles).tokens.vars.root;
    const density = (doc.styles.choices as { density?: keyof typeof SPACE_SCALES }).density;
    this.space = SPACE_SCALES[density ?? "comfortable"] ?? SPACE_SCALES.comfortable;
    this.gutter = phonePx(this.root["--os-section-gutter"]) ?? 24;
  }

  add(i: Parameters<typeof issue>[0]) {
    this.issues.push(issue(i));
  }

  section({ page, section }: Where) {
    if (section.layout.mode === "stack") this.columns(page, section);
    else this.grid(page, section, section.layout);
    this.padding(page, section);
    this.tallPhoto(page, section);
    for (const b of section.blocks) if (!b.hidden) this.headingWords(page, section, b);
  }

  /** Text columns kept side by side on phones (an explicit phone column setting). */
  columns(page: string, section: Section) {
    const layout = section.layout;
    if (layout.mode !== "stack") return;
    const cols = phoneColumns(layout.columns);
    if (cols.length < 2) return;
    const content = PHONE - 2 * this.gutter;
    const squeezed = cols.some((span, i) => {
      // A paragraph (not a short blurb or a list of links) in a strip narrower than ~170px.
      const longest = section.blocks
        .filter((b) => !b.hidden && (b.column ?? 0) === i && isTextBlock(b))
        .reduce((n, b) => Math.max(n, words(blockText(b))), 0);
      return longest >= 25 && (span / STACK_UNITS) * content < 170;
    });
    if (!squeezed) return;
    this.add({
      rule: "phone-columns",
      severity: "warning",
      page,
      section: section.id,
      message: `On phones this section keeps ${cols.length} columns side by side, so its text is squeezed into a narrow strip.`,
      fix: "Stack the columns on phones (one under the other).",
      autofix: {
        label: "Stack the columns on phones",
        ops: [
          {
            op: "section.update",
            ...this.meta(),
            page: page as never,
            section: section.id,
            set: { "layout.columns.m": [STACK_UNITS] },
          } as Op,
        ],
      },
    });
  }

  /** Grid sections: missing or partial phone layouts, text squeezed into narrow phone columns. */
  grid(page: string, section: Section, layout: GridLayout) {
    const items = Object.entries(layout.items);
    if (!items.length) return;
    const placed = items.filter(([, i]) => i.m).length;
    const blocks = new Map(section.blocks.map((b) => [b.id as string, b]));
    const fill = () => autoMobileLayoutOps(this.doc, page, section.id, this.options);
    if (placed > 0 && placed < items.length) {
      this.add({
        rule: "phone-layout-missing",
        severity: "warning",
        page,
        section: section.id,
        message: `${items.length - placed === 1 ? "A block was" : `${items.length - placed} blocks were`} added on desktop but not placed for phones, so on a phone ${items.length - placed === 1 ? "it shows" : "they show"} at the bottom of the section.`,
        fix: "Place the new blocks in reading order on phones (your other phone placements stay).",
        autofix: { label: "Place them for phones", ops: fill() },
      });
    } else if (placed === 0 && items.length > 1) {
      // No phone layout: blocks stack by their top-left corner. Is that the reading order?
      const fallback = fallbackMobileRects(layout);
      const stacked = Object.entries(fallback)
        .sort(([, a], [, b]) => a.y - b.y)
        .map(([id]) => id);
      const reading = readingOrder(items.map(([id, i]) => ({ id, rect: i.d }))).map((i) => i.id);
      if (stacked.join() !== reading.join())
        this.add({
          rule: "phone-layout-order",
          severity: "warning",
          page,
          section: section.id,
          message:
            "On phones this section's blocks would stack in a confusing order (by where each one starts, not how the section reads).",
          fix: "Lay the section out for phones in reading order.",
          autofix: { label: "Lay it out for phones", ops: fill() },
        });
    }
    // Text squeezed into a narrow phone column.
    for (const [id, item] of items) {
      const b = blocks.get(id);
      if (!item.m || !b || b.hidden || !isTextBlock(b)) continue;
      const n = words(blockText(b));
      const width = (item.m.w / 8) * (PHONE - 2 * this.gutter);
      if (n < 8 || width >= 150 || (width >= 120 && n < 25)) continue;
      const restack = autoMobileLayout(section, { reset: true });
      this.add({
        rule: "phone-narrow-text",
        severity: "warning",
        page,
        section: section.id,
        block: id,
        message: `On phones this ${b.type} block is only about ${Math.round(width)}px wide, so its text is squeezed into a narrow strip.`,
        fix: "Re-stack the section for phones so every block is full width.",
        ...(restack
          ? {
              autofix: { label: "Re-stack for phones", ops: this.placeOps(page, section, restack) },
            }
          : {}),
      });
    }
  }

  placeOps(
    page: string,
    section: Section,
    items: NonNullable<ReturnType<typeof autoMobileLayout>>,
  ): Op[] {
    return Object.entries(items).flatMap(([block, item]) =>
      item.m
        ? [
            {
              op: "grid.place",
              ...this.meta(),
              page: page as never,
              section: section.id,
              block: block as never,
              bp: "m",
              rect: item.m,
            } as Op,
          ]
        : [],
    );
  }

  /** A phone padding so large the screen is mostly empty space. */
  padding(page: string, section: Section) {
    const pad = section.style.padding;
    if (!pad) return;
    const token = phonePadding(pad);
    const px = this.space[token] ?? 0;
    if (px <= 100) return;
    this.add({
      rule: "phone-padding",
      severity: "warning",
      page,
      section: section.id,
      message: `On phones this section has ${px}px of empty space above and below it, which pushes its content off the screen.`,
      fix: "Use less padding on phones (your desktop spacing stays).",
      autofix: {
        label: "Tighten the spacing on phones",
        ops: [
          {
            op: "section.update",
            ...this.meta(),
            page: page as never,
            section: section.id,
            set: { "style.padding.m": "lg" },
          } as Op,
        ],
      },
    });
  }

  /** A photo section taller than most of a phone screen (the words and button get pushed down). */
  tallPhoto(page: string, section: Section) {
    const bg = section.style.background;
    const mh = section.style.minHeight;
    if (!mh || !bg || (bg.type !== "image" && bg.type !== "video")) return;
    const m = mh.m ?? mh.t ?? mh.d;
    const vh = /^(\d+)(?:vh|svh|dvh|lvh)$/.exec(m);
    const px = /^(\d+)px$/.exec(m);
    if (!(vh && Number(vh[1]) > 75) && !(px && Number(px[1]) > 640)) return;
    this.add({
      rule: "phone-tall-photo",
      severity: "warning",
      page,
      section: section.id,
      message: `On phones this photo section is at least ${m} tall, so the photo fills most of the screen and pushes everything else down.`,
      fix: "Make it a little shorter on phones (70% of the screen); desktop keeps its height.",
      autofix: {
        label: "Shorten it on phones",
        ops: [
          {
            op: "section.update",
            ...this.meta(),
            page: page as never,
            section: section.id,
            set: { "style.minHeight.m": "70svh" },
          } as Op,
        ],
      },
    });
  }

  /** Heading words that can't fit on one phone line at the heading's phone size. */
  headingWords(page: string, section: Section, b: Block) {
    if (b.type !== "heading") return;
    const fields = b.fields as { text?: string; level?: string; size?: string; phoneSize?: string };
    const size =
      fields.phoneSize && fields.phoneSize !== "auto"
        ? fields.phoneSize
        : (b.style?.typography?.heading ??
          (fields.size && fields.size !== "auto" ? fields.size : (fields.level ?? "h2")));
    const px = this.typePx(size);
    if (!px) return;
    const width = PHONE - 2 * this.gutter - this.blockPad(b);
    const caps = this.root[`--os-type-${size}-text-transform`] === "uppercase";
    const longest = (fields.text ?? "")
      .split(/[\s\-‐–—/]+/)
      .reduce((a, w) => (w.length > a.length ? w : a), "");
    const est =
      longest.length * px * (caps || longest === longest.toUpperCase() ? GLYPH_CAPS : GLYPH);
    // Only clear cases: real fonts vary, and the rendered check measures the borderline ones.
    if (est <= width * 1.1) return;
    const smaller = this.fittingSize(longest, width, caps);
    this.add({
      rule: "phone-long-word",
      severity: "warning",
      page,
      section: section.id,
      block: b.id,
      message: `“${longest}” is too long to fit on one line of a phone at this heading size, so it would break in the middle of the word.`,
      fix: smaller
        ? "Use a smaller heading size on phones (desktop keeps its size), or a shorter word."
        : "Use a shorter word or phrase.",
      ...(smaller
        ? {
            autofix: {
              label: "Use a smaller size on phones",
              ops: [
                {
                  op: "block.update",
                  ...this.meta(),
                  page: page as never,
                  block: b.id,
                  set: { phoneSize: smaller },
                } as Op,
              ],
            },
          }
        : {}),
    });
  }

  typePx(preset: string): number | undefined {
    const px = phonePx(this.root[`--os-type-${preset}-font-size`]);
    if (!px) return undefined;
    // The renderer caps display and h1 to the column width on narrow screens.
    const content = PHONE - 2 * this.gutter;
    if (preset === "display") return Math.min(px, 0.16 * content);
    if (preset === "h1") return Math.min(px, 0.12 * content);
    return px;
  }

  blockPad(b: Block): number {
    const pad = b.style?.padding;
    const token = pad ? (pad.m ?? pad.t ?? pad.d) : b.style?.colorTheme ? "md" : undefined;
    return token ? 2 * (this.space[token] ?? 0) : 0;
  }

  fittingSize(word: string, width: number, caps: boolean): string | undefined {
    for (const s of ["h1", "h2", "h3", "h4"]) {
      const px = this.typePx(s);
      if (px && word.length * px * (caps ? GLYPH_CAPS : GLYPH) <= width) return s;
    }
    return undefined;
  }

  /** A header logo that leaves no room for the menu button on phones. */
  header() {
    const h = this.doc.site.header.logoHeight;
    if (!h) return;
    const m = h.m ?? h.t ?? h.d;
    if (m <= 64) return;
    this.add({
      rule: "phone-logo",
      severity: "warning",
      message: `The logo is ${m}px tall on phones, which makes the header take up a big part of a phone screen.`,
      fix: "Use a smaller logo on phones (around 40px; desktop keeps its size).",
      autofix: {
        label: "Use a 40px logo on phones",
        ops: [{ op: "site.update", ...this.meta(), set: { "header.logoHeight.m": 40 } } as Op],
      },
    });
  }

  /** Custom CSS or components that fix something wider than a phone. */
  css() {
    const sources: Array<{ css: string; where: string; component?: string }> = [];
    if (this.doc.site.customCss)
      sources.push({ css: this.doc.site.customCss, where: "Your custom CSS" });
    for (const [name, c] of Object.entries(this.doc.components ?? {}))
      if (c.css) sources.push({ css: c.css, where: `The “${name}” component`, component: name });
    for (const s of sources) {
      const wide = wideRules(s.css);
      if (!wide.length) continue;
      this.add({
        rule: "phone-fixed-width",
        severity: "warning",
        key: s.component ?? "custom-css",
        message: `${s.where} sets a fixed width (${wide.slice(0, 2).join(", ")}) that is wider than a phone screen, so the page may scroll sideways or be cut off on phones.`,
        fix: "Use max-width (or a percentage) instead of a fixed width, or add a phone rule (@media (max-width: 767px)).",
      });
    }
  }
}

/** `width: 640px` / `min-width: 30rem` declarations wider than a phone, outside min-width media queries. */
export function wideRules(css: string): string[] {
  // Drop blocks that only apply to wider screens.
  let plain = css;
  for (let guard = 0; guard < 50; guard++) {
    const m = /@media[^{]*min-width\s*:\s*(\d+)/i.exec(plain);
    if (!m || Number(m[1]) < 400) break;
    const start = plain.indexOf("{", m.index);
    let depth = 0;
    let end = start;
    for (; end < plain.length; end++) {
      if (plain[end] === "{") depth++;
      else if (plain[end] === "}" && --depth === 0) break;
    }
    plain = plain.slice(0, m.index) + plain.slice(end + 1);
  }
  const out: string[] = [];
  for (const m of plain.matchAll(/(?:^|[;{\s])((?:min-)?width)\s*:\s*([\d.]+)(px|rem|em)\b/gi)) {
    const px = Number(m[2]) * (m[3]?.toLowerCase() === "px" ? 1 : 16);
    if (px > 340) out.push(`${m[1]}: ${m[2]}${m[3]}`);
  }
  return out;
}

/**
 * Static phone rules over the document and theme (see the module comment). With `pageId`, only
 * that page's sections (and the footer and site-wide rules) are checked.
 */
export function phoneCheck(
  doc: SiteDocument,
  pageId?: string,
  options: CheckOptions = {},
): Issue[] {
  const ctx = new PhoneCtx(doc, options);
  for (const w of sectionsOf(doc, pageId)) ctx.section(w);
  ctx.header();
  ctx.css();
  return sortIssues(ctx.issues);
}

// --- rendered findings → issues ---------------------------------------------------------------

const SEVERITY: Record<PhoneFindingKind, Issue["severity"]> = {
  "page-overflow": "error",
  "cut-off": "error",
  overlap: "error",
  "photo-contrast": "error",
  "low-contrast": "error",
  "broken-word": "warning",
  "big-heading": "warning",
  "small-text": "warning",
  "tiny-text": "warning",
  "narrow-text": "warning",
  "tap-target": "warning",
  "edge-text": "warning",
  "header-crowded": "warning",
  "loose-padding": "warning",
  "tall-image": "info",
  "heavy-crop": "info",
  "long-footer": "info",
  "cta-below-fold": "warning",
};

const MESSAGE: Record<PhoneFindingKind, (f: PhoneFinding, where: string) => [string, string]> = {
  "page-overflow": (_f, w) => [
    `On phones the page is wider than the screen, so it scrolls sideways${w}.`,
    "Something has a fixed width wider than a phone. Re-stack the section for phones or make the element narrower.",
  ],
  "cut-off": (_f, w) => [
    `On phones something${w} is cut off at the edge of the screen.`,
    "Re-stack the section for phones, or make the element narrower.",
  ],
  overlap: (_f, w) => [
    `On phones two pieces of text${w} are drawn on top of each other, so neither can be read.`,
    "Re-stack the section for phones so the blocks sit one under the other.",
  ],
  "photo-contrast": (f, w) => [
    `On phones the text “${f.text ?? ""}”${w} sits on a photo where it can drop to ${f.value}:1 contrast (it needs ${f.limit}:1), so it is hard to read on bright or dark parts of the photo.`,
    "Darken (or lighten) the photo overlay, or put the text on a solid panel.",
  ],
  "low-contrast": (f, w) => [
    `On phones the text “${f.text ?? ""}”${w} has only ${f.value}:1 contrast with its background (it needs ${f.limit}:1).`,
    "Use a color theme instead of a custom color, or a darker/lighter text color.",
  ],
  "broken-word": (f, w) => [
    `On phones a word in the heading “${f.text ?? ""}”${w} doesn't fit on one line and breaks in the middle.`,
    "Use a smaller heading size on phones, or a shorter word.",
  ],
  "big-heading": (f, w) => [
    `On phones the heading “${f.text ?? ""}”${w} is so large it fills most of the screen.`,
    "Use a smaller heading size on phones, or a shorter heading.",
  ],
  "small-text": (f, w) => [
    `On phones the text${w} is ${f.value}px — too small to read comfortably (${f.limit === 14 ? "14px is the minimum for small print" : "16px is the minimum for reading text"}).`,
    f.limit === 14
      ? "Use the body text style for it, or shorten it to a note."
      : "Use the body text style for paragraphs instead of the small style.",
  ],
  "tiny-text": (f, w) => [
    `On phones the label “${f.text ?? ""}”${w} is only ${f.value}px tall, too small to read.`,
    "Make it at least 12px.",
  ],
  "narrow-text": (_f, w) => [
    `On phones the text${w} is squeezed into a very narrow column.`,
    "Stack the columns on phones so the text is full width.",
  ],
  "tap-target": (f, w) => [
    `On phones the link or button “${f.text ?? ""}”${w} is small and close to another one, so it's easy to tap the wrong one.`,
    "Make it a button, or put more space around it.",
  ],
  "edge-text": (_f, w) => [
    `On phones the text${w} touches the edge of the screen.`,
    "Keep text inside the page margins (don't let text blocks bleed to the edge).",
  ],
  "header-crowded": () => [
    "On phones the header is crowded: its logo, title and buttons overlap or wrap.",
    "Use a smaller logo on phones or a shorter site title.",
  ],
  "loose-padding": (f, w) => [
    `On phones there is ${f.value}px of empty space above or below${w || " a section"}.`,
    "Use less padding on phones.",
  ],
  "tall-image": (_f, w) => [
    `On phones an image${w} is taller than the whole screen.`,
    "Crop it to a landscape or square shape, or set a focus point.",
  ],
  "heavy-crop": (_f, w) => [
    `On phones most of a photo${w} is cropped away.`,
    "Set the photo's focus point so the important part stays in view on phones.",
  ],
  "cta-below-fold": (f) => [
    `On phones the main button (“${f.text ?? ""}”) is about ${Math.round(f.value ?? 0)}px down the page, below the first screen — visitors have to scroll before they see what to do.`,
    "Put the words and button first on phones (photos after them), or use a shorter headline.",
  ],
  "long-footer": () => [
    "On phones the footer is several screens long.",
    "Keep the footer to the essentials (a few links, contact details, social icons).",
  ],
};

interface Located {
  page: string;
  section?: Section;
  block?: Block;
}

function locate(doc: SiteDocument, pageId: string, f: PhoneFinding): Located {
  const lookup = (id: string | undefined) => {
    if (!id) return undefined;
    const pages = [pageId, FOOTER];
    for (const p of pages) {
      const hit = findSection(doc, p as never, id);
      if (hit) return { page: p, section: hit.section };
    }
    return undefined;
  };
  const sec = lookup(f.section);
  if (sec) {
    const block = f.block ? sec.section.blocks.find((b) => b.id === f.block) : undefined;
    return { page: sec.page, section: sec.section, ...(block ? { block } : {}) };
  }
  if (f.area === "footer") return { page: FOOTER, section: doc.site.footer };
  return { page: pageId };
}

/** Ops that fix a rendered finding, where an edit can (re-stack, overlay, panel, sizes, padding). */
function fixFor(
  at: Located,
  f: PhoneFinding,
  meta: ReturnType<typeof opMeta>,
): { label: string; ops: Op[] } | undefined {
  const { section, block, page } = at;
  if (!section) return undefined;
  const restack = (label: string) => {
    if (section.layout.mode === "grid") {
      const items = autoMobileLayout(section, { reset: true });
      if (!items) return undefined;
      const ops = Object.entries(items).flatMap(([b, item]) =>
        item.m
          ? [
              {
                op: "grid.place",
                ...meta(),
                page: page as never,
                section: section.id,
                block: b as never,
                bp: "m",
                rect: item.m,
              } as Op,
            ]
          : [],
      );
      return ops.length ? { label, ops } : undefined;
    }
    if (phoneColumns(section.layout.columns).length > 1)
      return {
        label: "Stack the columns on phones",
        ops: [
          {
            op: "section.update",
            ...meta(),
            page: page as never,
            section: section.id,
            set: { "layout.columns.m": [STACK_UNITS] },
          } as Op,
        ],
      };
    return undefined;
  };
  switch (f.kind) {
    case "overlap":
    case "cut-off":
    case "page-overflow":
    case "narrow-text":
    case "edge-text":
      return f.component ? undefined : restack("Re-stack for phones");
    case "photo-contrast": {
      const bg = section.style.background;
      if (bg && (bg.type === "image" || bg.type === "video")) {
        const now = bg.overlay?.opacity ?? 0;
        if (now >= 0.85) break;
        const target = Math.min(0.85, Math.ceil((now + 0.15) * 20) / 20);
        return {
          label: `Raise the photo overlay to ${Math.round(target * 100)}%`,
          ops: [
            {
              op: "section.update",
              ...meta(),
              page: page as never,
              section: section.id,
              set: {
                "style.background.overlay": {
                  color: bg.overlay?.color ?? "background",
                  opacity: target,
                },
              },
            } as Op,
          ],
        };
      }
      if (block && isTextBlock(block) && !block.style?.colorTheme)
        return {
          label: "Put the text on a panel",
          ops: [
            {
              op: "block.update",
              ...meta(),
              page: page as never,
              block: block.id,
              style: {
                ...(block.style ?? {}),
                colorTheme: section.style.colorTheme ?? "light",
                padding: block.style?.padding ?? { d: "lg", m: "md" },
              },
            } as Op,
          ],
        };
      return undefined;
    }
    case "broken-word":
    case "big-heading": {
      if (block?.type !== "heading") return undefined;
      const fields = block.fields as { level?: string; size?: string; phoneSize?: string };
      const order = ["display", "h1", "h2", "h3", "h4"];
      const current =
        fields.phoneSize && fields.phoneSize !== "auto"
          ? fields.phoneSize
          : fields.size && fields.size !== "auto"
            ? fields.size
            : (fields.level ?? "h2");
      const next = order[order.indexOf(current) + 1];
      if (!next) return undefined;
      return {
        label: "Use a smaller size on phones",
        ops: [
          {
            op: "block.update",
            ...meta(),
            page: page as never,
            block: block.id,
            set: { phoneSize: next },
          } as Op,
        ],
      };
    }
    case "cta-below-fold": {
      if (section.layout.mode === "grid") {
        const items = autoMobileLayout(section, { reset: true, textFirst: true });
        if (!items) return undefined;
        return {
          label: "Put the words first on phones",
          ops: Object.entries(items).flatMap(([b, item]) =>
            item.m
              ? [
                  {
                    op: "grid.place",
                    ...meta(),
                    page: page as never,
                    section: section.id,
                    block: b as never,
                    bp: "m",
                    rect: item.m,
                  } as Op,
                ]
              : [],
          ),
        };
      }
      // Stack: the column holding the button goes first on phones.
      const col = section.blocks.find((b) => b.type === "button")?.column ?? 0;
      const count = section.layout.columns.d.length;
      if (count < 2 || col === 0) return undefined;
      const order = [col, ...Array.from({ length: count }, (_, i) => i).filter((i) => i !== col)];
      return {
        label: "Put the words first on phones",
        ops: [
          {
            op: "section.update",
            ...meta(),
            page: page as never,
            section: section.id,
            set: { "layout.order.m": order },
          } as Op,
        ],
      };
    }
    case "loose-padding":
      return {
        label: "Tighten the spacing on phones",
        ops: [
          {
            op: "section.update",
            ...meta(),
            page: page as never,
            section: section.id,
            set: { "style.padding.m": "lg" },
          } as Op,
        ],
      };
    default:
      return undefined;
  }
  return undefined;
}

/**
 * Turn what the probe measured (one result per phone width) into plain-language issues with
 * fixes. Findings are de-duplicated across widths (the narrowest measurement wins).
 */
export function phoneIssuesFromProbe(
  doc: SiteDocument,
  pageId: string,
  results: readonly PhoneProbeResult[],
  options: CheckOptions = {},
): Issue[] {
  const meta = opMeta(options);
  const out = new Map<string, Issue>();
  const sorted = [...results].sort((a, b) => a.width - b.width);
  for (const r of sorted)
    for (const f of r.findings) {
      const at = locate(doc, pageId, f);
      // "Main button below the first screen" is about heroes: a section that opens with words
      // and a button (other first sections end with their button by design).
      if (
        f.kind === "cta-below-fold" &&
        at.section?.preset &&
        !at.section.preset.startsWith("hero/")
      )
        continue;
      const sectionName =
        at.section && at.page !== FOOTER
          ? " in this section"
          : at.page === FOOTER
            ? " in the footer"
            : "";
      const where = f.component ? ` in the “${f.component}” component` : sectionName;
      const [message, fix] = MESSAGE[f.kind](f, where);
      const key = `${f.kind}:${at.block?.id ?? f.block ?? ""}:${f.kind === "tap-target" || f.kind === "photo-contrast" ? (f.text ?? "") : ""}`;
      const i = issue({
        rule: `phone-${f.kind}`,
        severity: SEVERITY[f.kind],
        page: at.page,
        ...(at.section ? { section: at.section.id } : {}),
        ...(at.block ? { block: at.block.id } : {}),
        key: `${r.width}`,
        message,
        fix,
      });
      // Same finding at another width: keep the first (narrowest).
      const id = `${i.rule}:${i.page}:${i.section ?? ""}:${key}`;
      if (out.has(id)) continue;
      const autofix = fixFor(at, f, meta);
      out.set(id, { ...i, id: id.replace(/:+$/, ""), ...(autofix ? { autofix } : {}) });
    }
  return sortIssues([...out.values()]);
}

// --- fix everything ---------------------------------------------------------------------------

export interface FixForPhonesResult {
  /** Every op applied, in order (validate/apply them as one change). */
  ops: Op[];
  /** Labels of the fixes made. */
  fixed: Array<{ id: string; label: string }>;
  /** The document after the fixes. */
  doc: SiteDocument;
  /** Phone issues left that need a person (no automatic fix). */
  remaining: Issue[];
}

/**
 * "Fix everything for phones": apply every phone fix — the static rules' (recomputed after each
 * fix, so they never conflict) and then any rendered findings' — and return the combined ops.
 * Fixes never remove content and never change the desktop layout.
 */
export function fixForPhones(
  doc: SiteDocument,
  opts: CheckOptions & {
    pageId?: string;
    /** Issues from a rendered check (`phoneIssuesFromProbe`) to fix as well. */
    rendered?: readonly Issue[];
    /** Validate ops against this registry (defaults to the ops package's own). */
    validateOp?: (doc: SiteDocument, op: Op) => SiteDocument | null;
  } = {},
): FixForPhonesResult {
  let registry: ReturnType<typeof blocksRegistry> | undefined;
  const getRegistry = () => {
    registry ??= blocksRegistry();
    return registry;
  };
  const apply =
    opts.validateOp ??
    ((d: SiteDocument, op: Op) => {
      const r = validate(d, op, { trusted: true, registry: getRegistry() });
      return r.ok ? r.doc : null;
    });
  let cur = doc;
  const ops: Op[] = [];
  const fixed: Array<{ id: string; label: string }> = [];
  const tried = new Set<string>();
  const run = (i: Issue) => {
    if (!i.autofix || tried.has(i.id)) return;
    tried.add(i.id);
    let work = cur;
    for (const op of i.autofix.ops) {
      const next = apply(work, op);
      if (!next) return;
      work = next;
    }
    cur = work;
    ops.push(...i.autofix.ops);
    fixed.push({ id: i.id, label: i.autofix.label });
  };
  for (let guard = 0; guard < 200; guard++) {
    const next = phoneCheck(cur, opts.pageId, opts).find((i) => i.autofix && !tried.has(i.id));
    if (!next) break;
    run(next);
  }
  // Rendered fixes were computed for the document as it was; re-stacks and overlays still apply.
  const restacked = new Set<string>();
  for (const i of opts.rendered ?? []) {
    if (!i.autofix) continue;
    const key = `${i.section}:${i.autofix.label}`;
    if (restacked.has(key)) {
      tried.add(i.id);
      fixed.push({ id: i.id, label: i.autofix.label });
      continue;
    }
    const before = fixed.length;
    run(i);
    if (fixed.length > before) restacked.add(key);
  }
  const remaining = [
    ...phoneCheck(cur, opts.pageId, opts),
    ...(opts.rendered ?? []).filter((i) => !tried.has(i.id)),
  ];
  return { ops, fixed, doc: cur, remaining };
}
