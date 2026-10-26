import { z } from "zod";
import { PageSeoSchema } from "./page";
import {
  HttpsUrlSchema,
  ImageValueSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  MediaSrcSchema,
  SlugSchema,
} from "./primitives";
import { named } from "./registry";

/**
 * Collections (arch §3.6): long-form items stored as Markdoc files with typed frontmatter.
 * `CollectionItem` pairs the parsed frontmatter with the Markdoc body source.
 */

export const COLLECTION_KINDS = ["blog", "events", "portfolio", "podcast", "products"] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];

export const ItemStatusSchema = z.enum(["draft", "scheduled", "published"]);

const BaseFrontmatter = {
  title: z.string().min(1).max(200),
  status: ItemStatusSchema,
  /** Required when status is "scheduled". */
  publishAt: IsoDateTimeSchema.nullable().optional(),
  excerpt: z.string().max(500).optional(),
  image: MediaSrcSchema.optional(),
  imageAlt: z.string().max(500).optional(),
  categories: z.array(SlugSchema).max(20).optional(),
  tags: z.array(z.string().min(1).max(40)).max(40).optional(),
  featured: z.boolean().optional(),
  seo: PageSeoSchema.optional(),
};

function checkScheduled(
  fm: { status: string; publishAt?: string | null | undefined },
  ctx: z.RefinementCtx,
) {
  if (fm.status === "scheduled" && !fm.publishAt) {
    ctx.addIssue({
      code: "custom",
      path: ["publishAt"],
      message: "Scheduled items need publishAt",
    });
  }
}

export const BlogFrontmatterSchema = named(
  "BlogFrontmatter",
  "Frontmatter for a blog post.",
  z
    .strictObject({
      ...BaseFrontmatter,
      date: IsoDateSchema,
      /** Author slug (a team/author profile) or display name. */
      author: z.string().min(1).max(80).optional(),
    })
    .superRefine(checkScheduled),
);
export type BlogFrontmatter = z.infer<typeof BlogFrontmatterSchema>;

export const EventLocationSchema = z.strictObject({
  name: z.string().max(200).optional(),
  address: z.string().max(300).optional(),
  mapUrl: HttpsUrlSchema.optional(),
  online: z.boolean().optional(),
  url: HttpsUrlSchema.optional(),
});

export const EventFrontmatterSchema = named(
  "EventFrontmatter",
  "Frontmatter for an event.",
  z
    .strictObject({
      ...BaseFrontmatter,
      start: z.union([IsoDateTimeSchema, IsoDateSchema]),
      end: z.union([IsoDateTimeSchema, IsoDateSchema]).optional(),
      allDay: z.boolean().optional(),
      /** IANA time zone such as America/Denver. */
      timezone: z
        .string()
        .regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,2}$/)
        .optional(),
      location: EventLocationSchema.optional(),
      registrationUrl: HttpsUrlSchema.optional(),
      price: z.string().max(60).optional(),
    })
    .superRefine((fm, ctx) => {
      checkScheduled(fm, ctx);
      if (fm.end && Date.parse(fm.end) < Date.parse(fm.start)) {
        ctx.addIssue({ code: "custom", path: ["end"], message: "Event ends before it starts" });
      }
    }),
);
export type EventFrontmatter = z.infer<typeof EventFrontmatterSchema>;

export const PortfolioFrontmatterSchema = named(
  "PortfolioFrontmatter",
  "Frontmatter for a portfolio project.",
  z
    .strictObject({
      ...BaseFrontmatter,
      date: IsoDateSchema.optional(),
      client: z.string().max(120).optional(),
      role: z.string().max(120).optional(),
      year: z.int().min(1900).max(2200).optional(),
      gallery: z.array(ImageValueSchema).max(200).optional(),
      projectUrl: HttpsUrlSchema.optional(),
    })
    .superRefine(checkScheduled),
);
export type PortfolioFrontmatter = z.infer<typeof PortfolioFrontmatterSchema>;

export const PodcastFrontmatterSchema = named(
  "PodcastFrontmatter",
  "Frontmatter for a podcast episode (feeds include Apple/Spotify tags).",
  z
    .strictObject({
      ...BaseFrontmatter,
      date: IsoDateSchema,
      audio: z.strictObject({
        src: MediaSrcSchema,
        /** Seconds. */
        duration: z.int().min(1),
        bytes: z.int().min(1).optional(),
        mime: z.enum(["audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav"]),
      }),
      episode: z.int().min(0).optional(),
      season: z.int().min(1).optional(),
      episodeType: z.enum(["full", "trailer", "bonus"]).optional(),
      explicit: z.boolean().optional(),
      transcript: MediaSrcSchema.optional(),
    })
    .superRefine(checkScheduled),
);
export type PodcastFrontmatter = z.infer<typeof PodcastFrontmatterSchema>;

/** Money in minor units (cents) with an ISO 4217 currency. */
export const MoneySchema = z.strictObject({
  amount: z.int().min(0),
  currency: z.string().regex(/^[A-Z]{3}$/, { message: "Expected an ISO 4217 currency like USD" }),
});
export type Money = z.infer<typeof MoneySchema>;

export const ProductFrontmatterSchema = named(
  "ProductFrontmatter",
  "Frontmatter for a product (public catalog only; checkout prices are always re-read server-side).",
  z
    .strictObject({
      ...BaseFrontmatter,
      price: MoneySchema,
      compareAtPrice: MoneySchema.optional(),
      sku: z.string().max(64).optional(),
      images: z.array(ImageValueSchema).max(50).optional(),
      options: z
        .array(
          z.strictObject({
            name: z.string().min(1).max(40),
            values: z.array(z.string().min(1).max(60)).min(1),
          }),
        )
        .max(3)
        .optional(),
      variants: z
        .array(
          z.strictObject({
            sku: z.string().max(64).optional(),
            options: z.record(z.string(), z.string()),
            price: MoneySchema.optional(),
            available: z.boolean().optional(),
          }),
        )
        .max(100)
        .optional(),
      digital: z.boolean().optional(),
      available: z.boolean().optional(),
    })
    .superRefine((fm, ctx) => {
      checkScheduled(fm, ctx);
      const currencies = new Set([
        fm.price.currency,
        fm.compareAtPrice?.currency,
        ...(fm.variants ?? []).map((v) => v.price?.currency),
      ]);
      currencies.delete(undefined);
      if (currencies.size > 1)
        ctx.addIssue({
          code: "custom",
          path: ["price"],
          message: "All prices must use one currency",
        });
    }),
);
export type ProductFrontmatter = z.infer<typeof ProductFrontmatterSchema>;

const item = <K extends CollectionKind, F extends z.ZodType>(kind: K, frontmatter: F) =>
  z.strictObject({
    kind: z.literal(kind),
    /** File name without extension, e.g. `2026-10-26-opening-day`. */
    slug: SlugSchema,
    frontmatter,
    /** Markdoc source of the body. */
    body: z.string(),
  });

export const CollectionItemSchema = named(
  "CollectionItem",
  "A collection item (blog post, event, project, episode or product): frontmatter plus Markdoc body.",
  z.discriminatedUnion("kind", [
    item("blog", BlogFrontmatterSchema),
    item("events", EventFrontmatterSchema),
    item("portfolio", PortfolioFrontmatterSchema),
    item("podcast", PodcastFrontmatterSchema),
    item("products", ProductFrontmatterSchema),
  ]),
);
export type CollectionItem = z.infer<typeof CollectionItemSchema>;

/** Frontmatter schema for each collection kind. */
export const FRONTMATTER_SCHEMAS = {
  blog: BlogFrontmatterSchema,
  events: EventFrontmatterSchema,
  portfolio: PortfolioFrontmatterSchema,
  podcast: PodcastFrontmatterSchema,
  products: ProductFrontmatterSchema,
} as const satisfies Record<CollectionKind, z.ZodType>;

/** Kinds a `_collection.json` may declare: the typed kinds plus `custom` (untyped frontmatter). */
export const COLLECTION_CONFIG_KINDS = [...COLLECTION_KINDS, "custom"] as const;
export type CollectionConfigKind = (typeof COLLECTION_CONFIG_KINDS)[number];

/**
 * Slug pattern for new items, built from literal slug characters and placeholders, e.g.
 * `{date}-{title}` → `2026-10-26-opening-day`. Must contain `{title}` or `{slug}`.
 */
export const SlugPatternSchema = z
  .string()
  .regex(/^(?:\{(?:date|year|month|day|title|slug)\}|[a-z0-9-])+$/, {
    message: "Expected a pattern like {date}-{title}",
  })
  .refine((p) => p.includes("{title}") || p.includes("{slug}"), {
    message: "Slug pattern must include {title} or {slug}",
  });

/** `_collection.json`: kind, labels, list + item page layout, taxonomies, feed and slug pattern. */
export const CollectionConfigSchema = named(
  "CollectionConfig",
  "_collection.json: collection kind, labels, list layout, item page layout, taxonomies, feed and slug pattern.",
  z.strictObject({
    $schema: z.string().optional(),
    kind: z.enum(COLLECTION_CONFIG_KINDS),
    label: z.string().min(1).max(60),
    itemLabel: z.string().min(1).max(60).optional(),
    slugPattern: SlugPatternSchema.optional(),
    list: z.strictObject({
      layout: z.enum(["grid", "list", "cards", "masonry", "calendar", "compact"]),
      pageSize: z.int().min(1).max(100),
      sort: z.enum(["date-desc", "date-asc", "title", "manual"]),
    }),
    /** The item page: a page template whose content slot holds the item body. */
    itemPage: z
      .strictObject({
        layout: z.enum(["article", "wide", "split", "gallery", "minimal"]),
        showDate: z.boolean().optional(),
        showAuthor: z.boolean().optional(),
        showRelated: z.boolean().optional(),
      })
      .optional(),
    taxonomies: z
      .strictObject({
        categories: z
          .array(z.strictObject({ slug: SlugSchema, label: z.string().min(1).max(60) }))
          .max(100)
          .optional(),
        tags: z.boolean().optional(),
      })
      .optional(),
    feed: z
      .strictObject({
        enabled: z.boolean(),
        format: z.enum(["rss", "atom", "ical", "podcast"]).optional(),
        title: z.string().max(120).optional(),
        description: z.string().max(500).optional(),
      })
      .optional(),
  }),
);
export type CollectionConfig = z.infer<typeof CollectionConfigSchema>;
