import { allBlocks } from "@openspace/blocks";
import {
  FIELD_KINDS,
  type FieldMeta,
  type Form,
  type Section,
  type SiteDocument,
} from "@openspace/schema";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "../../ui";
import { AddSectionPanel } from "../add-section/AddSection";
import { BlockMenu } from "../add-section/BlockMenu";
import { useBlockMenu } from "../add-section/blockMenuStore";
import { insertBlockCommand } from "../add-section/insert";
import { useEditorUi } from "../editor/editor-store";
import { EditorStoreProvider } from "../editor/model/context";
import { devSiteDocument, DEV_IDS as I } from "../editor/model/dev-site";
import type { SelItem } from "../editor/model/selection";
import { createEditorStore, type EditorStore } from "../editor/model/store";
import { SiteStylesPanel } from "../styles/SiteStylesPanel";
import { InspectorEnvProvider, useInspectorTab } from "./env";
import { FIELD_COMMIT_MS } from "./fields/basic";
import { Inspector } from "./Inspector";

function setup(
  ui: ReactNode,
  opts: { role?: string; doc?: SiteDocument; select?: SelItem; store?: EditorStore } = {},
) {
  const store =
    opts.store ?? createEditorStore({ doc: opts.doc ?? devSiteDocument(), actor: "user:test" });
  if (opts.select) {
    const id = opts.select.id;
    const page = Object.values(store.getState().doc.pages).find((p) =>
      p.sections.some((x) => x.id === id || x.blocks.some((b) => b.id === id)),
    );
    if (page) store.getState().setPage(page.id);
    store.getState().select(opts.select);
  }
  const user = userEvent.setup();
  const utils = render(
    <TooltipProvider>
      <EditorStoreProvider store={store}>
        <InspectorEnvProvider role={opts.role ?? "designer"}>{ui}</InspectorEnvProvider>
      </EditorStoreProvider>
    </TooltipProvider>,
  );
  const s = () => store.getState();
  const section = (id: string) =>
    Object.values(s().doc.pages)
      .flatMap((p) => p.sections)
      .concat(s().doc.site.footer)
      .find((x) => x.id === id) as Section;
  const block = (id: string) =>
    Object.values(s().doc.pages)
      .flatMap((p) => p.sections)
      .concat(s().doc.site.footer)
      .flatMap((x) => x.blocks)
      .find((b) => b.id === id);
  return { ...utils, user, store, s, section, block };
}

const panel = () => screen.getByTestId("inspector");
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
  useEditorUi.getState().reset();
  useInspectorTab.setState({ tab: "content" });
});
afterEach(() => useBlockMenu.getState().close());

function kindsIn(fields: Record<string, FieldMeta>, out = new Set<string>()) {
  for (const meta of Object.values(fields)) {
    out.add(meta.kind);
    if (meta.kind === "list") kindsIn(meta.fields, out);
  }
  return out;
}

describe("field inspector generation", () => {
  it("covers every f.* field kind across the block library", () => {
    const kinds = new Set<string>();
    for (const def of allBlocks) kindsIn(def.meta.fields, kinds);
    expect([...kinds].sort()).toEqual([...FIELD_KINDS].sort());
  });

  it("renders a labelled control for every field of every block", { timeout: 60_000 }, async () => {
    const t = setup(<Inspector />);
    for (const def of allBlocks) {
      const r = t.s().run(insertBlockCommand(t.s().doc, I.home, def.type, { section: I.intro }));
      expect(r.ok, def.type).toBe(true);
      const id = (t.s().selection[0] as SelItem).id;
      act(() => t.s().select({ kind: "block", id }));
      const ip = panel();
      expect(
        within(ip).getByText(
          (_, el) =>
            el?.className === "st-ip__sub" && el.textContent?.startsWith(`${def.label} ·`) === true,
        ),
      ).toBeInTheDocument();
      for (const [key, meta] of Object.entries(def.meta.fields)) {
        if (meta.kind === "form") {
          expect(within(ip).getByText("Form fields"), `${def.type}.${key}`).toBeInTheDocument();
          continue;
        }
        expect(
          within(ip).getAllByText(meta.label ?? key).length,
          `${def.type}.${key}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("edits a text field as one undoable op, with plain-language length errors", async () => {
    const t = setup(<Inspector />, { select: { kind: "block", id: I.heroButton } });
    const input = within(panel()).getByRole("textbox", { name: "Label" });
    await t.user.clear(input);
    await t.user.type(input, "Book a free class");
    await wait(FIELD_COMMIT_MS + 30);
    expect(t.block(I.heroButton)?.fields.label).toBe("Book a free class");
    await t.user.clear(input);
    await t.user.type(input, "x".repeat(70));
    await wait(FIELD_COMMIT_MS + 30);
    expect(within(panel()).getByRole("alert").textContent).toMatch(/characters or fewer/);
    expect(t.block(I.heroButton)?.fields.label).toBe("Book a free class");
    t.s().undo();
    expect(t.block(I.heroButton)?.fields.label).not.toBe("Book a free class");
  });
});

describe("list editors", () => {
  it("adds, reorders, duplicates and removes items through ops, and undo restores them", async () => {
    const t = setup(<Inspector />, { select: { kind: "block", id: I.faqAccordion } });
    const items = () => t.block(I.faqAccordion)?.fields.items as Array<{ question: string }>;
    const original = items().map((i) => i.question);
    const ip = panel();
    await t.user.click(within(ip).getByRole("button", { name: /^Add / }));
    expect(items().length).toBe(original.length + 1);
    // The new item copies its neighbour.
    expect(items().at(-1)?.question).toBe(original.at(-1));
    await t.user.click(
      within(ip).getAllByRole("button", { name: /^Move .* down$/ })[0] as HTMLElement,
    );
    expect(items()[1]?.question).toBe(original[0]);
    await t.user.click(
      within(ip).getAllByRole("button", { name: /^Duplicate / })[0] as HTMLElement,
    );
    expect(items().length).toBe(original.length + 2);
    await t.user.click(within(ip).getAllByRole("button", { name: /^Remove / })[0] as HTMLElement);
    expect(items().length).toBe(original.length + 1);
    while (t.s().undo());
    expect(items().map((i) => i.question)).toEqual(original);
  });

  it("edits a field inside a list item", async () => {
    const t = setup(<Inspector />, { select: { kind: "block", id: I.faqAccordion } });
    const questions = () =>
      (t.block(I.faqAccordion)?.fields.items ?? []) as Array<{ question: string }>;
    const first = questions()[0]?.question ?? "";
    await t.user.click(
      within(panel()).getByRole("button", {
        name: new RegExp(`^${first.slice(0, 12)}`),
        expanded: false,
      }),
    );
    const q = within(panel()).getByRole("textbox", { name: "Question" });
    await t.user.clear(q);
    await t.user.type(q, "Do I need my own mat?");
    fireEvent.blur(q);
    expect(questions()[0]?.question).toBe("Do I need my own mat?");
  });
});

describe("link picker", () => {
  it("links to a page, a web address and an email, refusing bad addresses", async () => {
    const t = setup(<Inspector />, { select: { kind: "block", id: I.heroButton } });
    const ip = panel();
    await t.user.click(within(ip).getByRole("button", { name: /^Link: / }));
    await t.user.click(within(ip).getByRole("combobox", { name: "Link to" }));
    await t.user.click(await screen.findByRole("option", { name: "Page" }));
    await t.user.click(within(ip).getByRole("button", { name: /^About/ }));
    expect(t.block(I.heroButton)?.fields.link).toEqual({ type: "page", page: I.about });

    await t.user.click(within(ip).getByRole("combobox", { name: "Link to" }));
    await t.user.click(await screen.findByRole("option", { name: "Web address" }));
    const addr = within(ip).getByRole("textbox", { name: "Address" });
    await t.user.type(addr, "javascript:alert(1){enter}");
    expect(within(ip).getByRole("alert").textContent).toMatch(/full web address/);
    expect(t.block(I.heroButton)?.fields.link).toEqual({ type: "page", page: I.about });
    await t.user.clear(addr);
    await t.user.type(addr, "example.com/classes{enter}");
    expect(t.block(I.heroButton)?.fields.link).toEqual({
      type: "url",
      url: "https://example.com/classes",
    });
  });
});

describe("form builder", () => {
  it("offers only the allowed field types and refuses password or card fields", async () => {
    const t = setup(<Inspector />, { select: { kind: "block", id: I.contactForm } });
    const form = () => t.block(I.contactForm)?.fields.form as Form;
    const before = form().fields.length;
    const ip = panel();
    await t.user.click(within(ip).getByRole("button", { name: "Add field" }));
    const menu = await screen.findByRole("menu");
    const types = within(menu)
      .getAllByRole("menuitem")
      .map((m) => m.textContent);
    expect(types).toEqual([
      "Short text",
      "Email",
      "Phone",
      "Long text",
      "Dropdown",
      "Checkbox",
      "Choice",
      "Date",
    ]);
    expect(types.join(" ")).not.toMatch(/password|card/i);
    await t.user.click(within(menu).getByRole("menuitem", { name: "Date" }));
    expect(form().fields.length).toBe(before + 1);
    expect(form().fields.at(-1)?.type).toBe("date");

    const label = within(ip).getByRole("textbox", { name: "Field label" });
    await t.user.clear(label);
    await t.user.type(label, "Card number");
    fireEvent.blur(label);
    expect(within(ip).getByText(/passwords or card details/)).toBeInTheDocument();
    expect(form().fields.at(-1)?.label).toBe("Date");
  });

  it("sets required fields and the success message", async () => {
    const t = setup(<Inspector />, { select: { kind: "block", id: I.contactForm } });
    const form = () => t.block(I.contactForm)?.fields.form as Form;
    const ip = panel();
    const first = form().fields[0]?.label as string;
    await t.user.click(
      within(ip).getByRole("button", { name: new RegExp(`^${first}`), expanded: false }),
    );
    const required = within(ip).getByRole("switch", { name: "Required" });
    const was = form().fields[0]?.required === true;
    await t.user.click(required);
    expect(form().fields[0]?.required === true).toBe(!was);
    const msg = within(ip).getByRole("textbox", { name: "Success message" });
    await t.user.clear(msg);
    await t.user.type(msg, "Thanks! See you on the mat.");
    fireEvent.blur(msg);
    expect(form().success).toEqual({ type: "message", message: "Thanks! See you on the mat." });
  });
});

describe("design panel", () => {
  it("makes phone overrides with dots, and resets them", async () => {
    const t = setup(<Inspector />, { select: { kind: "section", id: I.intro } });
    act(() => useEditorUi.getState().setBreakpoint("mobile"));
    const ip = panel();
    expect(within(ip).getByText(/apply to phones only/)).toBeInTheDocument();
    await t.user.click(within(ip).getByRole("button", { name: "Padding: inherit on phone" }));
    const padding = t.section(I.intro).style.padding;
    expect(padding?.m).toBeDefined();
    expect(padding?.d).toBeDefined();
    expect(within(ip).getAllByRole("img", { name: "Changed on phone" }).length).toBeGreaterThan(0);
    await t.user.click(within(ip).getByRole("button", { name: "Padding: override on phone" }));
    expect(t.section(I.intro).style.padding?.m).toBeUndefined();
  });

  it("changes stack columns and the phone stacking order", async () => {
    const t = setup(<Inspector />, { select: { kind: "section", id: I.hero } });
    const ip = panel();
    await t.user.click(within(ip).getByRole("radio", { name: "3" }));
    expect((t.section(I.hero).layout as { columns: { d: number[] } }).columns.d).toEqual([4, 4, 4]);
    await t.user.click(within(ip).getByRole("radio", { name: "2" }));
    await t.user.click(within(ip).getByRole("button", { name: "7 : 5" }));
    expect((t.section(I.hero).layout as { columns: { d: number[] } }).columns.d).toEqual([7, 5]);
    act(() => useEditorUi.getState().setBreakpoint("mobile"));
    await t.user.click(within(ip).getByRole("radio", { name: "Stacked" }));
    await t.user.click(within(ip).getByRole("button", { name: "Move column 2 earlier" }));
    const layout = t.section(I.hero).layout as {
      columns: { m?: number[] };
      order?: { m?: number[] };
    };
    expect(layout.columns.m).toEqual([12]);
    expect(layout.order?.m).toEqual([1, 0]);
  });

  it("switches a section to grid and back", async () => {
    const t = setup(<Inspector />, { select: { kind: "section", id: I.intro } });
    await t.user.click(within(panel()).getByRole("radio", { name: "Grid: place blocks freely" }));
    expect(t.section(I.intro).layout.mode).toBe("grid");
    expect(
      within(panel()).getByRole("button", { name: "Rearrange for phones" }),
    ).toBeInTheDocument();
    await t.user.click(
      within(panel()).getByRole("radio", { name: "Stack: blocks flow in columns" }),
    );
    expect(t.section(I.intro).layout.mode).toBe("stack");
  });

  it("sets the section color theme and a block's style slots as ops", async () => {
    const t = setup(<Inspector />, { select: { kind: "section", id: I.intro } });
    await t.user.click(within(panel()).getByRole("button", { name: "Dark accent" }));
    expect(t.section(I.intro).style.colorTheme).toBe("dark-accent");
    act(() => t.s().select({ kind: "block", id: I.storyTestimonial }));
    await t.user.click(within(panel()).getByRole("tab", { name: "Design" }));
    await t.user.click(within(panel()).getByRole("radio", { name: "Strong" }));
    expect(t.block(I.storyTestimonial)?.style?.border).toBe("strong");
    t.s().undo();
    expect(t.block(I.storyTestimonial)?.style?.border).toBeUndefined();
  });
});

describe("role gating", () => {
  it("shows the exact-value escape hatch to designers only", async () => {
    const designer = setup(<Inspector />, {
      select: { kind: "section", id: I.intro },
      role: "designer",
    });
    expect(
      within(panel()).getByRole("button", { name: "Exact height in pixels" }),
    ).toBeInTheDocument();
    designer.unmount();

    setup(<Inspector />, { select: { kind: "section", id: I.intro }, role: "editor" });
    expect(within(panel()).queryByRole("button", { name: "Exact height in pixels" })).toBeNull();
    expect(within(panel()).getByText(/set by the site’s designer/)).toBeInTheDocument();
    expect(
      within(panel()).getByRole("radio", { name: "Grid: place blocks freely" }),
    ).toBeDisabled();
  });

  it("limits editors on locked sections to words and images", async () => {
    const doc = devSiteDocument();
    const hero = doc.pages[I.home as never] as { sections: Section[] };
    (hero.sections[0] as Section).locked = true;
    setup(<Inspector />, { doc, select: { kind: "block", id: I.heroButton }, role: "editor" });
    expect(within(panel()).getByRole("textbox", { name: "Label" })).toBeEnabled();
    expect(within(panel()).getByRole("button", { name: /^Link: / })).toBeDisabled();
  });

  it("keeps Site Styles read-only, without design tokens, for editors", async () => {
    const editor = setup(<SiteStylesPanel />, { role: "editor" });
    expect(screen.getByText(/set by the site’s owner and designers/)).toBeInTheDocument();
    expect(screen.queryByText("Design tokens")).toBeNull();
    expect(screen.getByRole("button", { name: "Fraunces & Hanken Grotesk" })).toBeDisabled();
    editor.unmount();
    setup(<SiteStylesPanel />, { role: "owner" });
    expect(screen.getByText("Design tokens")).toBeInTheDocument();
  });
});

describe("Site Styles panel", () => {
  it("changes density, fonts and palette live, all undoable", async () => {
    const t = setup(<SiteStylesPanel />);
    const before = t.s().doc.styles;
    await t.user.click(screen.getByRole("radio", { name: "Airy" }));
    expect(t.s().doc.styles.choices.density).toBe("airy");
    await t.user.click(screen.getByRole("button", { name: "Newsreader & Public Sans" }));
    expect(t.s().doc.styles.choices.pairing).toBe("newsreader-public-sans");
    await t.user.click(screen.getByRole("button", { name: /Harbor Blue/ }));
    expect(t.s().doc.styles.choices.palette.source).toBe("curated");
    const brand = screen.getByRole("textbox", { name: "Brand color" });
    await t.user.clear(brand);
    await t.user.type(brand, "C2410C{enter}");
    expect(t.s().doc.styles.choices.palette.brand).toBe("#c2410c");
    while (t.s().undo());
    expect(t.s().doc.styles).toEqual(before);
  });

  it("warns about unreadable overrides and fixes them in one click", async () => {
    const t = setup(<SiteStylesPanel />);
    act(() => {
      t.s().commit([
        {
          op: "styles.patch",
          patch: { set: { "overrides.color.dark.text": { $value: "#3a3a3a", $type: "color" } } },
        } as never,
      ]);
    });
    expect(screen.getByRole("status").textContent).toMatch(/hard to read/);
    const issues = screen.getByRole("list", { name: "Contrast problems" });
    await t.user.click(within(issues).getAllByRole("button", { name: "Fix" })[0] as HTMLElement);
    const value = (
      t.s().doc.styles.overrides as Record<
        string,
        Record<string, Record<string, { $value: string }>>
      >
    ).color?.dark?.text?.$value;
    expect(value).not.toBe("#3a3a3a");
  });

  it("adds and removes a DTCG override (Designer)", async () => {
    const t = setup(<SiteStylesPanel />);
    await t.user.click(screen.getByRole("button", { name: "Design tokens" }));
    await t.user.type(
      screen.getByRole("textbox", { name: "Token path" }),
      "type.display.letterSpacing",
    );
    await t.user.click(screen.getByRole("combobox", { name: "Token type" }));
    await t.user.click(await screen.findByRole("option", { name: "dimension" }));
    await t.user.type(screen.getByRole("textbox", { name: "Token value" }), "-0.03em");
    await t.user.click(screen.getByRole("button", { name: "Add token" }));
    expect(JSON.stringify(t.s().doc.styles.overrides)).toContain("-0.03em");
    await t.user.click(screen.getByRole("button", { name: "Remove type.display.letterSpacing" }));
    expect(JSON.stringify(t.s().doc.styles.overrides ?? {})).not.toContain("-0.03em");
  });
});

describe("add section and block menu", () => {
  it("inserts a preset from the gallery after the selected section", async () => {
    const t = setup(<AddSectionPanel />, { select: { kind: "section", id: I.hero } });
    await t.user.click(screen.getByRole("button", { name: /^Story with portrait/ }));
    const home = t.s().doc.pages[I.home as never] as { sections: Section[] };
    expect(home.sections[1]?.preset).toMatch(/^about\//);
    expect(t.s().selection[0]).toEqual({ kind: "section", id: home.sections[1]?.id });
  });

  it("disables header and footer presets for editors", async () => {
    setup(<AddSectionPanel />, { role: "editor" });
    expect(screen.getByRole("button", { name: /^Classic:/ })).toBeDisabled();
  });

  it("renders thumbnails live, in the site's styles, once scrolled into view", async () => {
    const seen = new Map<Element, () => void>();
    class FakeIO {
      constructor(private cb: (e: Array<{ isIntersecting: boolean; target: Element }>) => void) {}
      observe(el: Element) {
        seen.set(el, () => this.cb([{ isIntersecting: true, target: el }]));
      }
      unobserve() {}
      disconnect() {}
    }
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
    try {
      setup(<AddSectionPanel />);
      fireEvent.change(screen.getByRole("textbox", { name: "Search sections" }), {
        target: { value: "Story with portrait" },
      });
      const card = screen.getByRole("button", { name: /^Story with portrait/ });
      const holder = card.querySelector(".st-preview") as Element;
      act(() => seen.get(holder)?.());
      const frame = (await screen.findByTitle("Story with portrait preview")) as HTMLIFrameElement;
      await waitFor(() =>
        expect(frame.contentDocument?.querySelector("[data-os-section]")).toBeTruthy(),
      );
      expect(frame.getAttribute("sandbox")).toBe("allow-same-origin");
      expect(
        frame.contentDocument?.querySelector('style[data-os="tokens"]')?.textContent,
      ).toContain("--os-");
    } finally {
      delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    }
  });

  it("the block menu is searchable and inserts with the keyboard", async () => {
    const t = setup(<BlockMenu />, { select: { kind: "block", id: I.introText } });
    act(() => useBlockMenu.getState().openFor());
    const dialog = await screen.findByRole("dialog", { name: "Add a block" });
    expect(within(dialog).getByText(/Adding to/)).toBeInTheDocument();
    await t.user.type(within(dialog).getByRole("combobox"), "quote");
    await t.user.keyboard("{Enter}");
    const intro = t.section(I.intro);
    const i = intro.blocks.findIndex((b) => b.id === I.introText);
    expect(intro.blocks[i + 1]?.type).toBe("quote");
    expect(useBlockMenu.getState().open).toBe(false);
  });
});

describe("copy", () => {
  const FORBIDDEN = /\b(repo|repository|repositories|commit\w*|branch\w*|build\w*|deploy\w*)\b/gi;
  const copy = () => {
    let text = `${document.body.textContent ?? ""} `;
    for (const el of document.querySelectorAll("[aria-label],[placeholder],[title],[alt]"))
      for (const a of ["aria-label", "placeholder", "title", "alt"])
        text += ` ${el.getAttribute(a) ?? ""}`;
    return text;
  };

  it("uses no Git or hosting vocabulary in the inspector, Site Styles, gallery or block menu", async () => {
    for (const select of [
      { kind: "section", id: I.intro },
      { kind: "block", id: I.contactForm },
      { kind: "block", id: I.heroButton },
    ] as SelItem[]) {
      const t = setup(<Inspector />, { select });
      expect(copy().match(FORBIDDEN)).toBeNull();
      t.unmount();
    }
    const styles = setup(<SiteStylesPanel />, { role: "owner" });
    expect(copy().match(FORBIDDEN)).toBeNull();
    styles.unmount();
    setup(
      <>
        <AddSectionPanel />
        <BlockMenu />
      </>,
    );
    act(() => useBlockMenu.getState().openFor());
    await screen.findByRole("dialog", { name: "Add a block" });
    expect(copy().match(FORBIDDEN)).toBeNull();
  });
});
