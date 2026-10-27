import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { patchLayoutApis } from "../../test/setup";
import { useEditorUi } from "./editor-store";
import { DEV_IDS as I } from "./model/dev-site";
import type { EditorStore } from "./model/store";
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
  const store = () =>
    (window as unknown as { __osEditorStore: EditorStore }).__osEditorStore.getState();
  return { ...utils, frame, doc, q, store };
}

const inspector = () => screen.getByRole("complementary", { name: "Inspector" });

describe("canvas", () => {
  beforeEach(() => useEditorUi.getState().reset());

  it("renders the page through the renderer with site tokens, base and block CSS", async () => {
    const { doc, hub } = await openCanvas();
    expect(hub.calls.some((c) => c.method === "getRoomDocument")).toBe(true);
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

  it("shows a placeholder, never the code, for a page's head/footer code (M-8)", async () => {
    const { doc, store } = await openCanvas();
    expect(doc.querySelector("[data-os-canvas-code]")).toBeNull();
    const pageId = store().pageId;
    act(() => {
      store().commit([
        {
          op: "page.update",
          page: pageId,
          set: { footerInjection: "<script>window.__osInjectedCode = true</script>" },
        } as never,
      ]);
    });
    await waitFor(() =>
      expect(doc.querySelector("[data-os-canvas-code]")?.textContent).toContain("footer code"),
    );
    expect(doc.documentElement.innerHTML).not.toContain("__osInjectedCode");
    expect(
      (doc.defaultView as unknown as { __osInjectedCode?: boolean }).__osInjectedCode,
    ).toBeUndefined();
  });

  it("selects blocks and sections by clicking, and edits text inline as ops", async () => {
    const { q, user } = await openCanvas();
    fireEvent.click(q(I.heroButton));
    expect(within(inspector()).getByText("Button")).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Button block" })).toBeInTheDocument();

    // Shift-click adds to the selection.
    fireEvent.click(q(I.heroImage), { shiftKey: true });
    expect(within(inspector()).getByText("2 blocks selected")).toBeInTheDocument();

    // One click on words starts editing them ("click any words to change them" — wave 3:
    // it used to take a double-click); Tiptap mounts on the block.
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

    const hero = within(layers).getByRole("treeitem", { name: "Hero" });
    await user.dblClick(within(hero).getAllByText("Hero")[0] as HTMLElement);
    const input = within(layers).getByRole("textbox", { name: "Section name" });
    await user.clear(input);
    await user.type(input, "Welcome{Enter}");
    expect(within(layers).getByRole("treeitem", { name: "Welcome" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(within(layers).getByRole("treeitem", { name: "Hero" })).toBeInTheDocument();
  });

  it("renames, hides and deletes blocks from the layers tree with the keyboard", async () => {
    const { q, user, doc } = await openCanvas();
    act(() => {
      fireEvent.keyDown(window, { key: "™", code: "Digit2", altKey: true });
    });
    const layers = await screen.findByRole("complementary", { name: "Layers" });
    const tree = within(layers).getByRole("tree", { name: "Sections and blocks" });
    const button = within(tree).getByRole("treeitem", { name: "Button" });
    expect(button).toHaveAttribute("aria-level", "2");

    // Hide: ghosted on the canvas (the live site skips it).
    await user.click(within(button).getByRole("button", { name: "Hide block" }));
    expect(q(I.heroButton).hasAttribute("data-os-hidden")).toBe(true);

    // Click selects; arrows move through rows (and the selection); Enter renames.
    await user.click(within(button).getByText("Button"));
    expect(button).toHaveAttribute("aria-selected", "true");
    button.focus();
    await user.keyboard("{ArrowDown}");
    const image = within(tree).getAllByRole("treeitem", { name: "Image" })[0] as HTMLElement;
    expect(image).toHaveFocus();
    expect(image).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Enter}");
    const input = within(layers).getByRole("textbox", { name: "Block name" });
    await user.clear(input);
    await user.type(input, "Studio photo{Enter}");
    expect(within(tree).getByRole("treeitem", { name: "Studio photo" })).toHaveFocus();
    expect(within(inspector()).getByText("Studio photo")).toBeInTheDocument();

    // ⌫ on the focused row deletes it.
    await user.keyboard("{Backspace}");
    expect(doc.querySelector(`[data-os-id="${I.heroImage}"]`)).toBeNull();
  });

  it("edits rich text inside list items (e.g. a columns item) inline", async () => {
    const { q, store } = await openCanvas();
    act(() => store().setEditing(I.offeringsColumns, { path: "items.1.body", kind: "rich" }));
    await waitFor(() =>
      expect(
        q(I.offeringsColumns).querySelector('[data-os-editing-field="items.1.body"]'),
      ).toBeTruthy(),
    );
    // The other items' rich text is tagged for click-to-edit.
    expect(q(I.offeringsColumns).querySelector('[data-os-field="items.0.body"]')).toBeTruthy();
    const editor = useTextEditing.getState().editor;
    act(() => {
      editor?.chain().setTextSelection(1).insertContent("First, ").run();
    });
    await act(() => new Promise((r) => setTimeout(r, TEXT_COMMIT_MS + 20)));
    const items = store().doc.pages[I.home as never]?.sections[2]?.blocks[1]?.fields
      .items as Array<{
      heading: string;
      body: { content: Array<{ content: Array<{ text: string }> }> };
    }>;
    expect(items[1]?.body.content[0]?.content[0]?.text).toMatch(/^First, Come ten minutes/);
    expect(items[0]?.heading).toBe("Book");
  });

  it("ends a plain text session safely when a collaborator changes that block", async () => {
    const { q, store, hub } = await openCanvas();
    await screen.findByText("Saved");
    act(() => store().setEditing(I.heroButton, { path: "label", kind: "plain" }));
    const el = await waitFor(() => {
      const found = q(I.heroButton).querySelector<HTMLElement>("[data-os-plain-editing]");
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    el.textContent = "Typed here";
    // Ana changes another field of the same block while the label is being typed.
    act(() => {
      hub
        .room(willow.id)
        .collaborator({ userId: "u_ana", name: "Ana Ruiz" })
        .edit([
          {
            op: "block.update",
            page: I.home,
            block: I.heroButton,
            set: { secondaryLabel: "Bring a friend" },
          } as never,
        ]);
    });
    await waitFor(() => expect(q(I.heroButton).textContent).toContain("Bring a friend"));
    // The session ended first (committing what was typed), then React re-rendered its own nodes.
    expect(el.hasAttribute("contenteditable")).toBe(false);
    expect(el.textContent).toBe("Typed here");
    expect(store().editing).toBeNull();
    const fields = store().doc.pages[I.home as never]?.sections[0]?.blocks[1]?.fields as {
      label: string;
      secondaryLabel: string;
    };
    expect(fields).toMatchObject({ label: "Typed here", secondaryLabel: "Bring a friend" });
    await screen.findByText("Saved");
    expect(hub.room(willow.id).doc).toEqual(store().doc);
  });

  it("edits plain text fields (headings, labels) in place and commits on Enter", async () => {
    const { q, store } = await openCanvas();
    act(() => store().setEditing(I.offeringsColumns, { path: "items.0.heading", kind: "plain" }));
    const el = await waitFor(() => {
      const found = q(I.offeringsColumns).querySelector<HTMLElement>("[data-os-plain-editing]");
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    expect(el.textContent).toBe("Book");
    expect(el.getAttribute("contenteditable")).toMatch(/plaintext-only|true/);
    // Typing replaces the text node (as a browser might); the session restores React's nodes.
    el.textContent = "Reserve";
    act(() => {
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    await waitFor(() => expect(el.hasAttribute("contenteditable")).toBe(false));
    const items = store().doc.pages[I.home as never]?.sections[2]?.blocks[1]?.fields
      .items as Array<{
      heading: string;
    }>;
    expect(items[0]?.heading).toBe("Reserve");
    expect(el.textContent).toBe("Reserve");
    expect(store().editing).toBeNull();

    // Esc throws an edit away.
    act(() => store().setEditing(I.heroButton, { path: "label", kind: "plain" }));
    const label = await waitFor(() => {
      const found = q(I.heroButton).querySelector<HTMLElement>("[data-os-plain-editing]");
      expect(found).toBeTruthy();
      return found as HTMLElement;
    });
    label.textContent = "Nope";
    act(() => {
      label.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(label.textContent).toBe("See the schedule");
  });

  it("adds a section from the preset gallery and switches pages", async () => {
    const { doc, user } = await openCanvas();
    const before = doc.querySelectorAll("main [data-os-section]").length;
    act(() => {
      fireEvent.keyDown(window, { key: "£", code: "Digit3", altKey: true });
    });
    const add = await screen.findByRole("complementary", { name: "Add section" });
    await user.click(await within(add).findByRole("button", { name: /^Story with portrait/ }));
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
