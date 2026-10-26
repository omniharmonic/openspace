import { blocksRegistry } from "@openspace/blocks";
import type { MediaMeta } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { markdocPlainText, markdocToBlocks } from "./markdoc";

const media: Record<string, MediaMeta> = {
  "media/a.jpg": {
    id: "med_a000000001",
    path: "media/a.jpg",
    kind: "image",
    mime: "image/jpeg",
    bytes: 10,
    width: 1200,
    height: 800,
    alt: "A sunlit room",
    createdAt: "2026-10-20T15:04:05Z",
  },
};
const opts = { registry: blocksRegistry(), media, idSeed: "journal/x" };

describe("markdocToBlocks", () => {
  it("maps tags 1:1 to blocks and prose to text blocks", () => {
    const body = `We're finally in the **new space**.

## The first week

- Foundations at 8
- Restorative on Wednesday

{% gallery layout="grid" images=["media/a.jpg", "https://images.unsplash.com/photo-1?w=1600"] /%}

{% button href="/schedule" variant="primary" %}See the schedule{% /button %}

Last words.
`;
    const { blocks, issues } = markdocToBlocks(body, opts);
    expect(issues).toEqual([]);
    expect(blocks.map((b) => b.type)).toEqual(["text", "gallery", "button", "text"]);
    const [text, gallery, button] = blocks;
    expect(JSON.stringify(text?.fields)).toContain('"type":"bulletList"');
    expect(JSON.stringify(text?.fields)).toContain('"marks":[{"type":"bold"}]');
    expect(gallery?.variant).toBe("grid");
    expect((gallery?.fields.images as { image: unknown }[] | undefined)?.[0]?.image).toEqual({
      src: "media/a.jpg",
      alt: "A sunlit room",
      width: 1200,
      height: 800,
    });
    // `variant="primary"` isn't a button variant, so it fills the select that has it (role).
    expect(button?.fields).toMatchObject({
      label: "See the schedule",
      link: { type: "url", url: "/schedule" },
      role: "primary",
    });
    expect(button?.variant).toBeUndefined();
  });

  it("is deterministic and honours explicit ids", () => {
    const body = '{% spacer /%}\n\n{% spacer id="blk_abcdefghjk" /%}\n';
    const a = markdocToBlocks(body, opts).blocks;
    const b = markdocToBlocks(body, opts).blocks;
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a[0]?.id).toMatch(/^blk_[0-9a-hjkmnp-tv-z]{10}$/);
    expect(a[1]?.id).toBe("blk_abcdefghjk");
    expect(markdocToBlocks(body, { ...opts, idSeed: "other" }).blocks[0]?.id).not.toBe(a[0]?.id);
  });

  it("turns a lone Markdown image into an image block and --- into a line", () => {
    const { blocks } = markdocToBlocks("![Morning class](media/a.jpg)\n\n---\n\nText.\n", opts);
    expect(blocks.map((b) => b.type)).toEqual(["image", "line", "text"]);
    expect(blocks[0]?.fields.image).toMatchObject({ src: "media/a.jpg", alt: "Morning class" });
  });

  it("fills a block's rich text from multi-line tag content", () => {
    const { blocks, issues } = markdocToBlocks(
      '{% quote attribution="Maya" %}\nSlow is **smooth**.\n{% /quote %}\n',
      opts,
    );
    expect(issues).toEqual([]);
    expect(blocks[0]?.type).toBe("quote");
    expect(JSON.stringify(blocks[0]?.fields.quote)).toContain("smooth");
    expect(blocks[0]?.fields.attribution).toBe("Maya");
  });

  it("never injects optional demo defaults", () => {
    const { blocks } = markdocToBlocks('{% button href="/x" %}Go{% /button %}\n', opts);
    expect(blocks[0]?.fields.note).toBeUndefined();
    expect(blocks[0]?.fields.secondaryLabel).toBeUndefined();
  });

  it("reports unknown tags, fields and invalid values with line numbers", () => {
    const body =
      'Intro.\n\n{% carousel-of-doom /%}\n\n{% button href="/x" colour="red" %}Go{% /button %}\n\n{% button href="javascript:alert(1)" %}Bad{% /button %}\n';
    const { issues } = markdocToBlocks(body, opts);
    expect(issues[0]).toMatchObject({ line: 3 });
    expect(issues[0]?.message).toMatch(/Unknown block "carousel-of-doom"/);
    expect(issues.find((i) => i.line === 5)?.message).toMatch(/no field "colour"/);
    expect(issues.find((i) => i.line === 7)?.message).toMatch(/button: fields.link/);
  });

  it("summarises prose for feeds", () => {
    expect(markdocPlainText("Hello **world**.\n\n{% spacer /%}\n\nSecond para.\n")).toBe(
      "Hello world. Second para.",
    );
    expect(markdocPlainText("word ".repeat(100), 30).length).toBeLessThanOrEqual(30);
  });
});
