import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { patchLayoutApis } from "../../test/setup";
import { useBlockMenu } from "../add-section/blockMenuStore";
import { useEditorUi } from "../editor/editor-store";
import { DEV_IDS as I } from "../editor/model/dev-site";
import type { EditorStore } from "../editor/model/store";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
const willow = sites[0] as Site;

async function openStudio() {
  const utils = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
  const frame = (await screen.findByTitle("Page canvas")) as HTMLIFrameElement;
  await waitFor(() => expect(frame.contentDocument?.querySelector("[data-os-page]")).toBeTruthy());
  const doc = frame.contentDocument as Document;
  patchLayoutApis(frame.contentWindow as Window & typeof globalThis);
  const q = (id: string) => doc.querySelector(`[data-os-id="${id}"]`) as HTMLElement;
  const store = () =>
    (window as unknown as { __osEditorStore: EditorStore }).__osEditorStore.getState();
  return { ...utils, doc, q, store };
}

const inspector = () => screen.getByRole("complementary", { name: "Inspector" });

describe("inspector in the editor", () => {
  beforeEach(() => {
    useEditorUi.getState().reset();
    useBlockMenu.getState().close();
  });

  it("shows generated fields for the selected block and edits go to the canvas", async () => {
    const { q, user } = await openStudio();
    fireEvent.click(q(I.heroButton));
    const label = within(inspector()).getByRole("textbox", { name: "Label" });
    await user.clear(label);
    await user.type(label, "Join a class");
    fireEvent.blur(label);
    await waitFor(() => expect(q(I.heroButton).textContent).toContain("Join a class"));
  });

  it("restyles the whole canvas live from Site Styles", async () => {
    const { doc, user, store } = await openStudio();
    act(() => {
      fireEvent.keyDown(window, { key: "¢", code: "Digit4", altKey: true });
    });
    const styles = await screen.findByRole("complementary", { name: "Site styles" });
    const before = doc.querySelector('style[data-os="tokens"]')?.textContent;
    await user.click(await within(styles).findByRole("radio", { name: "Compact" }));
    expect(store().doc.styles.choices.density).toBe("compact");
    await waitFor(() =>
      expect(doc.querySelector('style[data-os="tokens"]')?.textContent).not.toBe(before),
    );
  });

  it("opens the block menu with / on the canvas and inserts next to the selection", async () => {
    const { q, user, store } = await openStudio();
    fireEvent.click(q(I.introText));
    act(() => {
      fireEvent.keyDown(q(I.introText).ownerDocument.body, { key: "/" });
    });
    const menu = await screen.findByRole("dialog", { name: "Add a block" });
    await user.type(within(menu).getByRole("combobox"), "button");
    await user.keyboard("{Enter}");
    const intro = store().doc.pages[I.home as never] as {
      sections: Array<{ id: string; blocks: Array<{ id: string; type: string }> }>;
    };
    const blocks = intro.sections.find((s) => s.id === I.intro)?.blocks ?? [];
    const i = blocks.findIndex((b) => b.id === I.introText);
    expect(blocks[i + 1]?.type).toBe("button");
    await waitFor(() => expect(q(blocks[i + 1]?.id as string)).toBeTruthy());
  });

  it("the + between sections opens the gallery and inserts exactly there", async () => {
    const { q, user, store } = await openStudio();
    fireEvent.mouseMove(q(I.hero));
    fireEvent.click(q(I.hero));
    const add = await screen.findByRole("button", { name: "Add a section below" });
    await user.click(add);
    const dialog = await screen.findByRole("dialog", { name: "Add a section" });
    await user.click(within(dialog).getByRole("button", { name: /^About & story/ }));
    await user.click(within(dialog).getByRole("button", { name: /^Story with portrait/ }));
    const home = store().doc.pages[I.home as never] as { sections: Array<{ preset?: string }> };
    expect(home.sections[1]?.preset).toMatch(/^about\//);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add a section" })).toBeNull());
  });
});
