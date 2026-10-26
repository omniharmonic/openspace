/**
 * Metadata stripping for encoded images (defense in depth for arch §5.6: re-encoding through a
 * canvas already drops EXIF, but some encoders copy profiles or text chunks, and a few files —
 * GIFs, already-small images — are kept as they are). Removes EXIF (including GPS), XMP, IPTC,
 * comments and text chunks while keeping what affects how pixels look (JFIF, ICC, Adobe).
 */

const ascii = (bytes: Uint8Array, start: number, len: number) =>
  String.fromCharCode(...bytes.subarray(start, start + len));

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function isJpeg(b: Uint8Array): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export function isPng(b: Uint8Array): boolean {
  return b.length > 8 && PNG_SIGNATURE.every((v, i) => b[i] === v);
}

export function isWebp(b: Uint8Array): boolean {
  return b.length > 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP";
}

/**
 * JPEG: drop APP1 (EXIF/XMP), APP3–APP13, APP15 and COM segments; keep APP0 (JFIF),
 * APP2 only when it is an ICC profile, and APP14 (Adobe color transform).
 */
export function stripJpegMetadata(b: Uint8Array): Uint8Array {
  if (!isJpeg(b)) return b;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) return b; // not a marker where one should be: leave the file alone
    let marker = b[i + 1] ?? 0;
    // Fill bytes.
    while (marker === 0xff && i + 2 < b.length) {
      i++;
      marker = b[i + 1] ?? 0;
    }
    if (marker === 0xd9) {
      parts.push(b.subarray(i, i + 2));
      break;
    }
    // Standalone markers (RSTn, TEM) carry no length.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0);
    if (len < 2 || i + 2 + len > b.length) return b;
    const seg = b.subarray(i, i + 2 + len);
    if (marker === 0xda) {
      // Start of scan: the rest of the file is image data.
      parts.push(b.subarray(i));
      break;
    }
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep =
      !isApp && marker !== 0xfe
        ? true
        : marker === 0xe0 ||
          marker === 0xee ||
          (marker === 0xe2 && ascii(b, i + 4, 11) === "ICC_PROFILE");
    if (keep) parts.push(seg);
    i += 2 + len;
  }
  return concat(parts);
}

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

/** PNG: drop eXIf, tEXt, zTXt, iTXt and tIME chunks. */
export function stripPngMetadata(b: Uint8Array): Uint8Array {
  if (!isPng(b)) return b;
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len =
      (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>>
      0;
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) return b;
    if (!PNG_DROP.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return concat(parts);
}

/** WebP: drop EXIF and XMP chunks and clear their VP8X flags. */
export function stripWebpMetadata(b: Uint8Array): Uint8Array {
  if (!isWebp(b)) return b;
  const chunks: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const size =
      ((b[i + 4] ?? 0) |
        ((b[i + 5] ?? 0) << 8) |
        ((b[i + 6] ?? 0) << 16) |
        ((b[i + 7] ?? 0) << 24)) >>>
      0;
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > b.length) return b;
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = b.slice(i, Math.min(end, b.length));
      if (type === "VP8X" && chunk.length > 8) chunk[8] = (chunk[8] ?? 0) & ~(0x08 | 0x04);
      chunks.push(chunk);
    }
    i = end;
  }
  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(b.subarray(0, 12));
  const riffSize = body.length + 4;
  header[4] = riffSize & 0xff;
  header[5] = (riffSize >> 8) & 0xff;
  header[6] = (riffSize >> 16) & 0xff;
  header[7] = (riffSize >> 24) & 0xff;
  return concat([header, body]);
}

/** Strip metadata from JPEG, PNG or WebP bytes; other formats are returned unchanged. */
export function stripMetadata(b: Uint8Array): Uint8Array {
  if (isJpeg(b)) return stripJpegMetadata(b);
  if (isPng(b)) return stripPngMetadata(b);
  if (isWebp(b)) return stripWebpMetadata(b);
  return b;
}

/** True if the bytes still carry an EXIF block (JPEG APP1 "Exif", PNG eXIf or WebP EXIF). */
export function hasExif(b: Uint8Array): boolean {
  for (let i = 0; i + 6 <= b.length; i++) {
    // "Exif\0\0" (JPEG APP1 / WebP payload) or PNG "eXIf".
    if (b[i] === 0x45 && b[i + 1] === 0x78 && b[i + 2] === 0x69 && b[i + 3] === 0x66) {
      if (b[i + 4] === 0 && b[i + 5] === 0) return true;
    }
    if (b[i] === 0x65 && b[i + 1] === 0x58 && b[i + 2] === 0x49 && b[i + 3] === 0x66) return true;
  }
  return false;
}
