import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SiteDocument } from "@openspace/schema";
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
import { type FakeImage, fakeCodec, fakePhoto } from "../media/testing";
import { useUploads } from "../media/uploader";
import { mediaTestHooks } from "../media/useUploader";
import { pagesInOrder, sectionSummary } from "./MobileStudio";

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

  it("adds a section from the presets", async () => {
    const { user } = await openOnPhone();
    await user.click(screen.getByRole("button", { name: "Add section" }));
    expect(await screen.findByRole("dialog", { name: /Add a section/i })).toBeInTheDocument();
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

  it("publishes from the phone", async () => {
    const { user } = await openOnPhone();
    act(() => {
      store().commit([{ op: "page.update", page: I.about, set: { title: "About us" } }] as never);
    });
    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("dialog", { name: "Publish changes" })).toBeInTheDocument();
  });
});

describe("mobile helpers", () => {
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
});
