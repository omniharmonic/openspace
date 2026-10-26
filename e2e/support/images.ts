import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** A real photo from the shared fixtures (no metadata of its own). */
export const BASE_JPEG = resolve(
  here,
  "../../tools/fixtures/meadow-site/media/2026/10/morning-light.jpg",
);

/** Marker written into the EXIF ImageDescription so a leak is easy to spot. */
export const EXIF_MARKER = "E2E-GPS-LEAK-CHECK";

/**
 * A JPEG with an APP1 EXIF segment carrying GPS coordinates (45.5152 N, 122.6784 W) and an
 * ImageDescription marker, inserted right after SOI. Built by hand so no image library is needed.
 */
export function jpegWithGps(base = BASE_JPEG): Buffer {
  const jpeg = readFileSync(base);
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("not a JPEG");

  // TIFF (little endian). Layout (offsets from the TIFF header):
  //   0  header (8)
  //   8  IFD0: 2 entries (ImageDescription, GPSInfo) = 2 + 24 + 4 = 30 → ends at 38
  //  38  GPS IFD: 4 entries = 2 + 48 + 4 = 54 → ends at 92
  //  92  latitude rationals (24), 116 longitude rationals (24), 140 description string
  const desc = Buffer.from(`${EXIF_MARKER}\0`, "ascii");
  const tiff = Buffer.alloc(140 + desc.length);
  let o = 0;
  const u16 = (v: number) => {
    tiff.writeUInt16LE(v, o);
    o += 2;
  };
  const u32 = (v: number) => {
    tiff.writeUInt32LE(v, o);
    o += 4;
  };
  const entry = (tag: number, type: number, count: number, value: number) => {
    u16(tag);
    u16(type);
    u32(count);
    u32(value);
  };
  tiff.write("II", 0, "ascii");
  o = 2;
  u16(42);
  u32(8);
  // IFD0
  u16(2);
  entry(0x010e, 2, desc.length, 140); // ImageDescription (ASCII, at 140)
  entry(0x8825, 4, 1, 38); // GPSInfo IFD pointer
  u32(0);
  // GPS IFD
  u16(4);
  entry(0x0001, 2, 2, 0x4e); // GPSLatitudeRef "N\0" inline
  entry(0x0002, 5, 3, 92); // GPSLatitude
  entry(0x0003, 2, 2, 0x57); // GPSLongitudeRef "W\0" inline
  entry(0x0004, 5, 3, 116); // GPSLongitude
  u32(0);
  const rationals = (vals: Array<[number, number]>) => {
    for (const [n, d] of vals) {
      u32(n);
      u32(d);
    }
  };
  rationals([
    [45, 1],
    [30, 1],
    [5472, 100],
  ]);
  rationals([
    [122, 1],
    [40, 1],
    [4224, 100],
  ]);
  desc.copy(tiff, 140);

  const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), app1, payload, jpeg.subarray(2)]);
}

/** True when the bytes still carry EXIF / GPS metadata or the marker. */
export function hasExif(bytes: Buffer): boolean {
  return (
    bytes.includes(Buffer.from("Exif\0\0", "binary")) ||
    bytes.includes(Buffer.from(EXIF_MARKER, "ascii"))
  );
}
