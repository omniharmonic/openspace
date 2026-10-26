import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { patchLayoutApis } from "../../test/setup";
import { useEditorUi } from "./editor-store";
import { DEV_IDS as I } from "./model/dev-site";
import { TEXT_COMMIT_MS, useTextEditing } from "./text/InlineText";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
const willow = sites[0] as Site;

async function openCanvas() {
  const utils = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
  const frame = (await screen.findByTitle("Page canvas")) as HTMLIFrameElement;
  await waitFor(() => expect(frame.contentDocument?.querySelector("[data-os-page]")).toBeTruthy());
  const doc = frame.contentDocument as Document;
  patchLayoutApis(frame.contentWindow as Window & typeof globalThis);
  const q = (id: string) => doc.querySelector(`[data-os-id="${id}"]`) as HTMLElement;
  return { ...utils, frame, doc, q };
}

const inspector = () => screen.getByRole("complementary", { name: "Inspector" });

describe("canvas", () => {
  beforeEach(() => useEditorUi.getState().reset());

  it("renders the page through the renderer with site tokens, base and block CSS", async () => {
    const { doc, hub } = await openCanvas();
    expect(hub.calls.some((c) => c.method === "getDocument")).toBe(true);
    expect(doc.querySelector('style[data-os="tokens"]')?.textContent).toContain("--os-");
    expect(doc.querySelector('style[data-os="base"]')?.textContent?.length).toBeGreaterThan(1000);
    expect(doc.querySelector('style[data-os="blocks"]')?.textContent).toContain("@layer os.blocks");
    expect(doc.querySelector('link[data-os="fonts"]')?.getAttribute("href")).toMatch(
      /^https:\/\/fonts\.googleapis\.com/,
    );
    expect(doc.body.dataset.osMode).toBe("editor");
    expect(doc.querySelector(`[data-os-id="${I.heroHeading}"]`)?.textContent).toContain(
      "Willow Street Yoga",
    );
  });

  it("selects blocks and sections by clicking, and edits text inline as ops", async () => {
    const { q, user } = await openCanvas();
    fireEvent.click(q(I.heroButton));
    expect(within(inspector()).getByText("Button")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Button block" })).toBeInTheDocument();

    // Shift-click adds to the selection.
    fireEvent.click(q(I.heroImage), { shiftKey: true });
    expect(within(inspector()).getByText("2 blocks selected")).toBeInTheDocument();

    // Clicking the selected text block again starts editing; Tiptap mounts on the block.
    fireEvent.click(q(I.introText));
    fireEvent.click(q(I.introText));
    await waitFor(() =>
      expect(q(I.introText).querySelector("[data-os-inline-editor]")).toBeTruthy(),
    );
    const editable = q(I.introText).querySelector("[data-os-inline-editor]") as HTMLElement;
    expect(editable.className).toContain("os-rich os-text os-text--default");
    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toBeInTheDocument();

    const editor = useTextEditing.getState().editor;
    expect(editor).toBeTruthy();
    act(() => {
      editor?.chain().setTextSelection(3).insertContent("Hello. ").run();
    });
    await act(() => new Promise((r) => setTimeout(r, TEXT_COMMIT_MS + 20)));
    const undo = screen.getByRole("button", { name: "Undo" });
    expect(undo).not.toHaveAttribute("aria-disabled");
    expect(q(I.introText).textContent).toContain("Hello. ");

    // Undo goes through the op history and flows back into the open editor.
    await user.click(undo);
    await waitFor(() => expect(q(I.introText).textContent).not.toContain("Hello. "));
  });

  it("toggles section visibility and renames from the layers panel", async () => {
    const { q, user } = await openCanvas();
    act(() => {
      fireEvent.keyDown(window, { key: "™", code: "Digit2", altKey: true });
    });
    const layers = await screen.findByRole("complementary", { name: "Layers" });
    const hideButtons = within(layers).getAllByRole("button", { name: "Hide section" });
    await user.click(hideButtons[1] as HTMLElement);
    expect(q(I.intro).hasAttribute("data-os-hidden")).toBe(true);
    expect(within(layers).getByRole("button", { name: "Show section" })).toBeInTheDocument();

    await user.dblClick(within(layers).getByRole("button", { name: "Hero" }));
    const input = within(layers).getByRole("textbox", { name: "Section name" });
    await user.clear(input);
    await user.type(input, "Welcome{Enter}");
    expect(within(layers).getByRole("button", { name: "Welcome" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(within(layers).getByRole("button", { name: "Hero" })).toBeInTheDocument();
  });

  it("adds a section from a starter and switches pages", async () => {
    const { doc, user } = await openCanvas();
    const before = doc.querySelectorAll("main [data-os-section]").length;
    act(() => {
      fireEvent.keyDown(window, { key: "£", code: "Digit3", altKey: true });
    });
    const add = await screen.findByRole("list", { name: "Section starters" });
    await user.click(within(add).getByRole("button", { name: /Text and image/ }));
    expect(doc.querySelectorAll("main [data-os-section]").length).toBe(before + 1);

    act(() => {
      fireEvent.keyDown(window, { key: "¡", code: "Digit1", altKey: true });
    });
    await user.click(await screen.findByRole("button", { name: /Classes/ }));
    await waitFor(() => expect(doc.querySelector(`[data-os-id="${I.classesEmbed}"]`)).toBeTruthy());
    // Code embeds stay inside a sandbox without same-origin access.
    const embed = doc.querySelector(`[data-os-id="${I.classesEmbed}"] iframe`);
    expect(embed?.getAttribute("sandbox")).toBeTruthy();
    expect(embed?.getAttribute("sandbox")).not.toContain("allow-same-origin");
  });

  it("opens the shortcuts sheet with ?", async () => {
    await openCanvas();
    act(() => {
      fireEvent.keyDown(window, { key: "?", shiftKey: true });
    });
    const sheet = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(sheet).getByText("Duplicate")).toBeInTheDocument();
  });
});
