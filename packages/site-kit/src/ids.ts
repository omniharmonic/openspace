import { CROCKFORD_ALPHABET } from "@omniharmonic/openspace-schema";

/**
 * Deterministic ids for content site-kit generates at build time (collection item pages,
 * Markdoc blocks, list pages). The same seed always yields the same id, so builds are
 * reproducible and the HTML only changes when content does. Pure JS (no node:crypto) so it
 * also runs inside the Cloudflare Worker. Dependency-free apart from `@omniharmonic/openspace-schema`, and
 * importable on its own as `@omniharmonic/openspace-site-kit/ids`.
 */
export function hash53(input: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** 10 Crockford base32 characters (50 bits) derived from `seed`. */
export function stableSuffix(seed: string): string {
  let a = hash53(seed);
  let b = hash53(seed, 7);
  let out = "";
  for (let i = 0; i < 10; i++) {
    const src = i < 5 ? a : b;
    out += CROCKFORD_ALPHABET[src % 32];
    if (i < 5) a = Math.floor(a / 32);
    else b = Math.floor(b / 32);
  }
  return out;
}

/** Id prefixes `stableId` mints (pages, sections, blocks, forms, sites). */
export type StableIdPrefix = "pg" | "sec" | "blk" | "frm" | "st";

export function stableId<P extends StableIdPrefix>(prefix: P, seed: string): `${P}_${string}` {
  return `${prefix}_${stableSuffix(`${prefix}:${seed}`)}`;
}

/** Short hex content hash (cache keys, asset file names). */
export function contentHash(input: string, length = 10): string {
  const a = hash53(input).toString(16).padStart(14, "0");
  const b = hash53(input, 31).toString(16).padStart(14, "0");
  return (a + b).slice(0, length);
}
