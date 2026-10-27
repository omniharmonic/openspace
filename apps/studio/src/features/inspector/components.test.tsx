import { designerComponent } from "@omniharmonic/openspace-blocks";
import {
  type ComponentDefinition,
  componentSection,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "../../ui";
import { componentCommand } from "../add-section/insert";
import { PresetGallery } from "../add-section/PresetGallery";
import { useEditorUi } from "../editor/editor-store";
import { EditorStoreProvider } from "../editor/model/context";
import { devSiteDocument } from "../editor/model/dev-site";
import { createEditorStore } from "../editor/model/store";
import { draftToDefinition } from "./ComponentCode";
import { InspectorEnvProvider, useInspectorTab } from "./env";
import { Inspector } from "./Inspector";

const quote: ComponentDefinition = {
  name: "pull-quote",
  label: "Pull quote",
  version: 1,
  fields: {
    quote: { kind: "text", label: "Quote", maxLength: 200 },
    author: { kind: "text", label: "Author", optional: true },
  },
  defaults: { quote: "Slow down; breathe.", author: "Maya" },
  template:
    "<figure><blockquote>{{quote}}</blockquote><figcaption>{{author}}</figcaption></figure>",
  css: "blockquote { font-family: var(--os-font-heading); }",
};

function docWithQuote(): { doc: SiteDocument; blockId: string; pageId: string } {
  const base = devSiteDocument();
  const page = Object.values(base.pages)[0];
  if (!page) throw new Error("dev site changed");
  const section = componentSection(quote);
  const doc: SiteDocument = {
    ...base,
    components: { [quote.name]: quote },
    pages: { ...base.pages, [page.id]: { ...page, sections: [section, ...page.sections] } },
  };
  return { doc, blockId: section.blocks[0]?.id as string, pageId: page.id };
}

function setup(ui: ReactNode, role: string, doc: SiteDocument, select?: string) {
  const store = createEditorStore({ doc, actor: "user:test" });
  if (select) store.getState().select({ kind: "block", id: select });
  render(
    <TooltipProvider>
      <EditorStoreProvider store={store}>
        <InspectorEnvProvider role={role}>{ui}</InspectorEnvProvider>
      </EditorStoreProvider>
    </TooltipProvider>,
  );
  return store;
}

beforeEach(() => {
  useEditorUi.getState().reset();
  useInspectorTab.setState({ tab: "content" });
});

describe("custom components in Studio", () => {
  it("shows a component's fields as normal controls; editors edit them without seeing code", async () => {
    const { doc, blockId } = docWithQuote();
    const store = setup(<Inspector />, "editor", doc, blockId);
    const panel = screen.getByTestId("inspector");
    expect(within(panel).getAllByText("Pull quote", { exact: false }).length).toBeGreaterThan(0);
    const input = within(panel).getByLabelText("Author") as HTMLInputElement;
    expect(input.value).toBe("Maya");
    fireEvent.change(input, { target: { value: "Ana" } });
    fireEvent.blur(input);
    await waitFor(() => {
      const b = Object.values(store.getState().doc.pages)
        .flatMap((p) => p.sections)
        .flatMap((s) => s.blocks)
        .find((x) => x.id === blockId);
      expect(b?.fields.author).toBe("Ana");
    });
    expect(within(panel).queryByText("Component code")).toBeNull();
  });

  it("designers get the Component code panel", async () => {
    const { doc, blockId } = docWithQuote();
    setup(<Inspector />, "designer", doc, blockId);
    const panel = screen.getByTestId("inspector");
    const user = userEvent.setup();
    await user.click(within(panel).getByRole("button", { name: /Component code/ }));
    expect(within(panel).getByRole("button", { name: "Edit component code" })).toBeTruthy();
  });

  it("validates a code draft in plain language", () => {
    const bad = draftToDefinition(quote, {
      label: "Pull quote",
      template: "<script>x</script>",
      css: "",
      js: "",
      fields: "{",
      defaults: "{}",
    });
    expect("problems" in bad && bad.problems[0]).toMatch(/^Fields:/);
    const ok = draftToDefinition(quote, {
      label: "Big quote",
      template: quote.template,
      css: "",
      js: "",
      fields: JSON.stringify(quote.fields),
      defaults: JSON.stringify(quote.defaults),
    });
    expect("def" in ok && ok.def.label).toBe("Big quote");
    expect("def" in ok && ok.def.css).toBeUndefined();
  });

  it("adds a library design with its definition (designers) or refuses for editors", () => {
    const base = devSiteDocument();
    const page = Object.keys(base.pages)[0] as string;
    const def = designerComponent("bento-grid") as ComponentDefinition;
    const cmd = componentCommand(base, page, def, "end");
    expect(cmd.bodies.map((b) => (b as { op: string }).op)).toEqual([
      "component.upsert",
      "section.insert",
    ]);
    const designer = createEditorStore({ doc: base, actor: "user:test" });
    expect(designer.getState().run(cmd).ok).toBe(true);
    expect(designer.getState().doc.components?.["bento-grid"]).toBeTruthy();
    // Once the site has it, another instance is just a section.
    const again = componentCommand(designer.getState().doc, page, def, "end");
    expect(again.bodies).toHaveLength(1);
  });

  it("lists Designer components in the Add section gallery", () => {
    const { doc, pageId } = docWithQuote();
    const picked: string[] = [];
    setup(
      <PresetGallery
        doc={doc}
        pageId={pageId}
        layout="panel"
        onPick={() => {}}
        onPickComponent={(d) => picked.push(d.name)}
        canAddComponents={false}
      />,
      "editor",
      doc,
    );
    const group = screen.getByRole("region", { name: "Designer components" });
    const site = within(group).getByRole("button", { name: /^Pull quote/ });
    fireEvent.click(site);
    expect(picked).toEqual(["pull-quote"]);
    // Editors can't add new library designs.
    const lib = within(group).getByRole("button", { name: /^Bento feature grid/ });
    expect((lib as HTMLButtonElement).disabled).toBe(true);
  });
});
