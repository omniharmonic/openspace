import "fake-indexeddb/auto";
import { designerComponent } from "@omniharmonic/openspace-blocks";
import {
  type ComponentDefinition,
  componentSection,
  findBrokenLinks,
  PopupSchema,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { useEditorUi } from "../editor/editor-store";
import { devSiteDocument } from "../editor/model/dev-site";
import type { EditorStore } from "../editor/model/store";
import { type FakeImage, fakeCodec, fakePhoto } from "../media/testing";
import { useUploads } from "../media/uploader";
import { mediaTestHooks } from "../media/useUploader";
import { pagesInNav } from "../pages/navTree";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
const willow = sites[0] as Site;
const store = () =>
  (window as unknown as { __osEditorStore: EditorStore }).__osEditorStore.getState();

async function openEditor(panel?: "pages" | "media" | "chrome", doc?: SiteDocument) {
  const utils = renderStudio(`/sites/${willow.id}`, { user: SAM, sites }, undefined, (hub) => {
    if (doc) hub.state.documents = { [willow.id]: doc };
  });
  await screen.findByTitle("Page canvas");
  await waitFor(() => expect(store().doc.pages).toBeTruthy());
  if (panel) {
    act(() => useEditorUi.getState().setLeftPanel(panel));
    // Pages, media and header & footer panels are lazy chunks.
    await waitFor(() => expect(screen.queryByRole("status", { name: "Loading" })).toBeNull());
  }
  return utils;
}

beforeEach(() => {
  useEditorUi.getState().reset();
  useUploads.setState({ items: [] });
});
afterEach(() => {
  mediaTestHooks.codec = undefined;
});

describe("pages & navigation manager", () => {
  it("adds a page from a template, linked in the navigation, then opens it", async () => {
    const { user } = await openEditor("pages");
    const panel = await screen.findByRole("complementary", { name: "Pages" });
    await user.click(within(panel).getByRole("button", { name: "Add page" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a page" });
    await user.click(within(dialog).getByRole("button", { name: /Services/ }));
    expect(within(dialog).getByLabelText("Address")).toHaveValue("services");
    await user.type(within(dialog).getByLabelText("Page name"), "Private sessions");
    expect(within(dialog).getByLabelText("Address")).toHaveValue("private-sessions");
    await user.click(within(dialog).getByRole("button", { name: "Add page" }));
    const page = Object.values(store().doc.pages).find((p) => p.slug === "private-sessions");
    expect(page?.title).toBe("Private sessions");
    expect(page?.sections.length).toBe(4);
    expect(store().pageId).toBe(page?.id);
    expect(pagesInNav(store().doc.site.nav).has(page?.id as string)).toBe(true);
    expect(within(panel).getByRole("button", { name: /Private sessions/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("reorders with the keyboard, hides from navigation, and deletes with confirmation", async () => {
    const { user } = await openEditor("pages");
    const panel = await screen.findByRole("complementary", { name: "Pages" });
    const list = within(panel).getByRole("list", { name: "Navigation" });
    const labels = () =>
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.querySelector(".st-pm__title")?.textContent);
    const before = labels();
    const second = within(list).getAllByRole("listitem")[1] as HTMLElement;
    const main = second.querySelector(".st-pm__main") as HTMLElement;
    main.focus();
    fireEvent.keyDown(main, { key: "ArrowUp", altKey: true });
    expect(labels()[0]).toBe(before[1]);
    expect(store().undoStack.at(-1)?.label).toBe("Reorder navigation");

    const row = within(list).getAllByRole("listitem")[1] as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "More options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Hide from navigation" }));
    expect(store().doc.site.nav[1]).toMatchObject({ hidden: true });

    const target = within(list)
      .getAllByRole("listitem")
      .find((li) => li.querySelector(".st-pm__path")?.textContent !== "/") as HTMLElement;
    const title = target.querySelector(".st-pm__title")?.textContent as string;
    await user.click(within(target).getByRole("button", { name: "More options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete page" }));
    const confirm = await screen.findByRole("dialog", { name: `Delete “${title}”?` });
    await user.click(within(confirm).getByRole("button", { name: "Delete page" }));
    expect(Object.values(store().doc.pages).some((p) => p.title === title)).toBe(false);
  });

  it("edits page settings with live search and social previews, gating and a redirect", async () => {
    const { user, hub } = await openEditor("pages");
    const doc = store().doc;
    const page = Object.values(doc.pages).find((p) => p.slug !== "");
    if (!page) throw new Error("no page");
    act(() => {
      useEditorUi.getState().setLeftPanel("pages");
    });
    const panel = await screen.findByRole("complementary", { name: "Pages" });
    const row = within(panel)
      .getAllByRole("listitem")
      .find((li) => li.querySelector(".st-pm__title")?.textContent === page.title) as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Page settings" }));
    const dialog = await screen.findByRole("dialog", { name: `${page.title} settings` });

    // The shared SEO check (@omniharmonic/openspace-lint) runs on the page as it's edited.
    const check = within(dialog).getByRole("list", { name: "Search check" });
    expect(check).toHaveTextContent("This page has no description for search results.");
    const seoTitle = within(dialog).getByLabelText(/Title in search results/);
    await user.type(seoTitle, "Yoga classes in Portland");
    const google = within(dialog).getByTestId("seo-google");
    expect(google).toHaveTextContent("Yoga classes in Portland");
    await user.type(
      within(dialog).getByLabelText(/Description/),
      "Small, friendly classes for every body.",
    );
    expect(google).toHaveTextContent("Small, friendly classes for every body.");
    expect(
      within(dialog).queryByText("This page has no description for search results."),
    ).toBeNull();
    await user.click(within(dialog).getByRole("radio", { name: "Social" }));
    expect(within(dialog).getByTestId("seo-social")).toHaveTextContent("Yoga classes in Portland");

    const address = within(dialog).getByLabelText("Address");
    await user.clear(address);
    await user.type(address, "Our Classes");
    expect(
      within(dialog).getByRole("switch", { name: `Send /${page.slug} to the new address` }),
    ).toBeChecked();

    await user.click(within(dialog).getByRole("radio", { name: "Password" }));
    expect(within(dialog).getByText(/Needs Cloudflare hosting/)).toBeInTheDocument();
    // A password page can't be saved without a password the Hub knows.
    expect(
      await within(dialog).findByText("Set a password (at least 4 characters) before saving."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Password"), "namaste");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(hub.calls.find((c) => c.method === "setPagePassword")?.args).toEqual([
        willow.id,
        page.id,
        "•••",
      ]),
    );
    await waitFor(() =>
      expect(store().doc.pages[page.id as keyof SiteDocument["pages"]]?.access).toEqual({
        password: true,
      }),
    );
    const saved = store().doc.pages[page.id as keyof SiteDocument["pages"]];
    expect(saved).toMatchObject({
      slug: "our-classes",
      access: { password: true },
      seo: {
        title: "Yoga classes in Portland",
        description: "Small, friendly classes for every body.",
      },
    });
    expect(store().doc.site.redirects).toContainEqual({
      from: `/${page.slug}`,
      to: "/our-classes",
      status: 301,
    });
  });
});

describe("header & footer, banner and pop-up", () => {
  it("switches header layout, behavior and adds a call-to-action button", async () => {
    const { user } = await openEditor("chrome");
    const panel = await screen.findByRole("complementary", { name: "Header & footer" });
    expect(within(panel).getAllByRole("button", { pressed: false }).length).toBeGreaterThanOrEqual(
      7,
    );
    await user.click(within(panel).getByRole("button", { name: /Split/ }));
    expect(store().doc.site.header.variant).toBe("split-nav");
    const sticky = store().doc.site.header.sticky;
    await user.click(within(panel).getByRole("switch", { name: "Stay at the top when scrolling" }));
    expect(store().doc.site.header.sticky).toBe(!sticky);
    await user.click(within(panel).getByRole("radio", { name: "Covers the whole screen" }));
    expect(store().doc.site.header.mobileMenu).toBe("fullscreen");
    const hadButton = store().doc.site.nav.some((n) => n.type === "button");
    if (!hadButton) {
      await user.click(within(panel).getByRole("switch", { name: "Show a button" }));
      expect(store().doc.site.nav.at(-1)).toMatchObject({ type: "button", label: "Get in touch" });
    }
    const text = within(panel).getByLabelText("Button text");
    await user.clear(text);
    await user.type(text, "Book now");
    expect(store().doc.site.nav.find((n) => n.type === "button")).toMatchObject({
      label: "Book now",
    });
  });

  it("turns on an announcement bar and a pop-up with trigger and frequency cap", async () => {
    const { user } = await openEditor("chrome");
    const panel = await screen.findByRole("complementary", { name: "Header & footer" });
    await user.click(within(panel).getByRole("tab", { name: "Banner" }));
    const showBanner = within(panel).getByRole("switch", { name: "Show an announcement bar" });
    if (!store().doc.site.announcement?.enabled) await user.click(showBanner);
    const message = within(panel).getByLabelText(/Message/);
    await user.clear(message);
    await user.type(message, "Spring retreat: 4 places left");
    expect(store().doc.site.announcement).toMatchObject({
      enabled: true,
      message: "Spring retreat: 4 places left",
    });

    await user.click(within(panel).getByRole("tab", { name: "Pop-up" }));
    await user.click(within(panel).getByRole("switch", { name: "Show a pop-up" }));
    expect(store().doc.site.popup).toMatchObject({
      enabled: true,
      trigger: "time",
      frequencyDays: 7,
    });
    await user.click(within(panel).getByRole("radio", { name: "On scroll" }));
    expect(store().doc.site.popup).toMatchObject({ trigger: "scroll", scrollPercent: 50 });
    await user.click(within(panel).getByRole("combobox", { name: "How often" }));
    await user.click(await screen.findByRole("option", { name: "Once a month" }));
    expect(store().doc.site.popup?.frequencyDays).toBe(30);
    const heading = within(panel).getByLabelText(/Heading/);
    await user.clear(heading);
    expect(store().doc.site.popup?.heading).not.toBe("");
    await user.type(heading, "Ten percent off your first class");
    expect(store().doc.site.popup?.heading).toBe("Ten percent off your first class");
    expect(PopupSchema.safeParse(store().doc.site.popup).success).toBe(true);
    // The canvas never shows the pop-up; the published page does.
    const frame = screen.getByTitle("Page canvas") as HTMLIFrameElement;
    expect(frame.contentDocument?.querySelector(".os-popup")).toBeNull();
  });
});

describe("media library", () => {
  it("uploads through the pipeline from the file picker and edits alt text and focal point", async () => {
    const images = new WeakMap<Blob, FakeImage>();
    mediaTestHooks.codec = fakeCodec(images).codec;
    const { user, hub } = await openEditor("media");
    const panel = await screen.findByRole("complementary", { name: "Media" });
    const file = fakePhoto(
      images,
      { width: 4032, height: 3024, subject: [0.3, 0.4] },
      "IMG_2041.JPG",
    );
    await user.upload(screen.getByTestId("media-file-input"), file);
    await waitFor(() => expect(hub.calls.some((c) => c.method === "uploadMedia")).toBe(true));
    const path = await waitFor(() => {
      const p = Object.keys(store().doc.media).find((k) => /img-2041-[0-9a-f]{8}\.jpg$/.test(k));
      expect(p).toBeTruthy();
      return p as string;
    });
    const meta = store().doc.media[path as keyof SiteDocument["media"]];
    expect(meta).toMatchObject({ width: 2400, height: 1800, mime: "image/jpeg", alt: "" });
    expect(await within(panel).findByText("Added")).toBeInTheDocument();

    await user.click(within(panel).getByRole("button", { name: "IMG_2041.JPG" }));
    const dialog = await screen.findByRole("dialog", { name: "IMG_2041.JPG" });
    await user.type(
      within(dialog).getByLabelText(/Alt text/),
      "A sunlit studio with mats laid out",
    );
    const point = within(dialog).getByRole("button", { name: /Focal point/ });
    point.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    const edited = store().doc.media[path as keyof SiteDocument["media"]];
    expect(edited?.alt).toBe("A sunlit studio with mats laid out");
    expect(edited?.focal?.[0]).toBeCloseTo((meta?.focal?.[0] ?? 0.5) + 0.04, 5);
    expect(within(dialog).getByText("Not used anywhere yet.")).toBeInTheDocument();
  });

  it("pastes images into the library and shows the storage meter", async () => {
    const images = new WeakMap<Blob, FakeImage>();
    mediaTestHooks.codec = fakeCodec(images).codec;
    const { hub } = await openEditor("media");
    const panel = await screen.findByRole("complementary", { name: "Media" });
    expect(within(panel).getByRole("meter", { name: "Storage used" })).toBeInTheDocument();
    const file = fakePhoto(images, { width: 800, height: 600 }, "pasted.png", "pasted");
    const paste = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, "clipboardData", {
      value: { items: [{ kind: "file", getAsFile: () => file }], files: [file] },
    });
    act(() => {
      document.body.dispatchEvent(paste);
    });
    expect(paste.defaultPrevented).toBe(true);
    await waitFor(() => expect(hub.calls.some((c) => c.method === "uploadMedia")).toBe(true));
  });
});

describe("page gating follow-ups", () => {
  it("switching a password page to public removes its password from the Hub", async () => {
    const { user, hub } = await openEditor("pages");
    const page = Object.values(store().doc.pages).find((p) => p.slug !== "");
    if (!page) throw new Error("no page");
    await hub.setPagePassword(willow.id, page.id, "namaste");
    act(() => {
      store().commit([
        { op: "page.update", page: page.id, set: { access: { password: true } } },
      ] as never);
    });
    const panel = await screen.findByRole("complementary", { name: "Pages" });
    const row = within(panel)
      .getAllByRole("listitem")
      .find((li) => li.querySelector(".st-pm__title")?.textContent === page.title) as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Page settings" }));
    const dialog = await screen.findByRole("dialog", { name: `${page.title} settings` });
    await within(dialog).findByText("Change password");
    await user.click(within(dialog).getByRole("radio", { name: "Everyone" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(hub.calls.some((c) => c.method === "clearPagePassword")).toBe(true));
    expect(store().doc.pages[page.id as keyof SiteDocument["pages"]]?.access).toBeUndefined();
  });

  it("duplicating a password page makes a public copy", async () => {
    const { user } = await openEditor("pages");
    const page = Object.values(store().doc.pages).find((p) => p.slug !== "");
    if (!page) throw new Error("no page");
    act(() => {
      store().commit([
        { op: "page.update", page: page.id, set: { access: { password: true } } },
      ] as never);
    });
    const panel = await screen.findByRole("complementary", { name: "Pages" });
    const row = within(panel)
      .getAllByRole("listitem")
      .find((li) => li.querySelector(".st-pm__title")?.textContent === page.title) as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "More options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    const copy = Object.values(store().doc.pages).find((p) => p.title === `${page.title} (copy)`);
    expect(copy?.access).toBeUndefined();
    expect(await screen.findByText(/The copy is public/)).toBeInTheDocument();
  });
});

describe("pop-up validation messages", () => {
  it("explains why an edit wasn't saved", async () => {
    const { popupProblem } = await import("../site-chrome/BannerEditors");
    expect(popupProblem({ path: ["heading"], message: "x" })).toBe("the heading can't be empty.");
    expect(popupProblem({ path: ["frequencyDays"], message: "x" })).toBe(
      "use between 0 and 365 days.",
    );
    expect(popupProblem({ path: ["image", "alt"], message: "x" })).toMatch(/image description/);
  });
});

/**
 * A site Claude made like Boulder Foodshed: designer sections (custom components) on the home
 * page, a menu of entries that scroll to sections nobody named, and a header button to /#waitlist.
 */
function claudeOnePager(): SiteDocument {
  const doc = devSiteDocument({ siteId: willow.id, name: willow.name, url: willow.url });
  const home = Object.values(doc.pages).find((p) => p.slug === "");
  if (!home) throw new Error("fixture");
  const hero = designerComponent("editorial-hero") as ComponentDefinition;
  doc.components = { [hero.name]: hero };
  const designed = { ...componentSection(hero), label: "Foodshed hero" };
  const [, second, third] = home.sections;
  if (!second || !third) throw new Error("fixture");
  second.label = "Basket sizes";
  delete second.anchor;
  third.label = "Common questions";
  delete third.anchor;
  home.sections.unshift(designed as never);
  doc.site.nav = [
    { type: "page", page: home.id, label: "Baskets", anchor: "baskets" },
    { type: "page", page: home.id, label: "Questions", anchor: "questions" },
    {
      type: "button",
      label: "Join the waitlist",
      link: { type: "url", url: "/#waitlist" },
      style: "primary",
    },
  ];
  return doc;
}

describe("menu entries to sections (Boulder Foodshed: the header wasn't connected)", () => {
  it("shows unconnected entries and connects one to its section in two clicks", async () => {
    const { user } = await openEditor("pages", claudeOnePager());
    const panel = await screen.findByRole("complementary", { name: "Pages" });
    const list = within(panel).getByRole("list", { name: "Navigation" });
    const row = within(list)
      .getAllByRole("listitem")
      .find((li) => li.querySelector(".st-pm__title")?.textContent === "Baskets") as HTMLElement;
    expect(within(row).getByText("Not connected")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: /Baskets/ }));
    const dialog = await screen.findByRole("dialog", { name: "Edit menu link" });
    // The section it most likely means is already chosen.
    expect(within(dialog).getByRole("combobox", { name: "Section" })).toHaveTextContent(
      "Basket sizes",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    const home = Object.values(store().doc.pages).find((p) => p.slug === "");
    expect(home?.sections.find((s) => s.label === "Basket sizes")?.anchor).toBe("baskets");
    expect(within(row).getByText("Home › Basket sizes")).toBeInTheDocument();
    expect(store().undoStack.at(-1)?.label).toBe("Edit menu link");

    // A new entry to a section, from the add menu.
    await user.click(within(panel).getByRole("button", { name: "Add" }));
    await user.click(await screen.findByRole("menuitem", { name: "Section of a page…" }));
    const add = await screen.findByRole("dialog", { name: "Add a link to a section" });
    await user.type(within(add).getByLabelText("Label"), "Our story");
    await user.click(within(add).getByRole("combobox", { name: "Section" }));
    await user.click(await screen.findByRole("option", { name: "Foodshed hero" }));
    await user.click(within(add).getByRole("button", { name: "Save" }));
    expect(store().doc.site.nav.at(-1)).toMatchObject({
      type: "page",
      label: "Our story",
      anchor: "our-story",
    });
    const anchors = findBrokenLinks(store().doc)
      .filter((l) => l.kind === "anchor" && l.scope.kind === "site")
      .map((l) => l.target);
    expect(anchors).toEqual(["/#questions", "/#waitlist"]);
  });

  it("the header panel opens on Claude-made content and the button can go to a section", async () => {
    const { user } = await openEditor("chrome", claudeOnePager());
    const panel = await screen.findByRole("complementary", { name: "Header & footer" });
    const goesTo = within(panel).getByRole("combobox", { name: "Link to" });
    expect(goesTo).toHaveTextContent("Web address");
    await user.click(goesTo);
    await user.click(await screen.findByRole("option", { name: "Section" }));
    await user.click(within(panel).getByRole("combobox", { name: "Section" }));
    await user.click(await screen.findByRole("option", { name: "Common questions" }));
    const home = Object.values(store().doc.pages).find((p) => p.slug === "");
    const questions = home?.sections.find((s) => s.label === "Common questions");
    expect(store().doc.site.nav.find((n) => n.type === "button")).toMatchObject({
      link: { type: "anchor", section: questions?.id },
    });
    // The footer tab renders too.
    await user.click(within(panel).getByRole("tab", { name: "Footer" }));
    expect(within(panel).getByRole("tabpanel")).toBeInTheDocument();
  });
});
