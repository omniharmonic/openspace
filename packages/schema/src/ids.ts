import { z } from "zod";

/**
 * Stable ids (Global Constraint 6): `<prefix>_` + 10 lowercase Crockford base32 characters.
 * Ids are generated once and preserved by every edit; they make merges, agent targeting
 * and comments reliable.
 */

/** Crockford base32 alphabet, lowercase (no i, l, o, u). */
export const CROCKFORD_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** Number of random characters after the prefix. 10 chars × 5 bits = 50 bits of entropy. */
export const ID_LENGTH = 10;

/** All id prefixes used by the content model. */
export const ID_PREFIXES = {
  page: "pg",
  section: "sec",
  block: "blk",
  media: "med",
  form: "frm",
  site: "st",
} as const;

export type IdKind = keyof typeof ID_PREFIXES;
export type IdPrefix = (typeof ID_PREFIXES)[IdKind];

export type PageId = `pg_${string}`;
export type SectionId = `sec_${string}`;
export type BlockId = `blk_${string}`;
export type MediaId = `med_${string}`;
export type FormId = `frm_${string}`;
export type SiteId = `st_${string}`;

export type IdOf<P extends IdPrefix> = `${P}_${string}`;

const ID_BODY = `[${CROCKFORD_ALPHABET}]{${ID_LENGTH}}`;
const ANY_ID_RE = new RegExp(`^(?:${Object.values(ID_PREFIXES).join("|")})_${ID_BODY}$`);
const idPattern = (prefix: IdPrefix): RegExp => new RegExp(`^${prefix}_${ID_BODY}$`);

/** Counter used instead of crypto while `withScratchIds` runs (null: random ids). */
let scratchCounter: number | null = null;

/**
 * Run `fn` with `newId` drawing ids from a deterministic counter instead of `crypto`.
 * For throwaway values built at module load (e.g. a preset's metadata sample): Cloudflare
 * Workers forbid generating random values in global scope. Ids made here are NOT unique
 * across calls — never store them.
 */
export function withScratchIds<T>(fn: () => T): T {
  const outer = scratchCounter;
  scratchCounter = outer ?? 0;
  try {
    const out = fn();
    if (out && typeof (out as { then?: unknown }).then === "function")
      throw new TypeError(
        "withScratchIds needs a synchronous function: ids made after an await would be random.",
      );
    return out;
  } finally {
    scratchCounter = outer;
  }
}

/** Generate a new random id with the given prefix, e.g. `newId("blk")` → `blk_7hq2k3f9mz`. */
export function newId<P extends IdPrefix>(prefix: P): IdOf<P> {
  const bytes = new Uint8Array(ID_LENGTH);
  if (scratchCounter === null) globalThis.crypto.getRandomValues(bytes);
  else {
    let n = scratchCounter++;
    for (let i = ID_LENGTH - 1; i >= 0; i--, n = Math.floor(n / 32)) bytes[i] = n % 32;
  }
  let body = "";
  for (const byte of bytes) body += CROCKFORD_ALPHABET[byte & 31];
  return `${prefix}_${body}` as IdOf<P>;
}

/** True if `value` is a well-formed id. With `prefix`, also checks the id kind. */
export function isId<P extends IdPrefix>(value: unknown, prefix: P): value is IdOf<P>;
export function isId(value: unknown): value is string;
export function isId(value: unknown, prefix?: IdPrefix): boolean {
  if (typeof value !== "string") return false;
  return prefix ? idPattern(prefix).test(value) : ANY_ID_RE.test(value);
}

/** The prefix of a well-formed id, or `undefined`. */
export function idPrefix(value: string): IdPrefix | undefined {
  if (!isId(value)) return undefined;
  return value.slice(0, value.indexOf("_")) as IdPrefix;
}

// Plain regex-checked strings (no transform, so JSON Schema export stays faithful).
// The branded template-literal type is applied via the cast on each export.
const idString = <P extends IdPrefix>(prefix: P) =>
  z.string().regex(idPattern(prefix), {
    message: `Expected an id like "${prefix}_" followed by 10 lowercase base32 characters`,
  }) as unknown as z.ZodType<IdOf<P>, IdOf<P>>;

export const PageIdSchema = idString("pg");
export const SectionIdSchema = idString("sec");
export const BlockIdSchema = idString("blk");
export const MediaIdSchema = idString("med");
export const FormIdSchema = idString("frm");
export const SiteIdSchema = idString("st");
