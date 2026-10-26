import { z } from "zod";
import { MediaIdSchema } from "./ids";
import { FocalPointSchema, HttpsUrlSchema, IsoDateTimeSchema, MediaPathSchema } from "./primitives";
import { named } from "./registry";

export const MEDIA_KINDS = ["image", "video", "audio", "file"] as const;
export const MAX_PLACEHOLDER_LENGTH = 1024;

/** Metadata for a file in `media/` (dimensions are required for images: no layout shift). */
export const MediaMetaSchema = named(
  "MediaMeta",
  "Metadata for a media file: kind, MIME type, size, dimensions, alt text, focal point, credit.",
  z
    .strictObject({
      id: MediaIdSchema,
      path: MediaPathSchema,
      kind: z.enum(MEDIA_KINDS),
      mime: z
        .string()
        .regex(/^[a-z]+\/[a-z0-9.+-]+$/, { message: "Expected a MIME type like image/jpeg" }),
      bytes: z.int().min(0),
      width: z.int().positive().optional(),
      height: z.int().positive().optional(),
      /** Seconds, for audio/video. */
      duration: z.number().min(0).optional(),
      alt: z.string().max(500).optional(),
      focal: FocalPointSchema.optional(),
      /** Tiny inline blurred placeholder (data URI). */
      placeholder: z
        .string()
        .regex(/^data:image\/(?:webp|png|jpeg|avif);base64,[A-Za-z0-9+/=]+$/)
        .max(MAX_PLACEHOLDER_LENGTH)
        .optional(),
      credit: z
        .strictObject({
          author: z.string().max(200).optional(),
          url: HttpsUrlSchema.optional(),
          source: z.string().max(100).optional(),
        })
        .optional(),
      license: z.string().max(200).optional(),
      originalName: z.string().max(255).optional(),
      createdAt: IsoDateTimeSchema,
    })
    .superRefine((m, ctx) => {
      if (m.kind === "image" && (m.width === undefined || m.height === undefined)) {
        ctx.addIssue({
          code: "custom",
          path: ["width"],
          message: "Images must record width and height",
        });
      }
      const top = m.mime.split("/")[0];
      if ((m.kind === "image" || m.kind === "video" || m.kind === "audio") && top !== m.kind) {
        ctx.addIssue({
          code: "custom",
          path: ["mime"],
          message: `MIME type ${m.mime} does not match kind ${m.kind}`,
        });
      }
    }),
);
export type MediaMeta = z.infer<typeof MediaMetaSchema>;
