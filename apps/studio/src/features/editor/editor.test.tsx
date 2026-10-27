import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { markSetupDone } from "../setup/checklist";
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
    // Publish opens the change summary; the draft room reports the save state and who's here.
    expect(screen.getByRole("button", { name: "Publish" })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("list", { name: "Editing now" })).toBeInTheDocument();
    expect(await screen.findByText("Saved")).toBeInTheDocument();
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

  it("has one to-do list, and the first edit ticks off Make it yours", async () => {
    const { user, router } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await screen.findByRole("navigation", { name: "Panels" });
    expect(screen.queryByRole("region", { name: "Get your site ready" })).not.toBeInTheDocument();
    markSetupDone(willow.id, "personalize");
    await user.click(await screen.findByRole("button", { name: /Finish setting up/ }));
    expect(router.state.location.pathname).toBe(`/sites/${willow.id}/settings/setup`);
    const item = await screen.findByTestId("setup-personalize");
    expect(within(item).getByText("Done")).toBeInTheDocument();
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
