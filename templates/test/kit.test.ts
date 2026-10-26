import { describe, expect, it } from "vitest";
import { buildTemplate, remoteMedia } from "../lib/define";
import { stabilizeIds } from "../lib/ids";
import { definePages, fromPreset, gridRows, heading, r, section } from "../lib/kit";
import { meadow } from "../meadow/src/build";

describe("fromPreset", () => {
  it("edits blocks by type and occurrence, and refuses keys that don't match", () => {
    const s = fromPreset("services/alternating@1", {
      edit: {
        "text:2": {
          content: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Second" }] }],
          },
        },
      },
    });
    const texts = s.blocks.filter((b) => b.type === "text");
    expect(JSON.stringify(texts[1]?.fields)).toContain("Second");
    expect(() => fromPreset("services/alternating@1", { edit: { text: {} } })).toThrow(/ambiguous/);
    expect(() => fromPreset("hero/centered@1", { edit: { image: {} } })).toThrow(/no image #1/);
    expect(() => fromPreset("hero/centered@1", { edit: { 0: {} } as never })).toThrow(/block type/);
  });

  it("drops grid blocks and recomputes the rows", () => {
    const full = fromPreset("hero/editorial-overlap@1");
    const s = fromPreset("hero/editorial-overlap@1", { drop: ["button"] });
    expect(s.blocks.some((b) => b.type === "button")).toBe(false);
    if (s.layout.mode !== "grid" || full.layout.mode !== "grid") throw new Error("grid");
    expect(Object.keys(s.layout.items)).toHaveLength(2);
    const maxD = Math.max(...Object.values(s.layout.items).map((i) => i.d.y + i.d.h - 1));
    expect(s.layout.rows).toMatchObject({ d: maxD });
  });
});

describe("gridRows", () => {
  it("keeps tablet rows when items place themselves on tablet", () => {
    expect(
      gridRows({
        a: { d: r(1, 1, 12, 10), t: r(1, 1, 12, 14), m: r(1, 1, 8, 6) },
        b: { d: r(13, 1, 12, 4), m: r(1, 7, 8, 5) },
      }),
    ).toEqual({ d: 10, t: 14, m: 11 });
    expect(gridRows({ a: { d: r(1, 2, 24, 3) } })).toEqual({ d: 4 });
  });
});

describe("stabilizeIds", () => {
  it("seeds ids from page, preset and occurrence, so inserting a section renumbers nothing else", () => {
    const { doc } = buildTemplate(meadow);
    const home =
      Object.values(doc.pages).find((p) => p.slug === "") ??
      (() => {
        throw new Error();
      })();
    const before = home.sections.map((s) => s.id);
    home.sections.unshift(section([heading("A new section")], {}, { label: "Inserted" }));
    const again = stabilizeIds(doc, "meadow");
    const after = (Object.values(again.pages).find((p) => p.slug === "")?.sections ?? []).map(
      (s) => s.id,
    );
    expect(after.slice(1)).toEqual(before);
  });
});

describe("definePages", () => {
  it("derives hrefs from slugs", () => {
    const r = definePages("x", { home: "", about: "about", dining: "private-dining" });
    expect(r.href("home")).toBe("/");
    expect(r.href("dining", "enquire")).toBe("/private-dining/#enquire");
  });
});

describe("media licenses", () => {
  it("finds media on any host, and refuses to build a template with an uncredited file", () => {
    expect(
      remoteMedia({
        a: { image: "https://cdn.example.com/a.jpg?w=2" },
        b: { url: "https://x.example/" },
      }),
    ).toEqual(["https://cdn.example.com/a.jpg"]);
    const bad = {
      ...meadow,
      build() {
        const c = meadow.build();
        const p = c.pages[0];
        if (p) p.seo = { ...p.seo, image: "https://cdn.example.com/uncredited.jpg" };
        return c;
      },
    };
    expect(() => buildTemplate(bad)).toThrow(/no license recorded/);
  });
});
