import { base64ToBytes } from "./crypto";

/** Raster types accepted for uploaded logos. SVG is refused (it can carry script). */
export const LOGO_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;
export type LogoMime = keyof typeof LOGO_TYPES;

export interface DecodedImage {
  mime: LogoMime;
  ext: string;
  base64: string;
  bytes: number;
  width: number;
  height: number;
}

const be16 = (b: Uint8Array, o: number) => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const le16 = (b: Uint8Array, o: number) => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const be32 = (b: Uint8Array, o: number) => ((be16(b, o) << 16) >>> 0) + be16(b, o + 2);
const le24 = (b: Uint8Array, o: number) => le16(b, o) | ((b[o + 2] ?? 0) << 16);

/** Intrinsic size from the file header (PNG, JPEG, GIF, WebP); null if unrecognized. */
export function imageSize(b: Uint8Array): { width: number; height: number; mime: LogoMime } | null {
  if (b.length >= 24 && be32(b, 0) === 0x89504e47 && be32(b, 12) === 0x49484452)
    return { mime: "image/png", width: be32(b, 16), height: be32(b, 20) };
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46)
    return { mime: "image/gif", width: le16(b, 6), height: le16(b, 8) };
  if (b.length >= 30 && be32(b, 0) === 0x52494646 && be32(b, 8) === 0x57454250) {
    const chunk = String.fromCharCode(b[12] ?? 0, b[13] ?? 0, b[14] ?? 0, b[15] ?? 0);
    if (chunk === "VP8X")
      return { mime: "image/webp", width: le24(b, 24) + 1, height: le24(b, 27) + 1 };
    if (chunk === "VP8 ")
      return { mime: "image/webp", width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24);
      return {
        mime: "image/webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) return null;
      const marker = b[o + 1] ?? 0;
      const len = be16(b, o + 2);
      // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { mime: "image/jpeg", height: be16(b, o + 5), width: be16(b, o + 7) };
      o += 2 + len;
    }
  }
  return null;
}

/**
 * Decode a `data:image/...;base64,` URL; checks the size limit and that the bytes really are the
 * declared raster type. Throws an Error with a plain-language message.
 */
export function decodeImageDataUrl(dataUrl: string, maxBytes: number): DecodedImage {
  const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!m) throw new Error("The logo must be a PNG, JPEG, WebP or GIF image.");
  const declared = m[1] as string;
  if (!(declared in LOGO_TYPES))
    throw new Error("The logo must be a PNG, JPEG, WebP or GIF image.");
  const base64 = (m[2] as string).replace(/\s+/g, "");
  if (base64.length > Math.ceil((maxBytes * 4) / 3) + 4)
    throw new Error("The logo is too large (1 MB at most).");
  const bytes = base64ToBytes(base64);
  if (bytes.length > maxBytes) throw new Error("The logo is too large (1 MB at most).");
  const size = imageSize(bytes);
  if (!size || size.mime !== declared || !size.width || !size.height)
    throw new Error("We couldn't read that logo image.");
  return {
    mime: size.mime,
    ext: LOGO_TYPES[size.mime],
    base64,
    bytes: bytes.length,
    width: size.width,
    height: size.height,
  };
}
