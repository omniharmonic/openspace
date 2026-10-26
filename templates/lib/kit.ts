import {
  blocksRegistry,
  type CropAspect,
  getPreset,
  PHOTOS,
  type PhotoKey,
  photo as presetPhoto,
  rt,
} from "@openspace/blocks";
import {
  type Block,
  type BlockStyle,
  type ColorTheme,
  type GridRect,
  type ImageValue,
  type Link,
  newId,
  type PageId,
  type RichTextDoc,
  type Section,
  type SectionBackground,
  type SectionLayout,
  type SectionStyle,
  type SpaceToken,
} from "@openspace/schema";
import { pageId } from "./ids";

/**
 * Authoring kit for templates: terse block and section builders over the real block library,
 * plus {@link fromPreset}, which builds a section preset and rewrites its demo copy for the
 * template's owner. Every block is validated by its definition as it is built.
 */

export { rt };
export type Nodes = RichTextDoc["content"];
// biome-ignore lint/suspicious/noExplicitAny: block fields are validated by their definition
export type Fields = Record<string, any>;

// --- links ---------------------------------------------------------------------------------------

export const page = (id: PageId, anchor?: string): Link =>
  anchor ? { type: "page", page: id, anchor } : { type: "page", page: id };
export const url = (u: string, newTab?: boolean): Link =>
  newTab ? { type: "url", url: u, newTab } : { type: "url", url: u };
export const mail = (email: string, subject?: string): Link =>
  subject ? { type: "email", email, subject } : { type: "email", email };
export const tel = (phone: string): Link => ({ type: "phone", phone });
/** A fresh form id (renamed to a stable one when the template is assembled). */
export const formId = () => newId("frm");
export const item = (collection: string, slug: string): Link => ({
  type: "item",
  collection,
  slug,
});

// --- images --------------------------------------------------------------------------------------

/**
 * A credited demo photo sized for where it is shown (`displayWidth` CSS px at desktop, cropped
 * to `aspect`). `alt` describes the photo's purpose in this template when the generic
 * description isn't enough.
 */
export function photo(
  key: PhotoKey,
  displayWidth: number,
  aspect: CropAspect = "original",
  alt?: string,
): ImageValue {
  const img = presetPhoto(key, displayWidth, aspect);
  return alt ? { ...img, alt } : img;
}

/** Bare https URL of a demo photo at a width (collection frontmatter `image`). */
export function photoUrl(key: PhotoKey, width = 1600): string {
  const p = PHOTOS[key];
  return `https://images.unsplash.com/photo-${p.id}?w=${Math.min(width, p.w)}&q=80`;
}

// --- blocks --------------------------------------------------------------------------------------

export interface BlockOpts {
  variant?: string;
  /** Stack column (0-based). */
  col?: number;
  style?: BlockStyle;
}

const SAFE_DEFAULT_KINDS = new Set(["boolean", "select", "number", "color"]);

/**
 * A block from the library. Required non-copy fields (booleans, selects, numbers) fall back to
 * their defaults; copy never does, so a definition's demo text can't leak into a template.
 */
export function block(type: string, fields: Fields, o: BlockOpts = {}): Block {
  const def = blocksRegistry().get(type);
  if (!def) throw new Error(`Unknown block type ${type}`);
  const merged: Fields = {};
  for (const [k, m] of Object.entries(def.meta.fields)) {
    const meta = m as { kind: string; optional?: boolean; default?: unknown };
    if (!meta.optional && meta.default !== undefined && SAFE_DEFAULT_KINDS.has(meta.kind))
      merged[k] = structuredClone(meta.default);
  }
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) merged[k] = v;
  const b: Block = { id: newId("blk"), type, v: def.version, fields: merged };
  if (o.variant) b.variant = o.variant;
  if (o.col !== undefined) b.column = o.col;
  if (o.style && Object.keys(o.style).length) b.style = o.style;
  return check(b);
}

function check(b: Block): Block {
  const def = blocksRegistry().get(b.type);
  if (!def) throw new Error(`Unknown block type ${b.type}`);
  const r = def.validate(b);
  if (!r.success)
    throw new Error(
      `${b.type}: ${r.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  return b;
}

type Align = "start" | "center" | "end";
const alignStyle = (align?: Align, m?: Align): BlockStyle | undefined =>
  align ? { align: m ? { d: align, m } : { d: align } } : undefined;
const mergeStyle = (...s: (BlockStyle | undefined)[]): BlockStyle | undefined => {
  const out: BlockStyle = {};
  for (const x of s) if (x) Object.assign(out, x);
  return Object.keys(out).length ? out : undefined;
};

export interface HeadingOpts extends BlockOpts {
  eyebrow?: string;
  sub?: string;
  level?: 1 | 2 | 3 | 4;
  size?: "auto" | "display" | "h1" | "h2" | "h3" | "h4";
  align?: Align;
  mAlign?: Align;
}

export function heading(textValue: string, o: HeadingOpts = {}): Block {
  return block(
    "heading",
    {
      text: textValue,
      eyebrow: o.eyebrow,
      subheading: o.sub,
      level: `h${o.level ?? 2}`,
      size: o.size ?? "auto",
    },
    {
      variant: o.variant ?? "plain",
      ...(o.col !== undefined ? { col: o.col } : {}),
      style: mergeStyle(alignStyle(o.align, o.mAlign), o.style),
    },
  );
}

export interface TextOpts extends BlockOpts {
  align?: Align;
  mAlign?: Align;
}

export function text(nodes: Nodes, o: TextOpts = {}): Block {
  return block(
    "text",
    { content: rt.doc(...nodes) },
    {
      variant: o.variant ?? "default",
      ...(o.col !== undefined ? { col: o.col } : {}),
      style: mergeStyle(alignStyle(o.align, o.mAlign), o.style),
    },
  );
}

export interface ButtonOpts extends BlockOpts {
  role?: "primary" | "secondary" | "tertiary";
  second?: [label: string, link: Link];
  note?: string;
  size?: "default" | "large" | "full-width";
  align?: Align;
  mAlign?: Align;
}

export function button(label: string, link: Link, o: ButtonOpts = {}): Block {
  return block(
    "button",
    {
      label,
      link,
      role: o.role ?? "primary",
      secondaryLabel: o.second?.[0],
      secondaryLink: o.second?.[1],
      note: o.note,
    },
    {
      variant: o.size ?? "default",
      ...(o.col !== undefined ? { col: o.col } : {}),
      style: mergeStyle(alignStyle(o.align, o.mAlign), o.style),
    },
  );
}

export interface ImageOpts extends BlockOpts {
  aspect?: CropAspect;
  caption?: string;
  link?: Link;
  lightbox?: boolean;
  treatment?: BlockStyle["imageTreatment"];
  radius?: BlockStyle["radius"];
  shadow?: BlockStyle["shadow"];
}

export function image(img: ImageValue, o: ImageOpts = {}): Block {
  return block(
    "image",
    {
      image: img,
      aspect: o.aspect ?? "original",
      caption: o.caption,
      link: o.link,
      lightbox: o.lightbox ?? false,
    },
    {
      variant: o.variant ?? "default",
      ...(o.col !== undefined ? { col: o.col } : {}),
      style: mergeStyle(
        o.treatment ? { imageTreatment: o.treatment } : undefined,
        o.radius ? { radius: o.radius } : undefined,
        o.shadow ? { shadow: o.shadow } : undefined,
        o.style,
      ),
    },
  );
}

/** Rich-text body for card/column/accordion fields. */
export const body = (...paras: (string | Nodes[number])[]): RichTextDoc =>
  rt.doc(...paras.map((x) => (typeof x === "string" ? rt.p(x) : x)));

// --- sections ------------------------------------------------------------------------------------

export interface StackOpts {
  /** Desktop column spans in twelfths (default one column). */
  cols?: number[];
  t?: number[];
  m?: number[];
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

/** A grid item: block, desktop rect, mobile rect. */
export type Placed = [block: Block, d: GridRect, m: GridRect];
export const r = (x: number, y: number, w: number, h: number, extra: Partial<GridRect> = {}) =>
  ({ x, y, w, h, ...extra }) as GridRect;

/** Rows a grid needs to hold its items at each breakpoint (tablet rows only when items set them). */
export function gridRows(items: Record<string, { d: GridRect; t?: GridRect; m?: GridRect }>) {
  const bottom = (r: GridRect) => r.y + r.h - 1;
  let d = 1;
  let t = 1;
  let m = 1;
  let hasT = false;
  let hasM = false;
  for (const it of Object.values(items)) {
    d = Math.max(d, bottom(it.d));
    t = Math.max(t, bottom(it.t ?? it.d));
    if (it.t) hasT = true;
    if (it.m) {
      hasM = true;
      m = Math.max(m, bottom(it.m));
    }
  }
  return { d, ...(hasT ? { t } : {}), ...(hasM ? { m } : {}) };
}

export function grid(
  placed: Placed[],
  width?: "narrow" | "content" | "wide" | "full",
): { layout: SectionLayout; blocks: Block[] } {
  const items: Record<string, { d: GridRect; m: GridRect }> = {};
  let d = 1;
  let m = 1;
  for (const [b, rd, rm] of placed) {
    items[b.id] = { d: rd, m: rm };
    d = Math.max(d, rd.y + rd.h - 1);
    m = Math.max(m, rm.y + rm.h - 1);
  }
  return {
    layout: { mode: "grid", rows: { d, m }, items, ...(width ? { width } : {}) } as SectionLayout,
    blocks: placed.map(([b]) => b),
  };
}

export interface SectionOpts {
  theme?: ColorTheme;
  padding?: SectionStyle["padding"];
  minHeight?: SectionStyle["minHeight"];
  background?: SectionBackground;
  label?: string;
  anchor?: string;
  /** The preset this section is modelled on (keeps "Try a new look" mapping). */
  preset?: string;
}

export function section(
  content: Block[] | { layout: SectionLayout; blocks: Block[] },
  layout: SectionLayout | StackOpts = {},
  o: SectionOpts = {},
): Section {
  const isLayout = (x: SectionLayout | StackOpts): x is SectionLayout => "mode" in x;
  const resolved = Array.isArray(content)
    ? { layout: isLayout(layout) ? layout : stack(layout), blocks: content }
    : content;
  const style: SectionStyle = { colorTheme: o.theme ?? "light" };
  if (o.padding) style.padding = o.padding;
  if (o.minHeight) style.minHeight = o.minHeight;
  if (o.background) style.background = o.background;
  return {
    id: newId("sec"),
    ...(o.preset ? { preset: o.preset } : {}),
    ...(o.label ? { label: o.label } : {}),
    ...(o.anchor ? { anchor: o.anchor } : {}),
    layout: resolved.layout,
    style,
    blocks: resolved.blocks,
  };
}

/**
 * Overlay opacity for text sections over photographs. The Design check requires text to pass
 * WCAG against the scrim over both a black and a white photo, which every look's dark themes
 * reach at 78%.
 */
export const PHOTO_SCRIM = 0.78;

/** A theme-relative scrim over a background photograph. */
export const photoBackground = (
  img: ImageValue,
  opacity = PHOTO_SCRIM,
  focal?: [number, number],
): SectionBackground => ({
  type: "image",
  src: img.src,
  ...(focal ? { focal } : img.focal ? { focal: img.focal } : {}),
  overlay: { color: "background", opacity },
});

// --- presets -------------------------------------------------------------------------------------

/** How to rewrite one block of a preset: replacement fields (shallow), style, variant. */
export interface BlockEdit {
  fields?: Fields;
  style?: BlockStyle | null;
  variant?: string;
}

export interface FromPresetOpts {
  theme?: ColorTheme;
  primary?: Link;
  secondary?: Link;
  collection?: string;
  label?: string;
  anchor?: string;
  /**
   * Per-block edits keyed by block type, with a 1-based occurrence when the preset has several
   * blocks of that type: `heading`, `button`, `image:2`. A key that doesn't match the preset's
   * blocks throws, so presets that change shape fail loudly instead of editing the wrong block.
   */
  edit?: Record<string, BlockEdit | Fields>;
  /** Blocks to remove, keyed the same way (their grid items go too). */
  drop?: string[];
  /** Section style overrides (padding, background, min height). */
  style?: Omit<SectionStyle, "colorTheme">;
  /** Section layout width override. */
  width?: "narrow" | "content" | "wide" | "full";
}

/** Blocks have no `style`/`variant` fields, so those keys always mean the block's own. */
function toEdit(e: BlockEdit | Fields): BlockEdit {
  const { fields, style, variant, ...rest } = e as Fields;
  return {
    fields: { ...(fields ?? {}), ...rest },
    ...(style !== undefined ? { style } : {}),
    ...(variant !== undefined ? { variant } : {}),
  };
}

/**
 * Build a section preset and rewrite it for the template: replace fields per block (copy,
 * images, lists), drop blocks, retheme. The section keeps its `preset` reference.
 */
export function fromPreset(id: string, o: FromPresetOpts = {}): Section {
  const preset = getPreset(id);
  if (!preset || preset.target === "header") throw new Error(`No section preset ${id}`);
  const s = preset.build({
    ...(o.theme ? { colorTheme: o.theme } : {}),
    ...(o.primary ? { primaryLink: o.primary } : {}),
    ...(o.secondary ? { secondaryLink: o.secondary } : {}),
    ...(o.collection ? { collection: o.collection } : {}),
  });
  const find = (key: string) => {
    const m = /^([a-z][a-z-]*)(?::(\d+))?$/.exec(key);
    if (!m) throw new Error(`${id}: edit key "${key}" must be a block type, optionally with :n`);
    const type = m[1] as string;
    const nth = Number(m[2] ?? 1);
    const matches = s.blocks.filter((b) => b.type === type);
    if (!m[2] && matches.length > 1)
      throw new Error(`${id}: "${type}" is ambiguous (${matches.length} blocks); use ${type}:1…`);
    const b = matches[nth - 1];
    if (!b)
      throw new Error(
        `${id}: no ${type} #${nth} to edit (blocks: ${s.blocks.map((x) => x.type).join(", ")})`,
      );
    return b;
  };
  for (const [k, e] of Object.entries(o.edit ?? {})) {
    const b = find(k);
    const edit = toEdit(e);
    if (edit.fields)
      for (const [f, v] of Object.entries(edit.fields)) {
        if (v === undefined) delete b.fields[f];
        else b.fields[f] = v;
      }
    if (edit.variant) b.variant = edit.variant;
    if (edit.style === null) delete b.style;
    else if (edit.style) b.style = { ...b.style, ...edit.style };
    check(b);
  }
  if (o.drop?.length) {
    const dropIds = new Set(o.drop.map((k) => find(k).id));
    s.blocks = s.blocks.filter((b) => !dropIds.has(b.id));
    if (s.layout.mode === "grid") {
      for (const id of dropIds) delete s.layout.items[id as Block["id"]];
      s.layout.rows = gridRows(s.layout.items);
    }
  }
  if (o.label) s.label = o.label;
  if (o.anchor) s.anchor = o.anchor;
  if (o.style) s.style = { ...s.style, ...o.style };
  if (o.width) s.layout = { ...s.layout, width: o.width };
  return s;
}

/** Site header settings from a header preset. */
export function headerFrom(id: string, overrides: Partial<ReturnType<typeof headerOf>> = {}) {
  return { ...headerOf(id), ...overrides };
}
function headerOf(id: string) {
  const preset = getPreset(id);
  if (preset?.target !== "header") throw new Error(`No header preset ${id}`);
  return preset.build();
}

// --- pages and chrome ----------------------------------------------------------------------------

export interface PageOpts {
  hidden?: boolean;
  noindex?: boolean;
  /** Share image (a photo URL); defaults to the site's. */
  image?: string;
  seoTitle?: string;
  header?: import("@openspace/schema").HeaderOverride;
}

/** A page with SEO description (50–160 characters). */
export function makePage(
  id: PageId,
  title: string,
  slug: string,
  description: string,
  sections: Section[],
  o: PageOpts = {},
): import("@openspace/schema").Page {
  const seo: Record<string, unknown> = { description };
  if (o.seoTitle) seo.title = o.seoTitle;
  if (o.image) seo.image = o.image;
  if (o.noindex) seo.noindex = true;
  return {
    id,
    title,
    slug,
    seo,
    ...(o.hidden ? { hidden: true } : {}),
    ...(o.header ? { header: o.header } : {}),
    sections,
  } as import("@openspace/schema").Page;
}

/** Paragraphs of footer links: an eyebrow title, then one link per line. */
export function linkColumn(title: string, links: [label: string, href: string][]): Nodes {
  return [rt.p(title, "eyebrow"), ...links.map(([label, href]) => rt.p([rt.link(label, href)]))];
}

/** The social-links block reading the site's profiles. */
export const siteSocial = (o: BlockOpts = {}) =>
  block("social-links", { source: "site", profiles: [] }, { variant: "icons", ...o });

// --- page paths ----------------------------------------------------------------------------------

/** Site-relative path of a collection's index page. */
export const collectionPath = (name: string) => `/${name}/`;

/**
 * A template's pages by key: stable ids seeded from the slugs, and `href(key, anchor?)` for
 * rich-text links, so internal links always follow the page's actual slug.
 */
export function definePages<K extends string>(template: string, slugs: Record<K, string>) {
  const id = {} as Record<K, PageId>;
  for (const [k, slug] of Object.entries(slugs) as [K, string][]) id[k] = pageId(template, slug);
  const href = (key: K, anchor?: string) => {
    const slug = slugs[key];
    return `${slug ? `/${slug}/` : "/"}${anchor ? `#${anchor}` : ""}`;
  };
  return { id, slug: slugs, href };
}
