import type { GridLayout, SiteDocument } from "@openspace/schema";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider, useToastStore } from "../../../ui";
import { InspectorEnvProvider } from "../../inspector/env";
import { useEditorUi } from "../editor-store";
import { setLayoutMode } from "../model/actions";
import { EditorStoreProvider } from "../model/context";
import { devSiteDocument, DEV_IDS as I } from "../model/dev-site";
import { createEditorStore } from "../model/store";
import { placeCommand } from "./commands";
import { gridController, useGridDrag } from "./controller";
import { GridLayer, gridLayerRenders } from "./GridLayer";
import { type GridSection, isMobileAuto, uniformMetrics } from "./model";

/**
 * The drag loop against a real (jsdom) canvas document. jsdom can't lay out, so geometry comes
 * from injected metrics: 24 columns of 40px + 10px gaps behind an 80px gutter, 24px rows.
 */
const METRICS = uniformMetrics({
  cols: 24,
  colWidth: 40,
  gap: 10,
  gutter: 80,
  rows: 8,
  rowUnit: 24,
});
const PITCH = 50;

let frames: Array<() => void> = [];
const flushFrames = () => {
  const run = frames;
  frames = [];
  for (const f of run) f();
};

function pointer(
  type: string,
  target: EventTarget,
  x: number,
  y: number,
  init: MouseEventInit = {},
) {
  const view = (target as Node).ownerDocument?.defaultView ?? window;
  const Ctor = (view as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent;
  const e = new Ctor(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    ...init,
  });
  Object.defineProperty(e, "pointerId", { value: 1 });
  target.dispatchEvent(e);
  return e;
}

function setup(role = "designer", opts: { customPhone?: boolean } = {}) {
  const store = createEditorStore({ doc: devSiteDocument(), actor: "user:test" });
  const s = () => store.getState();
  s().run(setLayoutMode(s().doc, I.home, I.hero, "grid", () => 96));
  if (opts.customPhone)
    s().run(
      placeCommand(
        s().doc,
        I.home,
        I.hero,
        [{ id: I.heroImage, rect: { x: 1, y: 40, w: 8, h: 6 } }],
        "m",
      ),
    );
  const hero = () =>
    s().doc.pages[I.home as keyof SiteDocument["pages"]]?.sections.find(
      (x) => x.id === I.hero,
    ) as GridSection;
  // A canvas document with the hero's grid DOM (blocks carry the renderer's data attributes).
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  const frameDoc = iframe.contentDocument as Document;
  frameDoc.body.innerHTML = `<section data-os-section data-os-id="${I.hero}"><div class="os-grid">${hero()
    .blocks.map(
      (b) =>
        `<div class="os-grid__item"><div data-os-block data-os-id="${b.id}"><p>${b.type}</p></div></div>`,
    )
    .join("")}</div></section>`;
  frameDoc.addEventListener("pointerdown", (e) => gridController.pointerDownInFrame(e));
  const utils = render(
    <TooltipProvider>
      <EditorStoreProvider store={store}>
        <InspectorEnvProvider role={role}>
          <GridLayer
            frameDoc={frameDoc}
            scale={1}
            width={1400}
            height={900}
            measure={() => METRICS}
          />
        </InspectorEnvProvider>
      </EditorStoreProvider>
    </TooltipProvider>,
  );
  const blockEl = (id: string) =>
    frameDoc.querySelector(`[data-os-id="${id}"][data-os-block]`) as HTMLElement;
  const d = (id: string) => hero().layout.items[id as keyof GridLayout["items"]]?.d;
  return { store, s, hero, frameDoc, blockEl, d, ...utils };
}

beforeEach(() => {
  frames = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.push(() => cb(0));
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  gridController.cancel();
  gridController.reminded.clear();
  useToastStore.getState().clear();
  useGridDrag.setState({ active: null });
  useEditorUi.getState().reset();
  document.body.innerHTML = "";
});

describe("grid drag loop", () => {
  it("moves a block with snapping, without re-rendering React on every pointer move, and commits one undo step", () => {
    const { s, hero, frameDoc, blockEl, d, container } = setup();
    const undo0 = s().undoStack.length;
    const img = blockEl(I.heroImage);
    act(() => {
      pointer("pointerdown", img, 900, 40);
    });
    // Past the threshold: the drag starts (React renders once for the start).
    act(() => {
      pointer("pointermove", img, 890, 40);
      flushFrames();
    });
    expect(useGridDrag.getState().active).toMatchObject({ kind: "move", ids: [I.heroImage] });
    const rendersAtStart = gridLayerRenders.count;
    act(() => {
      for (let i = 1; i <= 60; i++) {
        pointer("pointermove", frameDoc.body, 890 - i * 5, 40 + i);
        flushFrames();
      }
    });
    expect(gridLayerRenders.count).toBe(rendersAtStart);
    // The snapped ghost is positioned by a CSS transform.
    const ghost = container.querySelector(".st-grid__ghost") as HTMLElement;
    expect(ghost.style.transform).toMatch(/translate3d\(/);
    expect(ghost.style.display).toBe("");
    act(() => {
      pointer("pointerup", frameDoc.body, 900 - PITCH * 6, 40 + 48);
    });
    expect(d(I.heroImage)).toMatchObject({ x: 9, y: 3, w: 10, h: 4 });
    expect(s().undoStack.length).toBe(undo0 + 1);
    // The phone layout is automatic: it followed the desktop move, so no reminder.
    expect(isMobileAuto(hero())).toBe(true);
    expect(useToastStore.getState().toasts.map((t) => t.title)).not.toContain(
      "Check the phone layout",
    );
    expect(useGridDrag.getState().active).toBeNull();
    // The click that ends the drag doesn't select or start editing.
    expect(gridController.consumeClick()).toBe(true);
    s().undo();
    expect(d(I.heroImage)).toMatchObject({ x: 15, y: 1 });
  });

  it("reminds once to review a hand-made phone layout after a desktop drop (doc 04 §9.9)", () => {
    const { frameDoc, blockEl } = setup("designer", { customPhone: true });
    act(() => {
      pointer("pointerdown", blockEl(I.heroImage), 900, 40);
      pointer("pointermove", frameDoc.body, 800, 40);
      flushFrames();
      pointer("pointerup", frameDoc.body, 800, 40);
    });
    expect(useToastStore.getState().toasts.map((t) => t.title)).toContain("Check the phone layout");
    gridController.consumeClick();
  });

  it("a press without movement is a click (no drag, no op)", () => {
    const { s, blockEl } = setup();
    const undo0 = s().undoStack.length;
    act(() => {
      pointer("pointerdown", blockEl(I.heroButton), 100, 120);
      pointer("pointermove", blockEl(I.heroButton), 102, 121);
      pointer("pointerup", blockEl(I.heroButton), 102, 121);
    });
    expect(s().undoStack.length).toBe(undo0);
    expect(gridController.consumeClick()).toBe(false);
  });

  it("⇧ constrains the drag to one axis; ⌥ drops a copy; Esc cancels", () => {
    const { s, hero, frameDoc, blockEl, d } = setup();
    act(() => {
      pointer("pointerdown", blockEl(I.heroButton), 100, 120);
      pointer("pointermove", frameDoc.body, 100 + PITCH * 3, 120 + 30, { shiftKey: true });
      flushFrames();
      pointer("pointerup", frameDoc.body, 100 + PITCH * 3, 120 + 30, { shiftKey: true });
    });
    expect(d(I.heroButton)).toMatchObject({ x: 4, y: 5 });

    act(() => {
      pointer("pointerdown", blockEl(I.heroButton), 100, 120);
      pointer("pointermove", frameDoc.body, 100, 120 + 24 * 5, { altKey: true });
      flushFrames();
      pointer("pointerup", frameDoc.body, 100, 120 + 24 * 5, { altKey: true });
    });
    expect(hero().blocks).toHaveLength(4);
    expect(d(I.heroButton)).toMatchObject({ x: 4, y: 5 });
    const copy = s().selection[0]?.id as string;
    expect(copy).not.toBe(I.heroButton);
    expect(d(copy)).toMatchObject({ x: 4, y: 10 });

    const before = s().doc;
    act(() => {
      pointer("pointerdown", blockEl(I.heroImage), 900, 40);
      pointer("pointermove", frameDoc.body, 700, 200);
      flushFrames();
    });
    act(() => {
      frameDoc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    act(() => {
      pointer("pointerup", frameDoc.body, 700, 200);
    });
    expect(s().doc).toBe(before);
  });

  it("moves a multi-selection together", () => {
    const { s, frameDoc, blockEl, d } = setup();
    act(() => {
      s().setSelection([
        { kind: "block", id: I.heroHeading },
        { kind: "block", id: I.heroButton },
      ]);
    });
    act(() => {
      pointer("pointerdown", blockEl(I.heroHeading), 100, 40);
      pointer("pointermove", frameDoc.body, 100 + PITCH * 2, 40 + 24 * 2);
      flushFrames();
      pointer("pointerup", frameDoc.body, 100 + PITCH * 2, 40 + 24 * 2);
    });
    expect(d(I.heroHeading)).toMatchObject({ x: 3, y: 3 });
    expect(d(I.heroButton)).toMatchObject({ x: 3, y: 7 });
  });

  it("warns live when text would overlap text", () => {
    const { frameDoc, blockEl, container } = setup();
    act(() => {
      pointer("pointerdown", blockEl(I.heroButton), 100, 120);
      pointer("pointermove", frameDoc.body, 100, 120 - 24 * 3);
      flushFrames();
    });
    const badge = container.querySelector(".st-grid__badge--live") as HTMLElement;
    expect(badge.style.display).toBe("");
    expect(badge.textContent).toMatch(/Text overlaps text/);
    act(() => {
      pointer("pointermove", frameDoc.body, 100, 120 + 24 * 3);
      flushFrames();
    });
    expect(badge.style.display).toBe("none");
    act(() => gridController.cancel());
  });

  it("marquee-selects blocks by dragging on empty grid space", () => {
    const { s, frameDoc } = setup();
    const grid = frameDoc.querySelector(".os-grid") as HTMLElement;
    act(() => {
      pointer("pointerdown", grid, 85, 5);
      pointer("pointermove", frameDoc.body, 140, 150);
      flushFrames();
    });
    expect(s().selection).toEqual([
      { kind: "block", id: I.heroHeading },
      { kind: "block", id: I.heroButton },
    ]);
    act(() => {
      pointer("pointerup", frameDoc.body, 140, 150);
    });
    expect(gridController.consumeClick()).toBe(true);
  });

  it("resizes from a handle (one grid.place) and shows 8 handles only to designers", async () => {
    const { s, d } = setup();
    act(() => s().select({ kind: "block", id: I.heroImage }));
    const handles = document.querySelectorAll(".st-grid__handle");
    expect(handles).toHaveLength(8);
    const west = document.querySelector('.st-grid__handle[data-pos="w"]') as HTMLElement;
    act(() => {
      pointer("pointerdown", west, 0, 0);
    });
    act(() => {
      pointer("pointermove", window, -PITCH * 4, 0);
      flushFrames();
      pointer("pointerup", window, -PITCH * 4, 0);
    });
    expect(d(I.heroImage)).toMatchObject({ x: 11, w: 14 });
  });

  it("editors see the grid but get no handles, no drag and a plain reason", () => {
    const { s, blockEl, d } = setup("editor");
    act(() => s().select({ kind: "block", id: I.heroImage }));
    expect(document.querySelectorAll(".st-grid__handle")).toHaveLength(0);
    expect(screen.getByText(/Only the site’s designer can move blocks/)).toBeTruthy();
    act(() => {
      pointer("pointerdown", blockEl(I.heroImage), 900, 40);
      pointer("pointermove", blockEl(I.heroImage), 700, 200);
      flushFrames();
      pointer("pointerup", blockEl(I.heroImage), 700, 200);
    });
    expect(d(I.heroImage)).toMatchObject({ x: 15, y: 1 });
  });

  it("the grid bar offers Customize tablet and Reset mobile layout per device", async () => {
    const user = userEvent.setup();
    const { s, hero } = setup("designer", { customPhone: true });
    act(() => s().select({ kind: "section", id: I.hero }));
    expect(screen.getByRole("toolbar", { name: "Grid" })).toBeTruthy();
    act(() => useEditorUi.getState().setBreakpoint("tablet"));
    await user.click(screen.getByRole("switch"));
    expect(Object.values(hero().layout.items).every((i) => i.t)).toBe(true);
    act(() => useEditorUi.getState().setBreakpoint("mobile"));
    expect(screen.getByText(/custom/)).toBeTruthy();
    const reset = screen.getByRole("button", { name: /Reset mobile layout/ });
    await user.click(reset);
    expect(screen.getByText(/automatic/)).toBeTruthy();
  });
});
