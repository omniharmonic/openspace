import { getBlock, unregisterBlocks } from "@openspace/renderer";
import { BLOCK_CATEGORIES, isId } from "@openspace/schema";
import { allTokenVars } from "@openspace/theme";
import { icons } from "lucide";
import { afterAll, describe, expect, it } from "vitest";
import { gridSection, page, siteWith, stackSection } from "./__fixtures__/site";
import { allBlocks, BLOCKS_CSS, blocksRegistry, ICON_NAMES, registerAll } from "./index";

afterAll(() => unregisterBlocks());

const pascal = (kebab: string) =>
  kebab.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());

describe("block library", () => {
  it("has the P1 set with unique types", () => {
    const types = allBlocks.map((b) => b.type);
    expect(new Set(types).size).toBe(types.length);
    expect(types.length).toBeGreaterThanOrEqual(20);
    for (const t of [
      "text",
      "image",
      "button",
      "gallery",
      "video",
      "quote",
      "testimonial",
      "line",
      "spacer",
      "shape",
      "form",
      "newsletter",
      "map",
      "social-links",
      "share-buttons",
      "accordion",
      "embed",
      "logo-strip",
      "card",
      "icon-list",
      "columns",
    ])
      expect(types).toContain(t);
  });

  it("registerAll registers every block with the renderer", () => {
    registerAll();
    for (const def of allBlocks) expect(getBlock(def.type)).toBe(def);
  });

  it("the gallery offers all five layouts", () => {
    expect(blocksRegistry().get("gallery")?.variants).toEqual([
      "grid",
      "carousel",
      "masonry",
      "slideshow",
      "strips",
    ]);
  });

  for (const def of allBlocks) {
    describe(def.type, () => {
      it("validates its defaults in every variant", () => {
        const variants = def.variants.length ? def.variants : [undefined];
        for (const variant of variants) {
          const block = def.create(variant ? { variant } : {});
          expect(def.validate(block)).toMatchObject({ success: true });
          expect(blocksRegistry().validate(block)).toEqual({ success: true });
        }
      });

      it("has AI guidance, a label, a category and a Lucide icon", () => {
        expect(def.ai.purpose.length).toBeGreaterThan(20);
        expect(def.ai.whenToUse.length).toBeGreaterThan(20);
        expect(def.ai.avoid?.length ?? 0).toBeGreaterThan(10);
        expect(def.label.length).toBeGreaterThan(2);
        expect(def.description?.length ?? 0).toBeGreaterThan(10);
        expect(BLOCK_CATEGORIES).toContain(def.category);
        expect(Object.keys(icons)).toContain(pascal(def.icon));
      });

      it("has JSON-serializable metadata and real copy", () => {
        const json = JSON.stringify(def.meta);
        expect(JSON.parse(json)).toEqual(def.meta);
        expect(json).not.toMatch(
          /\blorem\b|\bipsum\b|dolor sit|placeholder text|\bTODO\b|\bTBD\b/i,
        );
      });

      it("declares only real style slots", () => {
        for (const slot of def.styleSlots) expect(slot).toMatch(/^[a-zA-Z]+(?:\.[a-zA-Z]+)?$/);
      });
    });
  }

  it("validates a whole document built from the library", () => {
    const pages = allBlocks.map((def) =>
      page(def.label, def.type, [stackSection([def.create()]), gridSection([def.create()])]),
    );
    expect(blocksRegistry().validateDocument(siteWith(pages))).toEqual([]);
  });

  it("ships a ~40-icon set where every icon renders", () => {
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(40);
  });
});

describe("form block guardrails", () => {
  const form = blocksRegistry().get("form");
  if (!form) throw new Error("form block missing");
  const base = form.create();
  const withField = (field: Record<string, unknown>) => {
    const value = structuredClone(base.fields.form) as { fields: unknown[] };
    value.fields.push(field);
    return { ...base, fields: { form: value } };
  };

  it("supports every FR-30 field type", () => {
    for (const field of [
      { type: "text", name: "company", label: "Company" },
      { type: "email", name: "work_email", label: "Work email" },
      { type: "phone", name: "mobile", label: "Mobile" },
      { type: "textarea", name: "notes", label: "Notes" },
      { type: "select", name: "size", label: "Group size", options: ["1", "2–5", "6+"] },
      { type: "checkbox", name: "days", label: "Days", options: ["Mon", "Wed"] },
      { type: "radio", name: "level", label: "Level", options: ["New", "Regular"] },
      { type: "date", name: "start", label: "Start date" },
    ])
      expect(form.validate(withField(field))).toMatchObject({ success: true });
  });

  it("forbids password and card-number fields", () => {
    for (const field of [
      { type: "password", name: "secret", label: "Secret" },
      { type: "card", name: "cc", label: "Card" },
      { type: "text", name: "card_number", label: "Card number" },
      { type: "text", name: "pwd", label: "Your password" },
    ])
      expect(form.validate(withField(field)).success).toBe(false);
  });

  it("uses a well-formed default form id", () => {
    expect(isId((base.fields.form as { id: string }).id, "frm")).toBe(true);
  });
});

describe("BLOCKS_CSS", () => {
  const known = new Set(allTokenVars());

  it("references only documented --os-* tokens and never declares them", () => {
    const used = [...BLOCKS_CSS.matchAll(/var\((--os-[a-z0-9-]+)/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(50);
    expect(used.filter((v) => !known.has(v as string))).toEqual([]);
    expect(BLOCKS_CSS).not.toMatch(/(?:^|[;{])\s*--os-[a-z0-9-]+\s*:/m);
  });

  it("uses theme colors only (no literal colors)", () => {
    expect(BLOCKS_CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/);
  });

  it("lives in the os.blocks layer and is balanced", () => {
    expect(BLOCKS_CSS).toContain("@layer os.blocks {");
    const opens = BLOCKS_CSS.split("{").length;
    const closes = BLOCKS_CSS.split("}").length;
    expect(opens).toBe(closes);
  });

  it("styles every block's root class", () => {
    for (const cls of [
      "os-text--columns",
      "os-image",
      "os-buttons",
      "os-gallery--masonry",
      "os-gallery--strips",
      "os-gallery--slideshow",
      "os-videoblock",
      "os-quote",
      "os-testimonial",
      "os-line",
      "os-spacer",
      "os-shape",
      "os-formblock",
      "os-newsletter",
      "os-map",
      "os-socialblock",
      "os-accordion",
      "os-embed",
      "os-logos",
      "os-cardblock",
      "os-iconlist",
      "os-columns",
    ])
      expect(BLOCKS_CSS).toContain(`.${cls}`);
  });
});
