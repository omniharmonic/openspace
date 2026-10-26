import { env, runInDurableObject } from "cloudflare:test";
import type { SiteDocument } from "@openspace/schema";
import { describe, expect, it } from "vitest";
import { DevGitHubAccess } from "../src/github/dev";
import { unwrapRoom } from "../src/room";
import type { SubmitResult } from "../src/room/protocol";
import { call } from "./helpers";
import {
  addMember,
  op,
  para,
  RoomClient,
  rawRoom,
  room,
  runFlushAlarm,
  setText,
  setup,
  T,
  userId,
} from "./room-helpers";

const textOf = (doc: SiteDocument, block: string): string => {
  for (const s of doc.pages[T.home as keyof SiteDocument["pages"]]?.sections ?? [])
    for (const b of s.blocks)
      if (b.id === block)
        return JSON.stringify(b.fields.content).match(/"text":"([^"]*)"/)?.[1] ?? "";
  return "";
};

async function roomDoc(app: Parameters<typeof call>[0], siteId: string, cookie: string) {
  const res = await call(app, `/api/sites/${siteId}/room/document`, { cookie });
  return (await res.json()) as { document: SiteDocument; seq: number; head: string };
}

describe("DraftRoom", () => {
  it("greets a client with the draft and replays ops since its seq", async () => {
    const { app, owner, site } = await setup();
    const a = await RoomClient.connect(app, site.id, owner);
    const hello = a.of("hello")[0];
    expect(hello).toMatchObject({ seq: 0, you: { actor: "maya-lin", role: "owner" } });
    expect(hello?.doc?.pages[T.home as keyof SiteDocument["pages"]]?.title).toBe("Home");
    a.sendOp(setText(T.heroTitle, "Hello"));
    await a.waitFor((m) => m.type === "ack");
    a.close();

    const b = await RoomClient.connect(app, site.id, owner, 0);
    const replay = b.of("hello")[0];
    expect(replay?.doc).toBeUndefined();
    expect(replay?.ops?.map((o) => o.seq)).toEqual([1]);
    b.close();
  });

  it("orders ops from concurrent clients and an agent, and broadcasts them", async () => {
    const { app, cookies, site } = await setup(["Maya Lin", "Ana Ruiz"]);
    const [maya, ana] = cookies as [string, string];
    await addMember(site.id, await userId(app, ana), "designer");
    const a = await RoomClient.connect(app, site.id, maya);
    const b = await RoomClient.connect(app, site.id, ana);

    // Both edit at seq 0 without having seen each other; the agent edits over HTTP.
    a.sendOp(setText(T.heroTitle, "From Maya"), 0);
    b.sendOp(setText(T.heroLead, "From Ana"), 0);
    const session = (await (
      await call(app, `/api/sites/${site.id}/room/agent-sessions`, {
        method: "POST",
        cookie: maya,
        json: { label: "Claude" },
      })
    ).json()) as { sessionId: string; tag: string };
    expect(session.tag).toMatch(/^os\/snap\/agent-\d+$/);
    const agentRes = await call(app, `/api/sites/${site.id}/room/ops`, {
      method: "POST",
      cookie: maya,
      json: { ops: [setText(T.offerTitle, "From Claude")], session: session.sessionId },
    });
    const agent = (await agentRes.json()) as { results: SubmitResult[]; seq: number };
    expect(agent.results[0]).toMatchObject({ status: "accepted" });

    await a.waitFor((m) => m.type === "op" && m.seq === 3);
    await b.waitFor((m) => m.type === "op" && m.seq === 3);
    // Every seq is assigned exactly once; each client sees the others' ops in order.
    const seqs = [...a.of("ack").map((m) => m.seq), ...a.of("op").map((m) => m.seq)].sort();
    expect(seqs).toEqual([1, 2, 3]);
    expect(b.of("op").map((m) => m.seq)).toEqual(
      [...b.of("op").map((m) => m.seq)].sort((x, y) => x - y),
    );
    const agentOp = a.of("op").find((m) => m.kind === "agent");
    expect(agentOp).toMatchObject({ actor: `agent:${session.sessionId}` });
    // "Claude is editing Home…"
    const presence = await a.waitFor(
      (m) => m.type === "presence" && m.members.some((x) => x.kind === "agent"),
    );
    expect(
      presence.type === "presence" && presence.members.find((x) => x.kind === "agent"),
    ).toMatchObject({
      name: "Claude",
      activity: "Claude is editing Home…",
    });

    const { document, seq } = await roomDoc(app, site.id, maya);
    expect(seq).toBe(3);
    expect(textOf(document, T.heroTitle)).toBe("From Maya");
    expect(textOf(document, T.heroLead)).toBe("From Ana");
    expect(textOf(document, T.offerTitle)).toBe("From Claude");
    // Leaving updates everyone's presence.
    b.close();
    await a.waitFor(
      (m) =>
        m.type === "presence" &&
        m.members.every((x) => x.actor !== "ana-ruiz") &&
        m.members.some((x) => x.actor === "maya-lin"),
    );
    a.close();
  });

  it("resolves same-field edits last-writer-wins with 'X changed this too' and a restore op", async () => {
    const { app, cookies, site } = await setup(["Maya Lin", "Ana Ruiz"]);
    const [maya, ana] = cookies as [string, string];
    await addMember(site.id, await userId(app, ana), "editor");
    const a = await RoomClient.connect(app, site.id, maya);
    const b = await RoomClient.connect(app, site.id, ana);
    const now = Date.now();

    // Maya's edit is newer; Ana's (made before she saw Maya's) arrives second and loses.
    a.sendOp(setText(T.heroLead, "Maya's version", now - 100), 0);
    await a.waitFor((m) => m.type === "ack");
    b.sendOp(setText(T.heroLead, "Ana's version", now - 500), 0);
    const notice = await b.waitFor((m) => m.type === "conflict");
    expect(notice).toMatchObject({ message: "Maya Lin changed this too", winner: "them" });
    expect(notice.type === "conflict" && notice.restore).toMatchObject({ op: "block.update" });
    const rejected = await b.waitFor((m) => m.type === "reject");
    expect(rejected).toMatchObject({ code: "dropped" });
    expect(textOf((await roomDoc(app, site.id, maya)).document, T.heroLead)).toBe("Maya's version");

    // Now Ana's newer edit (again without having seen seq 1) wins; Maya is told.
    b.sendOp(setText(T.heroLead, "Ana again", Date.now()), 0);
    await b.waitFor((m) => m.type === "ack");
    const toMaya = await a.waitFor((m) => m.type === "conflict");
    expect(toMaya).toMatchObject({ message: "Ana Ruiz changed this too", winner: "them" });
    expect(textOf((await roomDoc(app, site.id, maya)).document, T.heroLead)).toBe("Ana again");

    // Restore the other version: resubmitting the restore op brings Maya's text back.
    const restore = toMaya.type === "conflict" ? toMaya.restore : undefined;
    a.sendOp({ ...(restore as object), id: "restore-1", ts: Date.now() } as never);
    await a.waitFor((m) => m.type === "ack" && m.opId === "restore-1");
    expect(textOf((await roomDoc(app, site.id, maya)).document, T.heroLead)).toBe("Maya's version");
    a.close();
    b.close();
  });

  it("clamps client timestamps so a skewed clock can't win every conflict", async () => {
    const { app, owner, site } = await setup();
    const res = await call(app, `/api/sites/${site.id}/room/ops`, {
      method: "POST",
      cookie: owner,
      json: { ops: [setText(T.heroTitle, "Future", Date.now() + 10 * 365 * 86400_000)] },
    });
    const { results } = (await res.json()) as { results: SubmitResult[] };
    const r = results[0];
    expect(r?.status).toBe("accepted");
    expect(r?.status === "accepted" && r.op.ts).toBeLessThanOrEqual(Date.now());
    expect(r?.status === "accepted" && r.op.actor).toBe("maya-lin");
  });

  it("enforces roles: editors, locked sections and contributors", async () => {
    const { app, cookies, site } = await setup(["Maya Lin", "Ed Itor", "Cora Tribute"]);
    const [maya, ed, cora] = cookies as [string, string, string];
    await addMember(site.id, await userId(app, ed), "editor");
    await addMember(site.id, await userId(app, cora), "contributor");
    const submit = async (cookie: string, ops: unknown[]) =>
      (
        (await (
          await call(app, `/api/sites/${site.id}/room/ops`, {
            method: "POST",
            cookie,
            json: { ops },
          })
        ).json()) as { results: SubmitResult[] }
      ).results;

    // Editors can't restyle the site or reposition blocks.
    const [styles] = await submit(ed, [
      op({ op: "styles.patch", patch: { set: { "choices.radius": "lg" } } }),
    ]);
    expect(styles).toMatchObject({
      status: "rejected",
      code: "forbidden",
      message: "Editors can't change site styles",
    });
    // …but can edit text.
    expect((await submit(ed, [setText(T.heroTitle, "Editor text")]))[0]?.status).toBe("accepted");

    // A designer locks the hero; the editor may still change its text, not its look.
    expect(
      (
        await submit(maya, [
          op({ op: "section.update", page: T.home, section: T.hero, set: { locked: true } }),
        ])
      )[0]?.status,
    ).toBe("accepted");
    expect((await submit(ed, [setText(T.heroLead, "Still fine")]))[0]?.status).toBe("accepted");
    const [variant] = await submit(ed, [
      op({ op: "block.update", page: T.home, block: T.heroButton, style: { radius: "none" } }),
    ]);
    expect(variant).toMatchObject({ code: "forbidden", message: expect.stringMatching(/locked/) });
    const [del] = await submit(ed, [op({ op: "block.delete", page: T.home, block: T.heroLead })]);
    expect(del).toMatchObject({ code: "forbidden", message: "This section is locked" });

    // Personally locked sections (site_roles.locked_sections) apply too.
    await addMember(site.id, await userId(app, ed), "editor", [T.offer]);
    await unwrapRoom(room(site.id).refreshMember(site.id, await userId(app, ed)));
    const [offerDel] = await submit(ed, [
      op({ op: "block.delete", page: T.home, block: T.offer1 }),
    ]);
    expect(offerDel).toMatchObject({ code: "forbidden" });

    // Contributors only save draft collection items.
    const [text] = await submit(cora, [setText(T.heroTitle, "Nope")]);
    expect(text).toMatchObject({ code: "forbidden" });
    expect(
      (
        await submit(maya, [
          op({
            op: "collectionConfig.upsert",
            collection: "journal",
            config: {
              kind: "blog",
              label: "Journal",
              list: { layout: "list", pageSize: 10, sort: "date-desc" },
            },
          }),
        ])
      )[0]?.status,
    ).toBe("accepted");
    const post = (status: string) =>
      op({
        op: "collection.upsert",
        collection: "journal",
        item: {
          kind: "blog",
          slug: "first-light",
          frontmatter: { title: "First light", status, date: "2026-10-01" },
          body: "Morning practice notes.",
        },
      });
    const [published] = await submit(cora, [post("published")]);
    expect(published).toMatchObject({ code: "forbidden" });
    const [draft] = await submit(cora, [post("draft")]);
    expect(draft?.status).toBe("accepted");

    // The draft is in the approval queue; an editor approves and it's published.
    const queue = (await (
      await call(app, `/api/sites/${site.id}/approvals?status=pending`, { cookie: ed })
    ).json()) as {
      approvals: Array<{ id: string; slug: string; submittedBy: { login: string } }>;
    };
    expect(queue.approvals).toHaveLength(1);
    expect(queue.approvals[0]).toMatchObject({
      slug: "first-light",
      submittedBy: { login: "cora-tribute" },
    });
    expect(
      (
        await call(app, `/api/sites/${site.id}/approvals/${queue.approvals[0]?.id}/approve`, {
          method: "POST",
          cookie: cora,
        })
      ).status,
    ).toBe(403);
    const approved = await call(
      app,
      `/api/sites/${site.id}/approvals/${queue.approvals[0]?.id}/approve`,
      {
        method: "POST",
        cookie: ed,
      },
    );
    expect(await approved.json()).toMatchObject({ status: "approved" });
    const doc = (await roomDoc(app, site.id, maya)).document;
    expect(doc.collections.journal?.["first-light"]?.frontmatter.status).toBe("published");
    // Once published, the contributor can't overwrite it.
    expect((await submit(cora, [post("draft")]))[0]).toMatchObject({ code: "forbidden" });

    // Reject flow.
    const second = op({
      op: "collection.upsert",
      collection: "journal",
      item: {
        kind: "blog",
        slug: "second",
        frontmatter: { title: "Second", status: "draft", date: "2026-10-02" },
        body: "More notes.",
      },
    });
    await submit(cora, [second]);
    const q2 = (await (
      await call(app, `/api/sites/${site.id}/approvals?status=pending`, { cookie: maya })
    ).json()) as {
      approvals: Array<{ id: string }>;
    };
    const rej = await call(app, `/api/sites/${site.id}/approvals/${q2.approvals[0]?.id}/reject`, {
      method: "POST",
      cookie: maya,
      json: { note: "Needs a photo" },
    });
    expect(await rej.json()).toMatchObject({ status: "rejected", note: "Needs a photo" });
    const mine = (await (
      await call(app, `/api/sites/${site.id}/approvals`, { cookie: cora })
    ).json()) as {
      approvals: Array<{ status: string }>;
    };
    expect(mine.approvals.map((x) => x.status).sort()).toEqual(["approved", "rejected"]);
  });

  it("lets an Editor undo their own op even when the inverse needs layout rights", async () => {
    const { app, cookies, site } = await setup(["Maya Lin", "Ed Itor"]);
    const [maya, ed] = cookies as [string, string];
    await addMember(site.id, await userId(app, ed), "editor");
    const submit = async (cookie: string, ops: unknown[]) =>
      (
        (await (
          await call(app, `/api/sites/${site.id}/room/ops`, {
            method: "POST",
            cookie,
            json: { ops },
          })
        ).json()) as { results: SubmitResult[] }
      ).results;
    const gridSection = "sec_gr1dgr1d00";
    const gridBlock = "blk_gr1db10ck0";
    const [ins] = await submit(maya, [
      op({
        op: "section.insert",
        page: T.home,
        at: "end",
        section: {
          id: gridSection,
          layout: {
            mode: "grid",
            rows: { d: 6 },
            items: { [gridBlock]: { d: { x: 1, y: 1, w: 12, h: 4 } } },
          },
          style: {},
          blocks: [{ id: gridBlock, type: "text", v: 1, fields: { content: para("Grid text") } }],
        },
      }),
    ]);
    expect(ins, JSON.stringify(ins)).toMatchObject({ status: "accepted" });

    const [del] = await submit(ed, [op({ op: "block.delete", page: T.home, block: gridBlock })]);
    expect(del?.status).toBe("accepted");
    // The inverse (re-insert with its grid placement) is allowed as Ed's undo…
    const inverse = await runInDurableObject(rawRoom(site.id), async (_i, state) => {
      const row = state.storage.sql
        .exec<{ inverse: string }>("SELECT inverse FROM ops WHERE id = ?", del?.opId ?? "")
        .one();
      return JSON.parse(row.inverse) as Record<string, unknown>;
    });
    expect(inverse).toMatchObject({ op: "block.insert", place: expect.anything() });
    const [undo] = await submit(ed, [{ ...inverse, id: "ed-undo-1", ts: Date.now() }]);
    expect(undo?.status).toBe("accepted");
    // …but the same kind of op that isn't an undo is refused.
    const [placed] = await submit(ed, [
      op({
        op: "grid.place",
        page: T.home,
        section: gridSection,
        block: gridBlock,
        bp: "d",
        rect: { x: 1, y: 1, w: 6, h: 4 },
      }),
    ]);
    expect(placed).toMatchObject({ code: "forbidden" });
    // Someone else's op's inverse is not Ed's undo.
    const [mayaDel] = await submit(maya, [
      op({ op: "block.delete", page: T.home, block: gridBlock }),
    ]);
    const mayaInverse = await runInDurableObject(rawRoom(site.id), async (_i, state) =>
      JSON.parse(
        state.storage.sql
          .exec<{ inverse: string }>("SELECT inverse FROM ops WHERE id = ?", mayaDel?.opId ?? "")
          .one().inverse,
      ),
    );
    const [notMine] = await submit(ed, [{ ...mayaInverse, id: "ed-undo-2", ts: Date.now() }]);
    expect(notMine).toMatchObject({ code: "forbidden" });
  });

  it("rejects invalid ops with precise errors and dedupes resent ops", async () => {
    const { app, owner, site } = await setup();
    const a = await RoomClient.connect(app, site.id, owner);
    a.sendOp(
      op({
        op: "block.update",
        page: T.home,
        block: "blk_nonexist00",
        set: { content: para("x") },
      }),
    );
    const rej = await a.waitFor((m) => m.type === "reject");
    expect(rej).toMatchObject({ code: "invalid" });
    const o = setText(T.heroTitle, "Once");
    a.sendOp(o);
    a.sendOp(o);
    await a.waitFor((m) => m.type === "ack" && a.of("ack").length === 2);
    expect(a.of("ack").map((m) => m.seq)).toEqual([1, 1]);
    expect((await room(site.id).info(site.id)).seq).toBe(1);
    a.close();
  });

  it("drops people who lose access", async () => {
    const { app, cookies, site } = await setup(["Maya Lin", "Ana Ruiz"]);
    const [maya, ana] = cookies as [string, string];
    const anaId = await userId(app, ana);
    await addMember(site.id, anaId, "editor");
    const b = await RoomClient.connect(app, site.id, ana);
    const res = await call(app, `/api/sites/${site.id}/collaborators/${anaId}`, {
      method: "DELETE",
      cookie: maya,
    });
    expect(res.status).toBe(200);
    await b.waitFor((m) => m.type === "removed");
    // And can't reconnect.
    const again = await call(app, `/api/sites/${site.id}/room`, {
      cookie: ana,
      headers: { Upgrade: "websocket" },
    });
    expect(again.status).toBe(404);
  });

  it("refuses WebSocket upgrades from other origins and non-members", async () => {
    const { app, cookies, site } = await setup(["Maya Lin", "Stranger"]);
    const [maya, stranger] = cookies as [string, string];
    const evil = await call(app, `/api/sites/${site.id}/room`, {
      cookie: maya,
      headers: { Upgrade: "websocket", Origin: "https://evil.example" },
    });
    expect(evil.status).toBe(403);
    const other = await call(app, `/api/sites/${site.id}/room`, {
      cookie: stranger,
      headers: { Upgrade: "websocket" },
    });
    expect(other.status).toBe(404);
  });
});

describe("DraftRoom flushing", () => {
  it("batches ops into one draft commit after the idle timeout, with trailers", async () => {
    const { app, owner, site } = await setup();
    const gh = new DevGitHubAccess(env.HUB_DB);
    const repo = { owner: "maya-lin", name: "room-site" };
    const draftBefore = await gh.getRef(repo, "os/draft");
    const a = await RoomClient.connect(app, site.id, owner);
    a.sendOp(setText(T.heroTitle, "One"));
    await a.waitFor((m) => m.type === "ack");
    a.sendOp(setText(T.heroLead, "Two"));
    await a.waitFor((m) => m.type === "ack" && m.seq === 2);
    a.sendOp(setText(T.offerTitle, "Three"));
    await a.waitFor((m) => m.type === "ack" && m.seq === 3);

    // Nothing is committed yet; the flush alarm is ~10 s out.
    expect(await gh.getRef(repo, "os/draft")).toBe(draftBefore);
    const alarm = await runInDurableObject(rawRoom(site.id), (_i, s) => s.storage.getAlarm());
    expect(alarm).toBeGreaterThan(Date.now() + 5_000);
    expect(await runFlushAlarm(site.id)).toBe(true);

    const log = await gh.listCommits(repo, { ref: "os/draft", limit: 5 });
    expect(log[0]?.parents).toEqual([draftBefore]);
    expect(log[0]?.message).toBe(
      "Edited Home\n\nCo-authored-by: Maya Lin <maya-lin@users.noreply.github.com>",
    );
    const files = await gh.readFiles(repo, "os/draft", { textOnly: true });
    expect(files["content/pages/home.json"]).toContain("Three");
    await a.waitFor((m) => m.type === "flushed");
    expect(await room(site.id).info(site.id)).toMatchObject({
      seq: 3,
      flushedSeq: 3,
      unflushed: 0,
    });
    a.close();
  });

  it("flushes as soon as 50 ops are waiting", async () => {
    const { app, owner, site } = await setup();
    const ops = Array.from({ length: 50 }, (_, i) => setText(T.heroTitle, `Edit ${i}`));
    await call(app, `/api/sites/${site.id}/room/ops`, {
      method: "POST",
      cookie: owner,
      json: { ops: ops.slice(0, 49) },
    });
    let alarm = await runInDurableObject(rawRoom(site.id), (_i, s) => s.storage.getAlarm());
    expect(alarm).toBeGreaterThan(Date.now() + 5_000);
    await call(app, `/api/sites/${site.id}/room/ops`, {
      method: "POST",
      cookie: owner,
      json: { ops: ops.slice(49) },
    });
    alarm = await runInDurableObject(rawRoom(site.id), (_i, s) => s.storage.getAlarm());
    // Due now (it may already have fired).
    expect(alarm === null || alarm <= Date.now()).toBe(true);
    await runFlushAlarm(site.id);
    const info = await room(site.id).info(site.id);
    expect(info).toMatchObject({ seq: 50, flushedSeq: 50 });
    const gh = new DevGitHubAccess(env.HUB_DB);
    const log = await gh.listCommits(
      { owner: "maya-lin", name: "room-site" },
      { ref: "os/draft", limit: 5 },
    );
    expect(log.filter((c) => c.message.startsWith("Edited Home"))).toHaveLength(1);
  });

  it("marks agent commits with an Agent trailer and merges a draft moved elsewhere", async () => {
    const { app, owner, site } = await setup();
    const gh = new DevGitHubAccess(env.HUB_DB);
    const repo = { owner: "maya-lin", name: "room-site" };
    const s = (await (
      await call(app, `/api/sites/${site.id}/room/agent-sessions`, {
        method: "POST",
        cookie: owner,
        json: {},
      })
    ).json()) as { sessionId: string };
    await call(app, `/api/sites/${site.id}/room/ops`, {
      method: "POST",
      cookie: owner,
      json: { ops: [setText(T.heroTitle, "By Claude")], session: s.sessionId },
    });
    // Someone commits to the draft directly (offline-mode Studio): the flush rebases onto it.
    const head = (await gh.getRef(repo, "os/draft")) as string;
    await gh.commitFiles(repo, {
      branch: "os/draft",
      expectedHead: head,
      message: "Offline edit",
      files: [{ path: "README.md", content: "# Offline\n" }],
    });
    const result = await unwrapRoom(room(site.id).flush(site.id));
    expect(result.committed).toBe(true);
    const log = await gh.listCommits(repo, { ref: "os/draft", limit: 3 });
    expect(log.map((c) => c.message.split("\n")[0])).toEqual([
      "Edited Home",
      "Offline edit",
      expect.any(String),
    ]);
    expect(log[0]?.message).toMatch(
      new RegExp(`\\nAgent: Claude \\(session ${s.sessionId}\\) for Maya Lin$`),
    );
    const files = await gh.readFiles(repo, "os/draft", { textOnly: true });
    expect(files["README.md"]).toBe("# Offline\n");
    expect(files["content/pages/home.json"]).toContain("By Claude");
  });

  it("undoes all of an agent session's changes but keeps later human edits", async () => {
    const { app, owner, site } = await setup();
    const post = (path: string, json: unknown) =>
      call(app, `/api/sites/${site.id}${path}`, { method: "POST", cookie: owner, json });
    const s = (await (await post("/room/agent-sessions", { label: "Claude" })).json()) as {
      sessionId: string;
      tag: string;
    };
    const gh = new DevGitHubAccess(env.HUB_DB);
    expect(await gh.getRef({ owner: "maya-lin", name: "room-site" }, `tags/${s.tag}`)).toBeTruthy();
    const newBlock = "blk_c1a0de0001";
    const agentOps = [
      setText(T.heroTitle, "Claude title"),
      setText(T.heroLead, "Claude lead"),
      op({
        op: "block.insert",
        page: T.home,
        section: T.contact,
        at: "end",
        block: { id: newBlock, type: "text", v: 1, fields: { content: para("Claude block") } },
      }),
    ];
    const agentRes = (await (
      await post("/room/ops", { ops: agentOps, session: s.sessionId })
    ).json()) as {
      results: SubmitResult[];
    };
    expect(
      agentRes.results.map((r) => r.status),
      JSON.stringify(agentRes),
    ).toEqual(["accepted", "accepted", "accepted"]);
    // Maya then rewrites the lead herself.
    await new Promise((r) => setTimeout(r, 5));
    await post("/room/ops", { ops: [setText(T.heroLead, "Maya lead")] });

    const undo = await post(`/room/agent-sessions/${s.sessionId}/undo`, {});
    expect(await undo.json()).toMatchObject({ sessionId: s.sessionId, reverted: 2, skipped: 1 });
    const doc = (await roomDoc(app, site.id, owner)).document;
    expect(textOf(doc, T.heroTitle)).toBe("Room Site");
    expect(textOf(doc, T.heroLead)).toBe("Maya lead");
    expect(JSON.stringify(doc)).not.toContain(newBlock);
  });
});
