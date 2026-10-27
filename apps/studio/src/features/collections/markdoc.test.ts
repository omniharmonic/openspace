import { blocksRegistry, rt } from "@omniharmonic/openspace-blocks";
import type { Block } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { demoCollections } from "../../api/growth-fixtures";
import { blocksToMarkdoc, freshBlock, markdocToEditorBlocks } from "./markdoc";

const strip = (blocks: Block[]) => blocks.map(({ id: _id, ...b }) => b);

describe("Markdoc bodies", () => {
  it("round-trips prose, tags, images and lines through site-kit's reader", () => {
    const blocks = [
      freshBlock("text", {
        content: rt.doc(rt.h(2, "Try it at home"), rt.p(["Breathe ", rt.bold("slowly"), "."])),
      }),
      freshBlock("quote", { quote: rt.doc(rt.p("You can't rush stillness.")), attribution: "Sam" }),
      freshBlock("button", {
        label: "Book",
        link: { type: "url", url: "https://example.com/book" },
      }),
      freshBlock("image", { image: { src: "media/2026/10/mat-0a1b2c3d.jpg", alt: "A mat" } }),
      freshBlock("line"),
      freshBlock("gallery", {
        images: [
          { image: { src: "https://example.com/a.jpg", alt: "A", width: 800, height: 600 } },
          { image: { src: "https://example.com/b.jpg", alt: "B", width: 800, height: 600 } },
        ],
      }),
      freshBlock("text", { content: rt.doc(rt.p("The end.")) }),
    ];
    const body = blocksToMarkdoc(blocks);
    expect(body).toContain("## Try it at home");
    expect(body).toContain("{% quote");
    expect(body).toContain("![A mat](media/2026/10/mat-0a1b2c3d.jpg)");
    expect(body).toContain("\n---\n");
    const back = markdocToEditorBlocks(body, { idSeed: "blog/x" });
    expect(back.issues).toEqual([]);
    const reg = blocksRegistry();
    for (const b of back.blocks) expect(reg.get(b.type)?.validate(b).success).toBe(true);
    expect(strip(back.blocks)).toEqual(strip(blocks));
  });

  it("reads every demo body without problems and writes it back", () => {
    const { collections } = demoCollections(Date.UTC(2026, 9, 26));
    for (const items of Object.values(collections))
      for (const item of Object.values(items)) {
        const r = markdocToEditorBlocks(item.body, { idSeed: item.slug });
        expect(r.issues, item.slug).toEqual([]);
        const again = markdocToEditorBlocks(blocksToMarkdoc(r.blocks), { idSeed: item.slug });
        expect(strip(again.blocks)).toEqual(strip(r.blocks));
      }
  });

  it("keeps prose from turning into tags", () => {
    const blocks = [freshBlock("text", { content: rt.doc(rt.p("Use {% braces %} freely")) })];
    const r = markdocToEditorBlocks(blocksToMarkdoc(blocks), { idSeed: "x" });
    expect(r.issues).toEqual([]);
    expect(r.blocks.map((b) => b.type)).toEqual(["text"]);
  });

  it("new blocks carry only required defaults (no demo copy)", () => {
    const img = freshBlock("image");
    expect(img.fields.caption).toBeUndefined();
    expect(img.id).toMatch(/^blk_/);
  });
});
