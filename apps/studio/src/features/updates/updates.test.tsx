import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { useEditorUi } from "../editor/editor-store";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
const willow = sites[0] as Site;

beforeEach(() => useEditorUi.getState().reset());

describe("update available", () => {
  it("shows the banner, the changelog and applies the update", async () => {
    const { user, hub, queryClient } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    const banner = await screen.findByText("OpenSpace 1.1.0 is ready");
    expect(banner.closest("[role=status]")).toHaveTextContent(/New gallery layouts/);
    await user.click(screen.getByRole("button", { name: "See what’s new" }));
    const dialog = await screen.findByRole("dialog", { name: "Update to OpenSpace 1.1.0" });
    expect(dialog).toHaveTextContent("Your site is on 1.0.0");
    expect(within(dialog).getByRole("region", { name: "What’s new" })).toHaveTextContent(
      /masonry with captions/,
    );
    // No live preview from this Hub: the changelog stands in.
    expect(within(dialog).getByRole("region", { name: "Preview" })).toHaveTextContent(
      /no live preview/,
    );
    await user.click(within(dialog).getByRole("button", { name: "Update now" }));
    expect(await screen.findByText("Updated to OpenSpace 1.1.0")).toBeInTheDocument();
    expect(screen.getByText(/being republished with the new version/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("OpenSpace 1.1.0 is ready")).toBeNull());
    expect(hub.calls.some((c) => c.method === "applyUpdate")).toBe(true);
    expect(hub.state.sites.find((s) => s.id === willow.id)?.updateAvailable).toBe(false);
    expect(queryClient.getQueryData<Site>(["sites", willow.id])?.updateAvailable).toBe(false);
  });

  it("explains a failed update and offers to try again", async () => {
    const { user, hub } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    hub.catalog.failNextApply = true;
    await screen.findByText("OpenSpace 1.1.0 is ready");
    await user.click(screen.getByRole("button", { name: "See what’s new" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Update now" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/couldn.t be combined/);
    await user.click(within(dialog).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Updated to OpenSpace 1.1.0")).toBeInTheDocument();
  });

  it("never shows the Hub's raw failure text", async () => {
    const { user, hub } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    // A failed update recorded by the Hub, with a host's merge output as its error.
    const raw = "Merge conflict: CONFLICT (content): Merge conflict in package.json at 3f2a9c1";
    const list = await hub.listUpdates(willow.id);
    hub.catalog.updates[willow.id] = list.map((u) => ({ ...u, status: "failed", error: raw }));
    expect(await screen.findByText("The last update didn’t finish")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "See what’s new" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "The update didn’t finish, and your site wasn’t changed.",
    );
    expect(document.body.textContent).not.toContain("CONFLICT");
  });

  it("lets a designer skip an update; editors see it but can't apply it", async () => {
    const asEditor = sites.map((s) => (s.id === willow.id ? { ...s, role: "editor" as const } : s));
    const { user } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites: asEditor });
    await screen.findByText("OpenSpace 1.1.0 is ready");
    await user.click(screen.getByRole("button", { name: "See what’s new" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Update now" })).toBeNull();
    expect(dialog).toHaveTextContent("Ask an owner or designer");
  });

  it("skips an update", async () => {
    const { user, hub } = renderStudio(`/sites/${willow.id}`, { user: SAM, sites });
    await screen.findByText("OpenSpace 1.1.0 is ready");
    await user.click(screen.getByRole("button", { name: "See what’s new" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Skip this update" }));
    await waitFor(() => expect(screen.queryByText("OpenSpace 1.1.0 is ready")).toBeNull());
    expect(hub.catalog.updates[willow.id]?.[0]?.status).toBe("dismissed");
  });

  it("shows nothing when the site is up to date", async () => {
    const other = sites[2] as Site;
    renderStudio(`/sites/${other.id}`, { user: SAM, sites });
    await screen.findByTitle("Page canvas");
    expect(screen.queryByText(/is ready$/)).toBeNull();
  });
});
