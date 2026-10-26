import { CROCKFORD_ALPHABET, type PageId } from "@openspace/schema";

/**
 * Deterministic ids for template content. Template sections are composed from section presets,
 * whose `build()` mints fresh random ids; {@link stabilizeIds} renames every section, block and
 * form id by order of appearance so the generated files are byte-stable between runs. Same hash
 * as site-kit's `stableId` (pure JS, so the registry also runs in a Worker).
 */
function hash53(input: string, seed = 0): number {
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

function suffix(seed: string): string {
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

export function stableId<P extends string>(prefix: P, seed: string): `${P}_${string}` {
  return `${prefix}_${suffix(`${prefix}:${seed}`)}`;
}

/** A page id for a template page (`meadow`, `about`). */
export const pageId = (template: string, key: string): PageId =>
  stableId("pg", `${template}:${key}`) as PageId;

const RANDOM_ID_RE = /\b(sec|blk|frm)_[0-9a-hjkmnp-tv-z]{10}\b/g;

/**
 * Rename every `sec_`/`blk_`/`frm_` id in a JSON-safe value by order of first appearance,
 * consistently everywhere it occurs (grid item keys, references). Page ids are left alone:
 * templates mint those with {@link pageId}.
 */
export function stabilizeIds<T>(value: T, template: string): T {
  const json = JSON.stringify(value);
  const map = new Map<string, string>();
  const counters: Record<string, number> = {};
  for (const m of json.matchAll(RANDOM_ID_RE)) {
    const id = m[0];
    const prefix = m[1] as string;
    if (map.has(id)) continue;
    counters[prefix] = (counters[prefix] ?? 0) + 1;
    map.set(id, stableId(prefix, `${template}:${counters[prefix]}`));
  }
  const values = new Set(map.values());
  if (values.size !== map.size) throw new Error(`stabilizeIds(${template}): id collision`);
  return JSON.parse(json.replace(RANDOM_ID_RE, (id) => map.get(id) ?? id)) as T;
}
