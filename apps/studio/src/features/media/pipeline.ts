import {
  MAX_PLACEHOLDER_LENGTH,
  type MediaMeta,
  newId,
  type SiteDocument,
} from "@openspace/schema";
import { dominantColor, fitWithin, hasTransparency, suggestFocal } from "./analyze";
import { browserCodec, type ImageCodec, type ImageEdit } from "./codec";
import { stripMetadata } from "./metadata";
import { findDuplicate, mediaPathFor, sha256Hex } from "./naming";
import { sanitizeSvg, svgSize } from "./svg";

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

const IMAGE_RASTER = /^image\/(jpeg|png|webp|avif|bmp|heic|heif|tiff)$/;

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function base64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Sniff the real type from the first bytes (file.type can be empty or wrong). */
export function sniffMime(head: Uint8Array, fallback: string): string {
  const a = (i: number) => head[i] ?? -1;
  if (a(0) === 0xff && a(1) === 0xd8 && a(2) === 0xff) return "image/jpeg";
  if (a(0) === 0x89 && a(1) === 0x50 && a(2) === 0x4e && a(3) === 0x47) return "image/png";
  if (a(0) === 0x47 && a(1) === 0x49 && a(2) === 0x46) return "image/gif";
  const s = String.fromCharCode(...head.subarray(0, 12));
  if (s.startsWith("RIFF") && s.slice(8, 12) === "WEBP") return "image/webp";
  if (s.slice(4, 8) === "ftyp") {
    const brand = s.slice(8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (/^hei|^mif1|^msf1/.test(brand)) return "image/heic";
  }
  if (s.startsWith("%PDF")) return "application/pdf";
  const text = new TextDecoder().decode(head.subarray(0, 256)).trimStart();
  if (
    /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text) ||
    (fallback === "image/svg+xml" && text.startsWith("<"))
  )
    return "image/svg+xml";
  return fallback || "application/octet-stream";
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
): Promise<string | undefined> {
  for (const edge of PLACEHOLDER_EDGES) {
    const size = fitWithin(w, h, edge);
    const surface = codec.draw(source, size.width, size.height, edit);
    const blob = await codec.encode(surface, alpha ? "image/webp" : "image/jpeg", 0.5);
    const type = /^image\/(webp|png|jpeg|avif)$/.test(blob.type) ? blob.type : null;
    if (!type) continue;
    const uri = `data:${type};base64,${base64(stripMetadata(await bytesOf(blob)))}`;
    if (uri.length <= MAX_PLACEHOLDER_LENGTH) return uri;
  }
  // A single pixel of the average color always fits.
  const dot = codec.draw(source, 1, 1, edit);
  const blob = await codec.encode(dot, "image/png");
  const uri = `data:image/png;base64,${base64(await bytesOf(blob))}`;
  return uri.length <= MAX_PLACEHOLDER_LENGTH && blob.type === "image/png" ? uri : undefined;
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
  const mime = sniffMime(original.subarray(0, 512), file.type);
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
        const clean = stripMetadata(await bytesOf(encoded));
        blob = new Blob([clean as Uint8Array<ArrayBuffer>], { type: outMime });
      }
      width = fit.width;
      height = fit.height;
      if (mime === "image/gif" && !resized && !options.edit) {
        width = srcW;
        height = srcH;
      }
      placeholder = await placeholderFor(codec, decoded.source, srcW, srcH, alpha, options.edit);
    } finally {
      decoded.close();
    }
  } else if (kind === "video" && !options.allowVideo) {
    throw new MediaError(
      "Videos are hosted on Cloudflare. Paste a YouTube or Vimeo link into a video block instead, or switch hosting in Settings.",
      "video-needs-cloudflare",
    );
  } else if (kind === "image") {
    throw new MediaError(
      "This image format isn't supported. Try a JPEG, PNG, WebP or SVG.",
      "unsupported",
    );
  } else {
    if (original.length > MAX_PASSTHROUGH_BYTES)
      throw new MediaError("Files must be under 25 MB.", "too-large");
    blob = new Blob([original as Uint8Array<ArrayBuffer>], { type: mime });
  }

  const finalBytes = await bytesOf(blob);
  const sha256 = await sha256Hex(finalBytes);
  const path = mediaPathFor({ name, sha256, mime: outMime, date: now });
  const duplicateOf = options.existing ? findDuplicate(options.existing, sha256) : null;
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
