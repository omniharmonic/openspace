import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorUi } from "../editor/editor-store";
import { useManageUi } from "../site-mgmt/manage-ui";
import { FORBIDDEN, openWorkspace, visibleCopy, WILLOW } from "../workspace/testing";

beforeEach(() => {
  useEditorUi.getState().reset();
  useManageUi.getState().reset();
});

type GrowthState = {
  members: Array<{ email: string; tier: string | null; status: string }>;
  tiers: Array<{ id: string; name: string; price: { amount: number; interval: string } | null }>;
  commerce: { membersSignup: string };
};
const growth = (hub: { growth: { sites: Record<string, unknown> } }) =>
  hub.growth.sites[WILLOW.id] as GrowthState;

describe("members", () => {
  it("lists members with tiers, adds one with an invite, and blocks another", async () => {
    const { user, hub } = await openWorkspace("members");
    expect(await screen.findByText("felix.berg60@example.com")).toBeInTheDocument();
    expect(screen.getAllByText("Paying").length).toBe(4);
    expect(visibleCopy().match(FORBIDDEN)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Add member" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a member" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Email" }),
      "new.member@example.com",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add member" }));
    expect(
      await screen.findByText("We emailed new.member@example.com a sign-in link."),
    ).toBeInTheDocument();
    expect(growth(hub).members.some((m) => m.email === "new.member@example.com")).toBe(true);

    await user.click(screen.getByRole("button", { name: "felix.berg60@example.com options" }));
    await user.click(await screen.findByRole("menuitem", { name: "Block sign-in" }));
    await waitFor(() =>
      expect(growth(hub).members.find((m) => m.email === "felix.berg60@example.com")?.status).toBe(
        "blocked",
      ),
    );
  });

  it("refuses duplicate members with a plain message", async () => {
    const { user } = await openWorkspace("members");
    await screen.findByText("felix.berg60@example.com");
    await user.click(screen.getByRole("button", { name: "Add member" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a member" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Email" }),
      "felix.berg60@example.com",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add member" }));
    expect(await within(dialog).findByText("That person is already a member.")).toBeInTheDocument();
  });

  it("creates a paid tier and won't delete a tier that has members", async () => {
    const { user, hub } = await openWorkspace("members");
    await user.click(await screen.findByRole("tab", { name: "Tiers" }));
    await user.click(await screen.findByRole("button", { name: "New tier" }));
    const dialog = await screen.findByRole("dialog", { name: "New tier" });
    await user.type(within(dialog).getByRole("textbox", { name: "Name" }), "Supporters");
    await user.click(within(dialog).getByRole("switch", { name: "Paid" }));
    const price = within(dialog).getByRole("textbox", { name: "Price" });
    await user.clear(price);
    await user.type(price, "7.50");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(growth(hub).tiers.find((t) => t.name === "Supporters")?.price).toEqual({
        amount: 750,
        currency: "USD",
        interval: "month",
      }),
    );
    const circle = screen.getByRole("region", { name: "Studio Circle" });
    await user.click(within(circle).getByRole("button", { name: "Delete" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    expect(
      await screen.findByText("Move this tier's members to another tier first."),
    ).toBeInTheDocument();
  });

  it("sets the sign-up policy and links members-only pages to page settings", async () => {
    const { user, hub } = await openWorkspace("members");
    await user.click(await screen.findByRole("tab", { name: "Members-only pages" }));
    await user.click(await screen.findByRole("radio", { name: "Only people I add" }));
    await waitFor(() => expect(growth(hub).commerce.membersSignup).toBe("invite"));
    expect(screen.getByText("No pages are members-only yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "About" }));
    expect(useManageUi.getState().pageSettings).toBeTruthy();
  });
});
