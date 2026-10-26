import type { Op, OpBody } from "@openspace/ops";
import { newId, type SiteDocument } from "@openspace/schema";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRoom } from "../../api/mockRoom";
import { type HubApi, HubError, type Site } from "../../api/types";
import { devSiteDocument, DEV_IDS as I } from "../editor/model/dev-site";
import { createEditorStore } from "../editor/model/store";
import { loadDraft } from "./bootstrap";
import { createMemoryDraftCache, type DraftCache, draftKey } from "./cache";
import type { RoomSocket } from "./protocol";
import { RoomClient, type RoomClientOptions } from "./RoomClient";
import { storeTarget } from "./SyncContext";

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
