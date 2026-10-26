import type { Section, SiteDocument } from "@openspace/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { devSiteDocument, DEV_IDS as I } from "./model/dev-site";
import { createEditorStore, type EditorStore } from "./model/store";
import { dropTarget } from "./panels/LayersPanel";
import { EDITOR_SHORTCUTS, handleEditorKey, isTypingTarget, type ShortcutEnv } from "./shortcuts";
import { normaliseHref } from "./text/TextToolbar";

// Tests run on a non-Apple platform, so `mod` is Ctrl.
function key(k: string, init: Partial<KeyboardEventInit> & { target?: EventTarget } = {}) {
  const { target, ...rest } = init;
  const e = new KeyboardEvent("keydown", { key: k, cancelable: true, ...rest });
  if (target) Object.defineProperty(e, "target", { value: target });
  return e;
}

const sections = (doc: SiteDocument, page: string = I.home) =>
  (doc.pages[page as keyof SiteDocument["pages"]]?.sections ?? []) as Section[];

let store: EditorStore;
let env: ShortcutEnv;
beforeEach(() => {
  store = createEditorStore({ doc: devSiteDocument() });
  env = {
    store,
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomTo: vi.fn(),
    togglePalette: vi.fn(),
    toggleShortcutsSheet: vi.fn(),
    toggleChrome: vi.fn(),
    openPanel: vi.fn(),
  };
});
const s = () => store.getState();
const press = (k: string, init?: Parameters<typeof key>[1]) => {
  const e = key(k, init);
  const handled = handleEditorKey(env, e);
  return { handled, prevented: e.defaultPrevented };
};

describe("editor shortcuts", () => {
  it("duplicates, deletes and undoes/redoes with the keyboard", () => {
    s().select({ kind: "block", id: I.heroButton });
    expect(press("d", { ctrlKey: true })).toEqual({ handled: true, prevented: true });
    expect(sections(s().doc)[0]?.blocks).toHaveLength(4);
    press("Backspace");
    expect(sections(s().doc)[0]?.blocks).toHaveLength(3);
    press("z", { ctrlKey: true });
    expect(sections(s().doc)[0]?.blocks).toHaveLength(4);
    press("z", { ctrlKey: true, shiftKey: true });
    expect(sections(s().doc)[0]?.blocks).toHaveLength(3);
    press("y", { ctrlKey: true });
    expect(s().redoStack).toHaveLength(0);
  });

  it("lets Backspace through when nothing is selected", () => {
    expect(press("Backspace")).toEqual({ handled: false, prevented: false });
  });

  it("moves the selection with arrows, Esc and Enter", () => {
    s().select({ kind: "block", id: I.heroHeading });
    press("ArrowDown");
    expect(s().selection).toEqual([{ kind: "block", id: I.heroButton }]);
    press("ArrowLeft");
    expect(s().selection).toEqual([{ kind: "block", id: I.heroHeading }]);
    press("Escape");
    expect(s().selection).toEqual([{ kind: "section", id: I.hero }]);
    press("ArrowDown");
    expect(s().selection).toEqual([{ kind: "section", id: I.intro }]);
    press("Enter");
    expect(s().selection).toEqual([{ kind: "block", id: I.introText }]);
    // Enter on a text block starts inline editing; Esc stops it, then selects the section.
    press("Enter");
    expect(s().editing).toBe(I.introText);
    s().setEditing(null);
    press("Escape");
    expect(s().selection).toEqual([{ kind: "section", id: I.intro }]);
    press("Escape");
    expect(s().selection).toEqual([]);
  });

  it("moves blocks and sections with ⌥↑/⌥↓", () => {
    s().select({ kind: "section", id: I.hero });
    press("ArrowDown", { altKey: true });
    expect(sections(s().doc)[1]?.id).toBe(I.hero);
    press("ArrowUp", { altKey: true });
    expect(sections(s().doc)[0]?.id).toBe(I.hero);
  });

  it("ignores editing keys while typing, but keeps the palette reachable", () => {
    s().select({ kind: "block", id: I.heroButton });
    const input = document.createElement("input");
    expect(press("Backspace", { target: input }).handled).toBe(false);
    expect(sections(s().doc)[0]?.blocks).toHaveLength(3);
    expect(press("k", { ctrlKey: true, target: input }).handled).toBe(true);
    expect(env.togglePalette).toHaveBeenCalledOnce();
    // While inline text editing, the document shortcuts stay out of the way.
    s().setEditing(I.heroHeading);
    expect(press("d", { ctrlKey: true }).handled).toBe(false);
  });

  it("leaves arrows to focused controls outside the canvas", () => {
    s().select({ kind: "block", id: I.heroHeading });
    const button = document.createElement("button");
    document.body.append(button);
    expect(press("ArrowDown", { target: button }).handled).toBe(false);
    const surface = document.createElement("section");
    surface.setAttribute("data-editor-surface", "");
    const inner = document.createElement("div");
    surface.append(inner);
    document.body.append(surface);
    expect(press("ArrowDown", { target: inner }).handled).toBe(true);
    button.remove();
    surface.remove();
  });

  it("routes view and panel shortcuts", () => {
    press("=", { ctrlKey: true });
    press("-", { ctrlKey: true });
    press("0", { ctrlKey: true });
    press("!", { shiftKey: true, code: "Digit1" } as KeyboardEventInit);
    press("?", { shiftKey: true });
    press("\\", { ctrlKey: true, code: "Backslash" } as KeyboardEventInit);
    press("¡", { altKey: true, code: "Digit2" } as KeyboardEventInit);
    expect(env.zoomIn).toHaveBeenCalled();
    expect(env.zoomOut).toHaveBeenCalled();
    expect(env.zoomTo).toHaveBeenCalledWith(1);
    expect(env.zoomTo).toHaveBeenCalledWith("fit");
    expect(env.toggleShortcutsSheet).toHaveBeenCalled();
    expect(env.toggleChrome).toHaveBeenCalled();
    expect(env.openPanel).toHaveBeenCalledWith(1);
  });

  it("documents every shortcut for the ? sheet", () => {
    const labels = EDITOR_SHORTCUTS.map((d) => d.label);
    for (const l of [
      "Undo",
      "Redo",
      "Duplicate",
      "Delete",
      "Move up",
      "Move down",
      "Copy",
      "Paste (on any page)",
      "Select parent",
      "Command palette",
      "Keyboard shortcuts",
    ])
      expect(labels).toContain(l);
  });

  it("recognises typing targets from any document (the canvas is another realm)", () => {
    expect(isTypingTarget({ tagName: "INPUT", type: "email" } as unknown as EventTarget)).toBe(
      true,
    );
    expect(isTypingTarget({ tagName: "INPUT", type: "checkbox" } as unknown as EventTarget)).toBe(
      false,
    );
    expect(
      isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget),
    ).toBe(true);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("layers drag and drop targets", () => {
  const doc = devSiteDocument();
  it("reorders sections before or after the one dropped on", () => {
    expect(dropTarget(doc, I.home, `s:${I.hero}`, `s:${I.offerings}`)).toEqual({
      kind: "section",
      section: I.hero,
      at: { after: I.offerings },
    });
    expect(dropTarget(doc, I.home, `s:${I.faq}`, `s:${I.intro}`)).toEqual({
      kind: "section",
      section: I.faq,
      at: { before: I.intro },
    });
    expect(dropTarget(doc, I.home, `s:${I.faq}`, `b:${I.introText}`)).toBeNull();
  });

  it("moves blocks within and across sections", () => {
    expect(dropTarget(doc, I.home, `b:${I.heroHeading}`, `b:${I.heroImage}`)).toMatchObject({
      section: I.hero,
      at: { after: I.heroImage },
    });
    expect(dropTarget(doc, I.home, `b:${I.heroImage}`, `b:${I.introText}`)).toMatchObject({
      section: I.intro,
      at: { before: I.introText },
    });
    expect(dropTarget(doc, I.home, `b:${I.heroImage}`, `s:${I.faq}`)).toMatchObject({
      section: I.faq,
      at: "end",
    });
  });
});

describe("link entry", () => {
  it("turns what people type into safe links", () => {
    expect(normaliseHref("example.com")).toBe("https://example.com");
    expect(normaliseHref("hello@studio.org")).toBe("mailto:hello@studio.org");
    expect(normaliseHref("+1 (303) 555-0100")).toBe("tel:+13035550100");
    expect(normaliseHref("/about")).toBe("/about");
    expect(normaliseHref("#faq")).toBe("#faq");
    expect(normaliseHref("javascript:alert(1)")).toBeNull();
    expect(normaliseHref("   ")).toBeNull();
  });
});
