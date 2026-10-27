import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { useAddSection, useBlockMenu } from "../add-section/blockMenuStore";
import { useDesignCheck } from "../design-check/store";
import { useEditorUi } from "../editor/editor-store";
import { DEV_IDS as I } from "../editor/model/dev-site";
import type { EditorStore } from "../editor/model/store";
import { useMediaSources } from "../media/sources";
import { type FakeImage, fakeCodec, fakePhoto } from "../media/testing";
import { useUploads } from "../media/uploader";
import { mediaTestHooks } from "../media/useUploader";
import { pagesInOrder, sectionSummary } from "./MobileStudio";
import { dropIndex } from "./SectionList";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
const willow = sites[0] as Site;
const store = () =>
  (window as unknown as { __osEditorStore: EditorStore }).__osEditorStore.getState();

/** The home hero's image field as it is now. */
function heroImage(): { src: string; alt: string; width?: number } {
  const block = store()
    .doc.pages[I.home]?.sections.flatMap((s) => s.blocks)
    .find((b) => b.id === I.heroImage);
  const image = (block?.fields as { image?: { src: string; alt: string; width?: number } })?.image;
  if (!image) throw new Error("no hero image");
  return image;
}

const realMatchMedia = window.matchMedia;
const realWidth = window.innerWidth;

/** A 390px-wide phone: every "max-width: 767px" query matches. */
function phone(width = 390) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.matchMedia = (query: string) =>
    ({
      matches: /max-width:\s*767px/.test(query),
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

async function openOnPhone() {
  phone();
  const utils = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
  await screen.findByTestId("mobile-studio");
  await waitFor(() => expect(store().doc.pages[I.home]).toBeTruthy());
  return utils;
}

beforeEach(() => {
  useEditorUi.getState().reset();
  useAddSection.getState().close();
  useBlockMenu.getState().close();
  useUploads.setState({ items: [] });
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: realWidth });
  mediaTestHooks.codec = undefined;
  useDesignCheck.getState().reset();
});

describe("mobile Studio at 390px", () => {
  it("replaces the desktop chrome with the phone layout", async () => {
    await openOnPhone();
    // No panel rail, inspector column or grid tools: a top bar, the section list and tabs.
    expect(screen.queryByRole("navigation", { name: "Panels" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Inspector" })).not.toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Studio" });
    expect(
      within(tabs)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Pages", "Sections", "Preview", expect.stringMatching(/^\d*Check$/), "More"]);
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    // Phones edit the phone layout.
    expect(useEditorUi.getState().breakpoint).toBe("mobile");
    const list = screen.getByRole("list", { name: "Sections on Home" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(
      store().doc.pages[I.home]?.sections.length ?? 0,
    );
  });

  it("goes page list → section list", async () => {
    const { user } = await openOnPhone();
    await user.click(screen.getByRole("button", { name: "Pages" }));
    const pages = screen.getByRole("list", { name: "Pages" });
    expect(within(pages).getAllByRole("button")[0]).toHaveTextContent("Home");
    await user.click(within(pages).getByRole("button", { name: /About/ }));
    expect(store().pageId).toBe(I.about);
    expect(screen.getByRole("list", { name: "Sections on About" })).toBeInTheDocument();
    // Back goes to the page list, then out to the sites list.
    await user.click(screen.getByRole("button", { name: "All pages" }));
    expect(screen.getByTestId("mobile-pages")).toBeInTheDocument();
  });

  it("edits a section's content in a bottom sheet", async () => {
    const { user } = await openOnPhone();
    const list = screen.getByRole("list", { name: "Sections on Home" });
    await user.click(
      within(list).getAllByRole("button", { name: /^(?!Reorder)/ })[0] as HTMLElement,
    );
    const sheet = await screen.findByRole("dialog");
    const blocks = within(sheet).getByRole("list", { name: "Blocks in this section" });
    await user.click(within(blocks).getAllByRole("button")[0] as HTMLElement);
    // The block's fields (the inspector) open in the same sheet, with a way back.
    expect(within(sheet).getByTestId("inspector")).toBeInTheDocument();
    expect(store().selection[0]).toEqual({ kind: "block", id: I.heroHeading });
    await user.click(within(sheet).getByRole("button", { name: /Hero|Section/ }));
    expect(within(sheet).getByRole("list", { name: "Blocks in this section" })).toBeVisible();
  });

  it("reorders sections from the sheet (one undo step each) and with the drag handle's keys", async () => {
    const { user } = await openOnPhone();
    const order = () => store().doc.pages[I.home]?.sections.map((s) => s.id);
    const before = order() ?? [];
    const list = screen.getByRole("list", { name: "Sections on Home" });
    await user.click(
      within(list).getAllByRole("button", { name: /^(?!Reorder)/ })[0] as HTMLElement,
    );
    const sheet = await screen.findByRole("dialog");
    await user.click(within(sheet).getByRole("button", { name: "Move down" }));
    expect(order()).toEqual([before[1], before[0], ...before.slice(2)]);
    expect(store().undoStack.at(-1)?.label).toBe("Move section");
    await user.keyboard("{Escape}");
    // Every row has a 44px drag handle that is also keyboard operable.
    const handles = screen.getAllByRole("button", { name: /^Reorder / });
    expect(handles).toHaveLength(before.length);
    expect(handles[0]).toHaveAttribute("aria-roledescription", "sortable");
  });

  it("drags a section to a new place with the handle's keyboard controls", async () => {
    const { user } = await openOnPhone();
    const order = () => store().doc.pages[I.home]?.sections.map((s) => s.id) ?? [];
    const before = order();
    // jsdom has no layout: give each row a place in a 60px-high list so dnd-kit can measure.
    const rect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const row = this.closest(".st-mob__srow");
      const rows = row ? [...document.querySelectorAll(".st-mob__srow")] : [];
      const i = row ? rows.indexOf(row) : -1;
      if (i < 0) return rect.call(this);
      const top = i * 60;
      return {
        x: 0,
        y: top,
        top,
        left: 0,
        right: 340,
        bottom: top + 56,
        width: 340,
        height: 56,
        toJSON() {},
      } as DOMRect;
    };
    try {
      const handle = screen.getAllByRole("button", { name: /^Reorder / })[0] as HTMLElement;
      handle.focus();
      await user.keyboard(" ");
      await user.keyboard("{ArrowDown}");
      await user.keyboard(" ");
      await waitFor(() => expect(order()).toEqual([before[1], before[0], ...before.slice(2)]));
      expect(store().undoStack.at(-1)?.label).toBe("Move section");
    } finally {
      Element.prototype.getBoundingClientRect = rect;
    }
  });

  it("adds a section from the presets", async () => {
    const { user } = await openOnPhone();
    const count = store().doc.pages[I.home]?.sections.length ?? 0;
    await user.click(screen.getByRole("button", { name: "Add section" }));
    const dialog = await screen.findByRole("dialog", { name: /Add a section/i });
    const cats = within(dialog).getByRole("navigation", { name: "Section categories" });
    await user.click(within(cats).getByRole("button", { name: /^FAQ/ }));
    const cards = await within(dialog).findAllByRole("button", { name: /:/ });
    await user.click(cards[0] as HTMLElement);
    await waitFor(() => expect(store().doc.pages[I.home]?.sections.length).toBe(count + 1));
    expect(store().doc.pages[I.home]?.sections.at(-1)?.preset).toMatch(/^faq\//);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /Add a section/i })).toBeNull(),
    );
    expect(
      within(screen.getByRole("list", { name: "Sections on Home" })).getAllByRole("listitem"),
    ).toHaveLength(count + 1);
  });

  it("replaces a photo from the camera roll through the media pipeline", async () => {
    const images = new WeakMap<Blob, FakeImage>();
    mediaTestHooks.codec = fakeCodec(images).codec;
    const { user, hub } = await openOnPhone();
    const list = screen.getByRole("list", { name: "Sections on Home" });
    await user.click(
      within(list).getAllByRole("button", { name: /^(?!Reorder)/ })[0] as HTMLElement,
    );
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getAllByRole("button", { name: "Replace photo" }).length).toBeGreaterThan(
      0,
    );
    const input = within(sheet).getByTestId(`replace-photo-${I.heroImage}`) as HTMLInputElement;
    expect(input.accept).toBe("image/*");
    const file = fakePhoto(images, { width: 3024, height: 4032 }, "IMG_7781.HEIC.jpg");
    await user.upload(input, file);
    await waitFor(() => expect(hub.calls.some((c) => c.method === "uploadMedia")).toBe(true));
    await waitFor(() => expect(heroImage().src).toMatch(/^media\/\d{4}\/\d{2}\/img-7781/));
    const image = heroImage();
    expect(store().doc.media[image.src as keyof SiteDocument["media"]]).toBeTruthy();
    expect(image.width).toBeLessThanOrEqual(2400);
    expect(store().undoStack.at(-1)?.label).toBe("Replace photo");
  });

  it("shows the Design check as a sheet and jumps to an issue's section", async () => {
    const { user } = await openOnPhone();
    // Give the page a problem: an image with no alt text.
    act(() => {
      store().commit([
        {
          op: "block.update",
          page: I.home,
          block: I.heroImage,
          set: { image: { ...heroImage(), alt: "" } },
        },
      ] as never);
    });
    await user.click(screen.getByRole("button", { name: /Check/ }));
    const sheet = await screen.findByRole("dialog", { name: "Design check" });
    await waitFor(() =>
      expect(within(sheet).getAllByRole("button", { name: "Show" }).length).toBeGreaterThan(0),
    );
    const home = within(sheet).getByRole("region", { name: "Home" });
    await user.click(within(home).getAllByRole("button", { name: "Show" })[0] as HTMLElement);
    // The issue's section opens in the sheet with the block selected.
    expect(await screen.findByTestId("inspector")).toBeInTheDocument();
  });

  it("closes the More sheet when it opens Settings", async () => {
    const { user, router } = await openOnPhone();
    const tabs = screen.getByRole("navigation", { name: "Studio" });
    await user.click(within(tabs).getByRole("button", { name: "More" }));
    const more = await screen.findByRole("dialog", { name: "More" });
    await user.click(within(more).getByRole("button", { name: "Settings" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/settings$/));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "More" })).not.toBeInTheDocument(),
    );
  });

  it("publishes from the phone", async () => {
    const { user, hub } = await openOnPhone();
    act(() => {
      store().commit([{ op: "page.update", page: I.about, set: { title: "About us" } }] as never);
    });
    await user.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish changes" });
    const now = within(dialog).getByRole("button", { name: "Publish now" });
    await waitFor(() => expect(now).toBeEnabled());
    await user.click(now);
    expect(await screen.findByText("Live", {}, { timeout: 8000 })).toBeInTheDocument();
    expect(hub.calls.some((c) => c.method === "publish")).toBe(true);
  });
});

describe("mobile helpers", () => {
  it("works out where a dragged section lands", () => {
    const ids = ["a", "b", "c"];
    expect(dropIndex(ids, "a", "c")).toBe(2);
    expect(dropIndex(ids, "c", "a")).toBe(0);
    expect(dropIndex(ids, "a", "a")).toBeNull();
    expect(dropIndex(ids, "a", null)).toBeNull();
    expect(dropIndex(ids, "x", "a")).toBeNull();
  });

  it("orders pages like the navigation, home first", async () => {
    phone();
    const { devSiteDocument } = await import("../editor/model/dev-site");
    const doc = devSiteDocument();
    expect(pagesInOrder(doc)[0]?.slug).toBe("");
    expect(
      pagesInOrder(doc)
        .map((p) => p.id)
        .sort(),
    ).toEqual(Object.keys(doc.pages).sort());
    const first = doc.pages[I.home]?.sections[0];
    expect(sectionSummary(first as never).length).toBeGreaterThan(0);
  });

  it("keeps touch targets at 44px, respects safe areas and never scrolls sideways", () => {
    const css = readFileSync(join(__dirname, "mobile.css"), "utf8");
    expect(css).toMatch(/\.st-mob \.st-icon-button \{[^}]*width: 44px;[^}]*height: 44px;/);
    expect(css).toMatch(/\.st-mob \.st-button \{[^}]*--_h: 44px;/);
    expect(css).toMatch(/\.st-mob__grip \{[^}]*width: 44px;/);
    expect(css).toMatch(/\.st-mob__tab \{[^}]*min-height: 52px;/);
    expect(css).toContain("env(safe-area-inset-top)");
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toMatch(/\.st-mob \{[^}]*overflow: hidden;/);
  });

  it("keeps this session's local media when the layout switches between phone and desktop", async () => {
    let narrow = true;
    const listeners = new Set<() => void>();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    window.matchMedia = (query: string) =>
      ({
        get matches() {
          return /max-width:\s*767px/.test(query) ? narrow : false;
        },
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
    renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await screen.findByTestId("mobile-studio");
    const urls = URL as unknown as Record<string, unknown>;
    const saved = { create: urls.createObjectURL, revoke: urls.revokeObjectURL };
    const revoked: string[] = [];
    urls.createObjectURL = () => "blob:kept";
    urls.revokeObjectURL = (u: string) => revoked.push(u);
    try {
      useMediaSources.getState().addLocal("media/fresh.png", new Blob([new Uint8Array([1])]));
      narrow = false;
      act(() => {
        for (const fn of [...listeners]) fn();
      });
      await waitFor(() => expect(screen.queryByTestId("mobile-studio")).not.toBeInTheDocument());
      expect(useMediaSources.getState().local["media/fresh.png"]).toBe("blob:kept");
      expect(revoked).toEqual([]);
    } finally {
      urls.createObjectURL = saved.create;
      urls.revokeObjectURL = saved.revoke;
    }
  });
});
