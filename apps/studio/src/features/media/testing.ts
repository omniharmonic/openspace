import type { ImageCodec, ImageEdit, Surface } from "./codec";

/**
 * Test helpers: hand-built image files carrying EXIF/GPS, and a fake codec that records what
 * the pipeline asked for. The fake encoder deliberately copies an EXIF block into its JPEG
 * output (like a careless encoder would) so tests prove the pipeline strips it anyway.
 */

const enc = new TextEncoder();
const u8 = (...parts: Array<number[] | Uint8Array | string>) => {
  const arrays = parts.map((p) => (typeof p === "string" ? enc.encode(p) : Uint8Array.from(p)));
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
};

/** "GPS" IFD payload marker used to prove location data is gone. */
export const GPS_MARKER = "GPSLatitude=37.7749N;GPSLongitude=122.4194W";

/** A JPEG APP1 EXIF segment with a GPS block. */
export function exifSegment(): Uint8Array {
  const payload = u8("Exif", [0, 0], "MM", [0, 0x2a, 0, 0, 0, 8], GPS_MARKER);
  const len = payload.length + 2;
  return u8([0xff, 0xe1, len >> 8, len & 0xff], payload);
}

/** A structurally valid JPEG (SOI, APP0 JFIF, APP1 EXIF+GPS, COM, DQT, SOS, data, EOI). */
export function jpegWithExif(body = "pixels"): Uint8Array {
  const jfif = u8("JFIF", [0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const com = u8("taken on a phone");
  return u8(
    [0xff, 0xd8],
    [0xff, 0xe0, 0, jfif.length + 2],
    jfif,
    exifSegment(),
    [0xff, 0xfe, 0, com.length + 2],
    com,
    [0xff, 0xdb, 0, 4, 0, 1],
    [0xff, 0xda, 0, 4, 0, 0],
    body,
    [0xff, 0xd9],
  );
}

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const td = u8(type, data);
  const crc = crc32(td);
  const len = data.length;
  return u8([len >>> 24, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff], td, [
    crc >>> 24,
    (crc >> 16) & 0xff,
    (crc >> 8) & 0xff,
    crc & 0xff,
  ]);
}

/** A PNG with eXIf and tEXt chunks. */
export function pngWithExif(): Uint8Array {
  return u8(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    pngChunk("IHDR", u8([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0])),
    pngChunk("eXIf", u8("MM", [0, 0x2a], GPS_MARKER)),
    pngChunk("tEXt", u8("Comment", [0], "home address")),
    pngChunk("IDAT", u8([1, 2, 3])),
    pngChunk("IEND", new Uint8Array()),
  );
}

/** A WebP (VP8X) with EXIF and XMP chunks. */
export function webpWithExif(): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const pad = data.length % 2 ? [0] : [];
    const n = data.length;
    return u8(type, [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff], data, pad);
  };
  const body = u8(
    chunk("VP8X", u8([0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
    chunk("VP8L", u8([0x2f, 1, 2, 3])),
    chunk("EXIF", u8("Exif", [0, 0], GPS_MARKER)),
    chunk("XMP ", u8("<x:xmpmeta/>")),
  );
  const size = body.length + 4;
  return u8(
    "RIFF",
    [size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, size >>> 24],
    "WEBP",
    body,
  );
}

export function contains(hay: Uint8Array, needle: string): boolean {
  const n = enc.encode(needle);
  outer: for (let i = 0; i + n.length <= hay.length; i++) {
    for (let j = 0; j < n.length; j++) if (hay[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

export interface FakeImage {
  width: number;
  height: number;
  /** Any transparent pixels. */
  alpha?: boolean;
  /** Where the subject is (0..1), drawn as a bright saturated blob on a flat background. */
  subject?: [number, number];
  /** Background color. */
  color?: [number, number, number];
}

interface FakeSurface extends Surface {
  img: FakeImage;
  edit?: ImageEdit;
}

/**
 * Fake codec. `images` maps the uploaded Blob to the picture it "contains". Encoders return
 * JPEG bytes with an EXIF+GPS block (to prove stripping), WebP when `webp` is true, otherwise PNG.
 */
export function fakeCodec(images: WeakMap<Blob, FakeImage>, options: { webp?: boolean } = {}) {
  const log = {
    decoded: [] as Array<{ width: number; height: number }>,
    drawn: [] as Array<{ width: number; height: number; edit?: ImageEdit }>,
    encoded: [] as Array<{ width: number; height: number; mime: string; quality?: number }>,
    closed: 0,
  };
  const codec: ImageCodec = {
    async decode(blob) {
      const img = images.get(blob);
      if (!img) throw new Error("not an image");
      log.decoded.push({ width: img.width, height: img.height });
      return { width: img.width, height: img.height, source: img, close: () => void log.closed++ };
    },
    draw(source, width, height, edit) {
      log.drawn.push({ width, height, edit });
      return { width, height, img: source as FakeImage, edit } as FakeSurface;
    },
    pixels(surface) {
      const { width, height, img } = surface as FakeSurface;
      const out = new Uint8ClampedArray(width * height * 4);
      const [bg0, bg1, bg2] = img.color ?? [200, 200, 200];
      const [sx, sy] = img.subject ?? [-1, -1];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const p = (y * width + x) * 4;
          const dx = (x + 0.5) / width - sx;
          const dy = (y + 0.5) / height - sy;
          const inSubject = dx * dx + dy * dy < 0.012;
          out[p] = inSubject ? 230 : bg0;
          out[p + 1] = inSubject ? 40 : bg1;
          out[p + 2] = inSubject ? 60 : bg2;
          out[p + 3] = img.alpha && x === 0 && y === 0 ? 0 : 255;
        }
      }
      return out;
    },
    async encode(surface, mime, quality) {
      const { width, height } = surface;
      log.encoded.push({ width, height, mime, quality });
      if (mime === "image/jpeg")
        return new Blob([jpegWithExif(`${width}x${height}`) as Uint8Array<ArrayBuffer>], {
          type: "image/jpeg",
        });
      if (mime === "image/webp" && options.webp)
        return new Blob([webpWithExif() as Uint8Array<ArrayBuffer>], { type: "image/webp" });
      // Safari-like: no WebP encoder → PNG.
      return new Blob([pngWithExif() as Uint8Array<ArrayBuffer>], { type: "image/png" });
    },
  };
  return { codec, log };
}

/** An "uploaded" photo: real JPEG bytes with EXIF+GPS, registered with the fake codec. */
export function fakePhoto(
  images: WeakMap<Blob, FakeImage>,
  img: FakeImage,
  name = "IMG_2041.jpg",
  body = "photo",
): File {
  const file = new File([jpegWithExif(body) as Uint8Array<ArrayBuffer>], name, {
    type: "image/jpeg",
  });
  images.set(file, img);
  return file;
}
