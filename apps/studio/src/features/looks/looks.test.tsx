import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { useEditorUi } from "../editor/editor-store";
import type { EditorStore } from "../editor/model/store";
import { useLookTrial } from "./trial";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
const willow = sites[0] as Site;
const store = () =>
  (window as unknown as { __osEditorStore: EditorStore }).__osEditorStore.getState();

async function open(role?: Site["role"]) {
  const list = role ? sites.map((s) => (s.id === willow.id ? { ...s, role } : s)) : sites;
  const utils = renderStudio(`/sites/${willow.id}`, { user: SAM, sites: list });
  await screen.findByTitle("Page canvas");
  act(() => useEditorUi.getState().setLeftPanel("looks"));
  return utils;
}

beforeEach(() => useEditorUi.getState().reset());
afterEach(() => useLookTrial.getState().discard());

describe("Try a new look", () => {
  it("lists every template with its looks, drawn with this site's content", async () => {
    await open();
    const panel = await screen.findByTestId("looks-panel");
    const cards = await within(panel).findAllByRole("article");
    expect(cards.map((c) => c.getAttribute("aria-labelledby"))).toEqual(
      expect.arrayContaining(["st-lk-meadow", "st-lk-harbor", "st-lk-signal"]),
    );
    const harbor = within(panel).getByRole("article", { name: /Harbor/ });
    expect(within(harbor).getAllByRole("radio")).toHaveLength(3);
    expect(
      within(harbor).getByRole("button", { name: /Try Harbor, .* look, on your site/ }),
    ).toBeInTheDocument();
  });

  it("previews side by side, then applies as one undo step", async () => {
    const { user } = await open();
    const panel = await screen.findByTestId("looks-panel");
    const harbor = await within(panel).findByRole("article", { name: /Harbor/ });
    const before = structuredClone(store().doc);
    await user.click(within(harbor).getByRole("button", { name: /Try Harbor/ }));
    const stage = await screen.findByRole("region", { name: "Try a new look" });
    expect(within(stage).getByText("Now")).toBeInTheDocument();
    expect(within(stage).getByText(/^With Harbor · /)).toBeInTheDocument();
    // Nothing has changed yet.
    expect(store().doc).toEqual(before);
    const apply = within(stage).getByRole("button", { name: "Apply look" });
    await waitFor(() => expect(apply).toBeEnabled());
    await user.click(apply);
    expect(screen.queryByRole("region", { name: "Try a new look" })).toBeNull();
    expect(store().doc.styles.choices).not.toEqual(before.styles.choices);
    expect(store().undoStack).toHaveLength(1);
    expect(store().undoStack[0]?.label).toMatch(/^Use the Harbor .* look$/);
    // Words stay the same.
    expect(store().doc.pages).toEqual(
      expect.objectContaining(
        Object.fromEntries(
          Object.entries(before.pages).map(([id, p]) => [
            id,
            expect.objectContaining({ title: p.title, slug: p.slug }),
          ]),
        ),
      ),
    );
    act(() => {
      store().undo();
    });
    expect(store().doc).toEqual(before);
  });

  it("switches looks while previewing and discards without changing anything", async () => {
    const { user } = await open();
    const before = structuredClone(store().doc);
    act(() => useLookTrial.getState().tryLook("signal", "unknown-look"));
    const stage = await screen.findByRole("region", { name: "Try a new look" });
    const looks = within(stage).getByRole("radiogroup", { name: "Signal looks" });
    const radios = within(looks).getAllByRole("radio");
    await user.click(radios[1] as HTMLElement);
    expect(useLookTrial.getState().lookId).toBe(radios[1]?.getAttribute("value"));
    await user.click(within(stage).getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("region", { name: "Try a new look" })).toBeNull();
    expect(store().doc).toEqual(before);
    expect(store().undoStack).toHaveLength(0);
  });

  it("lets editors look but not apply", async () => {
    await open("editor");
    act(() => useLookTrial.getState().tryLook("harbor", "x"));
    const stage = await screen.findByRole("region", { name: "Try a new look" });
    expect(within(stage).getByRole("button", { name: "Apply look" })).toBeDisabled();
    expect(screen.getByTestId("looks-panel")).toHaveTextContent(
      "Only owners and designers can apply a new look.",
    );
  });
});
