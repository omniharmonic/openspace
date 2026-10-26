import { z } from "zod";
import { MediaIdSchema, PageIdSchema, SectionIdSchema } from "./ids";
import { named } from "./registry";

/** A path inside the site repo's `media/` folder, e.g. `media/2026/10/hero-k3f9.jpg`. */
export const MEDIA_PATH_RE =
  /^media\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.[A-Za-z0-9]+$/;

export const MediaPathSchema = named(
  "MediaPath",
  "A file inside the site's media/ folder, e.g. media/2026/10/hero-k3f9.jpg.",
  z.string().regex(MEDIA_PATH_RE, { message: "Expected a path like media/2026/10/photo.jpg" }),
);
export type MediaPath = z.infer<typeof MediaPathSchema>;

/** An absolute https URL. */
export const HttpsUrlSchema = z.url({ protocol: /^https$/, hostname: z.regexes.domain });
/** An absolute http(s) URL. */
export const HttpUrlSchema = z.url({ protocol: /^https?$/, hostname: z.regexes.domain });

/**
 * Where an image/video/audio file lives: a repo media path (`media/...`) or an absolute
 * https URL (templates ship remote demo photography, e.g. Unsplash).
 */
export const MediaSrcSchema = named(
  "MediaSrc",
  "A repo media path (media/...) or an absolute https URL.",
  z.union([MediaPathSchema, HttpsUrlSchema]),
);
export type MediaSrc = z.infer<typeof MediaSrcSchema>;

export function isMediaPath(src: string): boolean {
  return MEDIA_PATH_RE.test(src);
}

/** Focal point as fractions of width/height, `[x, y]` in 0..1. */
export const FocalPointSchema = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
export type FocalPoint = z.infer<typeof FocalPointSchema>;

/** Aspect ratio like `4:5`, `16:9`, or `original`. */
export const AspectRatioSchema = z.string().regex(/^(?:original|[1-9]\d{0,2}:[1-9]\d{0,2})$/, {
  message: "Expected a ratio like 4:5 or original",
});
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

/** An image reference with its alt text. `alt: ""` marks a decorative image. */
export const ImageValueSchema = named(
  "Image",
  "An image with alt text, optional focal point and intrinsic size.",
  z.strictObject({
    src: MediaSrcSchema,
    alt: z.string().max(500),
    focal: FocalPointSchema.optional(),
    width: z.int().positive().optional(),
    height: z.int().positive().optional(),
    mediaId: MediaIdSchema.optional(),
  }),
);
export type ImageValue = z.infer<typeof ImageValueSchema>;

/** Video or audio. */
export const MediaValueSchema = named(
  "Media",
  "A video or audio file (repo media path or https URL).",
  z.strictObject({
    kind: z.enum(["video", "audio"]),
    src: MediaSrcSchema,
    title: z.string().max(200).optional(),
    poster: MediaSrcSchema.optional(),
    captions: MediaSrcSchema.optional(),
    autoplay: z.boolean().optional(),
    loop: z.boolean().optional(),
    mediaId: MediaIdSchema.optional(),
  }),
);
export type MediaValue = z.infer<typeof MediaValueSchema>;

const SLUG_SEGMENT = "[a-z0-9]+(?:-[a-z0-9]+)*";
/** A single URL-safe slug segment. */
export const SlugSchema = z
  .string()
  .regex(new RegExp(`^${SLUG_SEGMENT}$`), { message: "Expected a lowercase-hyphenated slug" });
/** A page path: "" for home, otherwise slash-separated slug segments. */
export const PagePathSchema = z
  .string()
  .regex(new RegExp(`^(?:|${SLUG_SEGMENT}(?:/${SLUG_SEGMENT})*)$`), {
    message: 'Expected "" (home) or lowercase slug segments separated by "/"',
  });

/** A collection name (folder under content/collections). */
export const CollectionNameSchema = SlugSchema;

/** Fragment id for in-page anchors. */
const AnchorSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/);

/** Link targets (arch §4.1): page, collection item, URL, email, phone, file, anchor. */
export const LinkSchema = named(
  "Link",
  "A link target: a page, collection item, URL, email, phone number, file or section anchor.",
  z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("page"),
      page: PageIdSchema,
      anchor: AnchorSchema.optional(),
    }),
    z.strictObject({
      type: z.literal("item"),
      collection: CollectionNameSchema,
      slug: SlugSchema,
    }),
    z.strictObject({
      type: z.literal("url"),
      url: z.union([HttpUrlSchema, z.string().regex(/^\/(?!\/)[^\s]*$/)]),
      newTab: z.boolean().optional(),
    }),
    z.strictObject({
      type: z.literal("email"),
      email: z.email(),
      subject: z.string().max(200).optional(),
    }),
    z.strictObject({
      type: z.literal("phone"),
      phone: z.string().regex(/^\+?[0-9 ()\-.]{3,30}$/),
    }),
    z.strictObject({
      type: z.literal("file"),
      src: MediaSrcSchema,
      newTab: z.boolean().optional(),
    }),
    z.strictObject({
      type: z.literal("anchor"),
      section: SectionIdSchema,
    }),
  ]),
);
export type Link = z.infer<typeof LinkSchema>;

/** ISO date `YYYY-MM-DD`. */
export const IsoDateSchema = z.iso.date();
/** ISO date-time with offset. */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

/** Semver `1.2.0`. */
export const SemverSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, {
    message: "Expected a semantic version such as 1.2.0",
  });
