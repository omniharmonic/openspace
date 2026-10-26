import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCommandStore } from "../../ui/command-store";
import { useEditorUi } from "../editor/editor-store";
import { FORBIDDEN, openWorkspace, visibleCopy, WILLOW } from "./testing";

// The editor and workspace screens load on demand; the first test in a busy run can be slow.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => useEditorUi.getState().reset());

describe("workspace shell", () => {
  it("groups content, audience, marketing and store, with new-entry and approval counts", async () => {
    const { user, router } = await openWorkspace("content/journal");
    const nav = screen.getByRole("navigation", { name: "Sections" });
    for (const name of [
      "Journal",
      "Events",
      "Podcast",
      "Shop",
      "Form inbox",
      "Subscribers",
      "Members",
      "Email campaigns",
      "Analytics",
      "Orders",
      "Products & stock",
      "Store settings",
      "Donations",
    ])
      expect(
        within(nav).getByRole("button", { name: new RegExp(`^${name.replace(/&/g, "&")}`) }),
      ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(nav).getByRole("button", { name: /^Form inbox/ }).textContent).toBe(
        "Form inbox4 new",
      ),
    );
    expect(within(nav).getByRole("button", { name: /^Approvals/ }).textContent).toBe(
      "Approvals1 new",
    );
    await user.click(within(nav).getByRole("button", { name: /^Orders/ }));
    expect(router.state.location.pathname).toBe(`/sites/${WILLOW.id}/orders`);
    await user.keyboard("{Escape}");
    expect(router.state.location.pathname).toBe(`/sites/${WILLOW.id}`);
  });

  it("shows contributors only content and their own submissions", async () => {
    await openWorkspace("content/journal", { site: { role: "contributor" } });
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(within(nav).getByRole("button", { name: "My submissions" })).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: /Form inbox/ })).toBeNull();
    expect(within(nav).queryByRole("button", { name: /Orders/ })).toBeNull();
  });

  it("refuses screens a role can't use", async () => {
    await openWorkspace("orders", { site: { role: "contributor" } });
    expect(
      await screen.findByText(/Your role on this site doesn't include this/),
    ).toBeInTheDocument();
  });

  it("adds commands to the command palette", async () => {
    await openWorkspace("content/journal");
    const labels = Object.values(useCommandStore.getState().sources)
      .flat()
      .map((c) => c.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        "Open Journal",
        "New post in Journal",
        "Form inbox",
        "Write an email campaign",
        "Analytics",
        "Store settings",
      ]),
    );
  });

  it("keeps Git vocabulary out of every screen", async () => {
    for (const path of [
      "content/new",
      "approvals",
      "members",
      "campaigns/sender",
      "products",
      "donations",
    ]) {
      const { unmount } = await openWorkspace(path);
      await screen.findAllByRole("heading", { level: 2 });
      expect(visibleCopy().match(FORBIDDEN), path).toBeNull();
      unmount();
    }
  });
});
