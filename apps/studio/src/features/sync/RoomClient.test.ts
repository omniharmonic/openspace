import type { Op, OpBody } from "@omniharmonic/openspace-ops";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRoom } from "../../api/mockRoom";
import { type HubApi, HubError } from "../../api/types";
import { devSiteDocument, DEV_IDS as I } from "../editor/model/dev-site";
import { createEditorStore, type EditorStore } from "../editor/model/store";
import { loadDraft } from "./bootstrap";
import { createMemoryDraftCache, type DraftCache, draftKey } from "./cache";
import type { ConflictNotice, RoomSocket } from "./protocol";
import { type RoomClient as Client, COALESCE_MS, RoomClient, type RoomEvent } from "./RoomClient";
import { asBody, storeTarget } from "./SyncContext";

const SAM = { userId: "u_sam", name: "Sam Rivera" };
const ANA = { userId: "u_ana", name: "Ana Ruiz" };

const FAST = {
  reconnectBaseMs: 5,
  reconnectMaxMs: 20,
  hubDownMs: 60,
  helloTimeoutMs: 1000,
  heartbeatMs: 60_000,
};

const label = (doc: SiteDocument) =>
  (doc.pages[I.home as keyof SiteDocument["pages"]]?.sections[0]?.blocks.find(
    (b) => b.id === I.heroButton,
  )?.fields as { label?: string; secondaryLabel?: string } | undefined) ?? {};

const setLabel = (value: string, field = "label"): OpBody =>
  ({ op: "block.update", page: I.home, block: I.heroButton, set: { [field]: value } }) as OpBody;

/** Let queued frames (microtasks) and short timers run. */
const tick = async (ms = 0) => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  if (ms) await new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

interface Setup {
  room: MockRoom;
  store: EditorStore;
  client: Client;
  cache: DraftCache & { records: Map<string, unknown> };
  events: RoomEvent[];
  connects: Array<number | null>;
}

const clients: Client[] = [];
afterEach(() => {
  for (const c of clients.splice(0)) c.stop();
});

function setup(
  options: {
    room?: MockRoom;
    storeNow?: () => number;
    initial?: { doc: SiteDocument; seq: number; pending?: Op[] };
    /** What the editor shows at start (default: the initial document). */
    storeDoc?: SiteDocument;
    cache?: DraftCache & { records: Map<string, unknown> };
    tabId?: string;
    userId?: string;
  } = {},
): Setup {
  const room = options.room ?? new MockRoom({ doc: devSiteDocument() });
  const initial = options.initial ?? { doc: room.doc, seq: room.seq };
  const store = createEditorStore({
    doc: options.storeDoc ?? initial.doc,
    actor: `user:${SAM.userId}`,
    ...(options.storeNow ? { now: options.storeNow } : {}),
  });
  const cache = options.cache ?? createMemoryDraftCache();
  const events: RoomEvent[] = [];
  const connects: Array<number | null> = [];
  const client = new RoomClient({
    siteId: "st_test",
    target: storeTarget(store),
    connect: (since) => {
      connects.push(since);
      return room.connect(SAM, since);
    },
    fetchDocument: async () => {
      if (room.down) throw new HubError(0, "network", "offline");
      return { document: room.doc, seq: room.seq, head: room.head };
    },
    initial,
    cache,
    owner: { userId: options.userId ?? SAM.userId, tabId: options.tabId ?? "tab1" },
    timing: FAST,
    watchNetwork: false,
  });
  client.on((e) => events.push(e));
  clients.push(client);
  client.start();
  return { room, store, client, cache, events, connects };
}

describe("RoomClient", () => {
  it("sends edits optimistically with baseSeq, confirms them on ack and saves to the device", async () => {
    const { room, store, client, cache } = setup();
    await tick();
    expect(client.state.getState().status).toBe("online");

    store.getState().commit([setLabel("Book a class")]);
    // Applied instantly, before the room has answered.
    expect(label(store.getState().doc).label).toBe("Book a class");
    expect(client.state.getState().pending).toBe(1);
    await tick();

    expect(room.seq).toBe(1);
    expect(label(room.doc).label).toBe("Book a class");
    expect(client.state.getState()).toMatchObject({ pending: 0, seq: 1 });
    expect(client.confirmedDocument).toEqual(room.doc);
    await client.flushCache();
    const saved = (await cache.list(SAM.userId, "st_test"))[0];
    expect(saved).toMatchObject({ seq: 1, pending: [] });
    expect(label(saved?.doc as SiteDocument).label).toBe("Book a class");
  });

  it("sends a typing burst as a few ops, not one per keystroke, and ends on the last value", async () => {
    const { room, store, client } = setup();
    await tick();
    const word = "Book a free class today";
    // One commit per keystroke, merged into one undo step (as the inspector and canvas do).
    for (let i = 1; i <= word.length; i++)
      store.getState().commit([setLabel(word.slice(0, i))], { mergeKey: "text:label" });
    expect(label(store.getState().doc).label).toBe(word);
    await tick(COALESCE_MS + 100);
    expect(await client.whenSynced(2000)).toBe(true);
    // Before coalescing the room received 23 ops; now the first keystroke goes out at once and
    // the rest of the burst as one update of the whole value.
    expect(room.seq).toBeLessThanOrEqual(3);
    expect(label(room.doc).label).toBe(word);
    expect(store.getState().doc).toEqual(room.doc);
    expect(store.getState().undoStack).toHaveLength(1);
  });

  it("keeps sending later bursts after a reconnect in the middle of one", async () => {
    const { room, store } = setup();
    await tick();
    const type = (word: string, field = "label") => {
      for (let i = 1; i <= word.length; i++)
        store.getState().commit([setLabel(word.slice(0, i), field)], { mergeKey: `text:${field}` });
    };
    type("Mid-burst");
    // The connection drops and comes back (a fresh hello) while the burst's tail waits.
    room.setDown(true);
    await tick();
    room.setDown(false);
    await tick(150);
    await tick(COALESCE_MS + 100);
    expect(label(room.doc).label).toBe("Mid-burst");
    // Later bursts are sent in full too (the coalescing timer wasn't left stuck).
    store.getState().sealHistory?.();
    type("Second burst", "secondaryLabel");
    await tick(COALESCE_MS + 100);
    expect(label(room.doc).secondaryLabel).toBe("Second burst");
    type("Third", "label");
    await tick(COALESCE_MS + 100);
    expect(label(room.doc).label).toBe("Third");
    expect(store.getState().doc).toEqual(room.doc);
  });

  it("sends a burst's tail before stopping (closing the editor mid-typing)", async () => {
    const { store, client } = setup();
    await tick();
    const word = "Closing time";
    const sent: unknown[] = [];
    const spy = vi.spyOn(client as unknown as { send: (m: unknown) => boolean }, "send");
    spy.mockImplementation((m: unknown) => {
      sent.push(m);
      return true;
    });
    for (let i = 1; i <= word.length; i++)
      store.getState().commit([setLabel(word.slice(0, i))], { mergeKey: "text:label" });
    client.stop();
    // The whole value went out before the socket closed.
    const values = sent
      .filter((m): m is { type: string; ops: Op[] } => (m as { type?: string }).type === "ops")
      .flatMap((m) => m.ops)
      .map((op) => (op as unknown as { set?: { label?: string } }).set?.label);
    expect(values.at(-1)).toBe(word);
  });

  it("sends a burst's tail when the tab is hidden", async () => {
    const { room, store } = setup();
    await tick();
    const word = "Switching tabs";
    for (let i = 1; i <= word.length; i++)
      store.getState().commit([setLabel(word.slice(0, i))], { mergeKey: "text:label" });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    try {
      document.dispatchEvent(new Event("visibilitychange"));
      await tick();
      expect(label(room.doc).label).toBe(word);
    } finally {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    }
  });

  it("sends separate edits right away (only typing bursts wait)", async () => {
    const { room, store } = setup();
    await tick();
    store.getState().commit([setLabel("One")]);
    store.getState().commit([setLabel("Two", "secondaryLabel")]);
    await tick();
    expect(room.seq).toBe(2);
  });

  it("rebases pending edits over a collaborator's op and converges with the room", async () => {
    const { room, store, client } = setup();
    await tick();
    const ana = room.collaborator(ANA);

    // Ana's change reaches the room first; ours is in flight based on seq 0.
    store.getState().commit([setLabel("Book a class")]);
    ana.edit([setLabel("Your first class is free", "secondaryLabel")], 0);
    await tick();

    expect(room.seq).toBe(2);
    expect(label(room.doc)).toMatchObject({
      label: "Book a class",
      secondaryLabel: "Your first class is free",
    });
    expect(store.getState().doc).toEqual(room.doc);
    expect(client.state.getState()).toMatchObject({ pending: 0, seq: 2 });
    // Our own undo history survives someone else's change.
    expect(store.getState().undoStack).toHaveLength(1);
  });

  it("shows “X changed this too” with the other version to restore when the same field collides", async () => {
    // Our clock is behind, so Ana's edit to the same field wins (last writer wins).
    const { room, store, client, events } = setup({ storeNow: () => 1000 });
    await tick();
    const ana = room.collaborator(ANA);
    store.getState().commit([setLabel("Mine")]);
    ana.edit([setLabel("Ana’s")], 0);
    await tick();

    expect(label(room.doc).label).toBe("Ana’s");
    expect(label(store.getState().doc).label).toBe("Ana’s");
    expect(client.state.getState().pending).toBe(0);
    const conflict = events.find((e) => e.type === "conflict") as
      | { type: "conflict"; notice: ConflictNotice }
      | undefined;
    expect(conflict?.notice).toMatchObject({
      message: "Ana Ruiz changed this too",
      winner: "them",
      reason: "concurrent-edit",
    });
    // One click restores the version that lost, as a new edit everyone gets.
    const restore = conflict?.notice.restore as Op;
    store.getState().commit([asBody(restore)]);
    await tick();
    expect(label(room.doc).label).toBe("Mine");
    expect(store.getState().doc).toEqual(room.doc);
  });

  it("queues edits offline, says so after a while, and syncs them when the room is back", async () => {
    const { room, store, client, cache, connects } = setup();
    await tick();
    room.setDown(true);
    await tick();
    expect(client.state.getState().status).toBe("offline");

    store.getState().commit([setLabel("Offline one")]);
    store.getState().commit([setLabel("Offline two", "secondaryLabel")]);
    expect(client.state.getState().pending).toBe(2);
    await client.flushCache();
    expect((await cache.list(SAM.userId, "st_test"))[0]?.pending).toHaveLength(2);

    // Reconnect attempts back off but keep going.
    await tick(80);
    expect(connects.length).toBeGreaterThan(2);
    expect(client.state.getState().hubDown).toBe(true);
    expect(room.seq).toBe(0);

    room.setDown(false);
    await vi.waitFor(() => expect(client.state.getState().status).toBe("online"), { timeout: 500 });
    await vi.waitFor(() => expect(client.state.getState().pending).toBe(0));
    expect(client.state.getState().hubDown).toBe(false);
    expect(label(room.doc)).toMatchObject({ label: "Offline one", secondaryLabel: "Offline two" });
    expect(store.getState().doc).toEqual(room.doc);
    // It reconnected from where it was.
    expect(connects.at(-1)).toBe(0);
  });

  it("reconnect delays grow with jitter and stay under the cap", async () => {
    vi.useFakeTimers();
    try {
      const room = new MockRoom({ doc: devSiteDocument() });
      room.setDown(true);
      const store = createEditorStore({ doc: room.doc });
      const times: number[] = [];
      const client = new RoomClient({
        siteId: "st_t",
        target: storeTarget(store),
        connect: (since) => {
          times.push(Date.now());
          return room.connect(SAM, since);
        },
        fetchDocument: async () => ({ document: room.doc, seq: 0 }),
        initial: { doc: room.doc, seq: 0 },
        timing: { reconnectBaseMs: 100, reconnectMaxMs: 800, hubDownMs: 30_000 },
        random: () => 1,
        watchNetwork: false,
      });
      clients.push(client);
      client.start();
      for (let i = 0; i < 8; i++) await vi.advanceTimersByTimeAsync(1000);
      const gaps = times.slice(1).map((t, i) => t - (times[i] as number));
      expect(gaps.slice(0, 4)).toEqual([100, 200, 400, 800]);
      expect(Math.max(...gaps)).toBeLessThanOrEqual(800);
    } finally {
      vi.useRealTimers();
    }
  });

  it("when the room says the editor is stale, reloads the document and replays pending edits", async () => {
    const { room, store, client } = setup();
    await tick();
    const ana = room.collaborator(ANA);
    // Ana edits and the room forgets its op log before our in-flight op (baseSeq 0) arrives.
    ana.edit([setLabel("Ana was here", "secondaryLabel")]);
    room.compact();
    store.getState().commit([setLabel("Mine")]);
    await tick();
    await vi.waitFor(() => expect(client.state.getState().pending).toBe(0));
    expect(label(room.doc)).toMatchObject({ label: "Mine", secondaryLabel: "Ana was here" });
    expect(store.getState().doc).toEqual(room.doc);
  });

  it("after a long time away (op log gone) the hello carries the document and pending edits replay", async () => {
    const { room, store, client } = setup();
    await tick();
    room.setDown(true);
    await tick();
    store.getState().commit([setLabel("While away")]);
    room.setDown(false);
    room.collaborator(ANA).edit([setLabel("Ana meanwhile", "secondaryLabel")]);
    room.compact();
    await vi.waitFor(() => expect(client.state.getState().status).toBe("online"), { timeout: 500 });
    await vi.waitFor(() => expect(client.state.getState().pending).toBe(0));
    expect(label(room.doc)).toMatchObject({ label: "While away", secondaryLabel: "Ana meanwhile" });
    expect(store.getState().doc).toEqual(room.doc);
  });

  it("opens from the device copy when the Hub is unreachable, then syncs the saved edits", async () => {
    const cache = createMemoryDraftCache();
    const first = setup({ cache });
    await tick();
    first.room.setDown(true);
    await tick();
    first.store.getState().commit([setLabel("Saved on this device")]);
    await first.client.flushCache();
    first.client.stop();

    // A reload: the device copy (with its pending edit) wins over the Hub's document.
    const offlineHub = {
      getRoomDocument: async () => {
        throw new HubError(0, "network", "offline");
      },
    } as unknown as HubApi;
    const boot = await loadDraft(offlineHub, cache, "st_test", {
      userId: SAM.userId,
      tabId: "tab2",
    });
    expect(boot.pending).toHaveLength(1);
    expect(label(boot.doc).label).toBe("Saved on this device");
    expect(label(boot.confirmed).label).not.toBe("Saved on this device");

    first.room.setDown(false);
    const second = setup({
      room: first.room,
      cache,
      tabId: "tab2",
      initial: { doc: boot.confirmed, seq: boot.seq, pending: boot.pending },
      storeDoc: boot.doc,
    });
    await vi.waitFor(() => expect(second.client.state.getState().pending).toBe(0));
    expect(label(first.room.doc).label).toBe("Saved on this device");
  });

  it("without pending edits, the Hub's document wins and an unreachable Hub falls back to the copy", async () => {
    const cache = createMemoryDraftCache();
    const doc = devSiteDocument();
    await cache.put({
      key: draftKey("u", "s", "old"),
      userId: "u",
      tabId: "old",
      siteId: "s",
      doc,
      seq: 4,
      head: null,
      pending: [],
      savedAt: 0,
    });
    const me = { userId: "u", tabId: "new" };
    const hub = {
      getRoomDocument: async () => ({ document: doc, seq: 9, head: "h" }),
    } as unknown as HubApi;
    const down = {
      getRoomDocument: async () => {
        throw new HubError(0, "network", "offline");
      },
    } as unknown as HubApi;
    expect(await loadDraft(down, cache, "s", me)).toMatchObject({ seq: 4, offline: true });
    expect(await loadDraft(hub, cache, "s", me)).toMatchObject({ seq: 9, offline: false });
    const denied = {
      getRoomDocument: async () => {
        throw new HubError(404, "not_found", "gone");
      },
    } as unknown as HubApi;
    await expect(loadDraft(denied, cache, "s", me)).rejects.toThrow("gone");
  });

  it("ends an inline text session touched by someone else's change before applying it", async () => {
    const { room, store } = setup();
    await tick();
    const seen: string[] = [];
    store.getState().registerTextSession({
      kind: "plain",
      blockId: I.heroButton,
      path: "label",
      flush: () => seen.push("flush"),
      end: (commit) => {
        // The document hasn't moved yet: React's nodes go back before it re-renders.
        seen.push(`end:${commit}:${label(store.getState().doc).secondaryLabel}`);
      },
    });
    room.collaborator(ANA).edit([setLabel("Changed elsewhere", "secondaryLabel")]);
    await tick();
    expect(seen).toEqual(["end:true:First class free"]);
    expect(label(store.getState().doc).secondaryLabel).toBe("Changed elsewhere");

    // A rich text session elsewhere only flushes what was typed.
    const rich: string[] = [];
    store.getState().registerTextSession({
      kind: "rich",
      blockId: I.introText,
      path: "content",
      flush: () => rich.push("flush"),
      end: () => rich.push("end"),
    });
    room.collaborator(ANA).edit([setLabel("Again", "secondaryLabel")]);
    await tick();
    expect(rich).toEqual(["flush"]);
  });

  it("drops a rejected edit, reports it, and asks for a resync when it sees a gap", async () => {
    const sent: Array<Record<string, unknown>> = [];
    let sock: RoomSocket | null = null;
    const doc = devSiteDocument();
    const store = createEditorStore({ doc, actor: `user:${SAM.userId}` });
    const events: RoomEvent[] = [];
    const client = new RoomClient({
      siteId: "st_s",
      target: storeTarget(store),
      connect: () => {
        sock = {
          send: (d) => d !== "ping" && sent.push(JSON.parse(d)),
          close() {},
          onopen: null,
          onmessage: null,
          onclose: null,
        };
        return sock;
      },
      fetchDocument: async () => ({ document: doc, seq: 0 }),
      initial: { doc, seq: 0 },
      timing: FAST,
      watchNetwork: false,
    });
    clients.push(client);
    client.on((e) => events.push(e));
    client.start();
    const serve = (msg: unknown) =>
      (sock as unknown as RoomSocket).onmessage?.(JSON.stringify(msg));
    serve({
      type: "hello",
      you: { client: "c1", actor: "user:u_sam", role: "editor", name: "Sam" },
      seq: 0,
      head: "h",
      ops: [],
      members: [],
    });

    const r = store.getState().commit([setLabel("Restyled")]);
    const opId = r.ok ? (r.ops[0] as Op).id : "";
    expect(sent.at(-1)).toMatchObject({ type: "ops", baseSeq: 0 });
    serve({
      type: "reject",
      opId,
      code: "forbidden",
      message: "Editors can’t change this section",
    });
    expect(client.state.getState().pending).toBe(0);
    expect(label(store.getState().doc).label).toBe("See the schedule");
    expect(events).toContainEqual({
      type: "rejected",
      opId,
      code: "forbidden",
      message: "Editors can’t change this section",
    });

    // seq 1 never arrived: ask the room for everything since what we have.
    serve({
      type: "op",
      seq: 2,
      op: { ...(r.ok ? (r.ops[0] as Op) : ({} as Op)), id: "x" },
      client: "c9",
      actor: "user:u_ana",
      kind: "human",
    });
    expect(sent.at(-1)).toEqual({ type: "sync", since: 0 });
  });

  it("tracks presence and agent ops from the room", async () => {
    const { room, client, events } = setup();
    await tick();
    const agent = room.startAgent(SAM, "Claude");
    agent.edit([setLabel("By Claude")]);
    await tick();
    const members = client.state.getState().members;
    expect(
      members.some((m) => m.kind === "agent" && m.activity === "Claude is editing Home…"),
    ).toBe(true);
    const remote = events.find((e) => e.type === "remote");
    expect(remote).toMatchObject({ logged: { kind: "agent", actor: agent.actor } });
  });
});
