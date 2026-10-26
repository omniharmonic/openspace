/**
 * `POST /api/sites/:id/media` — Studio's media upload (multipart `file` + `meta` JSON
 * `{ path, mime, bytes, sha256 }`). Studio has already resized and re-encoded the file in the
 * browser; the Hub verifies it (hash, type sniffing, size, path), strips any metadata left in
 * images, and stores it in the site through the DraftRoom (one commit on the draft, serialized
 * with flushes). Studio then adds the library entry (`media.add`) as an ordinary op.
 *
 * → 201 `{ media: { path, bytes, existed, mime, sha256, width?, height? } }`
 */
import { imageSize, sniffImage, stripMetadata } from "@openspace/mcp-tools";
import { Hono } from "hono";
import { z } from "zod";
import { requireUser } from "../auth/session";
import { getUserRow, toUser } from "../db/users";
import { parseRepo } from "../github/types";
import { toHex } from "../lib/crypto";
import { HttpError } from "../lib/errors";
import { sanitizeSvg } from "../lib/svg";
import { roomStub, unwrapRoom } from "../room";
import { readDraftMedia } from "../services/draft-media";
import { requireRole, siteForUser } from "../services/sites";
import type { AppEnv } from "../types";

export const mediaRoutes = new Hono<AppEnv>();

/**
 * Studio's limit for every file it sends (`MAX_PASSTHROUGH_BYTES`: documents, audio, GIFs and
 * videos as-is; photos are re-encoded well below it). GitHub refuses files over 100 MB.
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

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
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  flac: "audio/flac",
  heic: "image/heic",
  // Uploaded fonts (PRD §5.1), media/fonts/ only, owners and designers.
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

/** WOFF2 / TrueType / OpenType by their signatures. */
export function sniffFont(b: Uint8Array): string | null {
  const tag = String.fromCharCode(...b.subarray(0, 4));
  if (tag === "wOF2") return "font/woff2";
  if (tag === "OTTO") return "font/otf";
  if (tag === "true" || (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0)) return "font/ttf";
  return null;
}

/**
 * Why an uploaded SVG is refused, or null when it is acceptable. Acceptable files are stored as
 * `sanitizeSvg`'s re-serialization, never as uploaded.
 */
export function svgProblem(text: string): string | null {
  const r = sanitizeSvg(text);
  return r.ok ? null : r.problem;
}

/** PDF and audio by their magic bytes. */
function sniffDocument(b: Uint8Array): string | null {
  const ascii = (from: number, len: number) => String.fromCharCode(...b.subarray(from, from + len));
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0))
    return "audio/mpeg";
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return "audio/wav";
  if (ascii(0, 4) === "fLaC") return "audio/flac";
  if (ascii(4, 4) === "ftyp" && ascii(8, 3) === "M4A") return "audio/mp4";
  if (ascii(4, 4) === "ftyp" && /^(heic|heix|hevc|mif1|msf1)$/.test(ascii(8, 4)))
    return "image/heic";
  return null;
}

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
  requireRole(site, "editor");
  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024)
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
  if (file.size > MAX_UPLOAD_BYTES)
    throw new HttpError(413, "too_large", "Files must be under 25 MB.");
  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  const sha = toHex(await crypto.subtle.digest("SHA-256", bytes));
  if (sha !== meta.sha256 || bytes.length !== meta.bytes)
    throw new HttpError(400, "upload_corrupted", "The file arrived damaged. Try again.");
  // Content-hash names (Studio's naming): the file name carries the first 8 hex of its SHA-256.
  if (!meta.path.includes(sha.slice(0, 8)))
    throw new HttpError(400, "bad_request", "The file name doesn't match its contents.");

  const ext = meta.path.split(".").pop()?.toLowerCase() ?? "";
  const extMime = EXT_MIME[ext];
  if (!extMime)
    throw new HttpError(415, "unsupported_media_type", "That kind of file isn't supported.");
  let mime: string;
  let size: { width: number; height: number } | null = null;
  const fmt = sniffImage(bytes);
  if (extMime.startsWith("font/")) {
    // Fonts are design: owners and designers upload them, into media/fonts/.
    requireRole(site, "designer");
    if (!meta.path.startsWith("media/fonts/"))
      throw new HttpError(400, "bad_request", "Fonts are stored in media/fonts/.");
    const font = sniffFont(bytes);
    if (!font) throw new HttpError(415, "unsupported_media_type", "That file isn't a font.");
    mime = font;
  } else if (fmt) {
    mime = IMAGE_MIME[fmt] as string;
    bytes = stripMetadata(bytes);
    size = imageSize(bytes);
  } else if (extMime === "image/svg+xml") {
    // Studio sanitizes with DOMPurify; the Hub re-parses and stores only its own strict
    // allowlist re-serialization (elements, attributes, values), never the uploaded text.
    const clean = sanitizeSvg(new TextDecoder().decode(bytes));
    if (!clean.ok)
      throw new HttpError(
        415,
        "unsupported_media_type",
        `That SVG can't be used: ${clean.problem}.`,
      );
    bytes = new TextEncoder().encode(clean.svg);
    mime = extMime;
  } else if (sniffDocument(bytes)) {
    mime = sniffDocument(bytes) as string;
    // Studio converts HEIC photos to JPEG/WebP; a raw HEIC would keep its location metadata.
    if (mime === "image/heic")
      throw new HttpError(
        415,
        "unsupported_media_type",
        "HEIC photos must be converted first. Upload it from Studio, or as a JPEG.",
      );
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
  if (mime !== extMime)
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

const SERVE_TYPES: Record<string, string> = EXT_MIME;

/**
 * `GET /api/sites/:id/media/*` — a draft media file for people working on the site (private
 * sites, unpublished uploads). Session auth; served as an attachment-safe, sandboxed download.
 */
mediaRoutes.get("/:id/media/*", async (c) => {
  const user = requireUser(c);
  const site = await siteForUser(c.var.services, c.req.param("id"), user);
  const prefix = `/api/sites/${site.id}/media/`;
  let rest: string;
  try {
    rest = decodeURIComponent(c.req.path.slice(prefix.length));
  } catch {
    throw new HttpError(404, "not_found", "Not found.");
  }
  const path = `media/${rest}`;
  if (!/^media\/[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/.test(path) || path.includes(".."))
    throw new HttpError(404, "not_found", "Not found.");
  const owner = await getUserRow(c.var.services.db, site.owner_id);
  const gh = c.var.services.github({ site, user: owner ? toUser(owner) : null });
  const repo = parseRepo(site.repo);
  const bytes = await readDraftMedia(gh, repo, site.id, path);
  if (!bytes) throw new HttpError(404, "not_found", "Not found.");
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return new Response(bytes, {
    headers: {
      "Content-Type": SERVE_TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
