import { PRESET_IMAGE_CREDITS } from "@openspace/blocks";
import {
  type CollectionConfig,
  type CollectionItem,
  CURRENT_SCHEMA_VERSION,
  type Page,
  type PageId,
  type Site,
  type SiteConfig,
  type SiteDocument,
  type StyleChoices,
  type Styles,
} from "@openspace/schema";
import { stabilizeIds, stableId } from "./ids";

/** One of a template's three looks: a Site Styles combination shown in the gallery. */
export interface LookSpec {
  id: string;
  name: string;
  description: string;
  choices: StyleChoices;
  overrides?: Styles["overrides"];
}

/** Credit for a non-photo media file a template uses (audio). */
export interface MediaCredit {
  kind: "audio" | "video" | "image";
  src: string;
  title: string;
  author: string;
  authorUrl?: string;
  source: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
}

export interface TemplateContent {
  site: Site;
  pages: Page[];
  collections?: Record<string, CollectionItem[]>;
  collectionConfigs?: Record<string, CollectionConfig>;
  features?: Partial<SiteConfig["features"]>;
}

export interface TemplateSpec {
  id: string;
  name: string;
  description: string;
  /** Who it's for (doc 04 §7 "For"). */
  persona: string;
  mood: string;
  tags: string[];
  /** The fictional owner the demo content is written for. */
  sample: { name: string; tagline: string };
  /** Exactly three looks; the first is the template's own `styles.json`. */
  looks: [LookSpec, LookSpec, LookSpec];
  /** Page shown as the gallery thumbnail. */
  thumbnail: PageId;
  /** Non-photo media credits (photos are credited automatically from the preset library). */
  media?: MediaCredit[];
  build(): TemplateContent;
}

export interface TemplateLook {
  id: string;
  name: string;
  description: string;
  /** The complete `content/styles.json` for this look. */
  styles: Styles;
}

/** Gallery metadata (`template.json`). Matches the Hub's `TemplateMeta` shape. */
export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  persona: string;
  mood: string;
  version: string;
  tags: string[];
  looks: TemplateLook[];
  thumbnailPage: PageId;
  thumbnailUrl: string | null;
  sample: { name: string; tagline: string };
  pages: { id: PageId; title: string; slug: string }[];
}

/** One entry of `media/LICENSES.json`. */
export interface LicenseEntry {
  kind: "image" | "audio" | "video";
  /** The file's URL without query parameters (every size requested derives from it). */
  src: string;
  title: string;
  author: string;
  authorUrl?: string;
  source: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
}

export interface Licenses {
  $comment: string;
  design: { license: string; licenseUrl: string };
  media: LicenseEntry[];
}

export const TEMPLATE_VERSION = "1.0.0";
export const DEMO_HUB = "https://hub.openspace.dev";

const UNSPLASH_RE = /^https:\/\/images\.unsplash\.com\/photo-([0-9]+-[0-9a-f]+)$/;

/** Keys whose string value is a media file (image/video/audio source), on any host. */
const MEDIA_KEYS = new Set(["src", "image", "poster", "captions", "favicon"]);

/**
 * Every remote media file (https URL without its query) a document uses, on any host: block
 * images and media, section backgrounds, SEO images, collection frontmatter images and audio.
 * Links (`url`, `href`) are not media.
 */
export function remoteMedia(doc: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, key?: string) => {
    if (typeof v === "string") {
      if (key && MEDIA_KEYS.has(key) && v.startsWith("https://"))
        out.add(v.split("?")[0] as string);
    } else if (Array.isArray(v)) for (const x of v) walk(x);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(doc);
  return [...out].sort();
}

function licensesFor(doc: SiteDocument, spec: TemplateSpec): Licenses {
  const media: LicenseEntry[] = [];
  const other = new Map((spec.media ?? []).map((m) => [m.src, m]));
  for (const src of remoteMedia(doc)) {
    const unsplash = UNSPLASH_RE.exec(src);
    const c = unsplash ? PRESET_IMAGE_CREDITS.find((x) => x.id === unsplash[1]) : undefined;
    if (c) {
      media.push({
        kind: "image",
        src: c.url,
        title: c.alt,
        author: c.author,
        authorUrl: c.authorUrl,
        source: c.source,
        sourceUrl: c.pageUrl,
        license: c.license,
        licenseUrl: c.licenseUrl,
      });
      continue;
    }
    const m = other.get(src);
    if (!m) throw new Error(`${spec.id}: no license recorded for ${src}`);
    media.push({ ...m });
    other.delete(src);
  }
  if (other.size)
    throw new Error(`${spec.id}: credited media ${[...other.keys()].join(", ")} is unused`);
  return {
    $comment: `Licenses for the demo media in the ${spec.name} template. Replace the demo photos with your own; this file can be deleted once none of them are used.`,
    design: {
      license: "CC-BY-4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    },
    media,
  };
}

export interface BuiltTemplate {
  meta: TemplateMeta;
  doc: SiteDocument;
  licenses: Licenses;
}

/** Assemble a template's document, metadata and media licenses from its spec. */
export function buildTemplate(spec: TemplateSpec): BuiltTemplate {
  const content = spec.build();
  const [look] = spec.looks;
  const styles: Styles = {
    $schema: "https://schema.openspace.dev/v1/styles.json",
    choices: look.choices,
    ...(look.overrides ? { overrides: look.overrides } : {}),
  };
  const config: SiteConfig = {
    $schema: "https://schema.openspace.dev/v1/site-config.json",
    siteId: stableId("st", spec.id) as SiteConfig["siteId"],
    schemaVersion: CURRENT_SCHEMA_VERSION,
    template: { id: spec.id, version: TEMPLATE_VERSION },
    hub: DEMO_HUB,
    deploy: {
      target: "github-pages",
      url: `https://example.github.io/${spec.id}`,
      customDomain: null,
    },
    features: {
      forms: true,
      newsletter: false,
      analytics: true,
      search: false,
      ...content.features,
    },
  };
  const pages: SiteDocument["pages"] = {};
  for (const p of content.pages) {
    if (pages[p.id]) throw new Error(`${spec.id}: duplicate page id ${p.id}`);
    pages[p.id] = { $schema: "https://schema.openspace.dev/v1/page.json", ...p };
  }
  const collections: SiteDocument["collections"] = {};
  for (const [name, items] of Object.entries(content.collections ?? {})) {
    collections[name] = {};
    for (const it of items) collections[name][it.slug] = it;
  }
  const raw: SiteDocument = {
    config,
    site: { $schema: "https://schema.openspace.dev/v1/site.json", ...content.site },
    styles,
    pages,
    collections,
    ...(content.collectionConfigs ? { collectionConfigs: content.collectionConfigs } : {}),
    media: {},
  };
  const doc = stabilizeIds(raw, spec.id);
  const meta: TemplateMeta = {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    persona: spec.persona,
    mood: spec.mood,
    version: TEMPLATE_VERSION,
    tags: spec.tags,
    looks: spec.looks.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      styles: {
        $schema: "https://schema.openspace.dev/v1/styles.json",
        choices: l.choices,
        ...(l.overrides ? { overrides: l.overrides } : {}),
      },
    })),
    thumbnailPage: spec.thumbnail,
    thumbnailUrl: null,
    sample: spec.sample,
    pages: Object.values(doc.pages).map((p) => ({ id: p.id, title: p.title, slug: p.slug })),
  };
  return { meta, doc, licenses: licensesFor(doc, spec) };
}

// --- collection items ----------------------------------------------------------------------------

export function post(
  slug: string,
  fm: Omit<Extract<CollectionItem, { kind: "blog" }>["frontmatter"], "status"> & {
    status?: "published" | "draft" | "scheduled";
  },
  body: string,
): CollectionItem {
  return { kind: "blog", slug, frontmatter: { status: "published", ...fm }, body };
}

export function event(
  slug: string,
  fm: Omit<Extract<CollectionItem, { kind: "events" }>["frontmatter"], "status">,
  body: string,
): CollectionItem {
  return { kind: "events", slug, frontmatter: { status: "published", ...fm }, body };
}

export function product(
  slug: string,
  fm: Omit<Extract<CollectionItem, { kind: "products" }>["frontmatter"], "status">,
  body: string,
): CollectionItem {
  return { kind: "products", slug, frontmatter: { status: "published", ...fm }, body };
}

export function project(
  slug: string,
  fm: Omit<Extract<CollectionItem, { kind: "portfolio" }>["frontmatter"], "status">,
  body: string,
): CollectionItem {
  return { kind: "portfolio", slug, frontmatter: { status: "published", ...fm }, body };
}

export function episode(
  slug: string,
  fm: Omit<Extract<CollectionItem, { kind: "podcast" }>["frontmatter"], "status">,
  body: string,
): CollectionItem {
  return { kind: "podcast", slug, frontmatter: { status: "published", ...fm }, body };
}
