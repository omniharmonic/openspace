import type { Section } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { applyVariation, type FieldMetas, scaleWords } from "./stress";

const metas: Record<string, FieldMetas> = {
  card: {
    title: { kind: "text", maxLength: 20 } as never,
    photo: { kind: "image", optional: true } as never,
    items: {
      kind: "list",
      min: 1,
      max: 6,
      fields: { label: { kind: "text" } as never },
    } as never,
  },
};
const section = {
  id: "sec_aaaaaaaaaa",
  blocks: [
    {
      id: "blk_aaaaaaaaaa",
      type: "card",
      fields: {
        title: "Fresh bread daily",
        photo: { src: "media/a.jpg", alt: "", width: 10, height: 10 },
        items: [{ label: "One" }, { label: "Two" }],
      },
    },
  ],
} as unknown as Section;
const fields = (s: Section) => s.blocks[0]?.fields as Record<string, unknown>;
const metaOf = (t: string) => metas[t];

describe("stress variations", () => {
  it("scales copy within the field's max length", () => {
    expect(scaleWords("one two three four five six seven eight nine ten", 0.3)).toBe(
      "one two three",
    );
    expect(scaleWords("Fresh bread", 3)).toBe("Fresh bread Fresh bread Fresh bread");
    const s = applyVariation(section, { kind: "copy", factor: 3 }, metaOf);
    expect((fields(s).title as string).length).toBeLessThanOrEqual(20);
  });

  it("removes optional images and reshapes them tall or wide", () => {
    expect(
      fields(applyVariation(section, { kind: "images", mode: "missing" }, metaOf)).photo,
    ).toBeUndefined();
    const tall = fields(applyVariation(section, { kind: "images", mode: "tall" }, metaOf))
      .photo as {
      width: number;
      height: number;
    };
    expect(tall.height).toBeGreaterThan(tall.width);
  });

  it("resizes lists within their min and max", () => {
    const n = (count: number) =>
      (fields(applyVariation(section, { kind: "items", count }, metaOf)).items as unknown[]).length;
    expect([n(1), n(2), n(5), n(12)]).toEqual([1, 2, 5, 6]);
  });
});
