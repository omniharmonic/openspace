import type { Section, SiteDocument } from "@omniharmonic/openspace-schema";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "../../ui";
import { EditorStoreProvider } from "../editor/model/context";
import { devSiteDocument, DEV_IDS as I } from "../editor/model/dev-site";
import type { SelItem } from "../editor/model/selection";
import { createEditorStore } from "../editor/model/store";
import { InspectorEnvProvider, useInspectorTab } from "./env";
import { Inspector } from "./Inspector";

const DESIGNER = "designer";

function setup(select: SelItem, doc: SiteDocument = devSiteDocument()) {
  const store = createEditorStore({ doc, actor: "user:test" });
  store.getState().select(select);
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <EditorStoreProvider store={store}>
        <InspectorEnvProvider role={DESIGNER}>
          <Inspector />
        </InspectorEnvProvider>
      </EditorStoreProvider>
    </TooltipProvider>,
  );
  const intro = () =>
    (store.getState().doc.pages[I.home as never] as { sections: Section[] }).sections.find(
      (s) => s.id === I.intro,
    ) as Section;
  return { user, store, intro };
}

describe("spacing in the inspector (steps or exact pixels)", () => {
  it("types exact pixels, snaps typed step sizes to the step, and picks steps from the menu", async () => {
    const { user, intro } = setup({ kind: "section", id: I.intro });
    const panel = screen.getByTestId("inspector");
    const field = within(panel).getByLabelText("Space above and below");
    await user.clear(field);
    await user.type(field, "72{Enter}");
    expect(intro().style.padding).toEqual({ d: 72 });
    // 24px is the "md" step on the default (comfortable) density: stored as the step.
    await user.clear(field);
    await user.type(field, "24{Enter}");
    expect(intro().style.padding).toEqual({ d: "md" });
    await user.click(
      within(panel).getByRole("button", { name: "Space above and below: choose a spacing step" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "XL · 48px" }));
    expect(intro().style.padding).toEqual({ d: "xl" });
  });

  it("splits top and bottom spacing without moving anything, then joins them again", async () => {
    const { user, intro } = setup({ kind: "section", id: I.intro });
    const panel = screen.getByTestId("inspector");
    await user.click(
      within(panel).getByRole("button", { name: "Separate top and bottom spacing" }),
    );
    expect(intro().style.paddingTop).toBeDefined();
    expect(intro().style.paddingBottom).toEqual(intro().style.paddingTop);
    const bottom = within(panel).getByLabelText("Bottom spacing");
    await user.clear(bottom);
    await user.type(bottom, "16{Enter}");
    expect(intro().style.paddingBottom).toEqual({ d: "sm" });
    await user.click(
      within(panel).getByRole("button", { name: "Separate top and bottom spacing" }),
    );
    expect(intro().style.paddingTop).toBeUndefined();
    expect(intro().style.paddingBottom).toBeUndefined();
  });

  it("sets a block's space below (not for the last block in its column)", async () => {
    const doc = devSiteDocument();
    const intro = (doc.pages[I.home as never] as { sections: Section[] }).sections.find(
      (s) => s.id === I.intro,
    ) as Section;
    const first = intro.blocks[0] as Section["blocks"][number];
    intro.blocks.push({ ...structuredClone(first), id: "blk_spacetest1" as never });
    useInspectorTab.setState({ tab: "design" });
    const t = setup({ kind: "block", id: first.id }, doc);
    const field = screen.getByLabelText("Space below this block");
    await t.user.clear(field);
    await t.user.type(field, "10{Enter}");
    expect(t.intro().blocks[0]?.spaceBelow).toEqual({ d: 10 });
    act(() => t.store.getState().select({ kind: "block", id: "blk_spacetest1" }));
    await waitFor(() => expect(screen.queryByLabelText("Space below this block")).toBeNull());
    useInspectorTab.setState({ tab: "content" });
  });
});
