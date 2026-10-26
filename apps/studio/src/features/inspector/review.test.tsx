import { summaryBlock } from "@openspace/blocks";
import type { Section, SiteDocument } from "@openspace/schema";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TooltipProvider } from "../../ui";
import { AddSectionPanel } from "../add-section/AddSection";
import { BlockMenu } from "../add-section/BlockMenu";
import { useBlockMenu } from "../add-section/blockMenuStore";
import { useEditorUi } from "../editor/editor-store";
import { setLayoutMode } from "../editor/model/actions";
import { EditorStoreProvider } from "../editor/model/context";
import { devSiteDocument, DEV_IDS as I } from "../editor/model/dev-site";
import type { SelItem } from "../editor/model/selection";
import { createEditorStore } from "../editor/model/store";
import { useManageUi } from "../site-mgmt/manage-ui";
import { InspectorEnvProvider, useInspectorTab } from "./env";
import { Inspector } from "./Inspector";
import { libraryPicker, registerMediaPicker, useOpenMediaPicker } from "./media";

function setup(ui: ReactNode, opts: { role?: string; doc?: SiteDocument; select?: SelItem } = {}) {
  const store = createEditorStore({ doc: opts.doc ?? devSiteDocument(), actor: "user:test" });
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
  return { ...utils, user, store, s: () => store.getState() };
}

const panel = () => screen.getByTestId("inspector");

/** Every control a person could change something with, outside navigation-only controls. */
function enabledEditors(root: HTMLElement): string[] {
  const out: string[] = [];
  const sel =
    'button,input,textarea,select,[role="radio"],[role="switch"],[role="combobox"],[role="slider"],[contenteditable="true"]';
  for (const el of root.querySelectorAll<HTMLElement>(sel)) {
    if (el.closest("[data-ip-nav]") || el.getAttribute("role") === "tab") continue;
    const disabled =
      (el as HTMLButtonElement).disabled ||
      el.getAttribute("aria-disabled") === "true" ||
      el.hasAttribute("data-disabled") ||
      el.closest("fieldset:disabled") !== null;
    if (!disabled) out.push(el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName);
  }
  return out;
}

beforeEach(() => {
  useEditorUi.getState().reset();
  useInspectorTab.setState({ tab: "content" });
});
afterEach(() => useBlockMenu.getState().close());

describe("role gating leaves nothing editable that the Hub would refuse", () => {
  const blocks = [
    I.heroButton,
    I.heroImage,
    I.introText,
    I.contactForm,
    I.faqAccordion,
    I.storyTestimonial,
    I.classesEmbed,
  ];

  it("contributors: every content and design control is read-only", async () => {
    for (const id of blocks) {
      const t = setup(<Inspector />, { role: "contributor", select: { kind: "block", id } });
      expect(enabledEditors(panel()), `${id} content`).toEqual([]);
      await t.user.click(screen.getByRole("tab", { name: "Design" }));
      expect(enabledEditors(panel()), `${id} design`).toEqual([]);
      t.unmount();
    }
    for (const id of [I.hero, I.intro, I.footer]) {
      const t = setup(<Inspector />, { role: "contributor", select: { kind: "section", id } });
      expect(enabledEditors(panel()), id).toEqual([]);
      t.unmount();
    }
  });

  it("editors: section design is read-only (layout, theme, spacing, background, animation)", () => {
    const doc = devSiteDocument();
    const home = doc.pages[I.home as never] as { sections: Section[] };
    const hero = home.sections[0] as Section;
    hero.style = {
      ...hero.style,
      background: { type: "gradient", from: "accent", to: "accent-700", via: "surface" },
    };
    setup(<Inspector />, { role: "editor", doc, select: { kind: "section", id: I.hero } });
    const left = enabledEditors(panel());
    // Only the section's name, link anchor and visibility (allowed for editors) remain.
    // Only adding blocks (allowed in unlocked stack sections) and the section's name, link
    // anchor and visibility remain.
    expect(left.every((l) => /^Add a block|name|hidden|anchor/i.test(l))).toBe(true);
    expect(within(panel()).getByRole("button", { name: /Gradient start/ })).toBeDisabled();
    expect(within(panel()).getByRole("button", { name: "Remove" })).toBeDisabled();
  });

  it("editors: a locked section leaves only words and images", () => {
    const doc = devSiteDocument();
    const home = doc.pages[I.home as never] as { sections: Section[] };
    (home.sections[0] as Section).locked = true;
    setup(<Inspector />, { role: "editor", doc, select: { kind: "block", id: I.heroImage } });
    const left = enabledEditors(panel());
    expect(left).toContain("Replace image");
    expect(left.some((l) => /link/i.test(l))).toBe(false);
  });

  it("exact colors are offered to designers only", async () => {
    const doc = devSiteDocument();
    const home = doc.pages[I.home as never] as { sections: Section[] };
    (home.sections[1] as Section).style.background = { type: "color", color: "accent" };
    const t = setup(<Inspector />, { doc, select: { kind: "section", id: I.intro } });
    await t.user.click(within(panel()).getByRole("button", { name: /^Background color/ }));
    expect(await screen.findByRole("radio", { name: "Exact" })).toBeInTheDocument();
    t.unmount();
    setup(<Inspector />, { doc, role: "editor", select: { kind: "section", id: I.intro } });
    expect(within(panel()).getByRole("button", { name: /^Background color/ })).toBeDisabled();
  });
});

describe("gallery and block menu respect roles and locks", () => {
  it("contributors can't add sections", async () => {
    const t = setup(<AddSectionPanel />, { role: "contributor" });
    expect(screen.getByText(/Ask an editor to add sections/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Story with portrait/ })).toBeDisabled();
    const before = JSON.stringify(t.s().doc.pages);
    fireEvent.click(screen.getByRole("button", { name: /^Story with portrait/ }));
    expect(JSON.stringify(t.s().doc.pages)).toBe(before);
  });

  it("footer presets ask before replacing the footer", async () => {
    const t = setup(<AddSectionPanel />);
    const old = t.s().doc.site.footer.id;
    fireEvent.change(screen.getByRole("textbox", { name: "Search sections" }), {
      target: { value: "footer" },
    });
    const footerCard = () =>
      screen
        .getAllByRole("button")
        .find((b) => b.textContent?.includes("Replaces the footer")) as HTMLElement;
    await t.user.click(footerCard());
    const dialog = await screen.findByRole("dialog", { name: "Replace the footer?" });
    await t.user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(t.s().doc.site.footer.id).toBe(old);
    await t.user.click(footerCard());
    await t.user.click(await screen.findByRole("button", { name: "Replace footer" }));
    expect(t.s().doc.site.footer.id).not.toBe(old);
  });

  it("the block menu refuses contributors, locked sections and editors in grid sections", async () => {
    for (const [role, prep] of [
      ["contributor", () => {}],
      [
        "editor",
        (doc: SiteDocument) => {
          ((doc.pages[I.home as never] as { sections: Section[] }).sections[1] as Section).locked =
            true;
        },
      ],
    ] as const) {
      const doc = devSiteDocument();
      prep(doc);
      const t = setup(<BlockMenu />, { role, doc, select: { kind: "block", id: I.introText } });
      act(() => useBlockMenu.getState().openFor());
      const dialog = await screen.findByRole("dialog", { name: "Add a block" });
      expect(within(dialog).queryByText(/^Adding to/)).toBeNull();
      const before = t.s().doc;
      await t.user.type(within(dialog).getByRole("combobox"), "quote");
      await t.user.keyboard("{Enter}");
      expect(t.s().doc).toBe(before);
      t.unmount();
    }
    const t = setup(<BlockMenu />, { role: "editor", select: { kind: "section", id: I.intro } });
    act(() => {
      t.s().run(setLayoutMode(t.s().doc, I.home, I.intro, "grid"));
      useBlockMenu.getState().openFor();
    });
    const dialog = await screen.findByRole("dialog", { name: "Add a block" });
    expect(within(dialog).getByText(/placed by the site’s designer/)).toBeInTheDocument();
  });
});

/** Opens the picker the way field controls do. */
function Probe() {
  const open = useOpenMediaPicker();
  return (
    <button type="button" onClick={() => void open({ accept: "image" })}>
      pick
    </button>
  );
}

describe("media picker seam", () => {
  it("opens the media library and resolves the pick, enriched from the site's media", async () => {
    const doc = devSiteDocument();
    const path = "media/2026/10/studio-abc123.jpg";
    doc.media[path as never] = {
      id: "med_aaaaaaaaaa",
      path,
      kind: "image",
      mime: "image/jpeg",
      bytes: 1000,
      width: 1600,
      height: 1200,
      alt: "The studio at dawn",
      focal: [0.4, 0.6],
      createdAt: "2026-10-01T00:00:00Z",
    } as never;
    const open = libraryPicker(() => doc);
    const picked = open({ accept: "image", title: "Choose a photo" });
    const req = useManageUi.getState().mediaPick;
    expect(req).toMatchObject({ title: "Choose a photo", accept: "image" });
    req?.onPick(path);
    useManageUi.getState().pickMedia(null);
    expect(await picked).toEqual({
      src: path,
      mediaId: "med_aaaaaaaaaa",
      alt: "The studio at dawn",
      width: 1600,
      height: 1200,
      focal: [0.4, 0.6],
    });

    const cancelled = open({ accept: "video" });
    expect(useManageUi.getState().mediaPick?.accept).toBe("any");
    useManageUi.getState().pickMedia(null);
    expect(await cancelled).toBeNull();
  });

  it("controls use the registered picker", async () => {
    const calls: string[] = [];
    const off = registerMediaPicker(async (r) => {
      calls.push(r.accept);
      return { src: "https://images.example.com/new.jpg", alt: "New" };
    });
    render(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "pick" }));
    expect(calls).toEqual(["image"]);
    off();
  });

  it("replacing an image goes through the picker and keeps the alt text", async () => {
    const off = registerMediaPicker(async () => ({ src: "https://images.example.com/new.jpg" }));
    const t = setup(<Inspector />, { select: { kind: "block", id: I.heroImage } });
    const alt = (
      t.s().doc.pages[I.home as never] as { sections: Section[] }
    ).sections[0]?.blocks.find((b) => b.id === I.heroImage)?.fields.image as { alt: string };
    await t.user.click(
      within(panel()).getAllByRole("button", { name: /^Replace/ })[0] as HTMLElement,
    );
    await waitFor(() => {
      const img = (
        t.s().doc.pages[I.home as never] as { sections: Section[] }
      ).sections[0]?.blocks.find((b) => b.id === I.heroImage)?.fields.image as {
        src: string;
        alt: string;
      };
      expect(img.src).toBe("https://images.example.com/new.jpg");
      expect(img.alt).toBe(alt.alt);
    });
    off();
  });
});

describe("reference filters and embeds", () => {
  it("chooses latest-with-filters or hand-picked items", async () => {
    const doc = devSiteDocument();
    const post = (slug: string, title: string, categories: string[]) => ({
      kind: "blog",
      slug,
      frontmatter: { title, status: "published", date: "2026-10-01", categories },
      body: "Hello",
    });
    doc.collections.journal = {
      "first-light": post("first-light", "First light", ["news"]),
      "slow-flow": post("slow-flow", "Slow flow", ["practice"]),
    } as never;
    const home = doc.pages[I.home as never] as { sections: Section[] };
    (home.sections[1] as Section).blocks.push(
      summaryBlock.create({
        id: "blk_smmary0000" as never,
        fields: { source: { collection: "journal" } } as never,
      }),
    );
    const t = setup(<Inspector />, { doc, select: { kind: "block", id: "blk_smmary0000" } });
    const source = () =>
      (
        (t.s().doc.pages[I.home as never] as { sections: Section[] }).sections[1] as Section
      ).blocks.find((b) => b.id === "blk_smmary0000")?.fields.source as {
        items?: string[];
        filter?: { featured?: boolean; tags?: string[] };
      };
    await t.user.click(within(panel()).getByRole("switch", { name: "Featured only" }));
    expect(source().filter?.featured).toBe(true);
    const tags = within(panel()).getByRole("textbox", { name: "Tags" });
    await t.user.type(tags, "mornings, beginners");
    fireEvent.blur(tags);
    expect(source().filter?.tags).toEqual(["mornings", "beginners"]);
    await t.user.click(within(panel()).getByRole("radio", { name: "Hand-picked" }));
    expect(source().items?.length).toBeGreaterThan(0);
    expect(source().filter).toBeUndefined();
    await t.user.click(within(panel()).getByRole("checkbox", { name: /Slow flow/ }));
    expect(source().items).not.toContain("slow-flow");
  });

  it("embeds refuse secrets and save sanitized code", async () => {
    const t = setup(<Inspector />, { select: { kind: "block", id: I.classesEmbed } });
    const code = within(panel()).getByRole("textbox", { name: /code$/ });
    const embed = () =>
      Object.values(t.s().doc.pages)
        .flatMap((p) => p.sections)
        .flatMap((s) => s.blocks)
        .find((b) => b.id === I.classesEmbed)?.fields.embed as { code: string };
    const before = embed().code;
    const key = ["sk", "live", "4eC39HqLyjWDarjtT1zdp7dc"].join("_");
    fireEvent.change(code, { target: { value: `<script>pay("${key}")</script>` } });
    fireEvent.blur(code);
    expect(within(panel()).getByRole("alert").textContent).toMatch(/private key/);
    expect(embed().code).toBe(before);
    fireEvent.change(code, { target: { value: "  <b>Mon 7:00</b>  " } });
    fireEvent.blur(code);
    expect(embed().code).toBe("<b>Mon 7:00</b>");
  });
});

describe("breakpoint resets", () => {
  it("clearing the desktop value keeps tablet and phone overrides", async () => {
    const doc = devSiteDocument();
    const home = doc.pages[I.home as never] as { sections: Section[] };
    (home.sections[1] as Section).style.padding = { d: "lg", m: "sm" };
    const t = setup(<Inspector />, { doc, select: { kind: "section", id: I.intro } });
    await t.user.click(within(panel()).getByRole("combobox", { name: "Section padding" }));
    await t.user.click(await screen.findByRole("option", { name: "Site density" }));
    const pad = (t.s().doc.pages[I.home as never] as { sections: Section[] }).sections[1]?.style
      .padding;
    expect(pad?.m).toBe("sm");
    expect(pad?.d).toBeDefined();
  });
});
