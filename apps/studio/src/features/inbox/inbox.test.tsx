import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorUi } from "../editor/editor-store";
import { FORBIDDEN, openWorkspace, visibleCopy, WILLOW } from "../workspace/testing";

beforeEach(() => useEditorUi.getState().reset());

const growth = (hub: { growth: { sites: Record<string, unknown> } }) =>
  hub.growth.sites[WILLOW.id] as {
    submissions: Array<{ id: string; read: boolean }>;
    subscribers: Array<{ email: string; tags: string[]; status: string }>;
    settings: { retentionMonths: number; notifications: string };
  };

describe("form inbox", () => {
  it("lists entries, opens one (marking it read) and replies by email", async () => {
    const { user, hub } = await openWorkspace("inbox");
    const list = await screen.findByRole("list", { name: "Entries" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(12);
    expect(visibleCopy().match(FORBIDDEN)).toBeNull();
    const first = within(list).getAllByRole("button")[0] as HTMLElement;
    expect(first.textContent).toContain("Unread");
    await user.click(first);
    const entry = await screen.findByRole("article");
    expect(
      within(entry).getByText(
        "Do you offer classes for complete beginners? I've never done yoga before.",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(growth(hub).submissions.find((s) => s.id === "sub_c1")?.read).toBe(true),
    );
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    await user.click(within(entry).getByRole("button", { name: "Reply by email" }));
    expect(open.mock.calls[0]?.[0]).toMatch(/^mailto:ana\.moreno@example\.com\?subject=/);
    open.mockRestore();
  });

  it("deep-links to an entry from the notification email", async () => {
    await openWorkspace("inbox?entry=sub_r1");
    const entry = await screen.findByRole("article");
    expect(within(entry).getByText("Vegetarian, please.")).toBeInTheDocument();
    // Uploaded files are download links, never inline content (PRD 5.2 file uploads).
    const file = within(entry).getByRole("link", { name: /health-questionnaire\.pdf/ });
    expect(file).toHaveAttribute("download", "health-questionnaire.pdf");
    expect(within(file).getByText("178 KB")).toBeInTheDocument();
  });

  it("filters by form, unread and search; shows spam separately", async () => {
    const { user } = await openWorkspace("inbox");
    const list = await screen.findByRole("list", { name: "Entries" });
    await user.click(screen.getByRole("radio", { name: "Unread" }));
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(4));
    await user.click(screen.getByRole("radio", { name: "All" }));
    await user.type(screen.getByRole("searchbox", { name: "Search entries" }), "parking");
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Entries" })).getAllByRole("listitem"),
      ).toHaveLength(1),
    );
    await user.clear(screen.getByRole("searchbox", { name: "Search entries" }));
    await user.click(screen.getByRole("radio", { name: "Spam" }));
    await waitFor(() => expect(screen.getByText("SEO Expert")).toBeInTheDocument());
  });

  it("marks several read, deletes with confirmation and exports CSV", async () => {
    const { user, hub } = await openWorkspace("inbox");
    const list = await screen.findByRole("list", { name: "Entries" });
    const boxes = within(list).getAllByRole("checkbox");
    await user.click(boxes[0] as HTMLElement);
    await user.click(boxes[1] as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Mark read" }));
    await waitFor(() => expect(growth(hub).submissions.filter((s) => !s.read)).toHaveLength(3));
    await user.click(
      within(screen.getByRole("list", { name: "Entries" })).getAllByRole(
        "checkbox",
      )[2] as HTMLElement,
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete this entry?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(growth(hub).submissions).toHaveLength(12));
    const create = vi.fn(() => "blob:x");
    URL.createObjectURL = create;
    URL.revokeObjectURL = vi.fn();
    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() =>
      expect(hub.calls.some((c) => c.method === "downloadSubmissionsCsv")).toBe(true),
    );
    expect(create).toHaveBeenCalled();
  });

  it("changes how long entries are kept and how notifications arrive", async () => {
    const { user, hub } = await openWorkspace("inbox");
    await user.click(await screen.findByRole("button", { name: "Inbox settings" }));
    const dialog = await screen.findByRole("dialog", { name: "Inbox settings" });
    await user.click(await within(dialog).findByRole("radio", { name: "Once a day" }));
    await waitFor(() => expect(growth(hub).settings.notifications).toBe("daily"));
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "6 months" }));
    await waitFor(() => expect(growth(hub).settings.retentionMonths).toBe(6));
  });
});

describe("subscribers", () => {
  it("shows counts, filters by tag and status, and tags several people", async () => {
    const { user, hub } = await openWorkspace("subscribers");
    expect((await screen.findAllByText("Subscribed")).length).toBeGreaterThan(0);
    const rows = () => screen.getAllByRole("row").length - 1;
    await waitFor(() => expect(rows()).toBe(26));
    await user.type(screen.getByRole("searchbox", { name: "Search subscribers" }), "chloe");
    await waitFor(() => expect(rows()).toBeLessThan(26));
    await user.clear(screen.getByRole("searchbox", { name: "Search subscribers" }));
    await waitFor(() => expect(rows()).toBe(26));
    const first = screen.getAllByRole("checkbox", { name: /^Select / })[1] as HTMLElement;
    await user.click(first);
    await user.click(screen.getByRole("button", { name: "Add tags" }));
    const dialog = await screen.findByRole("dialog", { name: "Add tags" });
    await user.type(within(dialog).getByRole("combobox", { name: "Tags" }), "vip{Enter}");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(growth(hub).subscribers.filter((s) => s.tags.includes("vip"))).toHaveLength(1),
    );
    expect(visibleCopy().match(FORBIDDEN)).toBeNull();
  });

  it("imports a CSV only with consent, never re-adding people who left", async () => {
    const { user, hub } = await openWorkspace("subscribers");
    await user.click(await screen.findByRole("button", { name: "Import" }));
    const dialog = await screen.findByRole("dialog", { name: "Import subscribers" });
    const unsub = growth(hub).subscribers.find((s) => s.status === "unsubscribed")?.email;
    await user.type(
      within(dialog).getByRole("textbox", { name: "Or paste it here" }),
      `email,first_name,tags\nnew.person@example.com,Nia,retreats\n${unsub},X,\nnot-an-email,Y,`,
    );
    const importButton = within(dialog).getByRole("button", { name: "Import" });
    expect(importButton).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: /agreed to get emails/ }));
    await user.click(importButton);
    expect(await within(dialog).findByText(/Added 1, updated 0, skipped 2/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Unsubscribed earlier/)).toBeInTheDocument();
    expect(growth(hub).subscribers.find((s) => s.email === "new.person@example.com")?.tags).toEqual(
      ["retreats"],
    );
  });

  it("unsubscribes and deletes one person", async () => {
    const { user, hub } = await openWorkspace("subscribers");
    await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(2));
    const email = growth(hub).subscribers[0]?.email as string;
    await user.click(screen.getByRole("button", { name: `${email} options` }));
    await user.click(await screen.findByRole("menuitem", { name: "Unsubscribe" }));
    await waitFor(() => expect(growth(hub).subscribers[0]?.status).toBe("unsubscribed"));
    await user.click(screen.getByRole("button", { name: `${email} options` }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(growth(hub).subscribers.some((s) => s.email === email)).toBe(false));
  });

  it("without an email provider: explains, and the owner confirms a pending person by hand", async () => {
    const { user, hub } = await openWorkspace("subscribers", {
      hub: { capabilities: { email: { configured: false, devOutbox: false } } },
    });
    expect(await screen.findByText(/Confirmation emails can’t be sent yet/)).toBeInTheDocument();
    expect(screen.queryByText(/confirm by email/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("row").length).toBeGreaterThan(2));
    const pending = growth(hub).subscribers.find((s) => s.status === "pending");
    expect(pending).toBeDefined();
    await user.click(screen.getByRole("button", { name: `${pending?.email} options` }));
    await user.click(await screen.findByRole("menuitem", { name: "Mark as confirmed" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "They agreed — confirm",
      }),
    );
    await waitFor(() =>
      expect(growth(hub).subscribers.find((s) => s.email === pending?.email)?.status).toBe(
        "confirmed",
      ),
    );
  });
});
