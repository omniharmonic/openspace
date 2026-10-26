import { rt } from "@openspace/blocks";
import { apply, type Op } from "@openspace/ops";
import type { Section, SiteDocument } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import {
  copyItems,
  deleteItems,
  duplicateItems,
  moveItems,
  parseClip,
  pasteItems,
  renameSection,
  setLayoutMode,
  toggleHidden,
} from "./actions";
import { devSiteDocument, DEV_IDS as I } from "./dev-site";
import { firstChildOf, parentOf, readingOrder, siblingOf } from "./selection";
import { createEditorStore, MERGE_WINDOW_MS } from "./store";

const sections = (doc: SiteDocument, page: string = I.home) =>
  (doc.pages[page as keyof SiteDocument["pages"]]?.sections ?? []) as Section[];
const blockIds = (s: Section | undefined) => s?.blocks.map((b) => b.id) ?? [];

function setup() {
  let t = 1_000;
  const clock = { now: () => t, tick: (ms: number) => (t += ms) };
  const store = createEditorStore({ doc: devSiteDocument(), actor: "user:sam", now: clock.now });
  return { store, clock, s: () => store.getState() };
}

describe("editor store: ops and undo", () => {
  it("opens on the home page with nothing selected", () => {
    const { s } = setup();
    expect(s().pageId).toBe(I.home);
    expect(s().selection).toEqual([]);
  });

  it("applies every change as validated ops and undoes/redoes them exactly", () => {
    const { s } = setup();
    const before = s().doc;
    const r = s().run(deleteItems(s().doc, I.home, [{ kind: "block", id: I.introText }]));
    expect(r.ok).toBe(true);
    expect(blockIds(sections(s().doc)[1])).toEqual([]);
    expect(s().undo()).toBe(true);
    expect(s().doc).toEqual(before);
    expect(s().redo()).toBe(true);
    expect(blockIds(sections(s().doc)[1])).toEqual([]);
    expect(s().undoStack).toHaveLength(1);
    expect(s().redoStack).toHaveLength(0);
  });

  it("rejects invalid ops atomically and leaves the document untouched", () => {
    const { s } = setup();
    const before = s().doc;
    const r = s().commit([
      { op: "block.delete", page: I.home, block: I.introText } as never,
      { op: "block.delete", page: I.home, block: "blk_nope000000" } as never,
    ]);
    expect(r.ok).toBe(false);
    expect(s().doc).toBe(before);
    expect(s().undoStack).toHaveLength(0);
  });

  it("keeps unlimited history and clears redo on a new edit", () => {
    const { s } = setup();
    for (let i = 0; i < 40; i++)
      s().run(renameSection(s().doc, I.home, sections(s().doc)[0] as Section, `Hero ${i}`));
    expect(s().undoStack).toHaveLength(40);
    for (let i = 0; i < 40; i++) expect(s().undo()).toBe(true);
    expect(sections(s().doc)[0]?.label).toBe("Hero");
    expect(s().undo()).toBe(false);
    s().redo();
    s().run(renameSection(s().doc, I.home, sections(s().doc)[0] as Section, "Top"));
    expect(s().redoStack).toHaveLength(0);
  });

  it("groups rapid typing on one block into a single undo step", () => {
    const { s, clock } = setup();
    const original = s().doc;
    const type = (text: string) =>
      s().commit(
        [
          {
            op: "block.update",
            page: I.home,
            block: I.introText,
            set: { content: rt.doc(rt.p(text)) },
          } as never,
        ],
        { mergeKey: `text:${I.introText}`, label: "Edit text" },
      );
    type("H");
    clock.tick(300);
    type("He");
    clock.tick(300);
    type("Hello");
    expect(s().undoStack).toHaveLength(1);
    clock.tick(MERGE_WINDOW_MS + 1);
    type("Hello there");
    expect(s().undoStack).toHaveLength(2);
    s().undo();
    expect(sections(s().doc)[1]?.blocks[0]?.fields.content).toEqual(rt.doc(rt.p("Hello")));
    s().undo();
    expect(s().doc).toEqual(original);
    // Sealing closes the step even inside the window.
    type("A");
    s().sealHistory();
    type("AB");
    expect(s().undoStack).toHaveLength(2);
  });

  it("reports local ops (edits, undo, redo) to sync listeners and applies remote ops without history", () => {
    const { s } = setup();
    const seen: Array<{ kind: string; ops: Op[] }> = [];
    const off = s().onLocalOps((ops, info) => seen.push({ kind: info.kind, ops }));
    s().run(toggleHidden(s().doc, I.home, sections(s().doc)[2] as Section));
    s().undo();
    s().redo();
    expect(seen.map((x) => x.kind)).toEqual(["edit", "undo", "redo"]);
    expect(seen[0]?.ops[0]).toMatchObject({ op: "section.update", actor: "user:sam" });
    off();

    // A collaborator renames the hero: applied, not undoable locally.
    const remote = {
      op: "section.update",
      id: "op_remote",
      actor: "user:ana",
      ts: 5,
      page: I.home,
      section: I.hero,
      set: { label: "Welcome" },
    } as Op;
    const bad = { ...remote, id: "op_bad", section: "sec_missing000" } as Op;
    const r = s().applyRemoteOps([remote, bad]);
    expect(r.applied).toHaveLength(1);
    expect(r.rejected).toHaveLength(1);
    expect(sections(s().doc)[0]?.label).toBe("Welcome");
    expect(seen).toHaveLength(3);
    expect(s().undoStack).toHaveLength(1);
  });

  it("skips undo steps that a remote change made impossible", () => {
    const { s } = setup();
    s().run(renameSection(s().doc, I.home, sections(s().doc)[3] as Section, "Voices"));
    s().applyRemoteOps([
      {
        op: "section.delete",
        id: "r1",
        actor: "user:ana",
        ts: 9,
        page: I.home,
        section: I.story,
      } as Op,
    ]);
    expect(s().undo()).toBe(false);
    expect(s().undoStack).toHaveLength(0);
  });
});

describe("editor commands", () => {
  it("duplicates blocks and sections with fresh ids next to the original", () => {
    const { s } = setup();
    s().run(duplicateItems(s().doc, I.home, [{ kind: "block", id: I.introText }]));
    const intro = sections(s().doc)[1] as Section;
    expect(intro.blocks).toHaveLength(2);
    expect(intro.blocks[1]?.id).not.toBe(I.introText);
    expect(s().selection).toEqual([{ kind: "block", id: intro.blocks[1]?.id }]);

    s().run(duplicateItems(s().doc, I.home, [{ kind: "section", id: I.faq }]));
    const list = sections(s().doc);
    expect(list[5]?.id).not.toBe(I.faq);
    expect(list[5]?.blocks.map((b) => b.type)).toEqual(["text", "accordion"]);
    expect(list[5]?.blocks[0]?.id).not.toBe(I.faqHeading);
  });

  it("gives duplicated form blocks a new form id", () => {
    const { s } = setup();
    s().run(duplicateItems(s().doc, I.classes, [{ kind: "block", id: I.contactForm }]));
    const contact = sections(s().doc, I.classes)[1] as Section;
    const ids = contact.blocks
      .filter((b) => b.type === "form")
      .map((b) => (b.fields.form as { id: string }).id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ids[1]).toMatch(/^frm_[0-9a-z]{10}$/);
  });

  it("moves blocks within their column and sections within the page", () => {
    const { s } = setup();
    // Hero column 0: heading, button. Move the button up.
    s().run(moveItems(s().doc, I.home, [{ kind: "block", id: I.heroButton }], -1));
    expect(blockIds(sections(s().doc)[0])).toEqual([I.heroButton, I.heroHeading, I.heroImage]);
    // At the top of its column: hops to the previous section? No section above the hero.
    expect(moveItems(s().doc, I.home, [{ kind: "block", id: I.heroButton }], -1)).toBeNull();
    // Intro text moving up lands at the end of the hero.
    s().run(moveItems(s().doc, I.home, [{ kind: "block", id: I.introText }], -1));
    expect(sections(s().doc)[0]?.blocks.at(-1)?.id).toBe(I.introText);

    s().run(moveItems(s().doc, I.home, [{ kind: "section", id: I.faq }], -1));
    expect(
      sections(s().doc)
        .map((x) => x.id)
        .slice(2, 5),
    ).toEqual([I.offerings, I.faq, I.story]);
    // Footer never moves.
    expect(moveItems(s().doc, I.home, [{ kind: "section", id: I.footer }], -1)).toBeNull();
  });

  it("deletes sections but never the footer", () => {
    const { s } = setup();
    expect(deleteItems(s().doc, I.home, [{ kind: "section", id: I.footer }])).toBeNull();
    s().run(
      deleteItems(s().doc, I.home, [
        { kind: "section", id: I.faq },
        { kind: "section", id: I.signup },
      ]),
    );
    expect(sections(s().doc).map((x) => x.id)).not.toContain(I.faq);
    expect(sections(s().doc)).toHaveLength(4);
  });

  it("copies and pastes blocks and sections across pages with fresh ids", () => {
    const { s } = setup();
    const clip = copyItems(s().doc, I.home, [{ kind: "section", id: I.story }]);
    const text = JSON.stringify(clip);
    expect(parseClip(text)).toEqual(clip);
    expect(parseClip("plain text")).toBeNull();

    s().setPage(I.about);
    s().select({ kind: "section", id: I.aboutText });
    const parsed = parseClip(text);
    if (!parsed) throw new Error("clipboard did not parse");
    s().run(pasteItems(s().doc, I.about, s().selection, parsed));
    const about = sections(s().doc, I.about);
    expect(about).toHaveLength(3);
    expect(about[1]?.blocks.map((b) => b.type)).toEqual(["image", "quote", "testimonial"]);
    expect(about[1]?.id).not.toBe(I.story);

    const blockClip = copyItems(s().doc, I.home, [{ kind: "block", id: I.heroButton }]);
    if (!blockClip) throw new Error("nothing copied");
    s().select({ kind: "block", id: I.aboutHeading });
    s().run(pasteItems(s().doc, I.about, s().selection, blockClip));
    const first = sections(s().doc, I.about)[0] as Section;
    expect(first.blocks.map((b) => b.type)).toEqual(["text", "button", "image"]);
  });

  it("switches a section between stack and grid and back", () => {
    const { s } = setup();
    s().run(setLayoutMode(s().doc, I.home, I.hero, "grid", () => 96));
    const hero = sections(s().doc)[0] as Section;
    expect(hero.layout.mode).toBe("grid");
    if (hero.layout.mode !== "grid") return;
    expect(hero.layout.items[I.heroImage as never]?.d).toMatchObject({ x: 15, w: 10, y: 1, h: 4 });
    expect(hero.layout.items[I.heroButton as never]?.d).toMatchObject({ x: 1, w: 14, y: 5 });
    expect(hero.blocks.every((b) => b.column === undefined)).toBe(true);
    s().run(setLayoutMode(s().doc, I.home, I.hero, "stack"));
    const back = sections(s().doc)[0] as Section;
    expect(back.layout).toMatchObject({ mode: "stack", columns: { d: [12] } });
    expect(readingOrder(back).map((b) => b.id)).toEqual([I.heroHeading, I.heroImage, I.heroButton]);
    s().undo();
    s().undo();
    expect(sections(s().doc)[0]?.layout.mode).toBe("stack");
    expect(sections(s().doc)[0]?.blocks.map((b) => b.column)).toEqual([0, 0, 1]);
  });
});

describe("selection model", () => {
  const doc = devSiteDocument();
  it("walks siblings in reading order and across sections", () => {
    expect(siblingOf(doc, I.home, { kind: "block", id: I.heroHeading }, 1)).toEqual({
      kind: "block",
      id: I.heroButton,
    });
    expect(siblingOf(doc, I.home, { kind: "block", id: I.heroImage }, 1)).toEqual({
      kind: "block",
      id: I.introText,
    });
    expect(siblingOf(doc, I.home, { kind: "section", id: I.signup }, 1)).toEqual({
      kind: "section",
      id: I.footer,
    });
    expect(siblingOf(doc, I.home, { kind: "section", id: I.hero }, -1)).toBeUndefined();
  });

  it("goes to the parent with Esc and into the first child with Enter", () => {
    expect(parentOf(doc, I.home, { kind: "block", id: I.storyQuote })).toEqual({
      kind: "section",
      id: I.story,
    });
    expect(parentOf(doc, I.home, { kind: "section", id: I.story })).toBeUndefined();
    expect(firstChildOf(doc, I.home, { kind: "section", id: I.story })).toEqual({
      kind: "block",
      id: I.storyImage,
    });
  });

  it("toggles additive selection within one kind", () => {
    const { s } = setup();
    s().select({ kind: "block", id: I.heroHeading });
    s().select({ kind: "block", id: I.heroImage }, { additive: true });
    expect(s().selection).toHaveLength(2);
    s().select({ kind: "block", id: I.heroHeading }, { additive: true });
    expect(s().selection).toEqual([{ kind: "block", id: I.heroImage }]);
    // A different kind replaces the selection.
    s().select({ kind: "section", id: I.hero }, { additive: true });
    expect(s().selection).toEqual([{ kind: "section", id: I.hero }]);
  });

  it("prunes the selection when the selected item disappears", () => {
    const { s } = setup();
    s().select({ kind: "block", id: I.introText });
    const deleted = apply(s().doc, {
      op: "block.delete",
      id: "x",
      actor: "a",
      ts: 0,
      page: I.home,
      block: I.introText,
    } as Op);
    s().replaceDocument(deleted);
    expect(s().selection).toEqual([]);
  });
});
