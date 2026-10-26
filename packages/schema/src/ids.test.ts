import { describe, expect, it, vi } from "vitest";
import {
  BlockIdSchema,
  CROCKFORD_ALPHABET,
  ID_PREFIXES,
  idPrefix,
  isId,
  newId,
  PageIdSchema,
  withScratchIds,
} from "./ids";

describe("ids", () => {
  it("generates prefix + 10 lowercase Crockford base32 chars", () => {
    for (const prefix of Object.values(ID_PREFIXES)) {
      const id = newId(prefix);
      expect(id).toMatch(new RegExp(`^${prefix}_[0-9a-hjkmnp-tv-z]{10}$`));
      expect(isId(id, prefix)).toBe(true);
      expect(idPrefix(id)).toBe(prefix);
    }
  });

  it("never uses ambiguous letters i, l, o, u", () => {
    expect(CROCKFORD_ALPHABET).toHaveLength(32);
    const many = Array.from({ length: 2000 }, () => newId("blk").slice(4)).join("");
    expect(many).not.toMatch(/[ilou]/);
  });

  it("is collision-resistant in practice", () => {
    const ids = new Set(Array.from({ length: 10000 }, () => newId("sec")));
    expect(ids.size).toBe(10000);
  });

  it("rejects malformed ids", () => {
    expect(isId("blk_0123456789")).toBe(true);
    expect(isId("blk_0123456789", "sec")).toBe(false);
    expect(isId("blk_012345678")).toBe(false); // too short
    expect(isId("blk_01234567890")).toBe(false); // too long
    expect(isId("BLK_0123456789")).toBe(false);
    expect(isId("blk_ABCDEFGHJK")).toBe(false); // uppercase
    expect(isId("blk_abcdefghil")).toBe(false); // i, l
    expect(isId("xyz_0123456789")).toBe(false);
    expect(isId(42)).toBe(false);
    expect(idPrefix("nope")).toBeUndefined();
  });

  it("validates with zod", () => {
    expect(PageIdSchema.safeParse(newId("pg")).success).toBe(true);
    expect(PageIdSchema.safeParse("pg_home").success).toBe(false);
    expect(BlockIdSchema.safeParse(newId("pg")).success).toBe(false);
  });

  it("withScratchIds builds valid ids without crypto (Workers global scope) and restores randomness", () => {
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    const ids = withScratchIds(() => [
      newId("sec"),
      newId("blk"),
      withScratchIds(() => newId("blk")),
    ]);
    expect(spy).not.toHaveBeenCalled();
    for (const id of ids) expect(isId(id)).toBe(true);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe("sec_0000000000");
    newId("pg");
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("withScratchIds refuses async functions", () => {
    expect(() => withScratchIds(async () => newId("sec"))).toThrow(/synchronous/);
    // Randomness is back afterwards.
    expect(newId("sec")).not.toBe("sec_0000000000");
  });
});
