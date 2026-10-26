import { renderPageHtml, unregisterBlocks } from "@openspace/renderer";
import {
  COLOR_THEMES,
  HeaderSchema,
  isId,
  PresetRefSchema,
  type Section,
  SectionSchema,
  SiteDocumentSchema,
} from "@openspace/schema";
import { HtmlValidate } from "html-validate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { page, siteWith } from "../__fixtures__/site";
import { blocksRegistry, blocksStyleTag, registerAll } from "../index";
import {
  allPresets,
  blockHeadings,
  copyViolations,
  getPreset,
  headerPresets,
  PRESET_CATEGORIES,
  PRESET_IMAGE_CREDITS,
  presetCatalog,
  presetsIn,
  rectsOverlap,
  sectionPresets,
} from "./index";

beforeAll(() => registerAll());
afterAll(() => unregisterBlocks());

const validator = new HtmlValidate({
  extends: ["html-validate:recommended"],
  rules: {
    "no-inline-style": "off",
    "attribute-boolean-style": "off",
    "attribute-empty-style": "off",
    "void-style": "off",
    "no-trailing-whitespace": "off",
    "attr-case": "off",
    "long-title": "off",
    "no-redundant-role": "off",
    "doctype-style": "off",
    "prefer-native-element": "off",
    "no-implicit-button-type": "error",
    // Several sections on one test page each carry their own landmark-free headings; FAQ presets
    // each emit FAQPage JSON-LD, which is fine for validation.
  },
});

/** Ids (sections, blocks, forms) anywhere in a value. */
function idsIn(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string" && isId(value)) out.add(value);
  else if (Array.isArray(value)) for (const v of value) idsIn(v, out);
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) {
      if (isId(k)) out.add(k);
      idsIn(v, out);
    }
  return out;
}

describe("preset catalog", () => {
  it("has at least 90 section presets covering every doc 04 §6 category", () => {
    expect(sectionPresets.length).toBeGreaterThanOrEqual(90);
    for (const c of PRESET_CATEGORIES) expect(presetsIn(c).length, c).toBeGreaterThan(0);
    expect(headerPresets.length).toBe(8);
  });

  it("meets the MVP count in every category", () => {
    const mvp: Record<string, number> = {
      header: 4,
      hero: 6,
      about: 4,
      services: 4,
      features: 3,
      gallery: 4,
      testimonials: 3,
      pricing: 1,
      faq: 2,
      team: 1,
      stats: 1,
      logos: 1,
      cta: 3,
      contact: 3,
      newsletter: 2,
      blog: 1,
      events: 1,
      products: 1,
      footer: 3,
    };
    for (const [c, n] of Object.entries(mvp))
      expect(presetsIn(c as never).length, c).toBeGreaterThanOrEqual(n);
  });

  it("has at least 15 grid presets that layer blocks", () => {
    const layered = sectionPresets.filter((p) => p.layout === "grid" && p.overlap);
    expect(layered.length).toBeGreaterThanOrEqual(15);
    // and the flag is truthful
    for (const p of layered) {
      const s = p.build();
      if (s.layout.mode !== "grid") throw new Error(p.id);
      const rects = Object.values(s.layout.items).map((i) => i.d);
      expect(
        rects.some((a, i) => rects.some((b, j) => j > i && rectsOverlap(a, b))),
        p.id,
      ).toBe(true);
    }
  });

  it("ids are unique, well formed and resolvable", () => {
    const ids = allPresets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of allPresets) {
      expect(PresetRefSchema.safeParse(p.id).success, p.id).toBe(true);
      expect(p.id).toBe(`${p.category}/${p.name}@${p.version}`);
      expect(getPreset(p.id)).toBe(p);
    }
    expect(getPreset("hero/nope@1")).toBeUndefined();
  });

  it("metadata is complete and JSON-serializable", () => {
    expect(JSON.parse(JSON.stringify(presetCatalog))).toEqual(presetCatalog);
    for (const m of presetCatalog) {
      expect(m.label.length, m.id).toBeGreaterThan(2);
      expect(m.description.length, m.id).toBeGreaterThan(20);
      expect(m.ai.purpose && m.ai.whenToUse && m.ai.avoid, m.id).toBeTruthy();
      expect(m.themes.length, m.id).toBeGreaterThan(0);
      expect(m.themes).toContain(m.defaultTheme);
      expect("build" in m).toBe(false);
      for (const rule of m.copy) expect(rule.words[0]).toBeLessThanOrEqual(rule.words[1]);
    }
  });

  it("declares image slots and copy rules for what each preset contains", () => {
    for (const p of sectionPresets) {
      const s = p.build();
      const json = JSON.stringify(s.blocks);
      const photos = /"src":"https:\/\/images/.test(json) || s.style.background?.type === "image";
      const headings =
        s.blocks.flatMap(blockHeadings).length +
        s.blocks.filter((b) => b.fields.heading && typeof b.fields.heading === "string").length;
      const headingRule = p.copy.some(
        (r) =>
          r.target.kind === "heading" ||
          (r.target.kind === "field" && r.target.field === "heading"),
      );
      if (photos) expect(p.images.length, `${p.id} images`).toBeGreaterThan(0);
      if (headings) expect(headingRule, `${p.id} heading copy rule`).toBe(true);
      if (s.blocks.some((b) => b.type === "text"))
        expect(
          p.copy.some((r) => r.target.kind === "body"),
          `${p.id} body copy rule`,
        ).toBe(true);
    }
  });

  it("designed-for themes reflect real suitability", () => {
    for (const p of sectionPresets) {
      const s = p.build();
      if (s.style.background?.type === "image")
        expect(p.themes, p.id).toEqual(["dark", "dark-accent"]);
      if (["pricing", "faq", "contact", "blog", "events", "products", "team"].includes(p.category))
        expect(p.themes, p.id).not.toContain("brand");
    }
    const hero = getPreset("hero/centered@1");
    expect(hero?.themes).toContain("brand");
  });

  it("demo copy is real (no lorem ipsum, no placeholders)", () => {
    const text = JSON.stringify(sectionPresets.map((p) => p.build()));
    expect(
      text.match(/.{40}\b(?:lorem|ipsum|TODO|TBD|placeholder text|Juniper Yoga)\b.{20}/i),
    ).toBeNull();
  });
});

describe("building", () => {
  it("every preset builds a schema-valid section whose blocks validate", () => {
    const registry = blocksRegistry();
    for (const p of sectionPresets) {
      const s = p.build();
      const parsed = SectionSchema.safeParse(s);
      expect(parsed.success ? [] : parsed.error.issues.slice(0, 3), p.id).toEqual([]);
      expect(s.preset).toBe(p.id);
      expect(s.style.colorTheme).toBe(p.defaultTheme);
      for (const b of s.blocks) {
        const v = registry.validate(b);
        expect(v.success ? [] : v.issues, `${p.id} ${b.type}`).toEqual([]);
      }
      expect(copyViolations(s, p.copy), p.id).toEqual([]);
    }
  });

  it("grid presets ship designed mobile placements", () => {
    for (const p of sectionPresets) {
      const s = p.build();
      if (s.layout.mode !== "grid") continue;
      for (const [id, item] of Object.entries(s.layout.items))
        expect(item.m, `${p.id} ${id}`).toBeDefined();
    }
  });

  it("every build has fresh ids (sections, blocks, forms)", () => {
    for (const p of sectionPresets) {
      const a = idsIn(p.build());
      const b = idsIn(p.build());
      for (const id of a) expect(b.has(id), `${p.id} reused ${id}`).toBe(false);
    }
    const forms = sectionPresets
      .flatMap((p) => p.build().blocks)
      .filter((b) => b.type === "form")
      .map((b) => (b.fields.form as { id: string }).id);
    expect(forms.length).toBeGreaterThan(0);
    for (const id of forms) expect(isId(id, "frm")).toBe(true);
    expect(new Set(forms).size).toBe(forms.length);
  });

  it("honours build options", () => {
    const p = getPreset("hero/split-image@1");
    if (!p || p.target === "header") throw new Error("missing");
    const s = p.build({ colorTheme: "dark", primaryLink: { type: "url", url: "/book-now" } });
    expect(s.style.colorTheme).toBe("dark");
    expect(JSON.stringify(s)).toContain("/book-now");
  });

  it("header presets produce valid site headers covering all eight layouts", () => {
    const variants = new Set<string>();
    for (const p of headerPresets) {
      const h = p.build();
      expect(HeaderSchema.safeParse(h).success, p.id).toBe(true);
      variants.add(h.variant);
    }
    expect(variants.size).toBe(8);
  });

  it("footer presets work as the site footer", () => {
    const footers = sectionPresets.filter((p) => p.target === "footer");
    expect(footers.length).toBeGreaterThanOrEqual(3);
    for (const f of footers) {
      const doc = siteWith([page("Home", "", [])]);
      doc.site.footer = f.build();
      const parsed = SiteDocumentSchema.safeParse(doc);
      expect(parsed.success ? [] : parsed.error.issues.slice(0, 3), f.id).toEqual([]);
      const html = renderPageHtml({ doc, pageId: Object.keys(doc.pages)[0] as string });
      for (const b of doc.site.footer.blocks) expect(html, f.id).toContain(`data-os-id="${b.id}"`);
    }
  });

  it("every demo photo URL is credited", () => {
    const credited = new Set(PRESET_IMAGE_CREDITS.map((c) => c.id));
    const urls = JSON.stringify(sectionPresets.map((p) => p.build())).match(
      /https:\/\/images\.unsplash\.com\/photo-[0-9a-f-]+/g,
    );
    expect(urls?.length).toBeGreaterThan(50);
    for (const u of urls ?? []) expect(credited.has(u.replace(/^.*photo-/, "")), u).toBe(true);
    for (const c of PRESET_IMAGE_CREDITS) {
      expect(c.license).toBe("Unsplash License");
      expect(c.author.length, c.key).toBeGreaterThan(1);
      expect(c.authorUrl).toMatch(/^https:\/\/unsplash\.com\/@[\w-]+$/);
      expect(c.pageUrl).toMatch(/^https:\/\/unsplash\.com\/photos\/[\w-]+$/);
    }
  });
});

describe("rendering in every color theme", () => {
  const pages = COLOR_THEMES.map((t) =>
    page(
      `Theme ${t}`,
      `theme-${t}`,
      sectionPresets.map((p): Section => p.build({ colorTheme: t })),
    ),
  );
  const doc = siteWith(pages);

  it("the five theme pages form a valid site document", () => {
    const parsed = SiteDocumentSchema.safeParse(doc);
    expect(parsed.success ? [] : parsed.error.issues.slice(0, 5)).toEqual([]);
  });

  for (const p of pages) {
    it(`${p.slug}: renders without html-validate findings`, async () => {
      const html = renderPageHtml({
        doc,
        pageId: p.id,
        mode: "production",
        extraHead: blocksStyleTag(),
      });
      expect(html).not.toContain('class="os-block-missing"');
      for (const s of p.sections)
        for (const b of s.blocks) expect(html).toContain(`data-os-id="${b.id}"`);
      const report = await validator.validateString(html);
      const messages = report.results.flatMap((r) =>
        r.messages.map((m) => `${m.ruleId}: ${m.message} — ${m.selector ?? ""}`),
      );
      expect(messages).toEqual([]);
    }, 60_000);
  }
});
