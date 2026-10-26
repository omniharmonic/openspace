import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));

describe("dashboard", () => {
  it("asks signed-out visitors to sign in, then returns", async () => {
    const { user, router } = renderStudio("/sites", { sites });
    expect(
      await screen.findByRole("heading", { name: "Sign in to OpenSpace" }),
    ).toBeInTheDocument();
    expect(router.state.location.search).toBe("?next=/sites");
    await user.type(screen.getByLabelText("Your name"), "Sam Rivera");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Your sites" })).toBeInTheDocument();
  });

  it("shows every site with status, inbox counts and pending updates", async () => {
    renderStudio("/sites", { user: SAM, sites });
    const willow = await screen.findByRole("article", { name: "Willow Street Yoga" });
    expect(within(willow).getByText("Live")).toBeInTheDocument();
    expect(within(willow).getByText("3 new entries")).toBeInTheDocument();
    expect(within(willow).getByText("Update ready")).toBeInTheDocument();
    const pan = screen.getByRole("article", { name: "Pan & Crumb" });
    expect(within(pan).getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("15 new entries")).toBeInTheDocument();
    expect(screen.getByText("1 needs attention")).toBeInTheDocument();
  });

  it("shows a building site as setting up", async () => {
    renderStudio("/sites", { user: SAM, sites: [{ ...(sites[0] as Site), status: "building" }] });
    const card = await screen.findByRole("article", { name: "Willow Street Yoga" });
    expect(within(card).getByText("Setting up")).toBeInTheDocument();
  });

  it("invites people with no sites to make one", async () => {
    const { user, router } = renderStudio("/sites", { user: SAM, sites: [] });
    expect(
      await screen.findByRole("heading", { name: "Make your first site" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Browse templates" }));
    expect(router.state.location.pathname).toBe("/templates");
  });

  it("switches to the Site Gardener table and remembers it", async () => {
    const { user } = renderStudio("/sites", { user: SAM, sites });
    await screen.findByRole("article", { name: "Willow Street Yoga" });
    await user.click(screen.getByRole("radio", { name: "Site Gardener table" }));
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(table).getByText("eastside-tenants")).toBeInTheDocument();
    expect(within(table).getByText("You’re a designer")).toBeInTheDocument();
    expect(localStorage.getItem("openspace.dashboard.view")).toBe("gardener");
  });

  it("transfers ownership after typed confirmation", async () => {
    const { user, hub } = renderStudio("/sites", { user: SAM, sites });
    const willow = await screen.findByRole("article", { name: "Willow Street Yoga" });
    await user.click(
      within(willow).getByRole("button", { name: "More actions for Willow Street Yoga" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /Transfer ownership/ }));
    const dialog = await screen.findByRole("dialog", { name: "Transfer Willow Street Yoga" });
    const submit = within(dialog).getByRole("button", { name: "Transfer ownership" });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText("New owner"), "willow-studio");
    await user.type(within(dialog).getByLabelText(/to confirm/), "Willow Street Yoga");
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(
      await screen.findByText("Willow Street Yoga now belongs to willow-studio"),
    ).toBeInTheDocument();
    expect(hub.calls.find((c) => c.method === "transferSite")?.args).toEqual([
      (sites[0] as Site).id,
      "willow-studio",
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("only offers transfer on sites you own", async () => {
    const { user } = renderStudio("/sites", { user: SAM, sites });
    const eastside = await screen.findByRole("article", { name: "Eastside Tenants Union" });
    await user.click(within(eastside).getByRole("button", { name: /More actions/ }));
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).queryByRole("menuitem", { name: /Transfer ownership/ }),
    ).not.toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Open editor/ })).toBeInTheDocument();
  });
});
