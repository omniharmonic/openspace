import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { loadTemplate } from "@omniharmonic/openspace-templates";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "../../ui";
import { useToastStore } from "../../ui/toast-store";
import { DesignCheckPanel } from "../design-check/DesignCheckPanel";
import { PublishGate } from "../design-check/PublishGate";
import { checkNow, useDesignCheck } from "../design-check/store";
import { useEditorUi } from "../editor/editor-store";
import { EditorStoreProvider } from "../editor/model/context";
import { createEditorStore } from "../editor/model/store";
import { InspectorEnvProvider } from "../inspector/env";
import { measuredPhoneIssues, planPhoneFixes, recordPhoneProbe, usePhoneCheck } from "./model";
import { PhoneCheckBar } from "./PhoneCheckBar";

function must<T>(v: T | undefined | null): T {
  if (v === undefined || v === null) throw new Error("missing");
  return v;
}

/** Meadow with an about section whose text is squeezed into two phone columns. */
function squeezed(): { doc: SiteDocument; page: string; section: string } {
  const doc = must(loadTemplate("meadow")).doc;
  const about = must(Object.values(doc.pages).find((p) => p.slug === "about"));
  const s = must(
    about.sections.find(
      (x) =>
        x.layout.mode === "stack" &&
        x.blocks.some((b) => b.type === "text" && JSON.stringify(b.fields).length > 400),
    ),
  );
  if (s.layout.mode !== "stack") throw new Error("stack");
  s.layout.columns = { d: [6, 6], m: [4, 8] };
  for (const b of s.blocks) b.column = 0;
  return { doc, page: about.id, section: s.id };
}

function mount(doc: SiteDocument, role = "owner", page?: string) {
  const store = createEditorStore({ doc, actor: "user:test" });
  if (page) store.getState().setPage(page);
  checkNow(store.getState().doc);
  const user = userEvent.setup();
  render(
    <TooltipProvider>
      <EditorStoreProvider store={store}>
        <InspectorEnvProvider role={role}>
          <PhoneCheckBar />
          <DesignCheckPanel />
        </InspectorEnvProvider>
      </EditorStoreProvider>
    </TooltipProvider>,
  );
  return { store, user };
}

afterEach(() => {
  cleanup();
  useDesignCheck.getState().reset();
  usePhoneCheck.getState().reset();
  useEditorUi.getState().setBreakpoint("desktop");
  useToastStore.getState().clear();
});

describe("Phone check in Studio", () => {
  it("plans every phone fix the role allows, as phone-only settings", () => {
    const { doc, section } = squeezed();
    const plan = planPhoneFixes(doc, "owner", []);
    expect(plan.labels).toContain("Stack the columns on phones");
    expect(plan.bodies.some((b) => JSON.stringify(b).includes(section))).toBe(true);
    // A contributor can't change layouts: nothing is planned for them.
    expect(planPhoneFixes(doc, "contributor", []).bodies).toEqual([]);
  });

  it("keeps what the phone preview measured until the next edit", () => {
    const { doc, page } = squeezed();
    recordPhoneProbe(doc, page, [
      {
        width: 390,
        height: 780,
        scrollWidth: 430,
        findings: [{ kind: "page-overflow", area: "main", tag: "table", value: 40 }],
      },
    ]);
    expect(measuredPhoneIssues(doc).map((i) => i.rule)).toEqual(["phone-page-overflow"]);
    expect(measuredPhoneIssues(structuredClone(doc))).toEqual([]);
  });

  it("shows phone problems in the phone preview and fixes everything for phones in one step", async () => {
    const { doc, page } = squeezed();
    useEditorUi.getState().setBreakpoint("mobile");
    const { store, user } = mount(doc, "owner", page);
    expect(
      await screen.findByText(/don’t work well on phones|doesn’t work well on phones/),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Fix for phones" }));
    const after = store.getState().doc;
    const sec = Object.values(after.pages)
      .flatMap((p) => p.sections)
      .find((s) => s.layout.mode === "stack" && s.layout.columns.d.join() === "6,6");
    expect(sec?.layout.mode === "stack" && sec.layout.columns.m).toEqual([12]);
    // One undo step brings it back.
    act(() => store.getState().undo());
    expect(store.getState().doc).toEqual(doc);
  });

  it("stays hidden outside the phone preview", () => {
    const { doc } = squeezed();
    mount(doc);
    expect(screen.queryByTestId("phone-check")).toBeNull();
  });

  it("filters the Design check to phones and offers Fix everything for phones", async () => {
    const { doc } = squeezed();
    const { user } = mount(doc);
    await user.click(screen.getByRole("radio", { name: "Phones" }));
    expect(screen.getAllByText(/squeezed into a narrow strip/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Fix everything for phones" })).toBeTruthy();
  });

  it("calls out phone problems in the publish dialog", () => {
    const { doc } = squeezed();
    checkNow(doc);
    let fixed = 0;
    render(<PublishGate doc={doc} onReview={() => {}} onFixPhones={() => fixed++} />);
    expect(screen.getByText(/work well on phones/)).toBeTruthy();
    screen.getByRole("button", { name: "Fix for phones" }).click();
    expect(fixed).toBe(1);
  });
});
