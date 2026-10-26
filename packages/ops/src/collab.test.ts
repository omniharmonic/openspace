import { newId, type SiteDocument } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { stackSection, stampOp, textBlock } from "./__fixtures__/arbitrary";
import { IDS, siteFixture } from "./__fixtures__/site";
import { apply, applyAll } from "./apply";
import { diff } from "./diff";
import { invert } from "./invert";
import type { Op, OpBody } from "./ops";
import { deepEqual } from "./paths";
import { independent, rebase } from "./rebase";
import { isInverseOf, lockedSectionsOf, type Role, transformForRole } from "./roles";
import { stats, styleLabel, summarize } from "./summarize";

const home = IDS.home as `pg_${string}`;
const about = IDS.about as `pg_${string}`;
const hero = IDS.hero as `sec_${string}`;
const grid = IDS.grid as `sec_${string}`;

function lockedDoc(): SiteDocument {
  const doc = siteFixture();
  (doc.pages[home]?.sections[0] as { locked?: boolean }).locked = true;
  return doc;
}

const check = (body: OpBody, role: Role, doc: SiteDocument = lockedDoc()) =>
  transformForRole(stampOp(body), role, lockedSectionsOf(doc), { doc });

describe("transformForRole", () => {
  const item = {
    kind: "blog" as const,
    slug: "retreat-notes",
    frontmatter: { title: "Retreat notes", date: "2026-11-02", status: "draft" as const },
    body: "",
  };

  it("owners and designers may do everything", () => {
    for (const role of ["owner", "designer"] as const) {
      expect(
        check({ op: "styles.patch", patch: { set: { "choices.motion": "none" } } }, role).allowed,
      ).toBe(true);
      expect(check({ op: "block.delete", page: home, block: IDS.heading }, role).allowed).toBe(
        true,
      );
    }
  });

  it("editors: no styles, no grid.place, no section layout/style/lock changes", () => {
    expect(
      check({ op: "styles.patch", patch: { set: { "choices.motion": "none" } } }, "editor"),
    ).toMatchObject({ allowed: false });
    expect(
      check(
        {
          op: "grid.place",
          page: home,
          section: grid,
          block: IDS.c1,
          bp: "d",
          rect: { x: 1, y: 1, w: 2, h: 2 },
        },
        "editor",
      ).allowed,
    ).toBe(false);
    expect(
      check(
        { op: "section.update", page: home, section: grid, set: { "style.colorTheme": "light" } },
        "editor",
      ).allowed,
    ).toBe(false);
    expect(
      check(
        {
          op: "section.update",
          page: home,
          section: grid,
          set: { layout: { mode: "stack", columns: { d: [12] } } },
        },
        "editor",
      ).allowed,
    ).toBe(false);
    expect(
      check({ op: "section.update", page: home, section: grid, set: { locked: true } }, "editor")
        .allowed,
    ).toBe(false);
    expect(
      check(
        { op: "section.update", page: home, section: grid, set: { label: "Classes" } },
        "editor",
      ).allowed,
    ).toBe(true);
    expect(check({ op: "site.update", set: { customCss: "body{}" } }, "editor").allowed).toBe(
      false,
    );
    expect(
      check({ op: "page.update", page: about, set: { title: "Story" } }, "editor").allowed,
    ).toBe(true);
    expect(
      check(
        {
          op: "collection.upsert",
          collection: "journal",
          item: { ...item, frontmatter: { ...item.frontmatter, status: "published" } },
        },
        "editor",
      ).allowed,
    ).toBe(true);
  });

  it("editors on locked sections: only text/image field updates", () => {
    expect(
      check(
        {
          op: "block.update",
          page: home,
          block: IDS.heading,
          set: { content: { type: "doc", content: [] } },
        },
        "editor",
      ).allowed,
    ).toBe(true);
    expect(
      check(
        {
          op: "block.update",
          page: home,
          block: IDS.image,
          set: { image: { src: "media/a.jpg", alt: "A mat" } },
        },
        "editor",
      ).allowed,
    ).toBe(true);
    expect(
      check(
        { op: "block.update", page: home, block: IDS.button, set: { label: "Book now" } },
        "editor",
      ).allowed,
    ).toBe(true);
    expect(
      check(
        {
          op: "block.update",
          page: home,
          block: IDS.button,
          set: { link: { type: "url", url: "https://x.dev" } },
        },
        "editor",
      ).allowed,
    ).toBe(false);
    expect(
      check(
        { op: "block.update", page: home, block: IDS.heading, style: { radius: "lg" } },
        "editor",
      ).allowed,
    ).toBe(false);
    expect(check({ op: "block.delete", page: home, block: IDS.heading }, "editor").allowed).toBe(
      false,
    );
    expect(
      check(
        {
          op: "block.insert",
          page: home,
          section: hero,
          at: 0,
          block: textBlock(newId("blk"), "x"),
        },
        "editor",
      ).allowed,
    ).toBe(false);
    expect(
      check({ op: "block.move", page: home, block: IDS.c1, to: { section: hero, at: 0 } }, "editor")
        .allowed,
    ).toBe(false);
    expect(check({ op: "section.delete", page: home, section: hero }, "editor").allowed).toBe(
      false,
    );
    // unlocked sections are fine
    expect(check({ op: "block.delete", page: home, block: IDS.c1 }, "editor").allowed).toBe(true);
    // without a document every block is treated as locked
    const noDoc = transformForRole(
      stampOp({ op: "block.delete", page: home, block: IDS.c1 }),
      "editor",
      [],
    );
    expect(noDoc.allowed).toBe(false);
  });

  it("contributors: only draft collection items", () => {
    expect(
      check({ op: "collection.upsert", collection: "journal", item }, "contributor").allowed,
    ).toBe(true);
    expect(
      check(
        {
          op: "collection.upsert",
          collection: "journal",
          item: { ...item, frontmatter: { ...item.frontmatter, status: "published" } },
        },
        "contributor",
      ),
    ).toMatchObject({ allowed: false, reason: expect.stringMatching(/draft/) });
    // overwriting an already-published post is not allowed
    expect(
      check(
        {
          op: "collection.upsert",
          collection: "journal",
          item: { ...item, slug: "2026-10-26-opening-day" },
        },
        "contributor",
      ).allowed,
    ).toBe(false);
    expect(
      check({ op: "page.update", page: about, set: { title: "x" } }, "contributor").allowed,
    ).toBe(false);
    expect(
      check(
        { op: "collection.delete", collection: "journal", slug: "2026-10-26-opening-day" },
        "contributor",
      ).allowed,
    ).toBe(false);
  });
});

describe("transformForRole — fix round 1", () => {
  it("editors can't place on the grid through block ops", () => {
    const place = { d: { x: 1, y: 1, w: 4, h: 2 } };
    expect(
      check(
        { op: "block.move", page: home, block: IDS.c1, to: { section: grid, at: 1, place } },
        "editor",
      ).allowed,
    ).toBe(false);
    expect(
      check(
        {
          op: "block.move",
          page: home,
          block: IDS.c1,
          to: { section: grid, at: 1, rows: { d: 30 } },
        },
        "editor",
      ).allowed,
    ).toBe(false);
    expect(
      check(
        {
          op: "block.move",
          page: home,
          block: IDS.c1,
          to: { section: grid, at: 1 },
          fromRows: { d: 30 },
        },
        "editor",
      ).allowed,
    ).toBe(false);
    expect(
      check(
        {
          op: "block.insert",
          page: home,
          section: grid,
          at: 0,
          block: textBlock(newId("blk"), "x"),
          place,
        },
        "editor",
      ).allowed,
    ).toBe(false);
    expect(
      check(
        {
          op: "block.insert",
          page: home,
          section: grid,
          at: 0,
          block: textBlock(newId("blk"), "x"),
          rows: { d: 30 },
        },
        "editor",
      ).allowed,
    ).toBe(false);
    expect(
      check({ op: "block.delete", page: home, block: IDS.c1, rows: { d: 30 } }, "editor").allowed,
    ).toBe(false);
    // moving into/out of a grid section re-lays out the grid
    const unlocked = siteFixture();
    expect(
      check(
        { op: "block.move", page: home, block: IDS.heading, to: { section: grid, at: 0 } },
        "editor",
        unlocked,
      ).allowed,
    ).toBe(false);
    expect(
      check(
        { op: "block.move", page: home, block: IDS.c1, to: { section: hero, at: 0 } },
        "editor",
        unlocked,
      ).allowed,
    ).toBe(false);
    // reordering inside one grid section keeps placements
    expect(
      check({ op: "block.move", page: home, block: IDS.c1, to: { section: grid, at: 1 } }, "editor")
        .allowed,
    ).toBe(true);
    // plain inserts/deletes are still fine
    expect(
      check(
        {
          op: "block.insert",
          page: home,
          section: grid,
          at: 0,
          block: textBlock(newId("blk"), "x"),
        },
        "editor",
      ).allowed,
    ).toBe(true);
    expect(check({ op: "block.delete", page: home, block: IDS.c1 }, "editor").allowed).toBe(true);
  });

  it("isInverseOf lets the Hub authorize an editor's own undo", () => {
    const doc = siteFixture();
    const del = stampOp({ op: "block.delete", page: home, block: IDS.c1 });
    expect(check(del, "editor", doc).allowed).toBe(true);
    const after = apply(doc, del);
    const undo = { ...invert(doc, del), id: "undo-1", ts: 99 };
    // the undo restores placement + rows, which editors can't send directly…
    expect(transformForRole(undo, "editor", lockedSectionsOf(after), { doc: after }).allowed).toBe(
      false,
    );
    // …but it is exactly the inverse of their own op
    expect(isInverseOf(undo, del, doc)).toBe(true);
    const tampered = { ...undo, place: { d: { x: 1, y: 1, w: 24, h: 2 } } } as Op;
    expect(isInverseOf(tampered, del, doc)).toBe(false);
    expect(isInverseOf(undo, stampOp({ op: "block.delete", page: home, block: IDS.c2 }), doc)).toBe(
      false,
    );
  });

  it("contributors are denied without the document (fail safe)", () => {
    const op = stampOp({
      op: "collection.upsert",
      collection: "journal",
      item: {
        kind: "blog",
        slug: "2026-10-26-opening-day",
        frontmatter: { title: "x", date: "2026-11-02", status: "draft" },
        body: "",
      },
    });
    expect(transformForRole(op, "contributor", [])).toMatchObject({ allowed: false });
  });

  it("editors can't delete pages with locked sections", () => {
    expect(check({ op: "page.delete", page: home }, "editor").allowed).toBe(false);
    expect(check({ op: "page.delete", page: about }, "editor").allowed).toBe(true);
    expect(
      transformForRole(stampOp({ op: "page.delete", page: about }), "editor", []).allowed,
    ).toBe(false);
  });

  it("without a registry, locked-section edits must keep an existing field's text/image shape", () => {
    expect(
      check({ op: "block.update", page: home, block: IDS.button, set: { label: "Book" } }, "editor")
        .allowed,
    ).toBe(true);
    expect(
      check(
        {
          op: "block.update",
          page: home,
          block: IDS.button,
          set: { label: { type: "doc", content: [] } },
        },
        "editor",
      ).allowed,
    ).toBe(false);
    expect(
      check(
        { op: "block.update", page: home, block: IDS.button, set: { subtitle: "new field" } },
        "editor",
      ).allowed,
    ).toBe(false);
    expect(
      check(
        {
          op: "block.update",
          page: home,
          block: IDS.heading,
          set: { content: { type: "doc", content: [] } },
        },
        "editor",
      ).allowed,
    ).toBe(true);
  });
});

describe("rebase", () => {
  const op = (body: OpBody, actor: string, ts: number): Op => stampOp(body, actor, ts);

  it("passes independent ops through untouched", () => {
    const local = [op({ op: "page.update", page: about, set: { title: "Story" } }, "ana", 10)];
    const remote = [
      op({ op: "block.update", page: home, block: IDS.heading, set: { caption: "x" } }, "ben", 20),
    ];
    expect(independent(local[0] as Op, remote[0] as Op)).toBe(true);
    expect(rebase(local, remote)).toEqual({ ops: local, conflicts: [], dropped: [] });
  });

  it("same-field edits: last writer wins, with a conflict for the toast", () => {
    const mine = op(
      {
        op: "block.update",
        page: home,
        block: IDS.button,
        set: { label: "Mine", variant: "secondary" },
      },
      "ana",
      10,
    );
    const theirsLater = op(
      { op: "block.update", page: home, block: IDS.button, set: { label: "Theirs" } },
      "ben",
      20,
    );
    const r = rebase([mine], [theirsLater]);
    // remote is later: the overlapping field is stripped, the rest survives
    expect(r.ops).toEqual([{ ...mine, set: { variant: "secondary" } }]);
    expect(r.conflicts).toMatchObject([
      {
        winner: "remote",
        reason: "concurrent-edit",
        message: "ben changed this too",
        paths: [`block/${IDS.button}/fields/label`],
      },
    ]);
    // the merged result keeps ben's label and ana's variant
    const merged = applyAll(siteFixture(), [theirsLater, ...r.ops]);
    expect(merged.pages[home]?.sections[0]?.blocks[1]?.fields).toMatchObject({
      label: "Theirs",
      variant: "secondary",
    });

    const theirsEarlier = { ...theirsLater, ts: 5 };
    const r2 = rebase([mine], [theirsEarlier]);
    expect(r2.ops).toEqual([mine]);
    expect(r2.conflicts[0]).toMatchObject({ winner: "local" });
  });

  it("ties on ts break by actor", () => {
    const a = op({ op: "page.update", page: about, set: { title: "A" } }, "ana", 10);
    const b = op({ op: "page.update", page: about, set: { title: "B" } }, "ben", 10);
    expect(rebase([a], [b]).ops).toEqual([]); // ben > ana
    expect(rebase([b], [a]).ops).toEqual([b]);
  });

  it("nested paths conflict with their parents", () => {
    const a = op(
      {
        op: "styles.patch",
        patch: {
          set: { "overrides.color.accent": { $value: "#123456" }, "choices.motion": "none" },
        },
      },
      "ana",
      1,
    );
    const b = op({ op: "styles.patch", patch: { unset: ["overrides"] } }, "ben", 2);
    const r = rebase([a], [b]);
    expect(r.ops).toEqual([{ ...a, patch: { set: { "choices.motion": "none" } } }]);
  });

  it("remote deletes drop local edits to the deleted thing", () => {
    const edit = op(
      { op: "block.update", page: home, block: IDS.c1, set: { caption: "x" } },
      "ana",
      50,
    );
    const del = op({ op: "block.delete", page: home, block: IDS.c1 }, "ben", 1);
    const r = rebase([edit], [del]);
    expect(r.ops).toEqual([]);
    expect(r.conflicts[0]).toMatchObject({ reason: "deleted", message: "ben deleted this" });
    // page deletion drops ops on that page
    const pageEdit = op(
      {
        op: "section.update",
        page: about,
        section: siteFixture().pages[about]?.sections[0]?.id as `sec_${string}`,
        set: { label: "x" },
      },
      "ana",
      50,
    );
    expect(rebase([pageEdit], [op({ op: "page.delete", page: about }, "ben", 1)]).ops).toEqual([]);
  });

  it("local deletes win over remote edits; double deletes are silent", () => {
    const del = op({ op: "block.delete", page: home, block: IDS.c1 }, "ana", 1);
    const edit = op(
      { op: "block.update", page: home, block: IDS.c1, set: { caption: "x" } },
      "ben",
      50,
    );
    expect(rebase([del], [edit])).toMatchObject({ ops: [del], conflicts: [{ winner: "local" }] });
    expect(rebase([del], [{ ...del, actor: "ben" }])).toEqual({
      ops: [],
      conflicts: [],
      dropped: [del],
    });
  });

  it("with the merged document, drops ops that no longer apply and fixes positions", () => {
    const base = siteFixture();
    const remoteOps = [op({ op: "section.delete", page: home, section: grid }, "ben", 1)];
    const merged = applyAll(base, remoteOps);
    // block in the deleted section: only detectable with the doc
    const edit = op(
      { op: "block.update", page: home, block: IDS.c1, set: { caption: "x" } },
      "ana",
      2,
    );
    const insertAt = op(
      { op: "section.insert", page: home, at: 2, section: stackSection(newId("sec"), []) },
      "ana",
      3,
    );
    const r = rebase([edit, insertAt], remoteOps, { doc: merged });
    expect(r.ops).toEqual([{ ...insertAt, at: "end" }]);
    expect(r.conflicts).toMatchObject([{ reason: "invalid", local: edit }]);
  });

  it("with the base doc, a remote section.delete is a 'deleted' conflict for edits inside it", () => {
    const base = siteFixture();
    const edit = op(
      { op: "block.update", page: home, block: IDS.c1, set: { caption: "x" } },
      "ana",
      50,
    );
    const del = op({ op: "section.delete", page: home, section: grid }, "ben", 1);
    const r = rebase([edit], [del], { base });
    expect(r.ops).toEqual([]);
    expect(r.conflicts).toMatchObject([
      { reason: "deleted", message: "ben deleted this", local: edit },
    ]);
    // without the base it can't tell
    expect(rebase([edit], [del]).ops).toEqual([edit]);
  });

  it("page.create losing a nav race keeps the page but not the nav rewrite", () => {
    const id = newId("pg");
    const base = siteFixture();
    const create = op(
      {
        op: "page.create",
        page: { id, title: "New", slug: "new", sections: [] },
        nav: [...base.site.nav, { type: "page", page: id }],
      },
      "ana",
      1,
    );
    const nav = op({ op: "nav.update", tree: base.site.nav.slice(0, 2) }, "ben", 2);
    const r = rebase([create], [nav]);
    expect(r.ops).toEqual([{ ...create, nav: undefined }].map(({ nav: _n, ...rest }) => rest));
  });
});

describe("summarize", () => {
  it("summarizes edits in plain words", () => {
    const doc = siteFixture();
    const ops = [
      stampOp({ op: "block.update", page: home, block: IDS.heading, set: { caption: "x" } }),
      stampOp({ op: "page.update", page: about, set: { title: "Our story" } }),
      ...["a", "b"].map((n) =>
        stampOp({
          op: "media.add",
          path: `media/2026/11/${n}.jpg`,
          meta: {
            id: newId("med"),
            path: `media/2026/11/${n}.jpg`,
            kind: "image",
            mime: "image/jpeg",
            bytes: 1,
            width: 1,
            height: 1,
            createdAt: "2026-11-01T00:00:00Z",
          },
        }),
      ),
      stampOp({
        op: "styles.patch",
        patch: { set: { "overrides.color.accent": { $value: "#aa3300" } } },
      }),
    ];
    expect(summarize(ops, doc)).toBe("Edited Home and About; added 2 images; changed accent color");
    expect(stats(ops, doc)).toMatchObject({
      pagesEdited: [home, about],
      imagesAdded: 2,
      blocksEdited: 1,
      stylesChanged: ["accent color"],
    });
  });

  it("handles created/deleted pages, nav, footer and empty sets", () => {
    const doc = siteFixture();
    const id = newId("pg");
    const ops = [
      stampOp({
        op: "page.create",
        page: { id, title: "Schedule", slug: "schedule", sections: [] },
        nav: [...doc.site.nav, { type: "page", page: id }],
      }),
      stampOp({ op: "page.update", page: id, set: { title: "Timetable" } }),
      stampOp({ op: "block.update", page: "footer", block: IDS.footerText, set: { caption: "x" } }),
      stampOp({
        op: "styles.patch",
        patch: { set: { "choices.pairing": "inter-lora", "choices.palette.brand": "#123456" } },
      }),
      stampOp({
        op: "collection.upsert",
        collection: "journal",
        item: {
          kind: "blog",
          slug: "x",
          frontmatter: { title: "X", date: "2026-11-02", status: "draft" },
          body: "",
        },
      }),
    ];
    expect(summarize(ops, doc)).toBe(
      "Edited the footer; added page Schedule; changed fonts and brand color; updated navigation; saved 1 collection item",
    );
    expect(summarize([], doc)).toBe("No changes");
    expect(styleLabel("overrides.color.brand-dark.500")).toBe("brand dark color");
    expect(styleLabel("choices.palette.neutral")).toBe("color palette");
    expect(styleLabel("something.else")).toBe("site styles");
  });

  it("lists many pages compactly", () => {
    const doc = siteFixture();
    const pages = ["A", "B", "C", "D"].map((t, i) => ({
      id: newId("pg"),
      title: t,
      slug: `p${i}`,
      sections: [],
    }));
    for (const p of pages) doc.pages[p.id] = p;
    const ops = pages.map((p) => stampOp({ op: "page.update", page: p.id, set: { hidden: true } }));
    expect(summarize(ops, doc)).toBe("Edited A, B and 2 other pages");
  });
});

describe("diff", () => {
  it("produces targeted ops for typical file edits", () => {
    const before = siteFixture();
    const after = structuredClone(before) as SiteDocument;
    (after.pages[about] as { title: string }).title = "Our story";
    const heading = after.pages[home]?.sections[0]?.blocks[0];
    if (heading) heading.fields.caption = "Welcome";
    after.styles.choices.motion = "none";
    const hs = after.pages[home]?.sections[0];
    if (hs) hs.blocks.reverse();
    const ops = diff(before, after, { actor: "cli", ts: 5 });
    expect(ops.map((o) => o.op).sort()).toEqual(
      ["block.move", "block.move", "block.update", "page.update", "styles.patch"].sort(),
    );
    expect(ops.every((o) => o.actor === "cli" && o.ts === 5)).toBe(true);
    expect(deepEqual(applyAll(before, ops), after)).toBe(true);
    expect(summarize(ops, before)).toBe("Edited Home and About; changed motion");
  });

  it("turns cross-page moves into delete + insert and keeps ids", () => {
    const before = siteFixture();
    const after = structuredClone(before) as SiteDocument;
    const moved = after.pages[home]?.sections[0]?.blocks.splice(2, 1)[0];
    if (!moved) throw new Error("fixture changed");
    const { column: _column, ...rest } = moved;
    after.pages[about]?.sections[0]?.blocks.push(rest);
    const ops = diff(before, after);
    expect(ops.map((o) => o.op)).toEqual(["block.delete", "block.insert"]);
    expect(deepEqual(applyAll(before, ops), after)).toBe(true);
  });

  it("is empty for identical documents", () => {
    expect(diff(siteFixture(), siteFixture())).toEqual([]);
    expect(
      deepEqual(
        apply(siteFixture(), stampOp({ op: "nav.update", tree: siteFixture().site.nav })),
        siteFixture(),
      ),
    ).toBe(true);
  });
});
