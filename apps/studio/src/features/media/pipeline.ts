import {
  MAX_PLACEHOLDER_LENGTH,
  type MediaMeta,
  newId,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { dominantColor, fitWithin, hasTransparency, suggestFocal } from "./analyze";
import { browserCodec, type ImageCodec, type ImageEdit } from "./codec";
import { stripMetadata } from "./metadata";
import { duplicateCandidates, mediaPathFor, sha256Hex } from "./naming";
import { solidPng } from "./png";

/**
 * The in-browser media pipeline (arch §5.6): decode → downscale (long edge ≤ 2400) → re-encode
 * (JPEG q≈0.85 for photos, lossless WebP/PNG when there is transparency) which drops EXIF and
 * GPS → strip any metadata an encoder copied → dominant color, blur placeholder, suggested focal
 * point → content-hash name `media/YYYY/MM/<slug>-<hash>.<ext>` → dedupe against the library.
 */

export const MAX_EDGE = 2400;
export const JPEG_QUALITY = 0.85;
/** Largest file accepted as-is (documents, audio, GIFs). GitHub rejects files over 100 MB. */
export const MAX_PASSTHROUGH_BYTES = 25 * 1024 * 1024;
const PLACEHOLDER_EDGES = [16, 12, 8];
const ANALYSIS_EDGE = 64;

export interface ProcessOptions {
  codec?: ImageCodec;
  now?: () => Date;
  /** The library, for dedupe. */
  existing?: SiteDocument["media"];
  /** Bytes of a library file, to confirm a duplicate by its full hash (null when unavailable). */
  existingBytes?: (path: string) => Promise<Uint8Array | null>;
  /** Crop/filter applied before encoding (image editor "save as new image"). */
  edit?: ImageEdit;
  /** Name to slug instead of the file's own name. */
  name?: string;
  /** Video files are only accepted when the site is hosted on Cloudflare (R2). */
  allowVideo?: boolean;
  maxEdge?: number;
}

export interface ProcessedMedia {
  blob: Blob;
  path: string;
  sha256: string;
  meta: MediaMeta;
  /** `#rrggbb` of the most common color (images). */
  dominant: string | null;
  /** The saliency suggestion (also stored as `meta.focal`). */
  suggestedFocal: [number, number] | null;
  /** An identical file already in the library: use it instead of uploading. */
  duplicateOf: string | null;
  /** The long edge was reduced to fit {@link MAX_EDGE}. */
  resized: boolean;
  originalBytes: number;
}

export class MediaError extends Error {
  constructor(
    message: string,
    readonly code: "unsupported" | "too-large" | "video-needs-cloudflare" | "decode",
  ) {
    super(message);
    this.name = "MediaError";
  }
}

/** Raster images the browser decodes and the pipeline always re-encodes. */
const IMAGE_RASTER = /^image\/(jpeg|png|webp|avif|heic)$/;

/**
 * Everything the media library accepts, by *sniffed* type (never the file name or the browser's
 * guess). Anything else — HTML, scripts, archives… — is refused: files in media/ are served from
 * the site's own origin, so an unknown type could carry script.
 */
export const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "video/mp4",
  "video/webm",
]);

export const UNSUPPORTED_MESSAGE =
  "This kind of file can't be added. Upload photos (JPEG, PNG, WebP, GIF), SVG graphics, PDFs or audio.";

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * The real type from the first bytes. File names and `file.type` are ignored: a renamed
 * `promo.html` is still HTML. Returns null for anything that isn't on the allowlist.
 */
export function sniffMime(head: Uint8Array): string | null {
  const a = (i: number) => head[i] ?? -1;
  if (a(0) === 0xff && a(1) === 0xd8 && a(2) === 0xff) return "image/jpeg";
  if (a(0) === 0x89 && a(1) === 0x50 && a(2) === 0x4e && a(3) === 0x47) return "image/png";
  if (a(0) === 0x47 && a(1) === 0x49 && a(2) === 0x46 && a(3) === 0x38) return "image/gif";
  if (a(0) === 0x1a && a(1) === 0x45 && a(2) === 0xdf && a(3) === 0xa3) return "video/webm";
  const s = String.fromCharCode(...head.subarray(0, 12));
  if (s.startsWith("RIFF") && s.slice(8, 12) === "WEBP") return "image/webp";
  if (s.startsWith("RIFF") && s.slice(8, 12) === "WAVE") return "audio/wav";
  if (s.startsWith("OggS")) return "audio/ogg";
  if (s.startsWith("fLaC")) return "audio/flac";
  if (s.startsWith("ID3") || (a(0) === 0xff && (a(1) & 0xe0) === 0xe0)) return "audio/mpeg";
  if (s.slice(4, 8) === "ftyp") {
    const brand = s.slice(8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (/^(heic|heix|hevc|mif1|msf1)$/.test(brand)) return "image/heic";
    if (/^M4A /.test(brand)) return "audio/mp4";
    if (/^(isom|iso2|iso5|iso6|mp41|mp42|avc1|M4V |dash)$/.test(brand)) return "video/mp4";
    return null;
  }
  if (s.startsWith("%PDF-")) return "application/pdf";
  // SVG: an XML prolog, comments or a doctype may come first, then the root <svg> element.
  const text = new TextDecoder()
    .decode(head.subarray(0, 1024))
    .replace(/^\uFEFF/, "")
    .trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*|<!DOCTYPE svg[^>]*>\s*)*<svg[\s>]/i.test(text))
    return "image/svg+xml";
  return null;
}

function kindOf(mime: string): MediaMeta["kind"] {
  const top = mime.split("/")[0];
  return top === "image" || top === "video" || top === "audio" ? top : "file";
}

/** Build a ≤ 1 KB blurred placeholder data URI (tiny re-encode; the browser blurs it on display). */
async function placeholderFor(
  codec: ImageCodec,
  source: unknown,
  w: number,
  h: number,
  alpha: boolean,
  edit: ImageEdit | undefined,
  dominant: string,
): Promise<string | undefined> {
  for (const edge of PLACEHOLDER_EDGES) {
    const size = fitWithin(w, h, edge);
    const surface = codec.draw(source, size.width, size.height, edit);
    let blob: Blob;
    try {
      blob = await codec.encode(surface, alpha ? "image/webp" : "image/jpeg", 0.5);
    } catch {
      continue;
    }
    const type = /^image\/(webp|png|jpeg|avif)$/.test(blob.type) ? blob.type : null;
    if (!type) continue;
    const uri = `data:${type};base64,${base64(stripMetadata(await bytesOf(blob)))}`;
    if (uri.length <= MAX_PLACEHOLDER_LENGTH) return uri;
  }
  // A single pixel of the dominant color always fits.
  return `data:image/png;base64,${base64(solidPng(dominant))}`;
}

/** Run one file through the pipeline. Throws {@link MediaError} for files it can't take. */
export async function processMedia(
  file: Blob & { name?: string },
  options: ProcessOptions = {},
): Promise<ProcessedMedia> {
  const codec = options.codec ?? browserCodec;
  const now = options.now?.() ?? new Date();
  const name = options.name ?? file.name ?? "image";
  const original = await bytesOf(file);
  const sniffed = sniffMime(original.subarray(0, 1024));
  if (!sniffed || !ALLOWED_MIME.has(sniffed))
    throw new MediaError(UNSUPPORTED_MESSAGE, "unsupported");
  const mime = sniffed;
  const kind = kindOf(mime);
  const maxEdge = options.maxEdge ?? MAX_EDGE;

  let blob: Blob;
  let outMime = mime;
  let width: number | undefined;
  let height: number | undefined;
  let placeholder: string | undefined;
  let dominant: string | null = null;
  let focal: [number, number] | null = null;
  let resized = false;

  if (mime === "image/svg+xml") {
    // DOMPurify loads only when an SVG arrives.
    const { sanitizeSvg, svgSize } = await import("./svg");
    const clean = sanitizeSvg(new TextDecoder().decode(original));
    blob = new Blob([clean], { type: mime });
    ({ width, height } = svgSize(clean));
  } else if (IMAGE_RASTER.test(mime) || mime === "image/gif") {
    let decoded: Awaited<ReturnType<ImageCodec["decode"]>>;
    try {
      decoded = await codec.decode(file);
    } catch (err) {
      throw new MediaError((err as Error).message || "This image couldn't be opened.", "decode");
    }
    try {
      const crop = options.edit?.crop;
      const srcW = crop ? Math.round(crop.width) : decoded.width;
      const srcH = crop ? Math.round(crop.height) : decoded.height;
      const fit = fitWithin(srcW, srcH, maxEdge);
      resized = fit.width < srcW;
      const sample = fitWithin(srcW, srcH, ANALYSIS_EDGE);
      const px = codec.pixels(
        codec.draw(decoded.source, sample.width, sample.height, options.edit),
      );
      const alpha = hasTransparency(px);
      dominant = dominantColor(px);
      focal = suggestFocal(px, sample.width, sample.height);
      // GIFs may be animated: keep them as they are unless they need resizing or editing.
      const keepGif = mime === "image/gif" && !resized && !options.edit;
      if (keepGif) {
        if (original.length > MAX_PASSTHROUGH_BYTES)
          throw new MediaError(
            "This GIF is over 25 MB. Try a shorter clip or a video link.",
            "too-large",
          );
        blob = new Blob([original as Uint8Array<ArrayBuffer>], { type: mime });
      } else {
        const surface = codec.draw(decoded.source, fit.width, fit.height, options.edit);
        let encoded: Blob;
        if (alpha) {
          encoded = await codec.encode(surface, "image/webp", 1);
          if (encoded.type !== "image/webp") encoded = await codec.encode(surface, "image/png");
        } else {
          encoded = await codec.encode(surface, "image/jpeg", JPEG_QUALITY);
        }
        outMime = encoded.type || (alpha ? "image/png" : "image/jpeg");
        if (!/^image\/(jpeg|png|webp)$/.test(outMime))
          throw new MediaError("This image couldn't be saved. Try a JPEG or PNG.", "decode");
        const clean = stripMetadata(await bytesOf(encoded));
        blob = new Blob([clean as Uint8Array<ArrayBuffer>], { type: outMime });
      }
      width = fit.width;
      height = fit.height;
      if (mime === "image/gif" && !resized && !options.edit) {
        width = srcW;
        height = srcH;
      }
      placeholder = await placeholderFor(
        codec,
        decoded.source,
        srcW,
        srcH,
        alpha,
        options.edit,
        dominant,
      );
    } finally {
      decoded.close();
    }
  } else if (kind === "video" && !options.allowVideo) {
    throw new MediaError(
      "Video files need your site on your own free Cloudflare account (Finish setting up → any shop or members step sets it up). For now, paste a YouTube or Vimeo link into a video block.",
      "video-needs-cloudflare",
    );
  } else {
    if (original.length > MAX_PASSTHROUGH_BYTES)
      throw new MediaError("Files must be under 25 MB.", "too-large");
    blob = new Blob([original as Uint8Array<ArrayBuffer>], { type: mime });
  }

  const finalBytes = await bytesOf(blob);
  const sha256 = await sha256Hex(finalBytes);
  let path = mediaPathFor({ name, sha256, mime: outMime, date: now });
  let duplicateOf: string | null = null;
  if (options.existing) {
    // Same short hash and size is only a candidate; the full SHA-256 decides.
    for (const candidate of duplicateCandidates(options.existing, sha256, finalBytes.length)) {
      if (!options.existingBytes) {
        duplicateOf = candidate;
        break;
      }
      const bytes = await options.existingBytes(candidate).catch(() => null);
      if (bytes && (await sha256Hex(bytes)) === sha256) {
        duplicateOf = candidate;
        break;
      }
    }
    // A different file whose name and short hash collide gets a longer hash.
    if (!duplicateOf && options.existing[path as keyof SiteDocument["media"]])
      path = mediaPathFor({ name, sha256, mime: outMime, date: now, hashLength: 16 });
  }
  const meta: MediaMeta = {
    id: newId("med"),
    path,
    kind: kindOf(outMime),
    mime: outMime,
    bytes: finalBytes.length,
    ...(width !== undefined && height !== undefined ? { width, height } : {}),
    alt: "",
    ...(focal ? { focal } : {}),
    ...(placeholder ? { placeholder } : {}),
    originalName: name.slice(0, 255),
    createdAt: now.toISOString(),
  };
  return {
    blob,
    path,
    sha256,
    meta,
    dominant,
    suggestedFocal: focal,
    duplicateOf,
    resized,
    originalBytes: original.length,
  };
}
