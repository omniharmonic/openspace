import type { OpBody } from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { demoSites } from "../../api/fixtures";
import type { Site } from "../../api/types";
import { renderStudio, SAM } from "../../test/render";
import { useToastStore } from "../../ui/toast-store";
import { useEditorUi } from "../editor/editor-store";
import { DEV_IDS as I } from "../editor/model/dev-site";
import type { EditorStore } from "../editor/model/store";

const sites = demoSites(SAM.login, Date.UTC(2026, 9, 1));
const willow = sites[0] as Site;
const ANA = { userId: "u_ana", name: "Ana Ruiz" };

const store = () =>
  (window as unknown as { __osEditorStore: EditorStore }).__osEditorStore.getState();
const setLabel = (value: string, field = "label"): OpBody =>
  ({ op: "block.update", page: I.home, block: I.heroButton, set: { [field]: value } }) as OpBody;
const label = (doc: SiteDocument) =>
  (doc.pages[I.home as keyof SiteDocument["pages"]]?.sections[0]?.blocks.find(
    (b) => b.id === I.heroButton,
  )?.fields as { label?: string }) ?? {};
const pill = () => document.querySelector(".st-pill");

async function openEditor(options: Parameters<typeof renderStudio>[1] = {}) {
  const utils = renderStudio(`/sites/${willow.id}`, { user: SAM, sites, ...options });
  await screen.findByText("Saved");
  return utils;
}

async function edit(value: string) {
  act(() => {
    store().commit([setLabel(value)]);
  });
  await screen.findByText("Saved");
}

describe("publishing", () => {
  beforeEach(() => useEditorUi.getState().reset());

  it("summarises the changes, publishes and shows Publishing… → Live with the address", async () => {
    const { user, hub } = await openEditor();
    await edit("Book a class");

    await user.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish changes" });
    expect(await within(dialog).findByText("1 page edited")).toBeInTheDocument();
    expect(within(dialog).getByText(/Edited Home/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Publish now" }));
    await waitFor(() => expect(pill()).toHaveAttribute("data-phase", "publishing"));
    expect(pill()).toHaveTextContent("Publishing…");
    await waitFor(() => expect(pill()).toHaveAttribute("data-phase", "live"));
    expect(within(pill() as HTMLElement).getByRole("link")).toHaveAttribute("href", willow.url);
    expect(hub.calls.filter((c) => c.method === "publish")).toHaveLength(1);

    // Nothing left to publish.
    await user.click(screen.getByRole("button", { name: "Publish" }));
    const again = await screen.findByRole("dialog", { name: "Publish changes" });
    expect(await within(again).findByText("Everything is already live.")).toBeInTheDocument();
    expect(within(again).getByRole("button", { name: "Publish now" })).toBeDisabled();
  });

  it("explains a failed publish in plain words and fixes it for me", async () => {
    const { user, hub } = await openEditor();
    await edit("Huge photo");
    hub.failNextPublish(willow.id, "image_too_large");
    await user.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish changes" });
    await within(dialog).findByText("1 page edited");
    await user.click(within(dialog).getByRole("button", { name: "Publish now" }));

    await waitFor(() => expect(pill()).toHaveAttribute("data-phase", "failed"));
    expect(pill()).toHaveTextContent("Couldn’t publish");
    expect(pill()).toHaveTextContent("An image is too large");
    await user.click(within(pill() as HTMLElement).getByRole("button", { name: "Fix it for me" }));
    expect(hub.calls.some((c) => c.method === "fixLastPublish")).toBe(true);
    await waitFor(() => expect(pill()).toHaveAttribute("data-phase", "live"));
    const versions = await hub.listVersions(willow.id);
    expect(versions[0]).toMatchObject({ kind: "revert", current: true });
  });

  it("schedules a publish for a date and time, lists it and cancels it", async () => {
    const { user, hub } = await openEditor();
    await edit("Spring timetable");
    await user.click(screen.getByRole("button", { name: "Publish" }));
    let dialog = await screen.findByRole("dialog", { name: "Publish changes" });
    await within(dialog).findByText("1 page edited");
    await user.click(within(dialog).getByRole("radio", { name: "Schedule" }));
    const day = new Date(Date.now() + 30 * 86_400_000);
    const ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: ymd } });
    fireEvent.change(within(dialog).getByLabelText("Time"), { target: { value: "08:30" } });
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    const call = hub.calls.find((c) => c.method === "schedulePublish");
    expect((call?.args[1] as Date | undefined)?.getTime()).toBe(new Date(`${ymd}T08:30`).getTime());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Publish" }));
    dialog = await screen.findByRole("dialog", { name: "Publish changes" });
    const list = await within(dialog).findByRole("list", { name: "Scheduled publishes" });
    expect(list).toHaveTextContent(
      `Publishes ${day.toLocaleDateString("en", { month: "short", day: "numeric" })}`,
    );
    await user.click(within(list).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        within(dialog).queryByRole("list", { name: "Scheduled publishes" }),
      ).not.toBeInTheDocument(),
    );
    expect((await hub.listSchedules(willow.id))[0]?.status).toBe("cancelled");
  });

  it("refuses a time in the past", async () => {
    const { user, hub } = await openEditor();
    await edit("Later");
    await user.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish changes" });
    await within(dialog).findByText("1 page edited");
    await user.click(within(dialog).getByRole("radio", { name: "Schedule" }));
    fireEvent.change(within(dialog).getByLabelText("Date"), { target: { value: "2001-01-01" } });
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    expect(
      await within(dialog).findByText("Pick a time at least a minute from now."),
    ).toBeInTheDocument();
    expect(hub.calls.some((c) => c.method === "schedulePublish")).toBe(false);
  });

  it("discards the draft back to what's live, as an undoable change", async () => {
    const { user, hub } = await openEditor();
    await edit("Throwaway");
    await user.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish changes" });
    await within(dialog).findByText("1 page edited");
    await user.click(within(dialog).getByRole("button", { name: "Discard changes…" }));
    const confirm = await screen.findByRole("dialog", { name: "Discard unpublished changes?" });
    await user.click(within(confirm).getByRole("button", { name: "Discard changes" }));
    expect(label(store().doc).label).toBe("See the schedule");
    await screen.findByText("Saved");
    expect(label(hub.room(willow.id).doc).label).toBe("See the schedule");
    // …and undo brings it back.
    act(() => {
      store().undo();
    });
    expect(label(store().doc).label).toBe("Throwaway");
  });
});

describe("history", () => {
  beforeEach(() => useEditorUi.getState().reset());

  it("lists published versions, previews one and rolls back to it", async () => {
    const { user, hub } = await openEditor();
    await edit("Version two");
    await hub.publish(willow.id);
    await waitFor(() => expect(pill()).toHaveAttribute("data-phase", "live"));

    await user.click(screen.getByRole("button", { name: "History" }));
    const sheet = await screen.findByRole("dialog", { name: "History" });
    const list = await within(sheet).findByRole("list", { name: "Published versions" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Edited Home");
    expect(items[0]).toHaveTextContent("Live now");
    expect(items[1]).toHaveTextContent("Created the site");
    expect(items[1]).toHaveTextContent("First version");

    const opened: string[] = [];
    window.open = ((url: string) => {
      opened.push(url);
      return null;
    }) as typeof window.open;
    await user.click(
      within(items[1] as HTMLElement).getByRole("button", { name: /Preview the version/ }),
    );
    expect(opened[0]).toContain("?version=");

    await user.click(
      within(items[1] as HTMLElement).getByRole("button", { name: /Roll back to the version/ }),
    );
    const confirm = await screen.findByRole("dialog", { name: "Roll back to this version?" });
    await user.click(within(confirm).getByRole("button", { name: "Roll back" }));
    expect(hub.calls.some((c) => c.method === "rollback")).toBe(true);
    // The editor follows the live site back.
    await waitFor(() => expect(label(store().doc).label).toBe("See the schedule"));
    await waitFor(() => expect(pill()).toHaveAttribute("data-phase", "live"));
  });

  it("saves a named snapshot and restores it into the draft", async () => {
    const { user, hub } = await openEditor();
    await edit("Before the redesign");
    await user.click(screen.getByRole("button", { name: "History" }));
    const sheet = await screen.findByRole("dialog", { name: "History" });
    await user.click(within(sheet).getByRole("tab", { name: "Snapshots" }));
    expect(await within(sheet).findByText("No snapshots yet")).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText("Snapshot name"), "Spring launch");
    await user.click(within(sheet).getByRole("button", { name: "Save snapshot" }));
    expect(await within(sheet).findByText("Spring launch")).toBeInTheDocument();

    await edit("Redesigned");
    await user.click(within(sheet).getByRole("button", { name: "Restore Spring launch" }));
    const confirm = await screen.findByRole("dialog", { name: "Restore this snapshot?" });
    await user.click(within(confirm).getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(label(store().doc).label).toBe("Before the redesign"));
    expect(label(hub.room(willow.id).doc).label).toBe("Before the redesign");
  });

  it("only offers rollback to designers and owners", async () => {
    const editorSites = sites.map((s) =>
      s.id === willow.id ? { ...s, role: "editor" as const } : s,
    );
    const { user } = await openEditor({ sites: editorSites });
    await user.click(screen.getByRole("button", { name: "History" }));
    const sheet = await screen.findByRole("dialog", { name: "History" });
    await within(sheet).findByRole("list", { name: "Published versions" });
    expect(within(sheet).queryByRole("button", { name: /Roll back/ })).not.toBeInTheDocument();
    expect(within(sheet).getByText(/Designers and owners can roll/)).toBeInTheDocument();
  });
});

describe("live collaboration", () => {
  beforeEach(() => useEditorUi.getState().reset());

  it("shows “Claude is editing Home…” live, then Accept / Undo all", async () => {
    const { user, hub } = await openEditor({ agentPresenceMs: 120 });
    const agent = hub.room(willow.id).startAgent({ userId: SAM.id, name: SAM.name }, "Claude");
    act(() => {
      agent.edit([setLabel("Written by Claude"), setLabel("Bring a mat", "secondaryLabel")]);
    });
    expect(await screen.findByText("Claude is editing Home…")).toBeInTheDocument();
    await waitFor(() => expect(label(store().doc).label).toBe("Written by Claude"));

    const banner = await screen.findByRole("region", { name: "Changes by Claude" });
    expect(banner).toHaveTextContent("Claude made 2 changes to Home");
    expect(screen.queryByText("Claude is editing Home…")).not.toBeInTheDocument();
    await user.click(within(banner).getByRole("button", { name: "Undo all" }));
    expect(hub.calls.find((c) => c.method === "undoAgentSession")?.args).toEqual([
      willow.id,
      agent.sessionId,
    ]);
    await waitFor(() => expect(label(store().doc).label).toBe("See the schedule"));
    expect(screen.queryByRole("region", { name: "Changes by Claude" })).not.toBeInTheDocument();
  });

  it("Accept keeps the agent's changes and dismisses the banner", async () => {
    const { user, hub } = await openEditor({ agentPresenceMs: 60 });
    const agent = hub.room(willow.id).startAgent({ userId: SAM.id, name: SAM.name });
    act(() => {
      agent.edit([setLabel("Kept")]);
    });
    const banner = await screen.findByRole("region", { name: "Changes by Claude" });
    await user.click(within(banner).getByRole("button", { name: "Accept" }));
    expect(screen.queryByRole("region", { name: "Changes by Claude" })).not.toBeInTheDocument();
    expect(label(store().doc).label).toBe("Kept");
  });

  it("shows who else is here and their edits as they happen", async () => {
    const { hub } = await openEditor();
    const room = hub.room(willow.id);
    const sock = room.connect(ANA, null);
    expect(
      await screen.findByRole("list", { name: "Editing now: you and 1 other" }),
    ).toBeInTheDocument();
    act(() => {
      room.collaborator(ANA).edit([setLabel("Ana’s wording")]);
    });
    await waitFor(() => expect(label(store().doc).label).toBe("Ana’s wording"));
    act(() => sock.close());
    expect(await screen.findByRole("list", { name: "Editing now" })).toBeInTheDocument();
  });

  it("offers to restore the other version when someone changed the same thing", async () => {
    const { hub } = await openEditor();
    const room = hub.room(willow.id);
    // Ana's edit lands first and is newer, so it wins; our in-flight edit loses.
    act(() => {
      store().commit([setLabel("Mine")]);
      room
        .collaborator(ANA)
        .edit([{ ...setLabel("Ana’s"), ts: Date.now() + 60_000 } as unknown as OpBody], 0);
    });
    await waitFor(() =>
      expect(
        useToastStore.getState().toasts.some((t) => t.title === "Ana Ruiz changed this too"),
      ).toBe(true),
    );
    expect(label(store().doc).label).toBe("Ana’s");
    const restore = await screen.findByRole("button", { name: "Restore other version" });
    fireEvent.click(restore);
    await waitFor(() => expect(label(room.doc).label).toBe("Mine"));
  });

  it("says changes are saved on this device when OpenSpace is unreachable, and syncs when it's back", async () => {
    const { hub, user } = await openEditor();
    const room = hub.room(willow.id);
    act(() => room.setDown(true));
    expect(await screen.findByText("Offline")).toBeInTheDocument();
    act(() => {
      store().commit([setLabel("Typed offline")]);
    });
    expect(await screen.findByText("Saved on this device")).toBeInTheDocument();
    const banner = await screen.findByRole("status", { name: "Offline" });
    expect(banner).toHaveTextContent("Changes are saved on this device.");

    // Publishing waits for the connection.
    await user.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog", { name: "Publish changes" });
    expect(within(dialog).getByText(/You’re offline/)).toBeInTheDocument();
    await user.keyboard("{Escape}");

    act(() => room.setDown(false));
    await screen.findByText("Saved", undefined, { timeout: 2000 });
    expect(screen.queryByRole("status", { name: "Offline" })).not.toBeInTheDocument();
    expect(label(room.doc).label).toBe("Typed offline");
  });
});
