import { type GridLayout, newId, type SiteDocument } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { stackSection, stampOp, textBlock } from "./__fixtures__/arbitrary";
import { IDS, siteFixture } from "./__fixtures__/site";
import { apply, applyAll } from "./apply";
import { OpError } from "./doc";
import { invert, invertAll } from "./invert";
import { OP_TYPES, type Op, type OpBody, parseOp } from "./ops";
import { deepEqual } from "./paths";
import { validate, validateAll, validateDocument } from "./validate";

const home = IDS.home as `pg_${string}`;
const about = IDS.about as `pg_${string}`;
const hero = IDS.hero as `sec_${string}`;
const grid = IDS.grid as `sec_${string}`;

function ok(doc: SiteDocument, body: OpBody): { doc: SiteDocument; op: Op } {
  const op = stampOp(body);
  const r = validate(doc, op);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  // Every accepted op must round-trip through invert.
  const back = apply(r.doc, invert(doc, op));
  expect(deepEqual(back, doc)).toBe(true);
  return { doc: r.doc, op };
}

function errors(doc: SiteDocument, body: OpBody | unknown) {
  const r = validate(doc, stampOp(body as OpBody));
  if (r.ok) throw new Error("expected the op to be rejected");
  return r.errors;
}

const gridLayout = (doc: SiteDocument): GridLayout =>
  doc.pages[home]?.sections[1]?.layout as GridLayout;

describe("op vocabulary", () => {
  it("covers every op the architecture lists, plus collectionConfig.upsert", () => {
    expect(OP_TYPES.sort()).toEqual(
      [
        "block.update",
        "block.insert",
        "block.move",
        "block.delete",
        "grid.place",
        "section.insert",
        "section.move",
        "section.delete",
        "section.update",
        "styles.patch",
        "page.create",
        "page.update",
        "page.delete",
        "nav.update",
        "site.update",
        "media.add",
        "media.remove",
        "collection.upsert",
        "collection.delete",
        "collectionConfig.upsert",
      ].sort(),
    );
  });

  it("parses ops from JSON and rejects malformed ones", () => {
    const op = stampOp({
      op: "block.update",
      page: home,
      block: IDS.heading,
      set: { caption: "Hi" },
    });
    const parsed = parseOp(JSON.parse(JSON.stringify(op)));
    expect(parsed.ok).toBe(true);
    expect(parseOp({ ...op, block: "blk_short" }).ok).toBe(false);
    expect(parseOp({ ...op, extra: 1 }).ok).toBe(false);
    expect(parseOp({ op: "block.update", page: home, block: IDS.heading }).ok).toBe(false); // no meta
    expect(parseOp({ ...op, op: "page.rename" }).ok).toBe(false);
  });
});

describe("apply / invert / validate", () => {
  it("is immutable and shares untouched structure", () => {
    const doc = siteFixture();
    const snapshot = JSON.stringify(doc);
    const { doc: next } = ok(doc, { op: "page.update", page: about, set: { title: "Our story" } });
    expect(JSON.stringify(doc)).toBe(snapshot);
    expect(next.pages[about]?.title).toBe("Our story");
    expect(next.pages[home]).toBe(doc.pages[home]);
    expect(next.styles).toBe(doc.styles);
  });

  it("block.update sets/unsets fields and props", () => {
    const doc = siteFixture();
    const { doc: next } = ok(doc, {
      op: "block.update",
      page: home,
      block: IDS.button,
      set: { label: "Reserve a mat" },
      unset: ["variant"],
      style: { radius: "full" },
    });
    const b = next.pages[home]?.sections[0]?.blocks[1];
    expect(b?.fields.label).toBe("Reserve a mat");
    expect(b?.fields.variant).toBeUndefined();
    expect(b?.style).toEqual({ radius: "full" });
    expect(
      errors(doc, { op: "block.update", page: about, block: IDS.button, set: { a: 1 } })[0]
        ?.message,
    ).toMatch(/not on page/);
  });

  it("block.update edits footer blocks", () => {
    const doc = siteFixture();
    const { doc: next } = ok(doc, {
      op: "block.update",
      page: "footer",
      block: IDS.footerText,
      set: { tone: "quiet" },
    });
    expect(next.site.footer.blocks[0]?.fields.tone).toBe("quiet");
  });

  it("block.insert into a stack section at a position", () => {
    const doc = siteFixture();
    const id = newId("blk");
    const { doc: next } = ok(doc, {
      op: "block.insert",
      page: home,
      section: hero,
      at: { after: IDS.heading },
      block: textBlock(id, "Since 2012", 0),
    });
    expect(next.pages[home]?.sections[0]?.blocks.map((b) => b.id)).toEqual([
      IDS.heading,
      id,
      IDS.button,
      IDS.image,
    ]);
    expect(
      errors(doc, {
        op: "block.insert",
        page: home,
        section: hero,
        at: 9,
        block: textBlock(newId("blk"), "x"),
      })[0]?.message,
    ).toMatch(/out of range/);
  });

  it("block.insert into a grid auto-places at the bottom and raises rows; invert restores rows", () => {
    const doc = siteFixture();
    const id = newId("blk");
    const { doc: next, op } = ok(doc, {
      op: "block.insert",
      page: home,
      section: grid,
      at: "end",
      block: textBlock(id, "New"),
    });
    const layout = gridLayout(next);
    expect(layout.items[id]?.d).toEqual({ x: 1, y: 15, w: 12, h: 4 });
    expect(layout.items[id]?.m).toEqual({ x: 1, y: 18, w: 8, h: 4 });
    expect(layout.rows).toEqual({ d: 18, m: 22 });
    expect(invert(doc, op)).toMatchObject({ op: "block.delete", rows: { d: 16, m: 22 } });
  });

  it("grid.place raises rows only for the affected breakpoint, and invert restores them", () => {
    const doc = siteFixture();
    const { doc: next, op } = ok(doc, {
      op: "grid.place",
      page: home,
      section: grid,
      block: IDS.c1,
      bp: "m",
      rect: { x: 1, y: 30, w: 8, h: 5 },
    });
    expect(gridLayout(next).rows).toEqual({ d: 16, m: 34 });
    expect(invert(doc, op)).toMatchObject({
      rect: { x: 1, y: 1, w: 8, h: 9 },
      rows: { d: 16, m: 22 },
    });
    // desktop placement raises desktop rows; tablet inherits
    const { doc: d2 } = ok(doc, {
      op: "grid.place",
      page: home,
      section: grid,
      block: IDS.c1,
      bp: "d",
      rect: { x: 1, y: 20, w: 4, h: 2 },
    });
    expect(gridLayout(d2).rows).toEqual({ d: 21, m: 22 });
    // tablet override, then removing it
    const { doc: t } = ok(doc, {
      op: "grid.place",
      page: home,
      section: grid,
      block: IDS.c1,
      bp: "t",
      rect: { x: 2, y: 1, w: 4, h: 2 },
    });
    expect(gridLayout(t).items[IDS.c1 as `blk_${string}`]?.t).toEqual({ x: 2, y: 1, w: 4, h: 2 });
    const { doc: t2 } = ok(t, {
      op: "grid.place",
      page: home,
      section: grid,
      block: IDS.c1,
      bp: "t",
      rect: null,
    });
    expect(gridLayout(t2).items[IDS.c1 as `blk_${string}`]?.t).toBeUndefined();
  });

  it("grid.place rejects overflowing columns, stack sections and removing desktop", () => {
    const doc = siteFixture();
    expect(
      errors(doc, {
        op: "grid.place",
        page: home,
        section: grid,
        block: IDS.c1,
        bp: "m",
        rect: { x: 5, y: 1, w: 8, h: 1 },
      })[0]?.message,
    ).toMatch(/overflows/);
    expect(
      errors(doc, {
        op: "grid.place",
        page: home,
        section: hero,
        block: IDS.heading,
        bp: "d",
        rect: { x: 1, y: 1, w: 1, h: 1 },
      })[0]?.message,
    ).toMatch(/not a grid/);
    expect(
      errors(doc, {
        op: "grid.place",
        page: home,
        section: grid,
        block: IDS.c1,
        bp: "d",
        rect: null,
      })[0]?.message,
    ).toMatch(/desktop/);
  });

  it("block.move between stack and grid sections keeps everything valid and invertible", () => {
    const doc = siteFixture();
    // stack → grid: placed at the bottom, rows raised
    const { doc: a } = ok(doc, {
      op: "block.move",
      page: home,
      block: IDS.image,
      to: { section: grid, at: 0 },
    });
    expect(gridLayout(a).items[IDS.image as `blk_${string}`]).toBeDefined();
    expect(a.pages[home]?.sections[1]?.blocks[0]?.id).toBe(IDS.image);
    // grid → stack: placement removed, column clamped into range
    const { doc: b } = ok(doc, {
      op: "block.move",
      page: home,
      block: IDS.c2,
      to: { section: hero, at: "end", column: 1 },
    });
    expect(gridLayout(b).items[IDS.c2 as `blk_${string}`]).toBeUndefined();
    expect(b.pages[home]?.sections[0]?.blocks.at(-1)).toMatchObject({ id: IDS.c2, column: 1 });
    // within a section: reorder
    const { doc: c } = ok(doc, {
      op: "block.move",
      page: home,
      block: IDS.image,
      to: { section: hero, at: 0 },
    });
    expect(c.pages[home]?.sections[0]?.blocks.map((x) => x.id)).toEqual([
      IDS.image,
      IDS.heading,
      IDS.button,
    ]);
    // block.move stays within one page; cross-page moves are delete + insert
    const aboutSection = doc.pages[about]?.sections[0]?.id as `sec_${string}`;
    const r = validate(
      doc,
      stampOp({
        op: "block.move",
        page: home,
        block: IDS.image,
        to: { section: aboutSection, at: 0 },
      }),
    );
    expect(r.ok).toBe(false); // sections on other pages are not reachable by block.move
  });

  it("block.delete removes grid placements; invert restores block, placement and position", () => {
    const doc = siteFixture();
    const { doc: next, op } = ok(doc, { op: "block.delete", page: home, block: IDS.c1 });
    expect(gridLayout(next).items[IDS.c1 as `blk_${string}`]).toBeUndefined();
    expect(invert(doc, op)).toMatchObject({
      op: "block.insert",
      section: grid,
      at: 0,
      place: { d: { x: 1, y: 1, w: 10, h: 8 } },
    });
  });

  it("section ops insert, move, update and delete", () => {
    const doc = siteFixture();
    const sec = newId("sec");
    const { doc: a } = ok(doc, {
      op: "section.insert",
      page: home,
      at: "start",
      section: stackSection(sec, [textBlock(newId("blk"), "Hi")]),
    });
    expect(a.pages[home]?.sections[0]?.id).toBe(sec);
    const { doc: b } = ok(a, { op: "section.move", page: home, section: sec, at: "end" });
    expect(b.pages[home]?.sections.at(-1)?.id).toBe(sec);
    const { doc: c } = ok(b, {
      op: "section.update",
      page: home,
      section: sec,
      set: { label: "Intro", "style.colorTheme": "dark" },
    });
    expect(c.pages[home]?.sections.at(-1)).toMatchObject({
      label: "Intro",
      style: { colorTheme: "dark" },
    });
    const { doc: d } = ok(c, { op: "section.delete", page: home, section: sec });
    expect(d.pages[home]?.sections.map((s) => s.id)).toEqual([hero, grid]);
    expect(
      errors(doc, { op: "section.update", page: home, section: hero, set: { blocks: [] } })[0]
        ?.message,
    ).toMatch(/section\/block ops/);
    expect(
      errors(doc, {
        op: "section.update",
        page: home,
        section: hero,
        set: { "style.colorTheme": "neon" },
      }).length,
    ).toBeGreaterThan(0);
    expect(
      errors(doc, { op: "section.delete", page: "footer", section: IDS.footer } as never),
    ).toBeDefined();
  });

  it("section.update can switch a section to grid only with valid placements", () => {
    const doc = siteFixture();
    const errs = errors(doc, {
      op: "section.update",
      page: home,
      section: hero,
      set: { layout: { mode: "grid", rows: { d: 4 }, items: {} } },
    });
    expect(errs.some((e) => /no grid placement/.test(e.message))).toBe(true);
  });

  it("rejects ids that already exist anywhere in the document", () => {
    const doc = siteFixture();
    expect(
      errors(doc, {
        op: "block.insert",
        page: about,
        section: doc.pages[about]?.sections[0]?.id,
        at: 0,
        block: textBlock(IDS.heading as `blk_${string}`, "dup"),
      })[0]?.message,
    ).toMatch(/already used/);
    expect(
      errors(doc, { op: "section.insert", page: about, at: 0, section: stackSection(hero, []) })[0]
        ?.message,
    ).toMatch(/already used/);
  });

  it("styles.patch sets nested tokens; invert removes created parents", () => {
    const doc = siteFixture();
    const { doc: next, op } = ok(doc, {
      op: "styles.patch",
      patch: {
        set: {
          "overrides.space.section": { $value: "6rem", $type: "dimension" },
          "choices.palette.brand": "#225544",
        },
      },
    });
    expect(next.styles.overrides?.space).toEqual({
      section: { $value: "6rem", $type: "dimension" },
    });
    expect(invert(doc, op)).toMatchObject({
      patch: {
        unset: ["overrides.space"],
        set: { "choices.palette.brand": "oklch(0.62 0.09 145)" },
      },
    });
    expect(
      errors(doc, { op: "styles.patch", patch: { set: { "choices.density": "cramped" } } }).length,
    ).toBeGreaterThan(0);
    expect(
      errors(doc, {
        op: "styles.patch",
        patch: { set: { choices: {}, "choices.density": "airy" } },
      })[0]?.message,
    ).toMatch(/Overlapping/);
    expect(
      errors(doc, { op: "styles.patch", patch: { set: { "overrides.__proto__.x": 1 } } })[0]
        ?.message,
    ).toMatch(/Forbidden/);
  });

  it("page.create / page.update / page.delete with navigation", () => {
    const doc = siteFixture();
    const id = newId("pg");
    const page = { id, title: "Schedule", slug: "schedule", sections: [] };
    const { doc: a } = ok(doc, {
      op: "page.create",
      page,
      nav: [...doc.site.nav, { type: "page", page: id }],
    });
    expect(a.site.nav.at(-1)).toEqual({ type: "page", page: id });
    expect(
      errors(doc, { op: "page.create", page: { ...page, id: newId("pg"), slug: "about" } })[0]
        ?.message,
    ).toMatch(/Slug/);
    const { doc: b } = ok(a, {
      op: "page.update",
      page: id,
      set: { "seo.description": "Weekly classes" },
    });
    expect(b.pages[id]?.seo).toEqual({ description: "Weekly classes" });
    expect(errors(a, { op: "page.update", page: id, set: { slug: "about" } })[0]?.message).toMatch(
      /also used/,
    );
    expect(
      errors(a, { op: "page.update", page: id, set: { id: newId("pg") } })[0]?.message,
    ).toMatch(/ids never change/);
    // deleting a page still in navigation is rejected (dangling reference)…
    expect(errors(b, { op: "page.delete", page: id })[0]?.message).toMatch(/missing page/);
    // …unless the same op rewrites navigation
    const { doc: c } = ok(b, { op: "page.delete", page: id, nav: doc.site.nav });
    expect(c.pages[id]).toBeUndefined();
  });

  it("page.delete warns about content links to the deleted page", () => {
    const doc = siteFixture();
    // drop About from nav + announcement first
    const nav = doc.site.nav.filter(
      (i) => i.type !== "folder" && !(i.type === "page" && i.page === about),
    );
    let cur = ok(doc, { op: "nav.update", tree: nav }).doc;
    cur = ok(cur, { op: "site.update", unset: ["announcement"] }).doc;
    const r = validate(cur, stampOp({ op: "page.delete", page: about }));
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.warnings.map((w) => w.path.join("."))).toEqual([
        `pages.${home}.sections.0.blocks.1.fields.link`,
      ]);
  });

  it("nav.update rejects links to missing pages; site.update protects nav", () => {
    const doc = siteFixture();
    expect(
      errors(doc, { op: "nav.update", tree: [{ type: "page", page: newId("pg") }] })[0]?.message,
    ).toMatch(/missing page/);
    expect(errors(doc, { op: "site.update", set: { nav: [] } })[0]?.message).toMatch(/nav.update/);
    const { doc: next } = ok(doc, {
      op: "site.update",
      set: { "header.sticky": false, tagline: "Breathe in" },
    });
    expect(next.site.header.sticky).toBe(false);
  });

  it("site.update replacing the footer keeps ids unique", () => {
    const doc = siteFixture();
    const footer = stackSection(newId("sec"), [textBlock(IDS.heading as `blk_${string}`, "dup")]);
    expect(errors(doc, { op: "site.update", set: { footer } })[0]?.message).toMatch(/used in both/);
  });

  it("media.add / media.remove", () => {
    const doc = siteFixture();
    const path = "media/2026/11/mat.jpg";
    const meta = {
      id: newId("med"),
      path,
      kind: "image" as const,
      mime: "image/jpeg",
      bytes: 10,
      width: 4,
      height: 3,
      createdAt: "2026-11-01T00:00:00Z",
    };
    const { doc: a } = ok(doc, { op: "media.add", path, meta });
    expect(a.media[path]).toEqual(meta);
    expect(
      errors(doc, { op: "media.add", path, meta: { ...meta, id: IDS.media } })[0]?.message,
    ).toMatch(/already used/);
    expect(
      errors(doc, { op: "media.add", path, meta: { ...meta, path: "media/x.jpg" } })[0]?.message,
    ).toMatch(/does not match/);
    expect(
      errors(doc, { op: "media.add", path, meta: { ...meta, width: undefined } }).length,
    ).toBeGreaterThan(0);
    const r = validate(doc, stampOp({ op: "media.remove", path: "media/2026/10/hero-k3f9.jpg" }));
    expect(r.ok && r.warnings.length).toBeGreaterThan(0);
  });

  it("collection.upsert / delete and collectionConfig.upsert", () => {
    const doc = siteFixture();
    const item = {
      kind: "blog" as const,
      slug: "first-retreat",
      frontmatter: { title: "First retreat", date: "2026-11-02", status: "draft" as const },
      body: "Soon.\n",
    };
    const { doc: a } = ok(doc, { op: "collection.upsert", collection: "journal", item });
    expect(a.collections.journal?.["first-retreat"]).toEqual(item);
    // a new collection appears with its first item and disappears with its last
    const { doc: b, op } = ok(doc, { op: "collection.upsert", collection: "notes", item });
    expect(invert(doc, op)).toMatchObject({ op: "collection.delete", collection: "notes" });
    expect(b.collections.notes).toBeDefined();
    const { doc: c } = ok(b, {
      op: "collection.delete",
      collection: "notes",
      slug: "first-retreat",
    });
    expect(c.collections.notes).toBeUndefined();
    // kind mismatch with the collection's settings
    const event = {
      kind: "events" as const,
      slug: "open-day",
      frontmatter: { title: "Open day", start: "2026-12-01", status: "published" as const },
      body: "",
    };
    expect(
      errors(doc, { op: "collection.upsert", collection: "journal", item: event }).map(
        (e) => e.message,
      ),
    ).toContain("Collection journal is a blog collection but open-day is events");
    const { doc: d } = ok(doc, {
      op: "collectionConfig.upsert",
      collection: "events",
      config: {
        kind: "events",
        label: "Events",
        list: { layout: "calendar", pageSize: 20, sort: "date-asc" },
      },
    });
    expect(d.collectionConfigs?.events?.label).toBe("Events");
    ok(d, { op: "collectionConfig.upsert", collection: "events", config: null });
    expect(
      errors(doc, {
        op: "collectionConfig.upsert",
        collection: "journal",
        config: {
          kind: "events",
          label: "J",
          list: { layout: "list", pageSize: 5, sort: "title" },
        },
      })[0]?.message,
    ).toMatch(/events collection/);
  });

  it("rejects non-JSON values", () => {
    const doc = siteFixture();
    const op = stampOp({
      op: "block.update",
      page: home,
      block: IDS.heading,
      set: { when: new Date() },
    });
    expect(validate(doc, op).ok).toBe(false);
  });

  it("applyAll, validateAll and invertAll", () => {
    const doc = siteFixture();
    const ops = [
      stampOp({ op: "page.update", page: about, set: { title: "Story" } }),
      stampOp({ op: "styles.patch", patch: { set: { "choices.motion": "none" } } }),
      stampOp({ op: "block.delete", page: home, block: IDS.c2 }),
    ];
    const v = validateAll(doc, ops);
    expect(v.ok).toBe(true);
    const next = applyAll(doc, ops);
    if (v.ok) expect(deepEqual(v.doc, next)).toBe(true);
    expect(deepEqual(applyAll(next, invertAll(doc, ops)), doc)).toBe(true);
    const bad = validateAll(doc, [...ops, ops[2] as Op]);
    expect(bad.ok === false && bad.index).toBe(3);
    expect(() => applyAll(doc, [ops[2] as Op, ops[2] as Op])).toThrow(OpError);
  });

  it("validateDocument checks the whole site", () => {
    expect(validateDocument(siteFixture()).ok).toBe(true);
    const broken = siteFixture();
    broken.site.nav.push({ type: "page", page: newId("pg") });
    expect(validateDocument(broken).ok).toBe(false);
  });
});
