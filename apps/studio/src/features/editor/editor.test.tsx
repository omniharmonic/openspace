import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { DEVICE_WIDTHS, effectiveZoom, useEditorUi } from "./editor-store";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
const willow = sites[0] as Site;

describe("editor store", () => {
  beforeEach(() => useEditorUi.getState().reset());

  it("toggles panels and chrome", () => {
    const s = useEditorUi.getState();
    expect(s.leftPanel).toBe("pages");
    s.toggleLeftPanel("pages");
    expect(useEditorUi.getState().leftPanel).toBeNull();
    s.toggleLeftPanel("layers");
    expect(useEditorUi.getState().leftPanel).toBe("layers");
    s.toggleChrome();
    expect(useEditorUi.getState().chromeHidden).toBe(true);
    // Opening a panel brings the chrome back.
    s.toggleLeftPanel("layers");
    expect(useEditorUi.getState()).toMatchObject({ chromeHidden: false, leftPanel: "layers" });
  });

  it("steps zoom from the fitted scale and resets to fit on device change", () => {
    const s = useEditorUi.getState();
    s.setFitScale(0.54);
    s.zoomIn();
    expect(useEditorUi.getState().zoom).toBe(0.67);
    s.zoomOut();
    expect(useEditorUi.getState().zoom).toBe(0.5);
    s.zoomOut();
    expect(useEditorUi.getState().zoom).toBe(0.33);
    s.setBreakpoint("mobile");
    expect(useEditorUi.getState()).toMatchObject({ zoom: "fit", breakpoint: "mobile" });
    expect(effectiveZoom(useEditorUi.getState())).toBe(0.54);
    expect(DEVICE_WIDTHS).toEqual({ desktop: 1440, tablet: 834, mobile: 390 });
  });
});

describe("editor frame", () => {
  beforeEach(() => useEditorUi.getState().reset());

  it("renders the chrome: top bar, rail, panels, canvas and inspector", async () => {
    renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    expect(await screen.findByRole("button", { name: "Willow Street Yoga" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Panels" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Pages" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Inspector" })).toHaveTextContent(
      "Nothing selected",
    );
    const frame = (await screen.findByTitle("Page canvas")) as HTMLIFrameElement;
    await waitFor(() =>
      expect(frame.contentDocument?.querySelector("[data-os-page]")).toBeTruthy(),
    );
    // Disabled but still focusable, so its tooltip explains why.
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(publish).toHaveAttribute("aria-disabled", "true");
    expect(publish).not.toHaveAttribute("disabled");
    expect(screen.getByRole("list", { name: "Editing now" })).toBeInTheDocument();
  });

  it("switches panels from the rail and hides everything with ⌘\\", async () => {
    const { user } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    const rail = await screen.findByRole("navigation", { name: "Panels" });
    await user.click(within(rail).getByRole("button", { name: "Layers" }));
    expect(screen.getByRole("complementary", { name: "Layers" })).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: "\\", code: "Backslash", ctrlKey: true });
    });
    expect(screen.queryByRole("complementary", { name: "Layers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Inspector" })).not.toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { key: "¡", code: "Digit1", altKey: true });
    });
    expect(screen.getByRole("complementary", { name: "Pages" })).toBeInTheDocument();
  });

  it("changes device preview and zoom", async () => {
    const { user } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await user.click(await screen.findByRole("radio", { name: "Phone (390)" }));
    expect(useEditorUi.getState().breakpoint).toBe("mobile");
    expect(screen.getByLabelText("Canvas")).toHaveTextContent("390");
    act(() => {
      fireEvent.keyDown(window, { key: "0", ctrlKey: true });
    });
    expect(useEditorUi.getState().zoom).toBe(1);
    expect(screen.getByRole("button", { name: "Zoom 100%" })).toBeInTheDocument();
  });

  it("keeps the checklist's progress and dismissal per site", async () => {
    const { user, unmount } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    const list = await screen.findByRole("region", { name: "Get your site ready" });
    await user.click(within(list).getByRole("checkbox", { name: "Edit the headline" }));
    expect(within(list).getByText("1 of 5")).toBeInTheDocument();
    await user.click(within(list).getByRole("button", { name: "Hide checklist" }));
    expect(screen.queryByRole("region", { name: "Get your site ready" })).not.toBeInTheDocument();
    unmount();

    renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await screen.findByRole("navigation", { name: "Panels" });
    expect(screen.queryByRole("region", { name: "Get your site ready" })).not.toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem(`openspace.checklist.${willow.id}`) ?? "{}"),
    ).toMatchObject({
      done: ["headline"],
      dismissed: true,
    });
  });

  it("registers editor commands in the palette", async () => {
    const { user } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await screen.findByRole("navigation", { name: "Panels" });
    await user.keyboard("{Control>}k{/Control}");
    await user.type(await screen.findByPlaceholderText("Search commands…"), "tablet");
    await user.keyboard("{Enter}");
    await waitFor(() => expect(useEditorUi.getState().breakpoint).toBe("tablet"));
  });

  it("explains when a site can't be opened", async () => {
    renderStudio("/sites/st_0000000000", { user: SAM, sites });
    expect(
      await screen.findByRole("heading", { name: "This site can’t be opened" }),
    ).toBeInTheDocument();
  });

  it("sends signed-out visitors to sign in", async () => {
    const { router } = renderStudio(`/sites/${willow.id}`, { sites });
    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent(`/sites/${willow.id}`)}`);
  });
});
