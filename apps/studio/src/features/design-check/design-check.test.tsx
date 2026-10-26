import type { SiteDocument } from "@openspace/schema";
import { loadTemplate } from "@openspace/templates";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "../../ui";
import { useToastStore } from "../../ui/toast-store";
import { EditorStoreProvider } from "../editor/model/context";
import { createEditorStore, type EditorStore } from "../editor/model/store";
import { InspectorEnvProvider } from "../inspector/env";
import { DesignCheckBadge, DesignCheckPanel } from "./DesignCheckPanel";
import { canFix, countIssues, fixAllSafe, groupIssues, isSafeFix, runChecks } from "./model";
import { PublishGate } from "./PublishGate";
import { checkNow, useDesignCheck, useDesignCheckRunner } from "./store";

function must<T>(v: T | undefined | null): T {
  if (v === undefined || v === null) throw new Error("missing");
  return v;
}

/** Meadow with a few known problems: a low-contrast accent override, a photo without alt
 * text, an empty section and an About page hidden from search without a description. */
function brokenSite(): SiteDocument {
  const doc = must(loadTemplate("meadow")).doc;
  const pages = Object.values(doc.pages);
  const about = must(pages.find((p) => p.slug === "about"));
  about.seo = { ...about.seo, noindex: true };
  delete (about.seo as { description?: string }).description;
  const stack = must(about.sections.find((s) => s.layout.mode === "stack"));
  about.sections.push({
    ...structuredClone(stack),
    id: "sec_0000000000",
    preset: undefined,
    label: undefined,
    blocks: [],
  } as never);
  const home = must(pages.find((p) => p.slug === ""));
  const img = must(home.sections.flatMap((s) => s.blocks).find((b) => b.type === "image"));
  (img.fields as { image: { alt: string } }).image.alt = "";
  doc.styles.overrides = { color: { accent: { $type: "color", $value: "#f5f5f0" } } } as never;
  return doc;
}

const ids = (doc: SiteDocument) => {
  const pages = Object.values(doc.pages);
  return {
    home: must(pages.find((p) => p.slug === "")).id as string,
    about: must(pages.find((p) => p.slug === "about")).id as string,
  };
};

function Runner({ store }: { store: EditorStore }) {
  useDesignCheckRunner(store, 0);
  return null;
}

function setup(role = "owner", doc = brokenSite()) {
  const store = createEditorStore({ doc, actor: "user:test" });
  checkNow(store.getState().doc);
  const user = userEvent.setup();
  const utils = render(
    <TooltipProvider>
      <EditorStoreProvider store={store}>
        <InspectorEnvProvider role={role}>
          <Runner store={store} />
          <DesignCheckBadge onOpen={() => {}} />
          <DesignCheckPanel />
        </InspectorEnvProvider>
      </EditorStoreProvider>
    </TooltipProvider>,
  );
  return { store, user, ...utils };
}

/** Let the (0 ms) debounced re-check run. */
const settle = () => act(() => new Promise((r) => setTimeout(r, 5)));

afterEach(() => {
  useDesignCheck.getState().reset();
  useToastStore.getState().clear();
});

describe("Design check: model", () => {
  it("runs the design and SEO checks over every page, reporting each alt problem once", () => {
    const doc = brokenSite();
    const issues = runChecks(doc, 1);
    const rules = issues.map((i) => i.rule);
    expect(rules).toEqual(
      expect.arrayContaining([
        "contrast-override",
        "missing-alt",
        "empty-section",
        "seo-description-missing",
        "seo-noindex",
      ]),
    );
    expect(rules).not.toContain("seo-image-alt");
    expect(issues.find((i) => i.rule === "seo-noindex")?.kind).toBe("seo");
    expect(countIssues(issues)).toMatchObject({ error: 0, warning: 3, info: 2, attention: 3 });
  });

  it("groups by page (site-wide first) and section", () => {
    const doc = brokenSite();
    const { home, about } = ids(doc);
    const groups = groupIssues(doc, runChecks(doc, 1));
    expect(groups.map((g) => g.page)).toEqual(["", home, about]);
    expect(groups[0]?.label).toBe("Whole site");
    const aboutGroup = must(groups.find((g) => g.page === about));
    expect(aboutGroup.label).toBe("About");
    // Page-level issues first, then the empty section.
    expect(aboutGroup.sections.map((s) => s.section)).toEqual(["", "sec_0000000000"]);
  });

  it("fixes everything safe in one pass, never deleting anything", () => {
    const doc = brokenSite();
    const before = runChecks(doc, 1);
    expect(isSafeFix(must(before.find((i) => i.rule === "empty-section")))).toBe(false);
    const { bodies, fixed, doc: after } = fixAllSafe(doc, "owner", 1);
    expect(fixed.map((i) => i.rule).sort()).toEqual(
      ["contrast-override", "seo-description-missing", "seo-noindex"].sort(),
    );
    expect(bodies.some((b) => b.op.endsWith(".delete"))).toBe(false);
    const left = runChecks(after, 1).map((i) => i.rule);
    expect(left).toContain("empty-section");
    expect(left).not.toContain("seo-noindex");
    expect(left).not.toContain("contrast-override");
  });

  it("only offers fixes the person's role may make", () => {
    const doc = brokenSite();
    const contrast = must(runChecks(doc, 1).find((i) => i.rule === "contrast-override"));
    expect(canFix(doc, contrast, "designer")).toBe(true);
    // Editors can't change Site Styles.
    expect(canFix(doc, contrast, "editor")).toBe(false);
    expect(fixAllSafe(doc, "editor", 1).fixed.map((i) => i.rule)).not.toContain(
      "contrast-override",
    );
  });
});

describe("Design check: panel", () => {
  it("shows a count on the badge and issues grouped by page", async () => {
    setup();
    expect(screen.getByRole("button", { name: "Design check: 3 issues" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Whole site" })).toHaveTextContent(
      /accent|contrast|color/i,
    );
    const home = screen.getByRole("region", { name: "Home" });
    expect(home).toHaveTextContent(/alt/i);
    // Suggestions (info) are hidden until asked for.
    expect(screen.queryByText(/search engines/i)).not.toBeInTheDocument();
  });

  it("applies one fix as an undoable edit and checks again", async () => {
    const { store, user } = setup();
    await user.click(screen.getByRole("switch", { name: /Suggestions/ }));
    const about = screen.getByRole("region", { name: "About" });
    await user.click(within(about).getByRole("button", { name: "Show in search engines" }));
    const aboutId = ids(store.getState().doc).about;
    expect(store.getState().doc.pages[aboutId as never]?.seo?.noindex).not.toBe(true);
    expect(store.getState().undoStack).toHaveLength(1);
    await settle();
    expect(
      within(screen.getByRole("region", { name: "About" })).queryByRole("button", {
        name: "Show in search engines",
      }),
    ).not.toBeInTheDocument();
    act(() => {
      store.getState().undo();
    });
    expect(store.getState().doc.pages[aboutId as never]?.seo?.noindex).toBe(true);
  });

  it("fixes all safe issues as one undo step", async () => {
    const { store, user } = setup();
    await user.click(screen.getByRole("button", { name: /Fix all safe \(3\)/ }));
    expect(store.getState().undoStack).toHaveLength(1);
    expect(store.getState().undoStack[0]?.label).toBe("Fix 3 design issues");
    await settle();
    // The empty section is left for the owner to decide.
    expect(screen.getByRole("region", { name: "About" })).toHaveTextContent(/empty|nothing/i);
    expect(screen.getByRole("button", { name: /Design check: 2 issues/ })).toBeInTheDocument();
  });

  it("jumps to the issue: switches page and selects the block", async () => {
    const { store, user } = setup();
    const { home } = ids(store.getState().doc);
    act(() => store.getState().setPage(ids(store.getState().doc).about));
    const region = screen.getByRole("region", { name: "Home" });
    await user.click(within(region).getAllByRole("button", { name: "Show" })[0] as HTMLElement);
    expect(store.getState().pageId).toBe(home);
    expect(store.getState().selection[0]?.kind).toBe("block");
  });

  it("hides fixes an editor can't make", () => {
    setup("editor");
    expect(
      within(screen.getByRole("region", { name: "Whole site" })).queryByRole("button", {
        name: /accessible color/,
      }),
    ).not.toBeInTheDocument();
  });

  it("says when everything looks good", async () => {
    const doc = must(loadTemplate("meadow")).doc;
    setup("owner", doc);
    expect(screen.getByRole("heading", { name: "Looks good" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Design check: no issues" })).toBeInTheDocument();
  });
});

describe("Design check: publish gate", () => {
  it("lists what needs attention and lets the owner review it", async () => {
    const doc = brokenSite();
    let reviewed = false;
    const user = userEvent.setup();
    render(<PublishGate doc={doc} onReview={() => (reviewed = true)} />);
    const gate = screen.getByRole("region", { name: "Design check" });
    expect(gate).toHaveTextContent("Design check found 3 things to look at");
    await user.click(within(gate).getByRole("button", { name: "Review issues" }));
    expect(reviewed).toBe(true);
  });

  it("stays out of the way when there's nothing to fix", () => {
    const { container } = render(
      <PublishGate doc={must(loadTemplate("meadow")).doc} onReview={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
