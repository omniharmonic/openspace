/**
 * What an importer reads from the site being moved, before any OpenSpace mapping: a plain,
 * source-agnostic model. The Squarespace importer fills it from page HTML, `?format=json` and a
 * WXR export; the WordPress importer from the REST API and/or a WXR export; the generic importer
 * from any site's HTML. The `Sq*` names are historical (Squarespace came first); `Source*`
 * aliases are exported for new code.
 */

/** Where a site came from (detected from its markup, or chosen by the user). */
export type Platform =
  | "squarespace"
  | "wordpress"
  | "wix"
  | "webflow"
  | "framer"
  | "carrd"
  | "shopify"
  | "ghost"
  | "weebly"
  | "godaddy"
  | "jimdo"
  | "hostinger"
  | "jekyll"
  | "hugo"
  | "eleventy"
  | "github"
  | "generic";

/** What a section is for, when the importer could tell (picks the closest section preset). */
export type SectionRole = "hero" | "features" | "gallery" | "testimonials" | "cta" | "contact";

export interface SqImage {
  /** Absolute image URL (Squarespace CDN, without a `?format=` suffix). */
  url: string;
  alt: string;
  width?: number;
  height?: number;
  /** Focal point `[x, y]` in 0..1. */
  focal?: [number, number];
  /** Smaller renditions to fall back to when `url` is too large to import (largest first). */
  alternates?: string[];
}

export type SqBlock =
  | {
      kind: "text";
      html: string;
      /** The block has its own background panel (Squarespace "block background"). */
      panel?: boolean;
    }
  | {
      kind: "image";
      image: SqImage;
      caption?: string;
      href?: string;
      /** Squarespace image-block layouts with text (card, overlap, stack, poster…). */
      card?: SqImageCard;
    }
  | {
      kind: "gallery";
      images: (SqImage & { caption?: string; href?: string })[];
      layout: "grid" | "masonry" | "slideshow" | "carousel" | "strips";
    }
  | {
      kind: "button";
      label: string;
      href: string;
      style: "primary" | "secondary" | "tertiary";
      align?: "center" | "end";
    }
  | { kind: "form"; form: SqForm }
  | {
      kind: "newsletter";
      heading?: string;
      description?: string;
      buttonLabel?: string;
      placeholder?: string;
      success?: string;
    }
  | { kind: "video"; url: string; title?: string; caption?: string }
  | {
      kind: "map";
      lat: number;
      lng: number;
      zoom?: number;
      name?: string;
      address?: string;
    }
  | { kind: "code"; html: string; language?: string }
  | { kind: "embed"; url?: string; html?: string }
  | { kind: "quote"; text: string; source?: string }
  | { kind: "accordion"; items: { title: string; html: string }[] }
  | { kind: "summary"; collectionPath?: string; heading?: string; layout?: string }
  | { kind: "spacer"; ratio?: number }
  | { kind: "line" }
  | { kind: "social" }
  | { kind: "audio"; url: string; title?: string }
  | { kind: "product"; path?: string }
  | {
      kind: "cards";
      items: SqCard[];
      /** Image crop (`original` for icon strips, which must not be cropped). */
      aspect?: "original" | "1:1" | "4:5" | "3:2" | "16:9";
    }
  | {
      kind: "heading";
      text: string;
      level: 1 | 2 | 3 | 4;
      eyebrow?: string;
      subheading?: string;
      align?: "center";
    }
  | { kind: "testimonial"; html: string; name?: string; role?: string; photo?: SqImage }
  | { kind: "table"; head?: string[]; rows: string[][]; caption?: string }
  | { kind: "unknown"; type: string; text: string };

export interface SqImageCard {
  title?: string;
  html?: string;
  button?: { label: string; href: string };
  /** Where the text sits relative to the image. */
  position: "left" | "right" | "below" | "over";
}

export interface SqCard {
  title: string;
  html?: string;
  image?: SqImage;
  href?: string;
  linkLabel?: string;
}

export type SqFormFieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "name"
  | "address"
  | "checkbox"
  | "radio"
  | "select"
  | "date"
  | "time"
  | "website"
  | "number"
  | "file"
  | "hidden"
  | "likert"
  | "other";

export interface SqFormField {
  type: SqFormFieldType;
  label: string;
  required: boolean;
  description?: string;
  placeholder?: string;
  options?: string[];
  /** The Squarespace type when it was unusual (for the report). */
  rawType?: string;
}

export interface SqForm {
  name: string;
  fields: SqFormField[];
  submitLabel?: string;
  successMessage?: string;
  successRedirect?: string;
}

/** A placement on Squarespace's Fluid Engine grid (columns are content columns, 1-based). */
export interface SqPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
  z?: number;
}

export interface SqFluidItem {
  block: SqBlock;
  /** Desktop (24 columns). */
  d?: SqPlacement;
  /** Mobile (8 columns). */
  m?: SqPlacement;
}

/** A classic-editor row: columns (spans out of 12) holding blocks. */
export interface SqRow {
  columns: { span: number; blocks: SqBlock[] }[];
}

export interface SqSection {
  /** Squarespace section theme (`white`, `light-bold`, `dark`, `black`, `bright`…) or "". */
  theme: string;
  background?: { image?: SqImage; overlay?: number; color?: string; video?: string };
  height?: "small" | "medium" | "large" | "custom";
  /** Custom height in vh (1–100). */
  customHeight?: number;
  contentWidth?: "narrow" | "medium" | "wide" | "full";
  align?: "left" | "center" | "right";
  layout:
    | { mode: "classic"; rows: SqRow[] }
    | { mode: "fluid"; items: SqFluidItem[]; rows?: number; mobileRows?: number };
  /** Squarespace's own anchor/id, for in-page links. */
  id?: string;
  /** What the section is for (generic and WordPress importers): picks a section preset. */
  role?: SectionRole;
}

export interface SqSeo {
  title?: string;
  description?: string;
  image?: SqImage;
  noindex?: boolean;
}

export interface SqPage {
  /** Site path (`/about`, `/` for the home page). */
  path: string;
  title: string;
  navTitle?: string;
  seo: SqSeo;
  sections: SqSection[];
  /** In the sitemap or nav but not shown in navigation. */
  hidden?: boolean;
  /** Password-protected or members-only: content not readable. */
  locked?: "password" | "members";
  /** The home page was a collection (blog/shop as home): its path. */
  homeOf?: string;
}

export type SqCollectionKind = "blog" | "events" | "products" | "portfolio";

export interface SqEvent {
  start: string;
  end?: string;
  allDay?: boolean;
  location?: { name?: string; address?: string; lat?: number; lng?: number };
}

export interface SqProduct {
  /** Minor units. */
  price: number;
  currency: string;
  salePrice?: number;
  sku?: string;
  images: SqImage[];
  options: { name: string; values: string[] }[];
  variants: {
    sku?: string;
    options: Record<string, string>;
    price?: number;
    available?: boolean;
  }[];
  available?: boolean;
  digital?: boolean;
  /** Squarespace product type: physical, digital, service, gift card. */
  productType?: string;
}

export interface SqItem {
  /** Full site path (`/blog/opening-day`, `/shop/p/candle`). */
  path: string;
  title: string;
  /** ISO date-time. */
  date?: string;
  author?: string;
  tags: string[];
  categories: string[];
  excerptHtml?: string;
  /** Item body: a Squarespace layout (or plain HTML from a WXR export). */
  bodyHtml?: string;
  /** Item body already parsed into sections (portfolio sub-pages). */
  sections?: SqSection[];
  image?: SqImage;
  seo: SqSeo;
  draft?: boolean;
  event?: SqEvent;
  product?: SqProduct;
  source: "html" | "json" | "wxr" | "rest" | "repo";
}

export interface SqCollection {
  /** Site path of the collection page (`/blog`). */
  path: string;
  title: string;
  kind: SqCollectionKind;
  description?: string;
  seo: SqSeo;
  items: SqItem[];
  /** Squarespace collection type name (`blog-basic-grid`, `events-stacked`…). */
  typeName?: string;
}

export type SqNavItem =
  | { type: "link"; label: string; href: string; newTab?: boolean }
  | { type: "folder"; label: string; items: { label: string; href: string; newTab?: boolean }[] };

export interface SqTheme {
  /** Squarespace site palette (hex). */
  colors: Partial<Record<"white" | "black" | "accent" | "lightAccent" | "darkAccent", string>>;
  /** The default (unthemed) section background, when known. */
  siteBackground?: string;
  fonts: {
    heading?: { family: string; weight?: number };
    body?: { family: string; weight?: number };
  };
  /** Heading sizes in rem (`h1`…`h4`) and paragraph sizes. */
  sizes: Partial<Record<"h1" | "h2" | "h3" | "h4" | "large" | "normal" | "small", number>>;
  buttons: { shape?: "square" | "rounded" | "pill"; style?: "solid" | "outline" | "raised" };
  /** Header layout (`navRight`, `navCenter`, `navLeft`, `brandingCenter`). */
  headerLayout?: string;
  headerFixed?: boolean;
  headerTransparent?: boolean;
  /** Section theme name used by the header. */
  headerTheme?: string;
}

export interface SqNotice {
  kind:
    | "unsupported-block"
    | "custom-code"
    | "commerce"
    | "members"
    | "locked-page"
    | "fetch"
    | "robots"
    | "media"
    | "form"
    | "collection"
    | "link"
    | "theme"
    | "other";
  where: string;
  message: string;
}

export interface SqSite {
  baseUrl: string;
  title: string;
  description?: string;
  logo?: SqImage;
  favicon?: string;
  locale?: string;
  timeZone?: string;
  social: { network: string; url: string }[];
  nav: SqNavItem[];
  headerAction?: { label: string; href: string };
  footer: SqSection[];
  theme: SqTheme;
  pages: SqPage[];
  collections: SqCollection[];
  /** Other addresses of a page (`/home` for the home page). */
  aliases: { from: string; to: string }[];
  /** Site-wide custom code (Code Injection) noticed in the page HTML. */
  customCode: string[];
  /** Squarespace 7.0 or 7.1, when it can be told. */
  version?: "7.0" | "7.1";
  notices: SqNotice[];
  /** The platform the site was built with (default: squarespace). */
  platform?: Platform;
  /** The generator the site announced (`WordPress 6.6`, `Webflow`…), for the report. */
  generator?: string;
  /** Extra old → new addresses the importer knows about (category archives, feeds…). */
  redirects?: { from: string; to: string }[];
  /** How the content was read (for the report): `page HTML and the sitemap`, `the REST API`… */
  sources?: string[];
}

// Source-agnostic names for new code.
export type SourceImage = SqImage;
export type SourceBlock = SqBlock;
export type SourceSection = SqSection;
export type SourcePage = SqPage;
export type SourceItem = SqItem;
export type SourceCollection = SqCollection;
export type SourceNavItem = SqNavItem;
export type SourceTheme = SqTheme;
export type SourceNotice = SqNotice;
export type SourceSite = SqSite;
