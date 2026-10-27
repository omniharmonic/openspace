import { copyViolations, getPreset } from "@omniharmonic/openspace-blocks";
import { FOOTER, type Op, type SiteDocument } from "@omniharmonic/openspace-ops";
import {
  type Block,
  COLOR_THEMES,
  type ColorTheme,
  fallbackMobileRects,
  type GridRect,
  type Page,
  type RichTextDoc,
  type Section,
} from "@omniharmonic/openspace-schema";
import {
  compileStyles,
  contrastRatio,
  flattenDtcg,
  getPairing,
  nearestAccessible,
  pairingFamilies,
  type ThemeTokens,
} from "@omniharmonic/openspace-theme";
import {
  ACTION_BLOCKS,
  blockDisplayWidth,
  blocksInOrder,
  blockText,
  cropAspect,
  headingsOf,
  imageDisplayWidth,
  imagesIn,
  isTextBlock,
  type OutlineHeading,
} from "./content";
import { type CheckOptions, type Issue, issue, opMeta, sortIssues } from "./issue";
import { autoMobileLayout } from "./mobile";
import { photoContrast } from "./photo-contrast";

/**
 * Studio's Design check (doc 04 §9): contrast failures, more than two typefaces, headings out of
 * order, empty sections, oversized images, missing alt text, overlapping text in grid sections,
 * pages without a clear call to action, more than one primary action per section, section color
 * rhythm (more than three in a row; flipping every section), copy outside a preset's
 * recommended range, photo backgrounds without a scrim and mixed image shapes in a section.
 *
 * With `pageId`, page-level checks run for that page only (site-wide checks — styles, the
 * footer — always run). Issues come back sorted errors → warnings → info.
 */
export function designCheck(
  doc: SiteDocument,
  pageId?: string,
  options: CheckOptions = {},
): Issue[] {
  const ctx = new Ctx(doc, options);
  ctx.site();
  const pages = pageId
    ? [doc.pages[pageId as Page["id"]]].filter((p): p is Page => !!p)
    : Object.values(doc.pages);
  if (pageId && pages.length === 0) throw new Error(`Page ${pageId} not found`);
  for (const page of pages) ctx.page(page);
  ctx.container(FOOTER, [doc.site.footer], { footer: true });
  return sortIssues(ctx.issues);
}

const LIGHT = new Set<ColorTheme>(["light", "light-accent"]);
const themeOf = (s: Section): ColorTheme => s.style.colorTheme ?? "light";
const visible = (sections: readonly Section[]) => sections.filter((s) => !s.hidden);
const PHOTO_BLOCKS = new Set(["image", "gallery", "video", "before-after", "map"]);
const RESPONSIVE_HOSTS = /^https:\/\/(?:images\.unsplash\.com|[^/]+\.imgix\.net)\//;

class Ctx {
  issues: Issue[] = [];
  meta: ReturnType<typeof opMeta>;
  tokens: ThemeTokens;

  constructor(
    readonly doc: SiteDocument,
    options: CheckOptions,
  ) {
    this.meta = opMeta(options);
    this.tokens = compileStyles(doc.styles).tokens;
  }

  add(i: Parameters<typeof issue>[0]) {
    this.issues.push(issue(i));
  }

  // --- site-wide ------------------------------------------------------------------------------

  site() {
    this.contrast();
    this.families();
  }

  /** Color pairs that fail WCAG AA: unfixable ones (errors) and overrides the solver had to move. */
  contrast() {
    const styles = this.doc.styles;
    const solved = compileStyles(styles);
    for (const f of solved.contrast.failures) {
      this.add({
        rule: "contrast",
        severity: "error",
        key: `${f.theme}:${f.fg}:${f.bg}`,
        message: `In the ${f.theme} color theme, ${f.fg} on ${f.bg} has a contrast of ${f.ratio}:1; it needs ${f.required}:1 to be readable.`,
        fix: `Choose a brand color with more contrast, or set ${f.fg} to ${f.suggestion}.`,
      });
    }
    if (!styles.overrides) return;
    const overridden = new Map<string, string>(); // "theme:role" → override path
    for (const t of flattenDtcg(styles.overrides)) {
      const [group, a, b] = t.path;
      if (group !== "color" || !a) continue;
      if (b && (COLOR_THEMES as readonly string[]).includes(a))
        overridden.set(`${a}:${b}`, t.path.join("."));
      else if (b && a === "all")
        for (const th of COLOR_THEMES) overridden.set(`${th}:${b}`, t.path.join("."));
      else if (!b) overridden.set(`light:${a}`, t.path.join("."));
    }
    const raw = compileStyles(styles, { solve: false });
    // One issue per overridden color: fix it against every surface it fails on.
    const groups = new Map<
      string,
      { theme: ColorTheme; target: string; fixFg: boolean; failures: typeof raw.contrast.failures }
    >();
    for (const f of raw.contrast.failures) {
      const fixFg = overridden.has(`${f.theme}:${f.fg}`);
      if (!fixFg && !overridden.has(`${f.theme}:${f.bg}`)) continue;
      const target = fixFg ? f.fg : f.bg;
      const key = `${f.theme}:${target}`;
      const g = groups.get(key) ?? { theme: f.theme, target, fixFg, failures: [] };
      g.failures.push(f);
      groups.set(key, g);
    }
    for (const [key, g] of groups) {
      const first = g.failures[0];
      if (!first) continue;
      let value = g.fixFg ? first.fgColor : first.bgColor;
      for (let pass = 0; pass < 3; pass++)
        for (const f of g.failures) {
          const other = g.fixFg ? f.bgColor : f.fgColor;
          if (contrastRatio(value, other) < f.required)
            value = nearestAccessible(value, other, f.required + 0.05);
        }
      const pairs = g.failures
        .map((f) => `${f.fg} on ${f.bg} (${f.ratio}:1, needs ${f.required}:1)`)
        .join("; ");
      const ops: Op[] = [
        {
          op: "styles.patch",
          ...this.meta(),
          patch: {
            set: { [`overrides.color.${g.theme}.${g.target}`]: { $value: value, $type: "color" } },
          },
        },
      ];
      this.add({
        rule: "contrast-override",
        severity: "warning",
        key,
        message: `Your custom ${g.target} color is hard to read in the ${g.theme} theme: ${pairs}. It's adjusted automatically when published.`,
        fix: `Use ${value}, the nearest accessible shade, so what you see is what's published.`,
        autofix: { label: "Use the nearest accessible color", ops },
      });
    }
  }

  /** More than two type families (pairing + overrides + custom CSS). */
  families() {
    const families = new Map<string, string>(); // family (lowercase) → where
    const pairing = getPairing(this.doc.styles.choices.pairing);
    if (pairing)
      for (const f of pairingFamilies(pairing)) families.set(f.family.toLowerCase(), "pairing");
    const overridePaths: string[] = [];
    for (const t of flattenDtcg(this.doc.styles.overrides)) {
      if (t.path[t.path.length - 1] !== "fontFamily" && t.type !== "fontFamily") continue;
      const v = t.token.$value;
      const first = (Array.isArray(v) ? v[0] : v) as unknown;
      if (typeof first !== "string" || first.startsWith("{")) continue;
      families.set(first.replace(/["']/g, "").trim().toLowerCase(), "override");
      overridePaths.push(`overrides.${t.path.join(".")}`);
    }
    const generic =
      /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|inherit|initial|unset)$/;
    for (const m of (this.doc.site.customCss ?? "").matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
      const first = (m[1] ?? "").split(",")[0]?.replace(/["']/g, "").trim().toLowerCase() ?? "";
      if (!first || generic.test(first) || first.startsWith("var(")) continue;
      families.set(first, "custom CSS");
    }
    if (families.size <= 2) return;
    this.add({
      rule: "too-many-typefaces",
      severity: "warning",
      message: `The site uses ${families.size} typefaces (${[...families.keys()].join(", ")}). More than two makes pages feel busy.`,
      fix: "Pick a different type pairing in Site Styles instead of changing fonts block by block.",
      ...(overridePaths.length
        ? {
            autofix: {
              label: "Remove custom fonts and keep the pairing",
              ops: [{ op: "styles.patch", ...this.meta(), patch: { unset: overridePaths } } as Op],
            },
          }
        : {}),
    });
  }

  // --- pages ------------------------------------------------------------------------------------

  page(page: Page) {
    const sections = visible(page.sections);
    this.container(page.id, sections, { footer: false });
    this.headings(page, sections);
    this.cta(page, sections);
    this.rhythm(page, sections);
  }

  container(page: string, sections: readonly Section[], o: { footer: boolean }) {
    for (const section of visible(sections)) {
      this.empty(page, section, o.footer);
      this.images(page, section);
      this.overlap(page, section);
      this.primaryActions(page, section);
      this.copyLength(page, section);
      this.background(page, section);
    }
  }

  headings(page: Page, sections: readonly Section[]) {
    const outline: (OutlineHeading & { section: string })[] = [];
    for (const s of sections)
      for (const b of blocksInOrder(s))
        for (const h of headingsOf(b)) outline.push({ ...h, section: s.id });
    const h1s = outline.filter((h) => h.level === 1);
    if (outline.length && h1s.length === 0) {
      this.add({
        rule: "heading-missing-h1",
        severity: "warning",
        page: page.id,
        message: `“${page.title}” has no main heading (Heading 1).`,
        fix: "Make the first heading on the page a Heading 1 — usually the hero headline.",
      });
    }
    for (const extra of h1s.slice(1)) {
      const fix = this.relevel(page.id, extra, 2);
      this.add({
        rule: "heading-multiple-h1",
        severity: "warning",
        page: page.id,
        section: extra.section,
        block: extra.blockId,
        key: extra.text,
        message: `“${extra.text}” is a second Heading 1 on this page. Use one Heading 1 per page.`,
        fix: "Change it to a Heading 2; the visual size can stay the same.",
        ...(fix ? { autofix: { label: "Change to Heading 2", ops: fix } } : {}),
      });
    }
    let prev = 0;
    for (const h of outline) {
      if (prev && h.level > prev + 1) {
        const fix = this.relevel(page.id, h, prev + 1);
        this.add({
          rule: "heading-order",
          severity: "warning",
          page: page.id,
          section: h.section,
          block: h.blockId,
          key: `${h.text}:${h.level}`,
          message: `“${h.text || "Untitled"}” jumps from Heading ${prev} to Heading ${h.level}, skipping a level.`,
          fix: h.editable
            ? `Make it a Heading ${prev + 1}, or add a Heading ${prev + 1} above it.`
            : `Add a Heading ${prev + 1} above it (for example a section heading).`,
          ...(fix ? { autofix: { label: `Change to Heading ${prev + 1}`, ops: fix } } : {}),
        });
      }
      prev = h.level;
    }
  }

  /** Ops that change one heading's level (heading blocks, rich text, `headingLevel` fields). */
  relevel(page: string, h: OutlineHeading & { section: string }, level: number): Op[] | undefined {
    if (!h.editable) return undefined;
    const block = this.blockById(page, h.blockId);
    if (!block) return undefined;
    const base = {
      op: "block.update" as const,
      ...this.meta(),
      page: page as never,
      block: block.id,
    };
    if (block.type === "heading") return [{ ...base, set: { level: `h${level}` } }];
    if (block.type === "text") {
      const content = structuredClone(block.fields.content as RichTextDoc);
      const node = content.content.find(
        (n) => n.type === "heading" && n.attrs.level === h.level && plain(n) === h.text,
      );
      if (node?.type !== "heading") return undefined;
      node.attrs = { ...node.attrs, level: level as 1 | 2 | 3 | 4 };
      return [{ ...base, set: { content } }];
    }
    if (level >= 2 && level <= 4) return [{ ...base, set: { headingLevel: `h${level}` } }];
    return undefined;
  }

  blockById(page: string, id: string): Block | undefined {
    const sections =
      page === FOOTER
        ? [this.doc.site.footer]
        : (this.doc.pages[page as Page["id"]]?.sections ?? []);
    for (const s of sections) for (const b of s.blocks) if (b.id === id) return b;
    return undefined;
  }

  empty(page: string, section: Section, footer: boolean) {
    const empty =
      section.blocks.length === 0 || section.blocks.every((b) => isTextBlock(b) && !blockText(b));
    if (!empty) return;
    this.add({
      rule: "empty-section",
      severity: "warning",
      page,
      section: section.id,
      message: section.blocks.length
        ? "This section's blocks are all empty."
        : "This section is empty.",
      fix: footer ? "Add your details to the footer." : "Add content or delete the section.",
      ...(!footer
        ? {
            autofix: {
              label: "Delete the section",
              ops: [
                {
                  op: "section.delete",
                  ...this.meta(),
                  page: page as never,
                  section: section.id,
                } as Op,
              ],
            },
          }
        : {}),
    });
  }

  images(page: string, section: Section) {
    const aspects = new Set<string>();
    for (const block of section.blocks) {
      if (
        block.type === "image" &&
        typeof block.fields.aspect === "string" &&
        section.layout.mode === "stack"
      )
        aspects.add(block.fields.aspect);
      const blockWidth = blockDisplayWidth(section, block);
      for (const { image, path } of imagesIn(block)) {
        const where = path.length ? path.join(".") : "image";
        if (!image.alt.trim()) {
          this.add({
            rule: "missing-alt",
            severity: "warning",
            page,
            section: section.id,
            block: block.id,
            key: where,
            message: `An image in this ${block.type} block has no alt text, so people using screen readers won't know what it shows.`,
            fix: "Describe what the image is for (e.g. 'Maya adjusting a student's pose'). Only purely decorative images should be left empty.",
          });
        }
        if (!["image", "gallery", "card", "columns", "before-after"].includes(block.type)) continue;
        const width =
          image.width ?? this.doc.media[image.src as keyof SiteDocument["media"]]?.width;
        const height =
          image.height ?? this.doc.media[image.src as keyof SiteDocument["media"]]?.height;
        if (!width) continue;
        const display = imageDisplayWidth(block, blockWidth, path);
        const crop = cropAspect(block, section);
        const needed = crop && height ? display * Math.max(1, width / height / crop) : display;
        if (width <= needed * 2 * 1.05) continue;
        const responsive = RESPONSIVE_HOSTS.test(image.src) || !/^https?:/.test(image.src);
        const target = Math.ceil((needed * 2) / 10) * 10;
        const ops = this.resizeOps(page, block, path, image, target);
        this.add({
          rule: "oversized-image",
          severity: responsive ? "info" : "warning",
          page,
          section: section.id,
          block: block.id,
          key: where,
          message: `An image is ${width}px wide but shown at about ${Math.round(needed)}px — more than twice its displayed size${responsive ? "" : ", which makes the page slow to load"}.`,
          fix: `Use a version about ${target}px wide.`,
          ...(ops ? { autofix: { label: `Resize to ${target}px`, ops } } : {}),
        });
      }
    }
    if (aspects.size > 1) {
      this.add({
        rule: "mixed-aspects",
        severity: "info",
        page,
        section: section.id,
        message: `Images in this section use different shapes (${[...aspects].join(", ")}).`,
        fix: "Keep image aspect ratios consistent within a section.",
      });
    }
  }

  /** For imgix/Unsplash URLs: ask for a smaller width (a trivial, lossless fix). */
  resizeOps(
    page: string,
    block: Block,
    path: (string | number)[],
    image: { src: string; width?: number; height?: number },
    target: number,
  ): Op[] | undefined {
    if (!RESPONSIVE_HOSTS.test(image.src) || !image.width || !image.height) return undefined;
    const url = new URL(image.src);
    url.searchParams.set("w", String(target));
    const resized = {
      ...image,
      src: url.toString(),
      width: target,
      height: Math.round((target * image.height) / image.width),
    };
    const [field, ...rest] = path;
    if (field === undefined) return undefined;
    const value = structuredClone(block.fields[field as string]);
    if (rest.length === 0) {
      return [
        {
          op: "block.update",
          ...this.meta(),
          page: page as never,
          block: block.id,
          set: { [field]: { ...(value as object), ...resized } },
        },
      ];
    }
    let node = value as Record<string | number, unknown>;
    for (const k of rest.slice(0, -1)) node = node[k] as Record<string | number, unknown>;
    const last = rest[rest.length - 1] as string | number;
    node[last] = { ...(node[last] as object), ...resized };
    return [
      {
        op: "block.update",
        ...this.meta(),
        page: page as never,
        block: block.id,
        set: { [field]: value },
      },
    ];
  }

  /** Text blocks that overlap other text blocks in a grid, at any breakpoint. */
  overlap(page: string, section: Section) {
    const layout = section.layout;
    if (layout.mode !== "grid") return;
    const text = section.blocks.filter(isTextBlock);
    const fallback = fallbackMobileRects(layout);
    const rectAt = (id: string, bp: "d" | "t" | "m"): GridRect | undefined => {
      const item = layout.items[id as keyof typeof layout.items];
      if (!item) return undefined;
      if (bp === "d") return item.d;
      if (bp === "t") return item.t ?? item.d;
      return item.m ?? fallback[id];
    };
    const names = { d: "desktop", t: "tablet", m: "mobile" } as const;
    for (const bp of ["d", "t", "m"] as const) {
      if (bp === "t" && !Object.values(layout.items).some((i) => i.t)) continue;
      for (let i = 0; i < text.length; i++)
        for (let j = i + 1; j < text.length; j++) {
          const a = text[i] as Block;
          const b = text[j] as Block;
          const ra = rectAt(a.id, bp);
          const rb = rectAt(b.id, bp);
          if (!ra || !rb || !overlaps(ra, rb)) continue;
          let autofix: Issue["autofix"];
          if (bp === "m") {
            const items = autoMobileLayout(section, { reset: true });
            if (items) {
              autofix = {
                label: "Re-stack the mobile layout",
                ops: Object.entries(items).flatMap(([block, item]) =>
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
                ),
              };
            }
          }
          this.add({
            rule: "overlapping-text",
            severity: "error",
            page,
            section: section.id,
            block: b.id,
            key: `${bp}:${a.id}`,
            message: `Two text blocks (${a.type} and ${b.type}) overlap on ${names[bp]}, so neither can be read properly.`,
            fix: `Move one of them in the ${names[bp]} layout, or put the text on an image instead of on other text.`,
            ...(autofix ? { autofix } : {}),
          });
        }
      // Text drawn over a photo needs its own panel (a block color theme) to stay legible.
      const media = section.blocks.filter((x) => PHOTO_BLOCKS.has(x.type));
      for (const t of text) {
        const rt = rectAt(t.id, bp);
        let hidden = false;
        for (const m of media) {
          const rm = rectAt(m.id, bp);
          if (!rt || !rm || (rm.z ?? 1) <= (rt.z ?? 1) || !covers(rm, rt)) continue;
          hidden = true;
          this.add({
            rule: "text-hidden",
            severity: "error",
            page,
            section: section.id,
            block: t.id,
            key: `${bp}:${m.id}`,
            message: `A ${t.type} block is completely covered by a ${m.type} on ${names[bp]}, so visitors can't see it.`,
            fix: `Bring the ${t.type} to the front (a higher layer than the ${m.type}) or move it off the ${m.type}.`,
          });
          break;
        }
        if (hidden || t.style?.colorTheme) continue;
        for (const m of media) {
          const rm = rectAt(m.id, bp);
          if (!rt || !rm || !overlaps(rt, rm) || (rt.z ?? 1) < (rm.z ?? 1)) continue;
          this.add({
            rule: "text-over-photo",
            severity: "warning",
            page,
            section: section.id,
            block: t.id,
            key: `${bp}:${m.id}`,
            message: `A ${t.type} block sits directly on a photo on ${names[bp]}, where busy areas make it hard to read.`,
            fix: "Give the block its own color theme (a solid panel), or move it off the photo.",
            autofix: {
              label: "Put the text on a panel",
              ops: [
                {
                  op: "block.update",
                  ...this.meta(),
                  page: page as never,
                  block: t.id,
                  style: {
                    ...(t.style ?? {}),
                    colorTheme: themeOf(section),
                    padding: t.style?.padding ?? { d: "lg", m: "md" },
                  },
                } as Op,
              ],
            },
          });
          break;
        }
      }
    }
  }

  primaryActions(page: string, section: Section) {
    const primaries = section.blocks.filter(
      (b) => b.type === "button" && (b.fields.role ?? "primary") === "primary",
    );
    for (const extra of primaries.slice(1)) {
      this.add({
        rule: "multiple-primary-actions",
        severity: "warning",
        page,
        section: section.id,
        block: extra.id,
        message: `This section has ${primaries.length} primary buttons. One main action per screenful is clearer.`,
        fix: "Make the other actions secondary or tertiary.",
        autofix: {
          label: "Make it a secondary button",
          ops: [
            {
              op: "block.update",
              ...this.meta(),
              page: page as never,
              block: extra.id,
              set: { role: "secondary" },
            } as Op,
          ],
        },
      });
    }
  }

  copyLength(page: string, section: Section) {
    if (!section.preset) return;
    const preset = getPreset(section.preset);
    if (!preset || preset.target === "header" || !preset.copy.length) return;
    for (const v of copyViolations(section, preset.copy)) {
      const [min, max] = v.rule.words;
      this.add({
        rule: "copy-length",
        severity: v.direction === "long" ? "warning" : "info",
        page,
        section: section.id,
        block: v.blockId,
        key: `${v.rule.slot}:${v.item ?? 0}`,
        message: `${v.rule.label} is ${v.words} word${v.words === 1 ? "" : "s"}; this layout is designed for ${min}–${max}.`,
        fix:
          v.direction === "long"
            ? "Shorten it rather than making the text smaller."
            : "Add a little more detail so the layout feels balanced.",
      });
    }
  }

  /** Photo/video backgrounds behind text need a scrim; exact background colors need contrast. */
  background(page: string, section: Section) {
    const bg = section.style.background;
    if (!bg || bg.type === "none") return;
    const hasText = section.blocks.some((b) => isTextBlock(b) && !b.style?.colorTheme);
    if (!hasText) return;
    if (bg.type === "image" || bg.type === "video") {
      // A missing overlay is a 0% scrim; text must still pass over any photo.
      const overlay = bg.overlay ?? { color: "background", opacity: 0 };
      const minOpacity = this.photoText(page, section, overlay);
      if (overlay.opacity < 0.35) {
        const target = Math.max(0.35, minOpacity ?? 0.35);
        this.add({
          rule: "photo-without-scrim",
          severity: "warning",
          page,
          section: section.id,
          message:
            "Text sits directly on a photo background, which is hard to read on busy or bright areas.",
          fix:
            minOpacity === null
              ? "Put the text on a panel (a block color theme): no overlay keeps it readable over every photo."
              : `Add an overlay of at least ${Math.round(target * 100)}% (the section's background color works well).`,
          ...(minOpacity === null
            ? {}
            : {
                autofix: {
                  label: `Add a ${Math.round(target * 100)}% overlay`,
                  ops: [
                    {
                      op: "section.update",
                      ...this.meta(),
                      page: page as never,
                      section: section.id,
                      set: {
                        "style.background.overlay": { color: overlay.color, opacity: target },
                      },
                    } as Op,
                  ],
                },
              }),
        });
      }
      return;
    }
    const theme = themeOf(section);
    const colors = this.tokens.themes[theme];
    const stops =
      bg.type === "color" ? [bg.color] : [bg.from, bg.via, bg.to].filter((c): c is string => !!c);
    for (const stop of stops) {
      const color = this.resolveColor(stop, theme);
      if (!color) continue;
      const ratio = contrastRatio(colors.text, color);
      if (ratio >= 4.5) continue;
      this.add({
        rule: "background-contrast",
        severity: "error",
        page,
        section: section.id,
        key: stop,
        message: `The section background (${stop}) leaves body text at ${ratio.toFixed(2)}:1 contrast; it needs 4.5:1.`,
        fix: `Use a color theme instead of a custom background, or a background close to ${nearestAccessible(color, colors.text)}.`,
      });
    }
  }

  /**
   * Text over a photo/video background must pass WCAG against the scrim blended over both the
   * darkest and the brightest possible photo (the photo itself can be anything).
   */
  /**
   * Returns the smallest overlay opacity at which every text colour passes (`undefined` when
   * nothing fails or the overlay colour is unknown, `null` when no opacity is enough).
   */
  photoText(
    page: string,
    section: Section,
    overlay: { color: string; opacity: number },
  ): number | null | undefined {
    const theme = themeOf(section);
    const roles = this.tokens.themes[theme] as unknown as Record<string, string>;
    const color = this.resolveColor(overlay.color, theme);
    if (!color) {
      this.add({
        rule: "photo-overlay-color",
        severity: "warning",
        page,
        section: section.id,
        message: `The photo overlay color “${overlay.color}” isn't a color or theme role, so text contrast over the photo can't be checked.`,
        fix: "Use a theme role such as background, or a CSS color.",
      });
      return undefined;
    }
    const { failures, minOpacity } = photoContrast(
      section,
      roles,
      color,
      overlay.opacity,
      this.doc.styles.choices.buttons,
    );
    if (failures.length === 0) return overlay.opacity;
    const worst = new Map<string, (typeof failures)[number]>();
    for (const f of failures) {
      const key = `${f.blockId}:${f.label}`;
      const prev = worst.get(key);
      if (!prev || f.ratio < prev.ratio) worst.set(key, f);
    }
    for (const f of worst.values()) {
      this.add({
        rule: "text-over-photo-contrast",
        severity: "error",
        page,
        section: section.id,
        block: f.blockId,
        key: f.label,
        message: `${f.label} over the background photo can drop to ${f.ratio.toFixed(2)}:1 contrast on bright or dark parts of the photo; it needs ${f.min}:1.`,
        fix: minOpacity
          ? `Raise the photo overlay to ${Math.round(minOpacity * 100)}%, or put the text on a panel.`
          : "Put the text on a panel (a block color theme), or use a plain background.",
        ...(minOpacity
          ? {
              autofix: {
                label: `Raise the overlay to ${Math.round(minOpacity * 100)}%`,
                ops: [
                  {
                    op: "section.update",
                    ...this.meta(),
                    page: page as never,
                    section: section.id,
                    set: {
                      "style.background.overlay": { color: overlay.color, opacity: minOpacity },
                    },
                  } as Op,
                ],
              },
            }
          : {}),
      });
    }
    return minOpacity ?? null;
  }

  resolveColor(value: string, theme: ColorTheme): string | undefined {
    const roles = this.tokens.themes[theme] as Record<string, string>;
    if (roles[value]) return roles[value];
    const m = /^(accent|neutral)-(\d+)$/.exec(value);
    if (m)
      return (this.tokens.palette[m[1] as "accent" | "neutral"] as Record<number, string>)[
        Number(m[2])
      ];
    return /^(?:#|oklch|oklab|rgb|hsl|lab|lch)/.test(value) ? value : undefined;
  }

  cta(page: Page, sections: readonly Section[]) {
    if (sections.length === 0) return;
    const has = sections.some((s) => s.blocks.some((b) => ACTION_BLOCKS.has(b.type)));
    const navButton = this.doc.site.nav.some((n) => n.type === "button" && !n.hidden);
    if (has || navButton) return;
    this.add({
      rule: "no-call-to-action",
      severity: "warning",
      page: page.id,
      message: `“${page.title}” has no clear call to action — nothing tells visitors what to do next.`,
      fix: "Add a button, form or signup (a call-to-action section at the end works well).",
    });
  }

  rhythm(page: Page, sections: readonly Section[]) {
    if (sections.length < 5) return;
    let run = 1;
    sections.forEach((s, i) => {
      if (i === 0) return;
      const same = themeOf(s) === themeOf(sections[i - 1] as Section);
      run = same ? run + 1 : 1;
      if (run === 4) {
        const alt: ColorTheme = LIGHT.has(themeOf(s))
          ? themeOf(s) === "light"
            ? "light-accent"
            : "light"
          : themeOf(s) === "dark"
            ? "dark-accent"
            : "dark";
        this.add({
          rule: "rhythm-repeat",
          severity: "warning",
          page: page.id,
          section: s.id,
          message: `Four sections in a row use the ${themeOf(s)} color theme, so the page reads as one long block.`,
          fix: `Give one of them a different color theme, for example ${alt}.`,
          autofix: {
            label: `Switch this section to ${alt}`,
            ops: [
              {
                op: "section.update",
                ...this.meta(),
                page: page.id,
                section: s.id,
                set: { "style.colorTheme": alt },
              } as Op,
            ],
          },
        });
      }
    });
    const flips = sections
      .slice(1)
      .filter(
        (s, i) => LIGHT.has(themeOf(s)) !== LIGHT.has(themeOf(sections[i] as Section)),
      ).length;
    if (flips === sections.length - 1) {
      this.add({
        rule: "rhythm-flipping",
        severity: "warning",
        page: page.id,
        message: "Every section flips between light and dark, which feels restless.",
        fix: "Group related sections on the same or a neighbouring theme (Light → Light accent → Light), and save dark themes for moments that matter.",
      });
    }
  }
}

/** `outer` covers every cell of `inner`. */
function covers(outer: GridRect, inner: GridRect): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.w >= inner.x + inner.w &&
    outer.y + outer.h >= inner.y + inner.h
  );
}

function overlaps(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function plain(node: unknown): string {
  const parts: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== "object") return;
    const o = n as { type?: string; text?: string; content?: unknown[] };
    if (o.type === "text" && o.text) parts.push(o.text);
    if (Array.isArray(o.content)) o.content.forEach(walk);
  };
  walk(node);
  return parts.join("");
}
