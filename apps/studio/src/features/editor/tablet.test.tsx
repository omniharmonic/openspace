import "fake-indexeddb/auto";
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { useEditorUi } from "./editor-store";
import { DEV_IDS as I } from "./model/dev-site";
import type { EditorStore } from "./model/store";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
const willow = sites[0] as Site;
const store = () =>
  (window as unknown as { __osEditorStore: EditorStore }).__osEditorStore.getState();
const realMatchMedia = window.matchMedia;

/** An 834px tablet: only the one-panel query (768–1099 px) matches. */
function tablet() {
  window.matchMedia = (query: string) =>
    ({
      matches: /min-width:\s*768px\) and \(max-width:\s*1099px/.test(query),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

const ui = () => useEditorUi.getState();
const inspector = () => screen.queryByRole("complementary", { name: "Inspector" });

beforeEach(() => {
  useEditorUi.setState({ onePanel: false });
  ui().reset();
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
  useEditorUi.setState({ onePanel: false });
});

describe("tablet (834px): one side panel at a time", () => {
  async function open() {
    tablet();
    const utils = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await screen.findByTitle("Page canvas");
    await waitFor(() => expect(store().doc.pages[I.home]).toBeTruthy());
    return utils;
  }

  it("opens with the inspector only, and the rail and inspector toggle trade places", async () => {
    const { user } = await open();
    await waitFor(() => expect(ui().onePanel).toBe(true));
    expect(ui().leftPanel).toBeNull();
    expect(ui().inspectorOpen).toBe(true);

    const rail = screen.getByRole("navigation", { name: "Panels" });
    await user.click(within(rail).getByRole("button", { name: /^Layers/ }));
    expect(ui().leftPanel).toBe("layers");
    expect(ui().inspectorOpen).toBe(false);
    await waitFor(() => expect(inspector()).toBeNull());

    await user.click(screen.getByRole("button", { name: "Show inspector" }));
    expect(ui().inspectorOpen).toBe(true);
    expect(ui().leftPanel).toBeNull();

    // Again, the other way round: the rail closes the inspector every time, not just once.
    await user.click(within(rail).getByRole("button", { name: /^Site styles/ }));
    expect(ui().leftPanel).toBe("styles");
    expect(ui().inspectorOpen).toBe(false);
  });

  it("selecting in Layers keeps Layers open; selecting on the canvas shows the inspector", async () => {
    const { user } = await open();
    await waitFor(() => expect(ui().onePanel).toBe(true));
    act(() => ui().toggleLeftPanel("layers"));
    const tree = await screen.findByRole("tree", { name: "Sections and blocks" });
    await user.click(within(tree).getAllByRole("treeitem")[1] as HTMLElement);
    expect(store().selection.length).toBe(1);
    expect(ui().leftPanel).toBe("layers");
    expect(ui().inspectorOpen).toBe(false);

    // A click on the canvas (inside the page frame) selects there and reveals the inspector.
    const frame = screen.getByTitle("Page canvas") as HTMLIFrameElement;
    const target = await waitFor(() => {
      const el = frame.contentDocument?.querySelector(`[data-os-id="${I.heroImage}"]`);
      if (!el) throw new Error("block not rendered yet");
      return el;
    });
    act(() => {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(store().selection[0]?.id).toBe(I.heroImage);
    expect(ui().inspectorOpen).toBe(true);
    expect(ui().leftPanel).toBeNull();
  });

  it("leaves desktop alone: both panels stay open", () => {
    act(() => {
      ui().setOnePanel(false);
      ui().setLeftPanel("layers");
      ui().toggleInspector();
      ui().toggleInspector();
      ui().revealInspector();
    });
    expect(ui().leftPanel).toBe("layers");
    expect(ui().inspectorOpen).toBe(true);
  });
});
