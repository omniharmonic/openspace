import { allPresets, getPreset } from "@omniharmonic/openspace-blocks";
import { GRID_COLUMNS, type GridLayout, SectionSchema } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { setLayoutMode } from "../editor/model/actions";
import { devSiteDocument, DEV_IDS as I } from "../editor/model/dev-site";
import { createEditorStore } from "../editor/model/store";
import {
  defaultGridPlace,
  insertBlockCommand,
  positionFromSelection,
  presetCommand,
  targetFromSelection,
} from "./insert";
import { filterPresets, matchesPreset } from "./PresetGallery";

const store = () => createEditorStore({ doc: devSiteDocument(), actor: "user:test" });

describe("preset insert", () => {
  it("inserts a page preset at the position, with its preset ref and fresh ids each time", () => {
    const s = store();
    const preset = getPreset("hero/split-image@1") ?? allPresets.find((p) => p.category === "hero");
    if (!preset) throw new Error("no hero preset");
    const page = () =>
      s.getState().doc.pages[I.home as never] as {
        sections: Array<{ id: string; preset?: string; blocks: Array<{ id: string }> }>;
      };
    const before = page().sections.length;
    const r1 = s.getState().run(presetCommand(s.getState().doc, I.home, preset, { after: I.hero }));
    const r2 = s.getState().run(presetCommand(s.getState().doc, I.home, preset, "end"));
    expect(r1.ok && r2.ok).toBe(true);
    const sections = page().sections;
    expect(sections.length).toBe(before + 2);
    const a = sections[1];
    const b = sections.at(-1);
    expect(a?.preset).toBe(preset.id);
    expect(a?.id).not.toBe(b?.id);
    expect(a?.blocks.map((x) => x.id)).not.toEqual(b?.blocks.map((x) => x.id));
    expect(SectionSchema.safeParse(a).success).toBe(true);
    // The new section is selected; undo removes it again.
    expect(s.getState().selection).toEqual([{ kind: "section", id: b?.id }]);
    s.getState().undo();
    s.getState().undo();
    expect(page().sections.length).toBe(before);
  });

  it("every page preset inserts cleanly into a real document", () => {
    const s = store();
    for (const p of allPresets.filter((x) => x.target === "page")) {
      const r = s.getState().run(presetCommand(s.getState().doc, I.home, p, "end"));
      expect(r.ok, p.id).toBe(true);
    }
  });

  it("header presets set the site header (keeping the logo size); footer presets replace the footer", () => {
    const s = store();
    const header = allPresets.find((p) => p.target === "header" && p.id.startsWith("header/split"));
    const footer = allPresets.find((p) => p.target === "footer");
    if (!header || !footer) throw new Error("presets missing");
    const logoHeight = s.getState().doc.site.header.logoHeight;
    expect(s.getState().run(presetCommand(s.getState().doc, I.home, header, "end")).ok).toBe(true);
    expect(s.getState().doc.site.header.variant).toBe("split-nav");
    expect(s.getState().doc.site.header.logoHeight).toEqual(logoHeight);
    const oldFooter = s.getState().doc.site.footer.id;
    expect(s.getState().run(presetCommand(s.getState().doc, I.home, footer, "end")).ok).toBe(true);
    expect(s.getState().doc.site.footer.id).not.toBe(oldFooter);
    expect(s.getState().doc.site.footer.preset).toBe(footer.id);
  });

  it("inserts after the selected section, else at the end", () => {
    const doc = devSiteDocument();
    expect(positionFromSelection(doc, I.home, [{ kind: "block", id: I.introText }])).toEqual({
      after: I.intro,
    });
    expect(positionFromSelection(doc, I.home, [])).toBe("end");
    expect(positionFromSelection(doc, I.home, [{ kind: "section", id: I.footer }])).toBe("end");
  });

  it("searches names, descriptions, tags and categories", () => {
    expect(filterPresets("", "faq").every((p) => p.category === "faq")).toBe(true);
    expect(filterPresets("testimonial", "all").length).toBeGreaterThan(0);
    const any = allPresets[0];
    if (any) expect(matchesPreset(any, any.label.toUpperCase())).toBe(true);
    expect(filterPresets("zzzz-nothing", "all")).toEqual([]);
  });
});

describe("block menu insert", () => {
  it("inserts into the selected block's stack column, right after it", () => {
    const s = store();
    const doc = s.getState().doc;
    const target = targetFromSelection(doc, I.home, [{ kind: "block", id: I.heroImage }]);
    expect(target).toMatchObject({ section: I.hero, after: I.heroImage });
    const r = s.getState().run(insertBlockCommand(doc, I.home, "quote", target as never));
    expect(r.ok).toBe(true);
    const hero = s.getState().doc.pages[I.home as never] as {
      sections: Array<{ id: string; blocks: Array<{ id: string; type: string; column?: number }> }>;
    };
    const blocks = hero.sections.find((x) => x.id === I.hero)?.blocks ?? [];
    const i = blocks.findIndex((b) => b.id === I.heroImage);
    const image = blocks[i];
    expect(blocks[i + 1]?.type).toBe("quote");
    expect(blocks[i + 1]?.column).toBe(image?.column);
    const sel = s.getState().selection[0];
    expect(sel?.kind).toBe("block");
  });

  it("gives every inserted form a fresh form id", () => {
    const s = store();
    const a = s
      .getState()
      .run(insertBlockCommand(s.getState().doc, I.home, "form", { section: I.intro }));
    const b = s
      .getState()
      .run(insertBlockCommand(s.getState().doc, I.home, "form", { section: I.intro }));
    expect(a.ok && b.ok).toBe(true);
    const ids = [a, b].map((r) => {
      const op = r.ok ? r.ops[0] : undefined;
      return (op as { block?: { fields: { form: { id: string } } } }).block?.fields.form.id;
    });
    expect(ids[0]).toMatch(/^frm_/);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).not.toBe("frm_c0ntact0ne");
  });

  it("places blocks in grid sections under everything, full width on phones", () => {
    const s = store();
    s.getState().run(setLayoutMode(s.getState().doc, I.home, I.intro, "grid"));
    const r = s
      .getState()
      .run(insertBlockCommand(s.getState().doc, I.home, "button", { section: I.intro }));
    expect(r.ok).toBe(true);
    const page = s.getState().doc.pages[I.home as never] as {
      sections: Array<{
        id: string;
        layout: GridLayout;
        blocks: Array<{ id: string; type: string }>;
      }>;
    };
    const sec = page.sections.find((x) => x.id === I.intro);
    const added = sec?.blocks.find((b) => b.type === "button");
    const item = sec?.layout.items[added?.id as never];
    expect(item?.m).toMatchObject({ x: 1, w: GRID_COLUMNS.m });
    const others = Object.entries(sec?.layout.items ?? {}).filter(([id]) => id !== added?.id);
    for (const [, o] of others) expect(item?.d.y).toBeGreaterThan(o.d.y + o.d.h - 1);
    expect(defaultGridPlace({ mode: "grid", rows: { d: 10, m: 20 }, items: {} }, 4)).toEqual({
      d: { x: 7, y: 11, w: 12, h: 4 },
      m: { x: 1, y: 21, w: 8, h: 4 },
    });
  });

  it("returns nothing for unknown blocks or sections", () => {
    const doc = devSiteDocument();
    expect(insertBlockCommand(doc, I.home, "no-such-block", { section: I.intro })).toBeNull();
    expect(insertBlockCommand(doc, I.home, "text", { section: "sec_zzzzzzzzzz" })).toBeNull();
  });
});

describe("block menu search", () => {
  it("ranks names over descriptions and needs every word", async () => {
    const { blockScore } = await import("./BlockMenu");
    expect(blockScore("Button button", "button", ["Buttons & links"])).toBe(1);
    expect(
      blockScore("Quote quote", "button", ["A pull quote or epigraph with attribution."]),
    ).toBe(0);
    expect(blockScore("Image image", "photo", ["A responsive photograph"])).toBeGreaterThan(0);
    expect(blockScore("Image image", "photo caption", ["A responsive photograph"])).toBe(0);
    expect(blockScore("Text text", "", [])).toBe(1);
  });
});
