import { autoMobileLayout } from "@openspace/lint";
import { type Op, parseOp } from "@openspace/ops";
import { type GridLayout, MAX_GRID_ROWS, type Section, type SiteDocument } from "@openspace/schema";
import { afterEach, describe, expect, it } from "vitest";
import { useSiteRoleStore } from "../../inspector/env";
import { useEditorUi } from "../editor-store";
import { setLayoutMode } from "../model/actions";
import { devSiteDocument, DEV_IDS as I } from "../model/dev-site";
import { createEditorStore } from "../model/store";
import { handleEditorKey, type ShortcutEnv } from "../shortcuts";
import { gridCaps } from "./caps";
import {
  customizeTabletCommand,
  duplicateCommand,
  emptyTrailingRows,
  mobileOrder,
  mobileReorderCommand,
  nudgeCommand,
  pinCommand,
  placeCommand,
  resetMobileCommand,
  trimRowsCommand,
  zOrderCommand,
} from "./commands";
import { gridController } from "./controller";
import { gridReadingOrder, stackToGrid } from "./convert";
import { gridNudge } from "./keys";
import { displayRects, domOrder, type GridSection, isMobileAuto, stackOrder } from "./model";

/** The dev site with the hero switched to grid: heading + button (column 0), image (column 1). */
function setup() {
  let t = 1_000;
  const store = createEditorStore({ doc: devSiteDocument(), actor: "user:sam", now: () => t });
  const s = () => store.getState();
  s().run(setLayoutMode(s().doc, I.home, I.hero, "grid", () => 96));
  const hero = () =>
    s().doc.pages[I.home as keyof SiteDocument["pages"]]?.sections.find(
      (x) => x.id === I.hero,
    ) as GridSection;
  return { store, s, hero, tick: (ms: number) => (t += ms) };
}

const item = (sec: GridSection, id: string) =>
  sec.layout.items[
    id as keyof GridLayout["items"]
  ] as GridLayout["items"][keyof GridLayout["items"]];

afterEach(() => {
  useSiteRoleStore.setState({ role: undefined });
  useEditorUi.getState().reset();
  gridController.ctx = null;
});

describe("stack ⇄ grid conversion", () => {
  it("keeps columns side by side; with no phone stacking order the phone layout is automatic", () => {
    const { hero } = setup();
    const h = hero();
    expect(item(h, I.heroHeading).d).toEqual({ x: 1, y: 1, w: 14, h: 4 });
    expect(item(h, I.heroButton).d).toEqual({ x: 1, y: 5, w: 14, h: 4 });
    expect(item(h, I.heroImage).d).toEqual({ x: 15, y: 1, w: 10, h: 4 });
    // No `layout.order.m`: autoMobileLayout (reading order: heading and image share a band).
    expect(isMobileAuto(h)).toBe(true);
    expect(mobileOrder(h)).toEqual([I.heroHeading, I.heroImage, I.heroButton]);
  });

  it("follows the section's phone stacking order (layout.order.m)", () => {
    const doc = devSiteDocument();
    const sec = doc.pages[I.home as keyof SiteDocument["pages"]]?.sections[0] as Section;
    const stack = { ...sec, layout: { ...sec.layout, order: { m: [1, 0] } } } as Section;
    const layout = stackToGrid(stack, () => 48);
    const m = (id: string) => layout.items[id as keyof GridLayout["items"]]?.m;
    expect(m(I.heroImage)?.y).toBe(1);
    expect((m(I.heroHeading)?.y ?? 0) > (m(I.heroImage)?.y ?? 0)).toBe(true);
    expect(layout.rows.m).toBeGreaterThanOrEqual(
      (m(I.heroButton)?.y ?? 0) + (m(I.heroButton)?.h ?? 0) - 1,
    );
  });

  it("grid → stack uses visual reading order (bands, then columns), as ops", () => {
    const { s, hero } = setup();
    // Put the button beside the heading, the image below both.
    s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [
          { id: I.heroImage, rect: { x: 1, y: 6, w: 24, h: 4 } },
          { id: I.heroButton, rect: { x: 15, y: 1, w: 10, h: 2 } },
        ],
        "d",
      ),
    );
    expect(gridReadingOrder(hero()).map((b) => b.id)).toEqual([
      I.heroHeading,
      I.heroButton,
      I.heroImage,
    ]);
    const seen: Op[] = [];
    s().onLocalOps((ops) => seen.push(...ops));
    s().run(setLayoutMode(s().doc, I.home, I.hero, "stack"));
    const back = s().doc.pages[I.home as keyof SiteDocument["pages"]]?.sections[0] as Section;
    expect(back.layout.mode).toBe("stack");
    expect(back.blocks.map((b) => b.id)).toEqual([I.heroHeading, I.heroButton, I.heroImage]);
    expect(seen.map((o) => o.op)).toContain("block.move");
    for (const op of seen) expect(() => parseOp(JSON.parse(JSON.stringify(op)))).not.toThrow();
  });
});

describe("placing blocks", () => {
  it("a desktop move writes one grid.place per item as one undo step", () => {
    const { s, hero } = setup();
    const before = s().doc;
    const r = s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroImage, rect: { x: 13, y: 2, w: 12, h: 6 } }],
        "d",
      ),
    );
    expect(r.ok).toBe(true);
    expect(item(hero(), I.heroImage).d).toEqual({ x: 13, y: 2, w: 12, h: 6 });
    expect(r.ok && r.ops.filter((o) => o.op === "grid.place" && o.bp === "d")).toHaveLength(1);
    s().undo();
    expect(s().doc).toEqual(before);
  });

  it("rows auto-raise when a block is placed below the last row", () => {
    const { s, hero } = setup();
    expect(hero().layout.rows.d).toBe(8);
    s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroButton, rect: { x: 1, y: 20, w: 6, h: 3 } }],
        "d",
      ),
    );
    expect(hero().layout.rows.d).toBe(22);
    expect(emptyTrailingRows(hero().layout, "d")).toBe(0);
    s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroButton, rect: { x: 1, y: 5, w: 6, h: 3 } }],
        "d",
      ),
    );
    expect(emptyTrailingRows(hero().layout, "d")).toBe(15);
    s().run(trimRowsCommand(s().doc, I.home, I.hero));
    expect(hero().layout.rows.d).toBe(7);
    expect(trimRowsCommand(s().doc, I.home, I.hero)).toBeNull();
  });

  it("regenerates the phone layout from desktop while it is automatic", () => {
    const { s, hero } = setup();
    // Make the phone layout automatic first.
    s().run(resetMobileCommand(s().doc, I.home, I.hero));
    expect(isMobileAuto(hero())).toBe(true);
    s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroImage, rect: { x: 1, y: 9, w: 24, h: 6 } }],
        "d",
      ),
    );
    expect(isMobileAuto(hero())).toBe(true);
    const auto = autoMobileLayout(hero(), { reset: true });
    for (const id of [I.heroHeading, I.heroButton, I.heroImage])
      expect(item(hero(), id).m).toEqual(auto?.[id]?.m);
    expect(mobileOrder(hero()).at(-1)).toBe(I.heroImage);
  });

  it("phone edits write m placements only, and keep a custom phone layout on desktop edits", () => {
    const { s, hero } = setup();
    const d0 = Object.fromEntries(
      Object.entries(hero().layout.items).map(([id, it]) => [id, structuredClone(it.d)]),
    );
    const r = s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroImage, rect: { x: 2, y: 1, w: 6, h: 8 } }],
        "m",
      ),
    );
    expect(r.ok && r.ops.every((o) => o.op === "grid.place" && o.bp === "m")).toBe(true);
    for (const [id, d] of Object.entries(d0)) expect(item(hero(), id).d).toEqual(d);
    expect(item(hero(), I.heroImage).m).toEqual({ x: 2, y: 1, w: 6, h: 8 });
    expect(isMobileAuto(hero())).toBe(false);
    const m0 = structuredClone(item(hero(), I.heroImage).m);
    s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroButton, rect: { x: 1, y: 10, w: 8, h: 2 } }],
        "d",
      ),
    );
    expect(item(hero(), I.heroImage).m).toEqual(m0);
  });

  it("a first phone edit stores what the canvas showed for the other items (no jumps)", () => {
    const { s, hero } = setup();
    // Drop the stored phone placements: the renderer falls back for all of them.
    const bodies = Object.keys(hero().layout.items).map((id) => ({
      op: "grid.place",
      page: I.home,
      section: I.hero,
      block: id,
      bp: "m",
      rect: null,
    }));
    s().commit(bodies as never);
    expect(Object.values(hero().layout.items).some((i) => i.m)).toBe(false);
    s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroImage, rect: { x: 1, y: 30, w: 8, h: 4 } }],
        "m",
      ),
    );
    expect(Object.values(hero().layout.items).every((i) => i.m)).toBe(true);
    expect(item(hero(), I.heroHeading).m).toMatchObject({ x: 1, y: 1, w: 8 });
  });

  it("Reset mobile layout regenerates every phone placement", () => {
    const { s, hero } = setup();
    s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroImage, rect: { x: 3, y: 40, w: 4, h: 4 } }],
        "m",
      ),
    );
    expect(hero().layout.rows.m).toBeGreaterThanOrEqual(43);
    s().run(resetMobileCommand(s().doc, I.home, I.hero));
    const auto = autoMobileLayout(hero(), { reset: true });
    expect(item(hero(), I.heroImage).m).toEqual(auto?.[I.heroImage]?.m);
    expect(isMobileAuto(hero())).toBe(true);
    expect(hero().layout.rows.m).toBeLessThan(43);
    expect(resetMobileCommand(s().doc, I.home, I.hero)).toBeNull();
  });

  it("Customize tablet copies desktop to t, then tablet edits write t only; off removes them", () => {
    const { s, hero } = setup();
    s().run(customizeTabletCommand(s().doc, I.home, I.hero, true));
    for (const it of Object.values(hero().layout.items)) expect(it.t).toEqual(it.d);
    const d = structuredClone(item(hero(), I.heroImage).d);
    s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroImage, rect: { x: 1, y: 9, w: 24, h: 6 } }],
        "t",
      ),
    );
    expect(item(hero(), I.heroImage).t).toEqual({ x: 1, y: 9, w: 24, h: 6 });
    expect(item(hero(), I.heroImage).d).toEqual(d);
    s().run(customizeTabletCommand(s().doc, I.home, I.hero, false));
    expect(Object.values(hero().layout.items).some((i) => i.t)).toBe(false);
    expect(hero().layout.rows.t).toBeUndefined();
  });

  it("⌥-drag duplicates at the drop placement with fresh ids; originals stay", () => {
    const { s, hero } = setup();
    const r = s().run(
      duplicateCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroImage, rect: { x: 1, y: 9, w: 10, h: 4 } }],
        "d",
      ),
    );
    expect(r.ok).toBe(true);
    const h = hero();
    expect(h.blocks).toHaveLength(4);
    const copy = h.blocks.find(
      (b) => ![I.heroHeading, I.heroButton, I.heroImage].includes(b.id as never),
    );
    expect(copy?.type).toBe("image");
    expect(item(h, copy?.id as string).d).toEqual({ x: 1, y: 9, w: 10, h: 4 });
    expect(item(h, copy?.id as string).m).toBeDefined();
    expect(item(h, I.heroImage).d).toEqual({ x: 15, y: 1, w: 10, h: 4 });
    expect(s().selection).toEqual([{ kind: "block", id: copy?.id }]);
  });
});

describe("nudge and stacking order", () => {
  it("nudges by one cell (or four), clamped to the grid, merging a held key into one step", () => {
    const { s, hero, tick } = setup();
    const sel = [{ kind: "block" as const, id: I.heroImage }];
    s().setSelection(sel);
    const undoBefore = s().undoStack.length;
    const key = { mergeKey: "grid-nudge" };
    s().run(nudgeCommand(s().doc, I.home, sel, 1, 0, "d"), key);
    tick(100);
    s().run(nudgeCommand(s().doc, I.home, sel, 4, 0, "d"), key);
    tick(100);
    // The image already touches the right edge, so moving right does nothing.
    expect(item(hero(), I.heroImage).d).toMatchObject({ x: 15, w: 10 });
    s().run(nudgeCommand(s().doc, I.home, sel, -4, 1, "d"), key);
    expect(item(hero(), I.heroImage).d).toMatchObject({ x: 11, y: 2 });
    expect(s().undoStack.length).toBe(undoBefore + 1);
    expect(nudgeCommand(s().doc, I.home, sel, 0, -5, "d")?.label).toBe("Nudge");
  });

  it("keyboard: arrows nudge selected grid blocks for designers, and select otherwise", () => {
    const { store, s, hero } = setup();
    const env = { store } as ShortcutEnv;
    const key = (k: string, mods: Partial<KeyboardEventInit> = {}) =>
      handleEditorKey(env, new KeyboardEvent("keydown", { key: k, ...mods }));
    s().setSelection([{ kind: "block", id: I.heroButton }]);
    useSiteRoleStore.setState({ role: "designer" });
    expect(key("ArrowRight")).toBe(true);
    expect(item(hero(), I.heroButton).d.x).toBe(2);
    expect(key("ArrowDown", { shiftKey: true })).toBe(true);
    expect(item(hero(), I.heroButton).d.y).toBe(9);
    // Editors can't place: the arrow selects the next block instead.
    useSiteRoleStore.setState({ role: "editor" });
    const before = structuredClone(item(hero(), I.heroButton).d);
    expect(key("ArrowRight")).toBe(true);
    expect(item(hero(), I.heroButton).d).toEqual(before);
    expect(s().selection).not.toEqual([{ kind: "block", id: I.heroButton }]);
    expect(gridNudge(store, 1, 0)).toBe(false);
  });

  it("brings forward / sends back with ⌘] ⌘[ ⌥⌘] ⌥⌘[", () => {
    const { store, s, hero } = setup();
    useSiteRoleStore.setState({ role: "owner" });
    // Layer the button over the heading.
    s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroButton, rect: { x: 1, y: 2, w: 14, h: 2 } }],
        "d",
      ),
    );
    s().setSelection([{ kind: "block", id: I.heroHeading }]);
    const env = { store } as ShortcutEnv;
    const mac = /mac/i.test(navigator.platform);
    const mod = mac ? { metaKey: true } : { ctrlKey: true };
    handleEditorKey(env, new KeyboardEvent("keydown", { key: "]", code: "BracketRight", ...mod }));
    const zh = item(hero(), I.heroHeading).d.z ?? 1;
    const zb = item(hero(), I.heroButton).d.z ?? 1;
    expect(zh).toBeGreaterThan(zb);
    handleEditorKey(
      env,
      new KeyboardEvent("keydown", { key: "“", code: "BracketLeft", altKey: true, ...mod }),
    );
    const rects = displayRects(hero().layout, "d");
    expect(stackOrder(rects, domOrder(hero()))[0]).toBe(I.heroHeading);
    expect(
      zOrderCommand(s().doc, I.home, [{ kind: "block", id: I.heroHeading }], "back", "d"),
    ).toBeNull();
  });
});

describe("phones: simplified reorder", () => {
  it("restacks the phone layout in the new order, writing m only", () => {
    const { s, hero } = setup();
    const order = mobileOrder(hero());
    const next = [order[2], order[0], order[1]] as string[];
    const r = s().run(mobileReorderCommand(s().doc, I.home, I.hero, next));
    expect(r.ok && r.ops.every((o) => o.op === "grid.place" && o.bp === "m")).toBe(true);
    expect(mobileOrder(hero())).toEqual(next);
  });
});

describe("roles and locks", () => {
  it("only owners and designers arrange grids; locks restrict editors only (as the ops do)", () => {
    expect(gridCaps("owner", {}).edit).toBe(true);
    expect(gridCaps("designer", { locked: false }).edit).toBe(true);
    expect(gridCaps("designer", { locked: true }).edit).toBe(true);
    expect(gridCaps("owner", { locked: true }).edit).toBe(true);
    expect(gridCaps("editor", {})).toMatchObject({ edit: false });
    expect(gridCaps("editor", { locked: true }).reason).toMatch(/locked/);
    expect(gridCaps("contributor", {}).edit).toBe(false);
    expect(gridCaps(undefined, {}).edit).toBe(false);
  });

  it("keyboard nudges work for designers in a locked section, never for editors", () => {
    const { store, s, hero } = setup();
    s().commit([
      { op: "section.update", page: I.home, section: I.hero, set: { locked: true } } as never,
    ]);
    s().setSelection([{ kind: "block", id: I.heroButton }]);
    useSiteRoleStore.setState({ role: "designer" });
    expect(gridNudge(store, 1, 0)).toBe(true);
    expect(item(hero(), I.heroButton).d.x).toBe(2);
    useSiteRoleStore.setState({ role: "editor" });
    expect(gridNudge(store, 1, 0)).toBe(false);
    expect(item(hero(), I.heroButton).d.x).toBe(2);
  });
});

describe("pins, duplicates on a custom tablet, nudge limits", () => {
  it("pins to the bottom row, stays there when rows grow, trims with the last row, and unpins", () => {
    const { s, hero } = setup();
    const sel = [{ kind: "block" as const, id: I.heroButton }];
    s().run(pinCommand(s().doc, I.home, sel, "bottom", "d"));
    expect(item(hero(), I.heroButton).d).toMatchObject({ y: 5, h: 4, pin: "bottom" });
    // Another block dropped lower grows the rows: the pinned button is drawn on the new last rows.
    s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroImage, rect: { x: 15, y: 10, w: 10, h: 10 } }],
        "d",
      ),
    );
    expect(hero().layout.rows.d).toBe(19);
    expect(displayRects(hero().layout, "d").get(I.heroButton)?.y).toBe(16);
    // A vertical nudge leaves it pinned where it is; a sideways one moves it.
    s().run(nudgeCommand(s().doc, I.home, sel, 0, -3, "d"));
    expect(displayRects(hero().layout, "d").get(I.heroButton)?.y).toBe(16);
    s().run(nudgeCommand(s().doc, I.home, sel, 2, 0, "d"));
    expect(item(hero(), I.heroButton).d).toMatchObject({ x: 3, y: 16, pin: "bottom" });
    // Move the image back up and trim: the pinned button moves up with the last row.
    s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroImage, rect: { x: 15, y: 1, w: 10, h: 4 } }],
        "d",
      ),
    );
    s().run(trimRowsCommand(s().doc, I.home, I.hero));
    expect(hero().layout.rows.d).toBe(8);
    expect(item(hero(), I.heroButton).d).toMatchObject({ y: 5, pin: "bottom" });
    s().run(pinCommand(s().doc, I.home, sel, null, "d"));
    expect(item(hero(), I.heroButton).d.pin).toBeUndefined();
    // Top pins.
    s().run(pinCommand(s().doc, I.home, sel, "top", "d"));
    expect(item(hero(), I.heroButton).d).toMatchObject({ y: 1, pin: "top" });
  });

  it("phone pins write m only", () => {
    const { s, hero } = setup();
    const d = structuredClone(item(hero(), I.heroImage).d);
    const r = s().run(
      pinCommand(s().doc, I.home, [{ kind: "block", id: I.heroImage }], "top", "m"),
    );
    expect(r.ok && r.ops.every((o) => o.op === "grid.place" && o.bp === "m")).toBe(true);
    expect(item(hero(), I.heroImage).m).toMatchObject({ y: 1, pin: "top" });
    expect(item(hero(), I.heroImage).d).toEqual(d);
  });

  it("nudging down stops at the schema's row limit", () => {
    const { s, hero } = setup();
    const sel = [{ kind: "block" as const, id: I.heroButton }];
    s().run(nudgeCommand(s().doc, I.home, sel, 0, MAX_GRID_ROWS * 2, "d"));
    const r = item(hero(), I.heroButton).d;
    expect(r.y + r.h - 1).toBe(MAX_GRID_ROWS);
    expect(nudgeCommand(s().doc, I.home, sel, 0, 1, "d")).toBeNull();
  });

  it("⌥-duplicating on a customized tablet places the copy below at other sizes and keeps phones automatic", () => {
    const { s, hero } = setup();
    s().run(resetMobileCommand(s().doc, I.home, I.hero));
    s().run(customizeTabletCommand(s().doc, I.home, I.hero, true));
    expect(isMobileAuto(hero())).toBe(true);
    s().run(
      duplicateCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroImage, rect: { x: 1, y: 9, w: 10, h: 4 } }],
        "t",
      ),
    );
    const copy = s().selection[0]?.id as string;
    const c = item(hero(), copy);
    expect(c.t).toEqual({ x: 1, y: 9, w: 10, h: 4 });
    // Not on top of the original on desktop: below everything.
    expect(c.d.y).toBeGreaterThan(8);
    expect(isMobileAuto(hero())).toBe(true);
    expect(c.m).toBeDefined();
  });
});
