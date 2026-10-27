import type { Op, OpBody } from "@omniharmonic/openspace-ops";
import { newId, type SiteDocument } from "@omniharmonic/openspace-schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRoom } from "../../api/mockRoom";
import { type HubApi, HubError, type Site } from "../../api/types";
import { devSiteDocument, DEV_IDS as I } from "../editor/model/dev-site";
import { createEditorStore } from "../editor/model/store";
import { loadDraft } from "./bootstrap";
import { createMemoryDraftCache, type DraftCache, draftKey } from "./cache";
import type { RoomSocket } from "./protocol";
import { RoomClient, type RoomClientOptions, type RoomEvent } from "./RoomClient";
import { asBody, storeTarget } from "./SyncContext";

const SAM = { userId: "u_sam", name: "Sam Rivera" };
const FAST = {
  reconnectBaseMs: 5,
  reconnectMaxMs: 10,
  hubDownMs: 1000,
  helloTimeoutMs: 1000,
  heartbeatMs: 60_000,
  resyncTimeoutMs: 30,
};

const setLabel = (value: string, field = "label"): OpBody =>
  ({ op: "block.update", page: I.home, block: I.heroButton, set: { [field]: value } }) as OpBody;
const label = (doc: SiteDocument) =>
  (doc.pages[I.home as keyof SiteDocument["pages"]]?.sections[0]?.blocks.find(
    (b) => b.id === I.heroButton,
  )?.fields as { label?: string; secondaryLabel?: string }) ?? {};

const clients: RoomClient[] = [];
afterEach(() => {
  for (const c of clients.splice(0)) c.stop();
});

/** A room the test drives frame by frame. Every connection is a new scripted socket. */
function scripted(options: Partial<RoomClientOptions> = {}) {
  const doc = devSiteDocument();
  const sockets: Array<{
    sock: RoomSocket;
    sent: Array<Record<string, unknown>>;
    closed: boolean;
  }> = [];
  const store = createEditorStore({ doc, actor: `user:${SAM.userId}` });
  const fetchDocument = vi.fn(async () => ({ document: doc, seq: 0 }));
  const client = new RoomClient({
    siteId: "st_s",
    target: storeTarget(store),
    connect: () => {
      const entry = {
        sock: null as unknown as RoomSocket,
        sent: [] as Array<Record<string, unknown>>,
        closed: false,
      };
      entry.sock = {
        send: (d) => {
          if (d !== "ping") entry.sent.push(JSON.parse(d));
        },
        close: () => {
          entry.closed = true;
        },
        onopen: null,
        onmessage: null,
        onclose: null,
      };
      sockets.push(entry);
      return entry.sock;
    },
    fetchDocument,
    initial: { doc, seq: 0 },
    timing: FAST,
    watchNetwork: false,
    ...options,
  });
  clients.push(client);
  client.start();
  const last = () => sockets.at(-1) as (typeof sockets)[number];
  const serve = (msg: unknown, s = last()) => s.sock.onmessage?.(JSON.stringify(msg));
  const hello = (seq: number, extra: Record<string, unknown> = { ops: [] }) =>
    serve({
      type: "hello",
      you: { client: `c${sockets.length}`, actor: "user:u_sam", role: "owner", name: "Sam" },
      seq,
      head: "h",
      members: [],
      ...extra,
    });
  const commit = (body: OpBody) => {
    const r = store.getState().commit([body]);
    return r.ok ? (r.ops[0] as Op) : (null as never);
  };
  return { client, store, sockets, last, serve, hello, commit, fetchDocument, doc };
}

const tick = async (ms = 0) => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  if (ms) await new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe("RoomClient recovery", () => {
  it("stale → reload frame lost → fetch fails → reconnect with an ops hello: pending edits still go out", async () => {
    const t = scripted();
    t.hello(0);
    const op = t.commit(setLabel("Mine"));
    t.fetchDocument.mockRejectedValueOnce(new HubError(0, "network", "offline"));
    t.serve({ type: "reject", opId: op.id, code: "stale", message: "out of date" });
    await tick();
    // The failed fetch dropped the socket; a new one connects.
    await vi.waitFor(() => expect(t.sockets).toHaveLength(2));
    t.hello(0); // ops hello (since was fine this time), no doc
    expect(t.last().sent).toContainEqual(expect.objectContaining({ type: "ops", baseSeq: 0 }));
    t.serve({ type: "ack", opId: op.id, seq: 1, op });
    expect(t.client.state.getState().pending).toBe(0);
    expect(t.fetchDocument).toHaveBeenCalledTimes(1);
  });

  it("confirms an own op whose ack was lost from the next hello's ops, without sending it again", async () => {
    const t = scripted();
    t.hello(0);
    const op = t.commit(setLabel("Mine"));
    expect(t.last().sent.at(-1)).toMatchObject({ type: "ops" });
    // The connection drops before the ack arrives; the room had accepted the op as seq 1.
    t.last().sock.onclose?.(1006, "gone");
    await vi.waitFor(() => expect(t.sockets).toHaveLength(2));
    t.hello(1, { ops: [{ seq: 1, op, client: "c1", actor: "user:u_sam", kind: "human" }] });
    expect(t.client.state.getState()).toMatchObject({ pending: 0, seq: 1 });
    expect(t.last().sent.filter((m) => m.type === "ops")).toHaveLength(0);
    expect(label(t.store.getState().doc).label).toBe("Mine");
  });

  it("fetches the document once per burst of stale rejects", async () => {
    let resolve: (v: { document: SiteDocument; seq: number }) => void = () => {};
    const t = scripted();
    t.fetchDocument.mockImplementation(() => new Promise((r) => (resolve = r)));
    t.hello(0);
    const a = t.commit(setLabel("One"));
    const b = t.commit(setLabel("Two", "secondaryLabel"));
    t.serve({ type: "reject", opId: a.id, code: "stale", message: "" });
    t.serve({ type: "reject", opId: b.id, code: "stale", message: "" });
    expect(t.fetchDocument).toHaveBeenCalledTimes(1);
    resolve({ document: t.doc, seq: 3 });
    await tick();
    // Replayed on the fetched base.
    expect(t.last().sent.at(-1)).toMatchObject({ type: "ops", baseSeq: 3 });
    expect(t.last().sent.at(-1)?.ops).toHaveLength(2);
  });

  it("asks for a sync on a gap once, and reloads the document when the sync doesn't fill it", async () => {
    const t = scripted();
    t.hello(0);
    const op = { ...t.commit(setLabel("x")), id: "remote" } as Op;
    t.serve({ type: "op", seq: 3, op, client: "c9", actor: "user:u_ana", kind: "human" });
    t.serve({
      type: "op",
      seq: 4,
      op: { ...op, id: "r2" },
      client: "c9",
      actor: "user:u_ana",
      kind: "human",
    });
    expect(t.last().sent.filter((m) => m.type === "sync")).toEqual([{ type: "sync", since: 0 }]);
    t.fetchDocument.mockResolvedValueOnce({ document: t.doc, seq: 4 });
    await tick(60);
    expect(t.fetchDocument).toHaveBeenCalledTimes(1);
    expect(t.client.state.getState().seq).toBe(4);
  });

  it("settles an inline text session before its own op comes back changed or is rejected", async () => {
    const t = scripted();
    t.hello(0);
    const seen: string[] = [];
    t.store.getState().registerTextSession({
      kind: "plain",
      blockId: I.heroButton,
      path: "label",
      flush: () => seen.push("flush"),
      end: (c) => seen.push(`end:${c}`),
    });
    const a = t.commit(setLabel("Mine"));
    // The room rebased it into something else: the block moves under the session.
    t.serve({ type: "ack", opId: a.id, seq: 1, op: { ...a, set: { label: "Theirs" } } });
    expect(seen).toEqual(["end:true"]);
    const b = t.commit(setLabel("Again", "secondaryLabel"));
    t.serve({ type: "reject", opId: b.id, code: "forbidden", message: "no" });
    expect(seen).toEqual(["end:true", "end:true"]);
    expect(label(t.store.getState().doc).secondaryLabel).toBe("First class free");
  });

  it("checks the sign-in after repeated failures and asks to sign in again", async () => {
    const probeAuth = vi.fn(async () => false);
    const t = scripted({ probeAuth });
    for (let i = 0; i < 3; i++) {
      await vi.waitFor(() => expect(t.sockets.length).toBeGreaterThan(i));
      t.last().sock.onclose?.(1006, "denied");
    }
    await tick();
    expect(probeAuth).toHaveBeenCalledTimes(1);
    expect(t.client.state.getState().authRequired).toBe(true);
    await vi.waitFor(() => expect(t.sockets.length).toBeGreaterThan(3));
    t.hello(0);
    expect(t.client.state.getState().authRequired).toBe(false);
  });

  it("doesn't suspect the sign-in when connections said hello before dropping", async () => {
    const probeAuth = vi.fn(async () => false);
    const t = scripted({ probeAuth });
    for (let i = 0; i < 4; i++) {
      await vi.waitFor(() => expect(t.sockets.length).toBeGreaterThan(i));
      t.hello(0);
      t.last().sock.onclose?.(1006, "network blip");
    }
    await tick();
    expect(probeAuth).not.toHaveBeenCalled();
    expect(t.client.state.getState().authRequired).toBe(false);
  });

  it("“Try again” closes a connection that never said hello and opens a new one", () => {
    const t = scripted();
    expect(t.sockets).toHaveLength(1);
    t.client.reconnectNow();
    expect(t.sockets[0]?.closed).toBe(true);
    expect(t.sockets).toHaveLength(2);
    t.hello(0);
    t.client.reconnectNow();
    expect(t.sockets).toHaveLength(2);
  });

  it("doesn't rewrite the device copy when the site poll returns the same site", async () => {
    const cache = createMemoryDraftCache();
    const put = vi.spyOn(cache, "put");
    const site = { id: "st_s", name: "W" } as Site;
    const t = scripted({ cache, owner: { userId: "u_sam", tabId: "t1" }, site });
    t.hello(0);
    await t.client.flushCache();
    const before = put.mock.calls.length;
    t.client.setSite({ ...site });
    await t.client.flushCache();
    expect(put.mock.calls.length).toBe(before);
    t.client.setSite({ ...site, name: "Renamed" });
    await t.client.flushCache();
    expect(put.mock.calls.length).toBe(before + 1);
  });
});

describe("several tabs on one device", () => {
  function tab(
    room: MockRoom,
    cache: DraftCache,
    tabId: string,
    userId = SAM.userId,
    initial?: { doc: SiteDocument; seq: number; pending: Op[] },
    storeDoc?: SiteDocument,
  ) {
    const start = initial ?? { doc: room.doc, seq: room.seq, pending: [] };
    const store = createEditorStore({ doc: storeDoc ?? start.doc, actor: `user:${userId}` });
    const client = new RoomClient({
      siteId: "st_t",
      target: storeTarget(store),
      connect: (since) => room.connect({ userId, name: userId }, since),
      fetchDocument: async () => ({ document: room.doc, seq: room.seq }),
      initial: start,
      cache,
      owner: { userId, tabId },
      timing: FAST,
      watchNetwork: false,
    });
    clients.push(client);
    client.start();
    return { store, client };
  }

  it("keeps each tab's offline edits, and the next tab sends them all", async () => {
    const room = new MockRoom({ doc: devSiteDocument() });
    const cache = createMemoryDraftCache();
    const a = tab(room, cache, "A");
    const b = tab(room, cache, "B");
    await tick();
    room.setDown(true);
    await tick();
    a.store.getState().commit([setLabel("From tab A")]);
    b.store.getState().commit([setLabel("From tab B", "secondaryLabel")]);
    await a.client.flushCache();
    await b.client.flushCache();
    a.client.stop();
    b.client.stop();
    await a.client.flushCache();
    await b.client.flushCache();
    // Both queues survived side by side (no last-writer-wins).
    expect([...cache.records.values()].map((r) => r.pending.length)).toEqual([1, 1]);

    const down = {
      getRoomDocument: async () => {
        throw new HubError(0, "network", "offline");
      },
    } as unknown as HubApi;
    const boot = await loadDraft(down, cache, "st_t", { userId: SAM.userId, tabId: "C" });
    expect(boot.pending).toHaveLength(2);
    expect(label(boot.doc)).toMatchObject({ label: "From tab A", secondaryLabel: "From tab B" });
    // Adopted into this tab's record; the others are gone.
    expect([...cache.records.keys()]).toEqual(["u_sam:st_t:C"]);

    room.setDown(false);
    const c = tab(room, cache, "C", SAM.userId, boot, boot.doc);
    await vi.waitFor(() => expect(c.client.state.getState().pending).toBe(0));
    expect(label(room.doc)).toMatchObject({ label: "From tab A", secondaryLabel: "From tab B" });
  });

  it("never picks up another account's queued edits", async () => {
    const room = new MockRoom({ doc: devSiteDocument() });
    const cache = createMemoryDraftCache();
    const other = tab(room, cache, "A", "u_ana");
    await tick();
    room.setDown(true);
    await tick();
    other.store.getState().commit([setLabel("Ana offline")]);
    await other.client.flushCache();
    other.client.stop();
    room.setDown(false);
    const hub = {
      getRoomDocument: async () => ({ document: room.doc, seq: room.seq, head: null }),
    } as unknown as HubApi;
    const boot = await loadDraft(hub, cache, "st_t", { userId: SAM.userId, tabId: "B" });
    expect(boot.pending).toHaveLength(0);
    expect(label(boot.doc).label).toBe("See the schedule");
    expect(cache.records.has("u_ana:st_t:A")).toBe(true);
  });

  it("keeps edits made on a newer base: a tab at seq 9 editing a block that a tab at seq 5 doesn't have", async () => {
    const room = new MockRoom({ doc: devSiteDocument() });
    const ana = room.collaborator({ userId: "u_ana", name: "Ana" });
    for (let i = 1; i <= 5; i++) ana.edit([setLabel(`Ana ${i}`, "secondaryLabel")]);
    const docAt5 = room.doc;
    for (let i = 6; i <= 8; i++) ana.edit([setLabel(`Ana ${i}`, "secondaryLabel")]);
    const hero = docAt5.pages[I.home as keyof SiteDocument["pages"]]?.sections[0];
    const button = hero?.blocks.find((b) => b.id === I.heroButton);
    const newBlock = { ...structuredClone(button), id: newId("blk") } as NonNullable<typeof button>;
    ana.edit([
      { op: "block.insert", page: I.home, section: I.hero, at: "end", block: newBlock } as OpBody,
    ]);
    expect(room.seq).toBe(9);
    const docAt9 = room.doc;

    const stamp = (body: OpBody, id: string, ts: number) =>
      ({ ...body, id, actor: `user:${SAM.userId}`, ts }) as unknown as Op;
    const cache = createMemoryDraftCache();
    const rec = (tabId: string, doc: SiteDocument, seq: number, pending: Op[], savedAt: number) =>
      cache.put({
        key: draftKey(SAM.userId, "st_t", tabId),
        userId: SAM.userId,
        siteId: "st_t",
        tabId,
        doc,
        seq,
        head: null,
        pending,
        savedAt,
      });
    await rec("old", docAt5, 5, [stamp(setLabel("From the old tab"), "opA", Date.now())], 1);
    await rec(
      "new",
      docAt9,
      9,
      [
        stamp(
          {
            op: "block.update",
            page: I.home,
            block: newBlock.id,
            set: { label: "Offline on the new block" },
          } as OpBody,
          "opB",
          Date.now() + 1,
        ),
      ],
      2,
    );

    const down = {
      getRoomDocument: async () => {
        throw new HubError(0, "network", "offline");
      },
    } as unknown as HubApi;
    const boot = await loadDraft(down, cache, "st_t", { userId: SAM.userId, tabId: "C" });
    // Started from the older base, but the newer tab's edit is still queued (not dropped).
    expect(boot.seq).toBe(5);
    expect(boot.pending.map((o) => o.id)).toEqual(["opA", "opB"]);
    expect((await cache.list(SAM.userId, "st_t")).map((r) => r.pending.length)).toEqual([2]);

    const c = tab(room, cache, "C", SAM.userId, boot, boot.doc);
    await vi.waitFor(() => expect(c.client.state.getState().pending).toBe(0));
    const blocks = room.doc.pages[I.home as keyof SiteDocument["pages"]]?.sections[0]?.blocks ?? [];
    expect(blocks.find((b) => b.id === newBlock.id)?.fields).toMatchObject({
      label: "Offline on the new block",
    });
    expect(label(room.doc).label).toBe("From the old tab");
    expect(c.store.getState().doc).toEqual(room.doc);
  });

  it("doesn't pile up a device record per page load", async () => {
    const room = new MockRoom({ doc: devSiteDocument() });
    const cache = createMemoryDraftCache();
    const hub = {
      getRoomDocument: async () => ({ document: room.doc, seq: room.seq, head: null }),
    } as unknown as HubApi;
    for (let load = 0; load < 6; load++) {
      const tabId = `load${load}`;
      const boot = await loadDraft(hub, cache, "st_t", { userId: SAM.userId, tabId });
      const t = tab(room, cache, tabId, SAM.userId, boot);
      await tick();
      await t.client.flushCache();
      t.client.stop();
      await t.client.flushCache();
      expect(cache.records.size).toBeLessThanOrEqual(2);
    }
    expect([...cache.records.keys()]).toEqual(["u_sam:st_t:load5"]);
  });

  it("only removes another tab's record if it hasn't been saved again since it was read", async () => {
    const cache = createMemoryDraftCache();
    const doc = devSiteDocument();
    const key = draftKey("u", "s", "t");
    await cache.put({
      key,
      userId: "u",
      siteId: "s",
      tabId: "t",
      doc,
      seq: 1,
      head: null,
      pending: [],
      savedAt: 10,
    });
    expect(await cache.deleteIfUnchanged(key, 9)).toBe(false);
    expect(cache.records.has(key)).toBe(true);
    expect(await cache.deleteIfUnchanged(key, 10)).toBe(true);
    expect(cache.records.has(key)).toBe(false);
  });
});

describe("last writer wins across offline edits", () => {
  const ANA = { userId: "u_ana", name: "Ana Ruiz" };

  function live(room: MockRoom, storeNow?: () => number) {
    const store = createEditorStore({
      doc: room.doc,
      actor: `user:${SAM.userId}`,
      ...(storeNow ? { now: storeNow } : {}),
    });
    const events: RoomEvent[] = [];
    const client = new RoomClient({
      siteId: "st_l",
      target: storeTarget(store),
      connect: (since) => room.connect(SAM, since),
      fetchDocument: async () => ({ document: room.doc, seq: room.seq }),
      initial: { doc: room.doc, seq: room.seq },
      timing: FAST,
      watchNetwork: false,
    });
    client.on((e) => events.push(e));
    clients.push(client);
    client.start();
    return { store, client, events };
  }

  const conflicts = (events: RoomEvent[]) =>
    events.flatMap((e) => (e.type === "conflict" ? [e.notice] : []));

  it("Sam's older offline edit loses to Ana's newer one; Sam is offered his version back", async () => {
    const room = new MockRoom({ doc: devSiteDocument() });
    room.connect(ANA, null); // Ana is in the room, so Sam knows her name
    const sam = live(room, () => 1000);
    await tick();
    room.setDown(true);
    await tick();
    sam.store.getState().commit([setLabel("Sam, offline")]);
    room.setDown(false);
    room.connect(ANA, null);
    room.collaborator(ANA).edit([setLabel("Ana, newer")]);
    await vi.waitFor(() => expect(sam.client.state.getState().status).toBe("online"), {
      timeout: 500,
    });
    await vi.waitFor(() => expect(sam.client.state.getState().pending).toBe(0));
    expect(label(room.doc).label).toBe("Ana, newer");
    expect(label(sam.store.getState().doc).label).toBe("Ana, newer");
    const notice = conflicts(sam.events)[0];
    expect(notice).toMatchObject({ message: "Ana Ruiz changed this too", winner: "them" });
    // Restore re-applies Sam's value deliberately, as a new edit.
    sam.store.getState().commit([asBody(notice?.restore as Op)]);
    await vi.waitFor(() => expect(label(room.doc).label).toBe("Sam, offline"));
  });

  it("a block deleted by someone else wins over an offline edit to it, with “X deleted this”", async () => {
    const room = new MockRoom({ doc: devSiteDocument() });
    room.connect(ANA, null);
    const sam = live(room);
    await tick();
    room.setDown(true);
    await tick();
    sam.store.getState().commit([setLabel("Edited offline")]);
    room.setDown(false);
    room.connect(ANA, null);
    room
      .collaborator(ANA)
      .edit([{ op: "block.delete", page: I.home, block: I.heroButton } as OpBody]);
    await vi.waitFor(() => expect(sam.client.state.getState().status).toBe("online"), {
      timeout: 500,
    });
    await vi.waitFor(() => expect(sam.client.state.getState().pending).toBe(0));
    expect(conflicts(sam.events)).toEqual([
      expect.objectContaining({ message: "Ana Ruiz deleted this", reason: "deleted" }),
    ]);
    expect(sam.events.some((e) => e.type === "rejected")).toBe(false);
    expect(sam.store.getState().doc).toEqual(room.doc);
  });

  async function recovered(room: MockRoom, base: SiteDocument, seq: number, op: Op) {
    const cache = createMemoryDraftCache();
    await cache.put({
      key: draftKey(SAM.userId, "st_r", "old"),
      userId: SAM.userId,
      siteId: "st_r",
      tabId: "old",
      doc: base,
      seq,
      head: null,
      pending: [op],
      savedAt: 1,
    });
    const hub = {
      getRoomDocument: async () => ({ document: room.doc, seq: room.seq, head: null }),
    } as unknown as HubApi;
    const boot = await loadDraft(hub, cache, "st_r", { userId: SAM.userId, tabId: "new" });
    expect(boot.pendingBase).toEqual({ [op.id]: seq });
    const sent: Array<Record<string, unknown>> = [];
    const store = createEditorStore({ doc: boot.doc, actor: `user:${SAM.userId}` });
    const events: RoomEvent[] = [];
    const client = new RoomClient({
      siteId: "st_r",
      target: storeTarget(store),
      connect: (since) => {
        const sock = room.connect(SAM, since);
        const send = sock.send;
        sock.send = (d) => {
          if (d !== "ping") sent.push(JSON.parse(d));
          send(d);
        };
        return sock;
      },
      fetchDocument: async () => ({ document: room.doc, seq: room.seq }),
      initial: {
        doc: boot.confirmed,
        seq: boot.seq,
        pending: boot.pending,
        pendingBase: boot.pendingBase,
      },
      timing: FAST,
      watchNetwork: false,
    });
    client.on((e) => events.push(e));
    clients.push(client);
    client.start();
    await vi.waitFor(() => expect(client.state.getState().pending).toBe(0), { timeout: 1000 });
    return { client, store, events, sent };
  }

  const oldOp = (value: string, ts: number) =>
    ({ ...setLabel(value), id: `rec-${value}`, actor: `user:${SAM.userId}`, ts }) as unknown as Op;

  it("a recovered edit is sent with the seq it was made on, so the room rebases it (newer value wins)", async () => {
    const room = new MockRoom({ doc: devSiteDocument() });
    room.connect(ANA, null);
    const base = room.doc;
    room.collaborator(ANA).edit([setLabel("Ana, later")]);
    const r = await recovered(room, base, 0, oldOp("Sam, earlier", 1));
    expect(r.sent).toContainEqual(expect.objectContaining({ type: "ops", baseSeq: 0 }));
    expect(label(room.doc).label).toBe("Ana, later");
    expect(conflicts(r.events)[0]).toMatchObject({
      message: "Ana Ruiz changed this too",
      winner: "them",
    });
    expect(r.store.getState().doc).toEqual(room.doc);
  });

  it("…and a recovered edit that really is newer is applied by the room", async () => {
    const room = new MockRoom({ doc: devSiteDocument() });
    const base = room.doc;
    room.collaborator(ANA).edit([setLabel("Ana, earlier")]);
    // Its ts is newer than Ana's (clamped by the room to now at most).
    const r = await recovered(room, base, 0, oldOp("Sam, newest", Date.now() + 1000));
    expect(label(room.doc).label).toBe("Sam, newest");
    expect(r.store.getState().doc).toEqual(room.doc);
  });

  it("a recovered edit older than the room's history is set aside with restore, never sent over a newer value", async () => {
    const room = new MockRoom({ doc: devSiteDocument() });
    const base = room.doc;
    room.collaborator(ANA).edit([setLabel("Ana, kept")]);
    room.compact(); // the room no longer has the ops since seq 0
    const r = await recovered(room, base, 0, oldOp("Sam, too old", 1));
    expect(label(room.doc).label).toBe("Ana, kept");
    expect(room.log.some((o) => o.op.id === "rec-Sam, too old")).toBe(false);
    const notice = conflicts(r.events).at(-1);
    expect(notice?.restore?.id).toBe("rec-Sam, too old");
    expect(r.store.getState().doc).toEqual(room.doc);
  });
});

describe("round 4: recovered edits keep their own base", () => {
  const ANA = { userId: "u_ana", name: "Ana Ruiz" };
  const anaMember = {
    client: "ca",
    actor: "user:u_ana",
    userId: "u_ana",
    name: "Ana Ruiz",
    kind: "human",
    role: "editor",
    page: null,
    selection: [],
  };
  const conflicts = (events: RoomEvent[]) =>
    events.flatMap((e) => (e.type === "conflict" ? [e.notice] : []));
  const recOp = (body: OpBody, id: string, ts: number) =>
    ({ ...body, id, actor: `user:${SAM.userId}`, ts }) as unknown as Op;

  it("three sessions: an op made at seq 3 is still sent at seq 3 after a later session saved seq 9", async () => {
    // A clock that always moves, so "newer" is strictly newer (the room clamps ts to its own).
    let clock = Date.now();
    const room = new MockRoom({ doc: devSiteDocument(), now: () => (clock += 10) });
    const ana = room.collaborator(ANA);
    for (let i = 1; i <= 3; i++) ana.edit([setLabel(`A${i}`, "secondaryLabel")]);
    const docAt3 = room.doc;
    // Session 1 (offline): Sam edits the label on seq 3, with an old timestamp.
    const r = recOp(setLabel("Sam, session 1"), "R", 1);
    // Meanwhile Ana changes the same label (newer) and more.
    ana.edit([setLabel("Ana, newer")]);
    for (let i = 5; i <= 9; i++) ana.edit([setLabel(`A${i}`, "secondaryLabel")]);
    // Session 2 reloaded to seq 9 and saved R with its real base before it got sent.
    const cache = createMemoryDraftCache();
    await cache.put({
      key: draftKey(SAM.userId, "st_3", "s2"),
      userId: SAM.userId,
      siteId: "st_3",
      tabId: "s2",
      doc: room.doc,
      seq: 9,
      head: null,
      pending: [r],
      pendingBase: { R: 3 },
      savedAt: 2,
    });
    expect(docAt3).toBeDefined();
    // Session 3.
    const hub = {
      getRoomDocument: async () => ({ document: room.doc, seq: room.seq, head: null }),
    } as unknown as HubApi;
    const boot = await loadDraft(hub, cache, "st_3", { userId: SAM.userId, tabId: "s3" });
    expect(boot.pendingBase).toEqual({ R: 3 });
    const sent: Array<Record<string, unknown>> = [];
    const store = createEditorStore({ doc: boot.doc, actor: `user:${SAM.userId}` });
    const client = new RoomClient({
      siteId: "st_3",
      target: storeTarget(store),
      connect: (since) => {
        const sock = room.connect(SAM, since);
        const send = sock.send;
        sock.send = (d) => {
          if (d !== "ping") sent.push(JSON.parse(d));
          send(d);
        };
        return sock;
      },
      fetchDocument: async () => ({ document: room.doc, seq: room.seq }),
      initial: {
        doc: boot.confirmed,
        seq: boot.seq,
        pending: boot.pending,
        pendingBase: boot.pendingBase,
      },
      timing: FAST,
      watchNetwork: false,
    });
    clients.push(client);
    client.start();
    await vi.waitFor(() => expect(client.state.getState().pending).toBe(0), { timeout: 1000 });
    expect(sent).toContainEqual(expect.objectContaining({ type: "ops", baseSeq: 3 }));
    // The room rebased it over Ana's newer value: Ana wins.
    expect(label(room.doc).label).toBe("Ana, newer");
    expect(store.getState().doc).toEqual(room.doc);
  });

  function recoveredScripted(op: Op, base = 0) {
    const events: RoomEvent[] = [];
    const t = scripted({
      initial: { doc: devSiteDocument(), seq: base, pending: [op], pendingBase: { [op.id]: base } },
    });
    t.client.on((e) => events.push(e));
    return { ...t, events };
  }

  it("a stale recovered edit is decided after an ops hello when the reload frame was lost", async () => {
    const r = recOp(setLabel("Recovered"), "R", 1);
    const t = recoveredScripted(r);
    t.hello(0, { ops: [], members: [anaMember] });
    expect(t.last().sent).toContainEqual(expect.objectContaining({ type: "ops", baseSeq: 0 }));
    t.fetchDocument.mockRejectedValueOnce(new HubError(0, "network", "offline"));
    t.serve({ type: "reject", opId: "R", code: "stale", message: "" });
    await tick();
    await vi.waitFor(() => expect(t.sockets).toHaveLength(2));
    // Ana changed another field meanwhile; this client sees that op in the hello replay.
    const anaOp = {
      ...setLabel("Ana", "secondaryLabel"),
      id: "a1",
      actor: "user:u_ana",
      ts: 5,
    } as unknown as Op;
    t.hello(1, {
      ops: [{ seq: 1, op: anaOp, client: "ca", actor: "user:u_ana", kind: "human" }],
      members: [anaMember],
    });
    // Covered (seq 1 seen): rebased here and sent at the current seq, not stuck.
    expect(t.last().sent).toContainEqual(expect.objectContaining({ type: "ops", baseSeq: 1 }));
    t.serve({ type: "ack", opId: "R", seq: 2, op: r });
    expect(t.client.state.getState().pending).toBe(0);
  });

  it("a covered stale edit to a section someone deleted reads “X deleted this”", async () => {
    const r = recOp(setLabel("Recovered"), "R", 1);
    const t = recoveredScripted(r);
    t.hello(0, { ops: [], members: [anaMember] });
    t.fetchDocument.mockRejectedValueOnce(new HubError(0, "network", "offline"));
    t.serve({ type: "reject", opId: "R", code: "stale", message: "" });
    await tick();
    await vi.waitFor(() => expect(t.sockets).toHaveLength(2));
    const del = {
      op: "section.delete",
      page: I.home,
      section: I.hero,
      id: "d1",
      actor: "user:u_ana",
      ts: 5,
    } as unknown as Op;
    t.hello(1, {
      ops: [{ seq: 1, op: del, client: "ca", actor: "user:u_ana", kind: "human" }],
      members: [anaMember],
    });
    expect(conflicts(t.events)).toEqual([
      expect.objectContaining({ message: "Ana Ruiz deleted this", reason: "deleted", opId: "R" }),
    ]);
    expect(t.client.state.getState().pending).toBe(0);
  });

  it("an unsent edit that partly loses keeps its other fields and offers “changed this too” with restore", async () => {
    const room = new MockRoom({ doc: devSiteDocument() });
    room.connect(ANA, null);
    const store = createEditorStore({
      doc: room.doc,
      actor: `user:${SAM.userId}`,
      now: () => 1000,
    });
    const events: RoomEvent[] = [];
    const client = new RoomClient({
      siteId: "st_p",
      target: storeTarget(store),
      connect: (since) => room.connect(SAM, since),
      fetchDocument: async () => ({ document: room.doc, seq: room.seq }),
      initial: { doc: room.doc, seq: room.seq },
      timing: FAST,
      watchNetwork: false,
    });
    client.on((e) => events.push(e));
    clients.push(client);
    client.start();
    await tick();
    room.setDown(true);
    await tick();
    store.getState().commit([
      {
        op: "block.update",
        page: I.home,
        block: I.heroButton,
        set: { label: "Sam", secondaryLabel: "Sam 2" },
      } as OpBody,
    ]);
    room.setDown(false);
    room.connect(ANA, null);
    room.collaborator(ANA).edit([setLabel("Ana")]);
    await vi.waitFor(() => expect(client.state.getState().pending).toBe(0), { timeout: 1000 });
    expect(label(room.doc)).toMatchObject({ label: "Ana", secondaryLabel: "Sam 2" });
    expect(conflicts(events)).toEqual([
      expect.objectContaining({
        message: "Ana Ruiz changed this too",
        winner: "them",
        restore: expect.anything(),
      }),
    ]);
  });

  it("a sent edit removed locally still gets its notice if the connection drops before the room's", async () => {
    const t = scripted();
    const events: RoomEvent[] = [];
    t.client.on((e) => events.push(e));
    t.hello(0, { ops: [], members: [anaMember] });
    t.commit(setLabel("Mine"));
    const anaOp = {
      ...setLabel("Ana"),
      id: "a1",
      actor: "user:u_ana",
      ts: Date.now() + 60_000,
    } as unknown as Op;
    t.serve({ type: "op", seq: 1, op: anaOp, client: "ca", actor: "user:u_ana", kind: "human" });
    expect(t.client.state.getState().pending).toBe(0);
    expect(conflicts(events)).toHaveLength(0); // the room's notice is expected…
    t.last().sock.onclose?.(1006, "gone"); // …but the connection drops first
    await vi.waitFor(() => expect(t.sockets).toHaveLength(2));
    t.hello(1, { ops: [], members: [anaMember] });
    expect(conflicts(events)).toEqual([
      expect.objectContaining({ message: "Ana Ruiz changed this too", restore: expect.anything() }),
    ]);
  });

  it("keeps the replay history only as far back as a recovered edit needs", () => {
    const r = recOp(setLabel("Recovered", "secondaryLabel"), "R", Date.now() + 60_000);
    const t = recoveredScripted(r);
    t.hello(0, { ops: [], members: [] });
    for (let i = 1; i <= 30; i++)
      t.serve({
        type: "op",
        seq: i,
        op: { ...setLabel(`x${i}`), id: `o${i}`, actor: "user:u_ana", ts: i },
        client: "ca",
        actor: "user:u_ana",
        kind: "human",
      });
    const priv = t.client as unknown as { replayed: unknown[]; seen: Set<number> };
    expect(priv.replayed.length).toBe(30);
    t.serve({ type: "ack", opId: "R", seq: 31, op: r });
    expect(t.client.state.getState().pending).toBe(0);
    expect(priv.replayed.length).toBe(0);
    expect(priv.seen.size).toBe(1);
  });
});
