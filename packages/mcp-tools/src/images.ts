/**
 * Image upload pipeline shared by the Memory and File stores (no Node APIs, Workers-safe):
 * sniff the format, read dimensions, strip metadata (EXIF/XMP/text chunks), and build the
 * `media/YYYY/MM/<name>-<id>.<ext>` path and `MediaMeta`. Resizing above 2400 px needs a
 * resizer (sharp in the CLI); without one an oversized image is refused with a clear message.
 */
import { type MediaMeta, newId } from "@openspace/schema";
import { ToolError } from "./errors";
import type { ImageUploadInput } from "./store";

export const MAX_IMAGE_EDGE = 2400;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export type ImageFormat = "jpeg" | "png" | "gif" | "webp" | "avif";
const MIME: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};
const EXT: Record<ImageFormat, string> = {
  jpeg: "jpg",
  png: "png",
  gif: "gif",
  webp: "webp",
  avif: "avif",
};

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

const u16be = (b: Uint8Array, o: number) => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const u32be = (b: Uint8Array, o: number) =>
  (((b[o] ?? 0) << 24) >>> 0) +
  (((b[o + 1] ?? 0) << 16) | ((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0));
const u16le = (b: Uint8Array, o: number) => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, o: number) =>
  (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

export function sniffImage(b: Uint8Array): ImageFormat | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return "png";
  if (ascii(b, 0, 4) === "GIF8") return "gif";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  if (ascii(b, 4, 4) === "ftyp" && /avi[fs]/.test(ascii(b, 8, 4))) return "avif";
  return null;
}

/** Intrinsic size of a JPEG/PNG/GIF/WebP/AVIF, or null if it can't be read. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  const fmt = sniffImage(b);
  if (fmt === "png") return { width: u32be(b, 16), height: u32be(b, 20) };
  if (fmt === "gif") return { width: u16le(b, 6), height: u16le(b, 8) };
  if (fmt === "jpeg") {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) {
        o++;
        continue;
      }
      const marker = b[o + 1] ?? 0;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        o += 2;
        continue;
      }
      const len = u16be(b, o + 2);
      // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
        return { height: u16be(b, o + 5), width: u16be(b, o + 7) };
      o += 2 + len;
    }
    return null;
  }
  if (fmt === "webp") {
    const chunk = ascii(b, 12, 4);
    if (chunk === "VP8 ") return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    return null;
  }
  if (fmt === "avif") {
    // Find the `ispe` property box: 4 bytes version/flags, then width and height (u32 BE).
    for (let o = 0; o + 16 < b.length && o < 4096; o++)
      if (ascii(b, o, 4) === "ispe") return { width: u32be(b, o + 8), height: u32be(b, o + 12) };
  }
  return null;
}

/** Remove EXIF/XMP/comments from JPEG (keeps JFIF and ICC) and text/EXIF chunks from PNG. */
export function stripMetadata(b: Uint8Array): Uint8Array {
  const fmt = sniffImage(b);
  if (fmt === "jpeg") {
    const parts: Uint8Array[] = [b.subarray(0, 2)];
    let o = 2;
    while (o + 4 <= b.length) {
      if (b[o] !== 0xff) break;
      const marker = b[o + 1] ?? 0;
      if (marker === 0xda) break; // start of scan: the rest is image data
      const len = u16be(b, o + 2);
      const seg = b.subarray(o, o + 2 + len);
      const isApp = marker >= 0xe1 && marker <= 0xef;
      const keepIcc = marker === 0xe2 && ascii(b, o + 4, 11) === "ICC_PROFILE";
      if ((!isApp || keepIcc) && marker !== 0xfe) parts.push(seg);
      o += 2 + len;
    }
    parts.push(b.subarray(o));
    return concat(parts);
  }
  if (fmt === "png") {
    const drop = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
    const parts: Uint8Array[] = [b.subarray(0, 8)];
    let o = 8;
    while (o + 12 <= b.length) {
      const len = u32be(b, o);
      const type = ascii(b, o + 4, 4);
      const end = o + 12 + len;
      if (!drop.has(type)) parts.push(b.subarray(o, end));
      o = end;
      if (type === "IEND") break;
    }
    return concat(parts);
  }
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Optional resizer (sharp in the CLI): returns bytes no larger than `maxEdge` on either side. */
export type ImageResizer = (
  bytes: Uint8Array,
  maxEdge: number,
) => Promise<{ bytes: Uint8Array; width: number; height: number }>;

export interface PreparedImage {
  bytes: Uint8Array;
  path: string;
  meta: MediaMeta;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "image";

/** Fetch an https image with a size cap (Workers and Node both have `fetch`). */
export async function fetchImage(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; name: string }> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ToolError(`"${url}" is not a valid URL.`, "invalid_arguments");
  }
  // Follow redirects by hand so every hop must stay on https.
  let res: Response | undefined;
  for (let hop = 0; hop <= 5; hop++) {
    if (u.protocol !== "https:")
      throw new ToolError(
        hop
          ? `${url} redirects to a non-https address (${u.protocol}), which is refused.`
          : "Only https:// image URLs can be uploaded.",
        "invalid_arguments",
      );
    res = await fetchImpl(u.toString(), { redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      u = new URL(res.headers.get("location") as string, u);
      continue;
    }
    break;
  }
  if (!res || (res.status >= 300 && res.status < 400))
    throw new ToolError(`${url} redirects too many times.`, "fetch_failed");
  if (!res.ok)
    throw new ToolError(`Downloading ${url} failed with HTTP ${res.status}.`, "fetch_failed");
  const tooLarge = () => new ToolError(`The image at ${url} is larger than 15 MB.`, "too_large");
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    await res.body?.cancel().catch(() => undefined);
    throw tooLarge();
  }
  // Stream with a cap: never buffer more than the limit, whatever the server claims.
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      chunks.push(value);
    }
  }
  return { bytes: concat(chunks), name: u.pathname.split("/").pop() || "image" };
}

/**
 * Turn an upload into stored bytes + `MediaMeta`. `now` sets the folder (`media/2026/10/`).
 */
export async function prepareImage(
  input: ImageUploadInput,
  opts: { fetch?: typeof fetch; resize?: ImageResizer; now?: Date } = {},
): Promise<PreparedImage> {
  if (typeof input.alt !== "string")
    throw new ToolError(
      'alt is required: describe the image\'s purpose, or "" for a decorative image.',
      "invalid_arguments",
    );
  if ((input.url ? 1 : 0) + (input.base64 ? 1 : 0) !== 1)
    throw new ToolError("Give exactly one of url or base64.", "invalid_arguments");
  let bytes: Uint8Array;
  let name = input.filename ?? "image";
  if (input.url) {
    const r = await fetchImage(input.url, opts.fetch);
    bytes = r.bytes;
    if (!input.filename) name = r.name;
  } else {
    try {
      bytes = base64ToBytes(input.base64 as string);
    } catch {
      throw new ToolError("base64 is not valid base64 data.", "invalid_arguments");
    }
    if (bytes.length > MAX_IMAGE_BYTES)
      throw new ToolError("The image is larger than 15 MB.", "too_large");
  }
  const fmt = sniffImage(bytes);
  if (!fmt)
    throw new ToolError(
      "That file is not a JPEG, PNG, GIF, WebP or AVIF image.",
      "unsupported_image",
    );
  let size = imageSize(bytes);
  if (!size?.width || !size.height)
    throw new ToolError("Couldn't read the image's dimensions.", "unsupported_image");
  if (Math.max(size.width, size.height) > MAX_IMAGE_EDGE) {
    if (!opts.resize)
      throw new ToolError(
        `The image is ${size.width}×${size.height}px; images are stored at most ${MAX_IMAGE_EDGE}px on the long edge and no resizer is available here.`,
        "too_large",
        [],
        "Upload a smaller version (for Unsplash/imgix URLs add ?w=2400), or install sharp next to the CLI.",
      );
    const r = await opts.resize(bytes, MAX_IMAGE_EDGE);
    bytes = r.bytes;
    size = { width: r.width, height: r.height };
  }
  bytes = stripMetadata(bytes);
  const now = opts.now ?? new Date();
  const id = newId("med");
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const finalFmt = sniffImage(bytes) ?? fmt;
  const path = `media/${yyyy}/${mm}/${slugify(name)}-${id.slice(4, 8)}.${EXT[finalFmt]}`;
  const meta: MediaMeta = {
    id: id as MediaMeta["id"],
    path: path as MediaMeta["path"],
    kind: "image",
    mime: MIME[finalFmt],
    bytes: bytes.length,
    width: size.width,
    height: size.height,
    alt: input.alt,
    createdAt: now.toISOString(),
  };
  if (input.credit && Object.keys(input.credit).length) meta.credit = input.credit as never;
  if (input.license) meta.license = input.license;
  if (input.filename) meta.originalName = input.filename.slice(0, 255);
  return { bytes, path, meta };
}
