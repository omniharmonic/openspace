import {
  type AnyBlockDefinition,
  type Block,
  type BlockStyle,
  type ColorTheme,
  type GridRect,
  type Link,
  newId,
  type RichTextDoc,
  type Section,
  type SectionBackground,
  type SectionLayout,
  type SectionStyle,
  type SpaceToken,
} from "@openspace/schema";
import { buttonBlock } from "../blocks/button";
import { headingBlock } from "../blocks/heading";
import { imageBlock } from "../blocks/image";
import { textBlock } from "../blocks/text";
import { rt } from "../shared";
import { copyViolations } from "./copy";
import type { CropAspect } from "./images";
import {
  type CopyRule,
  type HeaderPreset,
  type ImageSlot,
  PRESET_CATEGORIES,
  type PresetAi,
  type PresetBuildOptions,
  type PresetCategory,
  type PresetId,
  type PresetMeta,
  type SectionPreset,
} from "./types";

/** Authoring kit for section presets: terse block builders and the `definePreset` wrapper. */

export { rt };

export const ALL_THEMES: ColorTheme[] = ["light", "light-accent", "dark", "dark-accent", "brand"];

export const url = (path: string): Link => ({ type: "url", url: path });

// --- blocks -------------------------------------------------------------------------------------

export interface PlaceOpts {
  /** Stack column (0-based). */
  col?: number;
  variant?: string;
  style?: BlockStyle;
}

/**
 * Create a block from a definition. Fields passed as `undefined` are removed, so a block's own
 * demo defaults (its sample copy) never leak into a preset by accident.
 */
export function make(
  def: AnyBlockDefinition,
  // biome-ignore lint/suspicious/noExplicitAny: fields are checked by the definition at runtime
  fields: Record<string, any>,
  o: PlaceOpts = {},
): Block {
  const block = def.create({
    fields,
    ...(o.variant !== undefined ? { variant: o.variant } : {}),
    ...(o.style !== undefined ? { style: o.style } : {}),
    ...(o.col !== undefined ? { column: o.col } : {}),
  });
  for (const [k, v] of Object.entries(fields)) if (v === undefined) delete block.fields[k];
  const check = def.validate(block);
  if (!check.success) {
    throw new Error(
      `preset ${def.type}: ${check.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  return block;
}

type Align = "start" | "center" | "end";
const alignStyle = (align: Align | undefined, mobile?: Align): BlockStyle | undefined =>
  align ? { align: mobile ? { d: align, m: mobile } : { d: align } } : undefined;

const merge = (...styles: (BlockStyle | undefined)[]): BlockStyle | undefined => {
  const out: BlockStyle = {};
  for (const s of styles) if (s) Object.assign(out, s);
  return Object.keys(out).length ? out : undefined;
};

export interface HeadingOpts extends PlaceOpts {
  eyebrow?: string;
  sub?: string;
  level?: 1 | 2 | 3 | 4;
  size?: "auto" | "display" | "h1" | "h2" | "h3" | "h4";
  align?: Align;
  mobileAlign?: Align;
}

/** A heading block (eyebrow + heading + optional subheading). */
export function heading(text: string, o: HeadingOpts = {}): Block {
  return make(
    headingBlock,
    {
      text,
      eyebrow: o.eyebrow,
      subheading: o.sub,
      level: `h${o.level ?? 2}`,
      size: o.size ?? "auto",
    },
    {
      ...o,
      variant: o.variant ?? "plain",
      style: merge(alignStyle(o.align, o.mobileAlign), o.style),
    },
  );
}

export interface TextOpts extends PlaceOpts {
  align?: Align;
  mobileAlign?: Align;
}

/** A text block from rich-text nodes. */
export function text(nodes: RichTextDoc["content"], o: TextOpts = {}): Block {
  return make(
    textBlock,
    { content: rt.doc(...nodes) },
    {
      ...o,
      variant: o.variant ?? "default",
      style: merge(alignStyle(o.align, o.mobileAlign), o.style),
    },
  );
}

export interface ButtonOpts extends PlaceOpts {
  role?: "primary" | "secondary" | "tertiary";
  second?: { label: string; link: Link };
  note?: string;
  align?: Align;
  mobileAlign?: Align;
  size?: "default" | "large" | "full-width";
}

/** A button block; the second action (if any) gets the next role down automatically. */
export function button(label: string, link: Link, o: ButtonOpts = {}): Block {
  return make(
    buttonBlock,
    {
      label,
      link,
      role: o.role ?? "primary",
      secondaryLabel: o.second?.label,
      secondaryLink: o.second?.link,
      note: o.note,
    },
    {
      ...o,
      variant: o.size ?? o.variant ?? "default",
      style: merge(alignStyle(o.align, o.mobileAlign), o.style),
    },
  );
}

export interface ImageOpts extends PlaceOpts {
  aspect?: CropAspect;
  caption?: string;
  link?: Link;
  lightbox?: boolean;
  treatment?: BlockStyle["imageTreatment"];
  radius?: BlockStyle["radius"];
  shadow?: BlockStyle["shadow"];
}

/** An image block. */
export function image(img: { src: string; alt: string }, o: ImageOpts = {}): Block {
  const style = merge(
    o.treatment ? { imageTreatment: o.treatment } : undefined,
    o.radius ? { radius: o.radius } : undefined,
    o.shadow ? { shadow: o.shadow } : undefined,
    o.style,
  );
  return make(
    imageBlock,
    {
      image: img,
      aspect: o.aspect ?? "original",
      caption: o.caption,
      link: o.link,
      lightbox: o.lightbox ?? false,
    },
    { ...o, variant: o.variant ?? "default", ...(style ? { style } : {}) },
  );
}

// --- sections -----------------------------------------------------------------------------------

export interface StackOpts {
  /** Desktop column spans in twelfths (default one column). */
  cols?: number[];
  /** Tablet spans (inherits desktop when absent). */
  t?: number[];
  /** Mobile spans (default: one column). */
  m?: number[];
  /** Mobile/tablet stacking order of desktop columns. */
  order?: number[];
  align?: "start" | "center" | "end" | "stretch";
  width?: "narrow" | "content" | "wide" | "full";
  gap?: SpaceToken;
}

export function stack(o: StackOpts = {}): SectionLayout {
  const d = o.cols ?? [12];
  const columns: { d: number[]; t?: number[]; m?: number[] } = { d };
  if (o.t) columns.t = o.t;
  if (d.length > 1 || o.m) columns.m = o.m ?? [12];
  return {
    mode: "stack",
    columns,
    ...(o.order ? { order: { m: o.order, t: o.order } } : {}),
    ...(o.align ? { align: o.align } : {}),
    ...(o.width ? { width: o.width } : {}),
    ...(o.gap ? { gap: o.gap } : {}),
  } as SectionLayout;
}

/** One grid item: the block, its desktop rect and (designed) mobile rect. */
export type Placed = [block: Block, d: GridRect, m?: GridRect];

export const r = (x: number, y: number, w: number, h: number, extra: Partial<GridRect> = {}) =>
  ({ x, y, w, h, ...extra }) as GridRect;

export interface GridOpts {
  width?: "narrow" | "content" | "wide" | "full";
}

/** A grid layout from placed blocks. Rows are derived from the rects. */
export function grid(
  placed: Placed[],
  o: GridOpts = {},
): { layout: SectionLayout; blocks: Block[] } {
  const items: Record<string, { d: GridRect; m?: GridRect }> = {};
  let d = 1;
  let m = 1;
  for (const [block, rd, rm] of placed) {
    items[block.id] = rm ? { d: rd, m: rm } : { d: rd };
    d = Math.max(d, rd.y + rd.h - 1);
    if (rm) m = Math.max(m, rm.y + rm.h - 1);
  }
  const rows = placed.every(([, , rm]) => rm) ? { d, m } : { d };
  return {
    layout: { mode: "grid", rows, items, ...(o.width ? { width: o.width } : {}) } as SectionLayout,
    blocks: placed.map(([b]) => b),
  };
}

// --- presets ------------------------------------------------------------------------------------

/** What a preset's `make` returns: the section body. Ids, preset ref and theme are added for it. */
export interface SectionBody {
  layout: SectionLayout;
  blocks: Block[];
  padding?: SectionStyle["padding"];
  minHeight?: SectionStyle["minHeight"];
  background?: SectionBackground;
  anchor?: string;
}

export interface BuildContext {
  theme: ColorTheme;
  primary: Link;
  secondary: Link;
  collection: string;
}

export interface PresetSpec {
  category: PresetCategory;
  name: string;
  version?: number;
  label: string;
  description: string;
  copy: CopyRule[];
  images?: ImageSlot[];
  themes?: ColorTheme[];
  defaultTheme?: ColorTheme;
  collections?: PresetMeta["collections"];
  tags?: string[];
  ai: PresetAi;
  /** Default call-to-action targets and collection. */
  links?: { primary?: string; secondary?: string };
  collection?: string;
  footer?: boolean;
  make(ctx: BuildContext): SectionBody;
}

/** True when two rects share at least one cell. */
export function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function hasOverlap(layout: SectionLayout): boolean {
  if (layout.mode !== "grid") return false;
  const rects = Object.values(layout.items).map((i) => i.d);
  return rects.some((a, i) => rects.some((b, j) => j > i && rectsOverlap(a, b)));
}

/** Define a section (or footer) preset. Metadata is derived from one build so it never drifts. */
export function definePreset(spec: PresetSpec): SectionPreset {
  if (!(PRESET_CATEGORIES as readonly string[]).includes(spec.category))
    throw new Error(`preset ${spec.name}: unknown category ${spec.category}`);
  const version = spec.version ?? 1;
  const id = `${spec.category}/${spec.name}@${version}` as PresetId;
  const themes = spec.themes ?? ALL_THEMES;
  const defaultTheme = spec.defaultTheme ?? themes[0] ?? "light";

  const build = (opts: PresetBuildOptions = {}): Section => {
    const ctx: BuildContext = {
      theme: opts.colorTheme ?? defaultTheme,
      primary: opts.primaryLink ?? url(spec.links?.primary ?? "/contact"),
      secondary: opts.secondaryLink ?? url(spec.links?.secondary ?? "/about"),
      collection: opts.collection ?? spec.collection ?? "journal",
    };
    const body = spec.make(ctx);
    const style: SectionStyle = { colorTheme: ctx.theme };
    if (body.padding) style.padding = body.padding;
    if (body.minHeight) style.minHeight = body.minHeight;
    if (body.background) style.background = body.background;
    return {
      id: newId("sec"),
      preset: id,
      label: spec.label,
      ...(body.anchor ? { anchor: body.anchor } : {}),
      layout: body.layout,
      style,
      blocks: body.blocks,
    };
  };

  const sample = build();
  const violations = copyViolations(sample, spec.copy);
  if (violations.length) {
    const v = violations[0];
    throw new Error(
      `preset ${id}: demo copy for "${v?.rule.label}" is ${v?.words} words, outside ${v?.rule.words.join("–")}`,
    );
  }
  return Object.freeze({
    id,
    category: spec.category,
    name: spec.name,
    version,
    label: spec.label,
    description: spec.description,
    target: spec.footer ? "footer" : "page",
    layout: sample.layout.mode,
    overlap: hasOverlap(sample.layout),
    copy: spec.copy,
    images: spec.images ?? [],
    themes,
    defaultTheme,
    collections: spec.collections ?? [],
    tags: spec.tags ?? [],
    ai: spec.ai,
    build,
  });
}

export interface HeaderSpec
  extends Omit<PresetSpec, "make" | "copy" | "images" | "collections" | "links" | "footer"> {
  make(theme: ColorTheme): ReturnType<HeaderPreset["build"]>;
}

/** Define a site header preset (`site.header` settings). */
export function defineHeaderPreset(spec: HeaderSpec): HeaderPreset {
  const version = spec.version ?? 1;
  const themes = spec.themes ?? ALL_THEMES;
  const defaultTheme = spec.defaultTheme ?? themes[0] ?? "light";
  return Object.freeze({
    id: `header/${spec.name}@${version}` as PresetId,
    category: "header",
    name: spec.name,
    version,
    label: spec.label,
    description: spec.description,
    target: "header",
    layout: "none",
    overlap: false,
    copy: [],
    images: [],
    themes,
    defaultTheme,
    collections: [],
    tags: spec.tags ?? [],
    ai: spec.ai,
    build: (opts: PresetBuildOptions = {}) => spec.make(opts.colorTheme ?? defaultTheme),
  });
}

// --- common copy rules ----------------------------------------------------------------------------

export const words = (min: number, max: number) => [min, max] as const;

export const copy = {
  headline: (min = 3, max = 9, level?: 1 | 2 | 3 | 4): CopyRule => ({
    slot: "headline",
    label: "Headline",
    target: level ? { kind: "heading", level } : { kind: "heading" },
    words: [min, max],
  }),
  body: (min: number, max: number): CopyRule => ({
    slot: "body",
    label: "Body text",
    target: { kind: "body" },
    words: [min, max],
  }),
  sub: (min: number, max: number): CopyRule => ({
    slot: "intro",
    label: "Introduction",
    target: { kind: "field", block: "heading", field: "subheading" },
    words: [min, max],
  }),
  field: (
    slot: string,
    label: string,
    block: string,
    field: string,
    min: number,
    max: number,
  ): CopyRule => ({
    slot,
    label,
    target: { kind: "field", block, field },
    words: [min, max],
  }),
  items: (
    slot: string,
    label: string,
    block: string,
    list: string,
    field: string,
    min: number,
    max: number,
  ): CopyRule => ({
    slot,
    label,
    target: { kind: "items", block, list, field },
    words: [min, max],
  }),
};

/** A theme-relative scrim for text over photographs: the section's own background color. */
export const scrim = (opacity = 0.55) => ({ color: "background", opacity });
