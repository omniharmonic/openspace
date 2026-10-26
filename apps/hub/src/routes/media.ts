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
};

/** SVG elements Studio's sanitizer (DOMPurify SVG profile) keeps; anything else is refused. */
const SVG_ELEMENTS = new Set(
  (
    "svg a g defs symbol use path rect circle ellipse line polyline polygon text tspan textPath " +
    "title desc metadata clipPath mask pattern marker linearGradient radialGradient stop filter " +
    "feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting " +
    "feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR " +
    "feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight " +
    "feSpecularLighting feSpotLight feTile feTurbulence switch view"
  )
    .split(" ")
    .map((n) => n.toLowerCase()),
);

/**
 * Structural check for an uploaded SVG (Studio sanitizes with DOMPurify; the Hub re-checks):
 * only allowlisted elements, no event handlers, no references outside the document, no
 * scripts/styles/entities. Returns the problem, or null when the SVG is safe to serve.
 */
export function svgProblem(text: string): string | null {
  const body = text.replace(/^\uFEFF/, "");
  if (!/<svg[\s>]/i.test(body)) return "it isn't an SVG image";
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(body)) return "it declares entities";
  if (/<\?xml-stylesheet/i.test(body)) return "it links a stylesheet";
  // Whole-text backstop on the entity-decoded text, whatever the tag parsing below concludes.
  const decoded = decodeEntities(body);
  const squashed = squash(decoded);
  if (/\son[a-z]+\s*=/i.test(decoded)) return "it has event handlers";
  if (/<script|<foreignobject/i.test(decoded)) return "it contains active content";
  if (/javascript:|vbscript:/.test(squashed)) return "it contains a script URL";

  // Every tag, attributes parsed with their quotes (a `>` inside a quoted value can't end it).
  const TAG =
    /<([A-Za-z][\w:.-]*)((?:\s+[^\s=>/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/y;
  const ATTR = /\s+([^\s=>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  for (let at = body.search(/<[A-Za-z]/); at >= 0; ) {
    TAG.lastIndex = at;
    const m = TAG.exec(body);
    if (!m) return "it contains a malformed tag";
    const name = (m[1] ?? "").toLowerCase();
    if (!SVG_ELEMENTS.has(name)) return `it contains <${m[1]}>`;
    for (const a of (m[2] ?? "").matchAll(ATTR)) {
      const attr = (a[1] ?? "").toLowerCase();
      const value = decodeEntities(a[2] ?? a[3] ?? a[4] ?? "");
      const compact = squash(value);
      if (attr.startsWith("on")) return "it has event handlers";
      if ((attr === "href" || attr === "xlink:href" || attr === "src") && !compact.startsWith("#"))
        return "it refers to outside content";
      if (/url\((?!['"]?#)/.test(compact)) return "it refers to outside content";
      if (/javascript:|vbscript:|data:/.test(compact)) return "it contains a script URL";
    }
    const next = body.slice(TAG.lastIndex).search(/<[A-Za-z]/);
    at = next < 0 ? -1 : TAG.lastIndex + next;
  }
  return null;
}

/** Lowercase with whitespace and control characters removed (`java\tscript:` → `javascript:`). */
const squash = (t: string) =>
  [...t]
    .filter((ch) => ch.charCodeAt(0) > 0x20)
    .join("")
    .toLowerCase();

/** Numeric and the few named character references an attacker would use to hide `:`/`(`. */
function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    colon: ":",
    lpar: "(",
    rpar: ")",
    tab: "\t",
    newline: "\n",
    sol: "/",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code =
        ref[1] === "x" || ref[1] === "X"
          ? Number.parseInt(ref.slice(2), 16)
          : Number.parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : "";
    }
    return named[ref.toLowerCase()] ?? whole;
  });
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
  if (fmt) {
    mime = IMAGE_MIME[fmt] as string;
    bytes = stripMetadata(bytes);
    size = imageSize(bytes);
  } else if (extMime === "image/svg+xml") {
    const problem = svgProblem(new TextDecoder().decode(bytes));
    if (problem)
      throw new HttpError(415, "unsupported_media_type", `That SVG can't be used: ${problem}.`);
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
