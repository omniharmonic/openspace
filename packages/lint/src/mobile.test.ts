import { blocksRegistry, sectionPresets } from "@openspace/blocks";
import { applyAll, validate } from "@openspace/ops";
import { type GridItem, type GridRect, newId, SectionSchema } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { btn, gridSection, h, img, p, page, siteWith, stackSection } from "./__fixtures__/doc";
import {
  autoMobileLayout,
  autoMobileLayoutOps,
  designCheck,
  isTextBlock,
  mobileRowCount,
  readingOrder,
} from "./index";

const m = (items: Record<string, GridItem> | undefined, id: string): GridRect => {
  const rect = items?.[id]?.m;
  if (!rect) throw new Error(`no m rect for ${id}`);
  return rect;
};
const overlaps = (a: GridRect, b: GridRect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("readingOrder", () => {
  it("reads top-to-bottom, then left-to-right within a band", () => {
    const order = readingOrder([
      { id: "bottom", rect: { x: 1, y: 20, w: 24, h: 4 } },
      { id: "right", rect: { x: 13, y: 1, w: 12, h: 10 } },
      { id: "left", rect: { x: 1, y: 2, w: 12, h: 10 } }, // starts lower but shares the band
      { id: "middle", rect: { x: 7, y: 13, w: 12, h: 4 } },
    ]);
    expect(order.map((o) => o.id)).toEqual(["left", "right", "middle", "bottom"]);
  });

  it("keeps a text column in order beside a taller photo that starts higher", () => {
    const order = readingOrder([
      { id: "photo", rect: { x: 13, y: 1, w: 12, h: 20 } },
      { id: "eyebrow", rect: { x: 2, y: 3, w: 8, h: 2 } },
      { id: "heading", rect: { x: 1, y: 6, w: 11, h: 4 } },
      { id: "button", rect: { x: 2, y: 12, w: 5, h: 2 } },
    ]);
    expect(order.map((o) => o.id)).toEqual(["eyebrow", "heading", "button", "photo"]);
  });

  it("reads a slightly misaligned row of cards left to right", () => {
    const order = readingOrder([
      { id: "c", rect: { x: 17, y: 1, w: 8, h: 10 } },
      { id: "a", rect: { x: 1, y: 3, w: 8, h: 10 } },
      { id: "b", rect: { x: 9, y: 2, w: 8, h: 10 } },
    ]);
    expect(order.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("reads an aligned 2×2 grid row by row, and staggered columns column by column", () => {
    const grid = readingOrder([
      { id: "br", rect: { x: 13, y: 7, w: 12, h: 5 } },
      { id: "tl", rect: { x: 1, y: 1, w: 12, h: 5 } },
      { id: "bl", rect: { x: 1, y: 7, w: 12, h: 5 } },
      { id: "tr", rect: { x: 13, y: 1, w: 12, h: 5 } },
    ]);
    expect(grid.map((o) => o.id)).toEqual(["tl", "tr", "bl", "br"]);
    const staggered = readingOrder([
      { id: "tl", rect: { x: 1, y: 1, w: 12, h: 5 } },
      { id: "tr", rect: { x: 13, y: 3, w: 12, h: 5 } },
      { id: "bl", rect: { x: 1, y: 7, w: 12, h: 5 } },
      { id: "br", rect: { x: 13, y: 9, w: 12, h: 5 } },
    ]);
    expect(staggered.map((o) => o.id)).toEqual(["tl", "bl", "tr", "br"]);
  });

  it("starts a new band below a gap, even when a column continues", () => {
    const order = readingOrder([
      { id: "intro", rect: { x: 1, y: 1, w: 10, h: 4 } },
      { id: "photo", rect: { x: 13, y: 1, w: 12, h: 6 } },
      { id: "cta", rect: { x: 1, y: 9, w: 24, h: 3 } },
    ]);
    expect(order.map((o) => o.id)).toEqual(["intro", "photo", "cta"]);
  });

  it("does not depend on insertion order", () => {
    const items = [
      { id: "a", rect: { x: 1, y: 1, w: 8, h: 4 } },
      { id: "b", rect: { x: 9, y: 1, w: 8, h: 4 } },
      { id: "c", rect: { x: 1, y: 6, w: 8, h: 4 } },
    ];
    expect(readingOrder([...items].reverse()).map((o) => o.id)).toEqual(["a", "b", "c"]);
  });
});

describe("autoMobileLayout", () => {
  it("returns undefined for stack sections", () => {
    expect(autoMobileLayout(stackSection([p("Hello")]))).toBeUndefined();
  });

  it("stacks items full width on 8 columns by reading order, with a one-row gap", () => {
    const right = p("Right column words");
    const left = p("Left column words");
    const below = btn();
    // inserted out of visual order
    const s = gridSection([
      [below, { x: 1, y: 12, w: 6, h: 2 }],
      [right, { x: 13, y: 1, w: 12, h: 10 }],
      [left, { x: 1, y: 1, w: 12, h: 10 }],
    ]);
    const items = autoMobileLayout(s);
    expect(m(items, left.id)).toEqual({ x: 1, y: 1, w: 8, h: 12 });
    expect(m(items, right.id)).toEqual({ x: 1, y: 14, w: 8, h: 12 });
    expect(m(items, below.id).y).toBe(27);
    for (const r of Object.values(items ?? {})) expect(r.m?.w).toBe(8);
  });

  it("scales heights: media keeps its proportions, text keeps its pixel height", () => {
    const photo = img();
    const words = p("Some words");
    const s = gridSection([
      [photo, { x: 1, y: 1, w: 24, h: 20 }], // 1280 × 480 px → 350 px wide ≈ 131 px ≈ 7 rows
      [words, { x: 1, y: 22, w: 12, h: 10 }], // 240 px → 12 rows of 20 px
    ]);
    const items = autoMobileLayout(s);
    expect(m(items, photo.id).h).toBe(7);
    expect(m(items, words.id).h).toBe(12);
  });

  it("keeps a text panel layered over its photo instead of stacking it below", () => {
    const photo = img();
    const card = p("A caption card over the photograph");
    const s = gridSection([
      [photo, { x: 1, y: 1, w: 24, h: 20 }],
      [card, { x: 3, y: 12, w: 10, h: 12, z: 2 }], // 75% of the card sits on the photo
    ]);
    const items = autoMobileLayout(s);
    const pm = m(items, photo.id);
    const cm = m(items, card.id);
    expect(overlaps(pm, cm)).toBe(true);
    expect(cm.y).toBeGreaterThan(pm.y);
    expect(cm.y).toBeLessThan(pm.y + pm.h);
    expect(cm.z).toBe(2);
    expect(cm.w).toBe(8);
  });

  it("keeps a decorative shape layered proportionally behind an image", () => {
    const photo = img();
    const shape = blocksRegistry().get("shape")?.create() ?? img();
    const s = gridSection([
      [photo, { x: 5, y: 1, w: 12, h: 16, z: 2 }],
      [shape, { x: 3, y: 4, w: 10, h: 10, z: 1 }],
    ]);
    const items = autoMobileLayout(s);
    const sm = m(items, shape.id);
    expect(overlaps(m(items, photo.id), sm)).toBe(true);
    expect(sm.w).toBeLessThan(8);
    expect(sm.z).toBe(1);
  });

  it("only layers onto media: a small text block over a big text block stacks", () => {
    const big = p("A large block of text");
    const small = p("A small note");
    const s = gridSection([
      [big, { x: 1, y: 1, w: 24, h: 12 }],
      [small, { x: 3, y: 3, w: 6, h: 3, z: 2 }],
    ]);
    const items = autoMobileLayout(s);
    expect(overlaps(m(items, big.id), m(items, small.id))).toBe(false);
  });

  it("orders stacked items around a panel layered across two columns", () => {
    const photo = img();
    const words = p("Words in the left column");
    const panel = p("A panel over the photo");
    const s = gridSection([
      [photo, { x: 10, y: 1, w: 15, h: 24 }],
      [words, { x: 1, y: 3, w: 8, h: 6 }],
      [panel, { x: 8, y: 8, w: 10, h: 8, z: 2 }], // 70% on the photo, also touches the words column
    ]);
    const items = autoMobileLayout(s);
    expect(m(items, words.id).y).toBeLessThan(m(items, photo.id).y);
    expect(overlaps(m(items, photo.id), m(items, panel.id))).toBe(true);
  });

  it("stacks side-by-side images that overlap only a little", () => {
    const a = img();
    const b = img();
    const s = gridSection([
      [a, { x: 1, y: 1, w: 12, h: 16 }],
      [b, { x: 10, y: 10, w: 12, h: 16 }], // ~14% overlap
    ]);
    const items = autoMobileLayout(s);
    expect(overlaps(m(items, a.id), m(items, b.id))).toBe(false);
  });

  it("carries bleed over for media, never for text", () => {
    const photo = img();
    const words = p("Words beside it");
    const s = gridSection([
      [photo, { x: 1, y: 1, w: 12, h: 16, bleed: "left" }],
      [words, { x: 14, y: 1, w: 10, h: 8, bleed: "right" }],
    ]);
    const items = autoMobileLayout(s);
    expect(m(items, photo.id).bleed).toBe("both");
    expect(m(items, words.id).bleed).toBeUndefined();
  });

  it("preserves stored mobile placements unless reset", () => {
    const a = p("First");
    const b = p("Second");
    const s = gridSection([
      [a, { x: 1, y: 1, w: 12, h: 6 }, { x: 2, y: 1, w: 6, h: 5 }],
      [b, { x: 13, y: 1, w: 12, h: 6 }],
    ]);
    const kept = autoMobileLayout(s);
    expect(m(kept, a.id)).toEqual({ x: 2, y: 1, w: 6, h: 5 });
    expect(m(kept, b.id).y).toBe(7); // below the stored placement, after a gap
    const reset = autoMobileLayout(s, { reset: true });
    expect(m(reset, a.id)).toEqual({ x: 1, y: 1, w: 8, h: 7 });
  });

  it("never overlaps text on any preset when regenerated", () => {
    for (const preset of sectionPresets) {
      const section = preset.build();
      if (section.layout.mode !== "grid") continue;
      const items = autoMobileLayout(section, { reset: true });
      const text = section.blocks.filter(isTextBlock);
      for (let i = 0; i < text.length; i++)
        for (let j = i + 1; j < text.length; j++) {
          const a = m(items, (text[i] as { id: string }).id);
          const b = m(items, (text[j] as { id: string }).id);
          expect(overlaps(a, b), `${preset.id}: ${text[i]?.type} / ${text[j]?.type}`).toBe(false);
        }
      // and the result is a valid section
      const next = {
        ...section,
        layout: {
          ...section.layout,
          items: items ?? {},
          rows: { d: section.layout.rows.d, m: mobileRowCount(items ?? {}) },
        },
      };
      const parsed = SectionSchema.safeParse(next);
      expect(parsed.success ? [] : parsed.error.issues, preset.id).toEqual([]);
    }
  });
});

describe("autoMobileLayoutOps", () => {
  it("produces valid grid.place ops that store the generated layout", () => {
    const a = p("First block of words");
    const b = p("Second block of words");
    const section = gridSection([
      [a, { x: 1, y: 1, w: 10, h: 6 }, { x: 1, y: 1, w: 8, h: 6 }],
      [b, { x: 13, y: 1, w: 10, h: 6 }, { x: 1, y: 3, w: 8, h: 6 }],
    ]);
    const home = page("Home", "", [stackSection([h("Welcome to the studio", 1), btn()]), section]);
    let doc = siteWith([home]);
    expect(designCheck(doc).some((i) => i.rule === "overlapping-text")).toBe(true);
    const ops = autoMobileLayoutOps(doc, home.id, section.id, {
      reset: true,
      actor: "studio",
      now: 1,
    });
    expect(ops.length).toBeGreaterThan(0);
    for (const op of ops) {
      expect(op.op).toBe("grid.place");
      expect(op.actor).toBe("studio");
      const v = validate(doc, op);
      expect(v.ok ? [] : v.errors).toEqual([]);
      doc = applyAll(doc, [op]);
    }
    expect(designCheck(doc).some((i) => i.rule === "overlapping-text")).toBe(false);
    expect(() => autoMobileLayoutOps(doc, home.id, newId("sec"))).toThrow();
  });

  it("returns no ops for stack sections or unchanged layouts", () => {
    const s = stackSection([h("Welcome to the studio", 1)]);
    const home = page("Home", "", [s]);
    const doc = siteWith([home]);
    expect(autoMobileLayoutOps(doc, home.id, s.id)).toEqual([]);
  });
});
