/** A tiny, dependency-free PNG writer for a 1×1 solid color (the placeholder of last resort). */

let table: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = (table[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

function chunk(type: string, data: number[]): number[] {
  const td = new Uint8Array([...Array.from(type, (c) => c.charCodeAt(0)), ...data]);
  return [...u32(data.length), ...td, ...u32(crc32(td))];
}

/** `#rrggbb` → a valid 1×1 RGB PNG (stored, uncompressed deflate block). */
export function solidPng(hex: string): Uint8Array {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const [r, g, b] = m
    ? [m[1], m[2], m[3]].map((x) => Number.parseInt(x as string, 16))
    : [128, 128, 128];
  const raw = [0, r as number, g as number, b as number];
  let a = 1;
  let bsum = 0;
  for (const x of raw) {
    a = (a + x) % 65521;
    bsum = (bsum + a) % 65521;
  }
  const zlib = [0x78, 0x01, 0x01, 0x04, 0x00, 0xfb, 0xff, ...raw, ...u32(((bsum << 16) | a) >>> 0)];
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk("IHDR", [...u32(1), ...u32(1), 8, 2, 0, 0, 0]),
    ...chunk("IDAT", zlib),
    ...chunk("IEND", []),
  ]);
}
