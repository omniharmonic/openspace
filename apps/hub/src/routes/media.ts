/**
 * `POST /api/sites/:id/media` — Studio's media upload (multipart `file` + `meta` JSON
 * `{ path, mime, bytes, sha256 }`). Studio has already resized and re-encoded the file in the
 * browser; the Hub verifies it (hash, type sniffing, size, path), strips any metadata left in
 * images, and stores it in the site through the DraftRoom (one commit on the draft, serialized
 * with flushes). Studio then adds the library entry (`media.add`) as an ordinary op.
 *
 * → 201 `{ media: { path, bytes, existed, mime, sha256, width?, height? } }`
 */
import { imageSize, MAX_IMAGE_BYTES, sniffImage, stripMetadata } from "@openspace/mcp-tools";
import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { toHex } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import { roomStub, unwrapRoom } from "../room";
import { siteForUser } from "../services/sites";
import type { AppEnv } from "../types";

export const mediaRoutes = new Hono<AppEnv>();

/** Videos are only for Cloudflare-hosted sites; keep them modest (repo storage). */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const MetaSchema = z.object({
  path: z
    .string()
    .regex(/^media\/[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/, "Invalid media path")
    .refine((p) => !p.includes("..") && !p.includes("//"), "Invalid media path"),
  mime: z.string().max(100),
  bytes: z.int().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

const IMAGE_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};
const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
};

/** Active content in an SVG (Studio sanitizes; this refuses anything it missed). */
const SVG_ACTIVE =
  /<script|<foreignObject|\son[a-z]+\s*=|javascript:|<iframe|<embed|<object|xlink:href\s*=\s*["']\s*(?!#)/i;

function sniffVideo(b: Uint8Array): string | null {
  if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70)
    return "video/mp4";
  if (b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3)
    return "video/webm";
  return null;
}

mediaRoutes.post("/:id/media", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > MAX_VIDEO_BYTES + 1024 * 1024)
    throw new HttpError(413, "too_large", "That file is too large to upload.");
  let form: Record<string, string | File>;
  try {
    form = (await c.req.parseBody()) as Record<string, string | File>;
  } catch {
    throw new HttpError(400, "bad_request", "Send the file as multipart form data.");
  }
  const file = form.file;
  if (!(file instanceof File)) throw new HttpError(400, "bad_request", "No file was sent.");
  let meta: z.infer<typeof MetaSchema>;
  try {
    meta = MetaSchema.parse(JSON.parse(typeof form.meta === "string" ? form.meta : "null"));
  } catch {
    throw new HttpError(400, "bad_request", "The file details are missing or invalid.");
  }
  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  const sha = toHex(await crypto.subtle.digest("SHA-256", bytes));
  if (sha !== meta.sha256 || bytes.length !== meta.bytes)
    throw new HttpError(400, "upload_corrupted", "The file arrived damaged. Try again.");

  const ext = meta.path.split(".").pop()?.toLowerCase() ?? "";
  const extMime = EXT_MIME[ext];
  if (!extMime)
    throw new HttpError(415, "unsupported_media_type", "That kind of file isn't supported.");
  let mime: string;
  let size: { width: number; height: number } | null = null;
  const fmt = sniffImage(bytes);
  if (fmt) {
    if (bytes.length > MAX_IMAGE_BYTES)
      throw new HttpError(413, "too_large", "Images can be at most 15 MB.");
    mime = IMAGE_MIME[fmt] as string;
    bytes = stripMetadata(bytes);
    size = imageSize(bytes);
  } else if (extMime === "image/svg+xml") {
    const text = new TextDecoder().decode(bytes);
    if (!/<svg[\s>]/i.test(text) || SVG_ACTIVE.test(text))
      throw new HttpError(415, "unsupported_media_type", "That SVG contains active content.");
    if (bytes.length > 1024 * 1024)
      throw new HttpError(413, "too_large", "SVGs can be at most 1 MB.");
    mime = extMime;
  } else {
    const video = sniffVideo(bytes);
    if (!video)
      throw new HttpError(415, "unsupported_media_type", "That file isn't an image or video.");
    if (site.deploy_target !== "cloudflare")
      throw new HttpError(
        415,
        "unsupported_media_type",
        "Videos need Cloudflare hosting. Use a video link (YouTube, Vimeo) instead.",
      );
    mime = video;
  }
  if (mime !== extMime && !(mime === "image/jpeg" && extMime === "image/jpeg"))
    throw new HttpError(415, "unsupported_media_type", "The file name doesn't match its type.");

  const stored = await unwrapRoom(
    roomStub(c.env, site.id).storeMedia(site.id, { userId: user.id, path: meta.path, bytes }),
  );
  return c.json(
    {
      media: {
        path: meta.path,
        bytes: bytes.length,
        existed: stored.existed,
        mime,
        sha256: toHex(await crypto.subtle.digest("SHA-256", bytes)),
        ...(size ? { width: size.width, height: size.height } : {}),
      },
    },
    stored.existed ? 200 : 201,
  );
});
