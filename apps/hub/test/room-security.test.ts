import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DevGitHubAccess } from "../src/github/dev";
import type { SubmitResult } from "../src/room/protocol";
import { runScheduled } from "../src/scheduled";
import { call, devLogin } from "./helpers";
import { addMember, op, para, room, setText, setup, T, userId } from "./room-helpers";

const repo = { owner: "maya-lin", name: "room-site" };
const gh = () => new DevGitHubAccess(env.HUB_DB);
type App = Parameters<typeof call>[0];

const post = (app: App, cookie: string, path: string, json: unknown = {}) =>
  call(app, path, { method: "POST", cookie, json });

async function submit(app: App, siteId: string, cookie: string, body: Record<string, unknown>) {
  const res = await post(app, cookie, `/api/sites/${siteId}/room/ops`, body);
  return {
    status: res.status,
    body: (await res.json()) as { results: SubmitResult[]; error?: { code: string } },
  };
}

async function startSession(app: App, siteId: string, cookie: string) {
  const res = await post(app, cookie, `/api/sites/${siteId}/room/agent-sessions`, {
    label: "Claude",
  });
  return (await res.json()) as { sessionId: string };
}

describe("agent session ownership", () => {
  it("refuses ops under someone else's (or an ended) agent session", async () => {
    const { app, cookies, site } = await setup(["Maya Lin", "Cora Tribute", "Ed Itor"]);
    const [maya, cora, ed] = cookies as [string, string, string];
    await addMember(site.id, await userId(app, cora), "contributor");
    await addMember(site.id, await userId(app, ed), "editor");
    const s = await startSession(app, site.id, maya);

    // A contributor posing as Maya's agent is refused before any op is looked at.
    const posing = await submit(app, site.id, cora, {
      ops: [setText(T.heroTitle, "Hijacked")],
      session: s.sessionId,
    });
    expect(posing.status).toBe(403);
    expect(posing.body.error?.code).toBe("invalid_session");
    // Unknown sessions too.
    expect(
      (
        await submit(app, site.id, ed, {
          ops: [setText(T.heroTitle, "x")],
          session: "ags_nope00000",
        })
      ).status,
    ).toBe(403);
    // Contributors can't start sessions at all.
    expect((await post(app, cora, `/api/sites/${site.id}/room/agent-sessions`)).status).toBe(403);

    // The impersonation would have let an Editor "undo" the agent's layout op: now refused.
    const gridBlock = "blk_gr1db10ck1";
    const ins = await submit(app, site.id, maya, {
      session: s.sessionId,
      ops: [
        op({
          op: "section.insert",
          page: T.home,
          at: "end",
          section: {
            id: "sec_gr1dgr1d01",
            layout: {
              mode: "grid",
              rows: { d: 6 },
              items: { [gridBlock]: { d: { x: 1, y: 1, w: 12, h: 4 } } },
            },
            style: {},
            blocks: [{ id: gridBlock, type: "text", v: 1, fields: { content: para("Grid") } }],
          },
        }),
      ],
    });
    expect(ins.body.results[0]?.status).toBe("accepted");
    const edAsAgent = await submit(app, site.id, ed, {
      ops: [op({ op: "section.delete", page: T.home, section: "sec_gr1dgr1d01" })],
      session: s.sessionId,
    });
    expect(edAsAgent.status).toBe(403);

    // Ending the session: Ed can't end or undo Maya's session; Maya can.
    expect(
      (await post(app, ed, `/api/sites/${site.id}/room/agent-sessions/${s.sessionId}/undo`)).status,
    ).toBe(403);
    expect(
      (await post(app, ed, `/api/sites/${site.id}/room/agent-sessions/${s.sessionId}/end`)).status,
    ).toBe(403);
    expect(
      (await post(app, maya, `/api/sites/${site.id}/room/agent-sessions/${s.sessionId}/end`))
        .status,
    ).toBe(200);
    const ended = await submit(app, site.id, maya, {
      ops: [setText(T.heroTitle, "late")],
      session: s.sessionId,
    });
    expect(ended.status).toBe(403);
  });

  it("doesn't treat server-applied ops (restores, reverts) as anyone's own undo", async () => {
    const { app, cookies, site } = await setup(["Maya Lin", "Ed Itor"]);
    const ed = cookies[1] as string;
    const edId = await userId(app, ed);
    await addMember(site.id, edId, "editor");
    const gridBlock = "blk_gr1db10ck2";
    // A server-side apply made as Ed (e.g. approving) inserts a grid section…
    const r = (await room(site.id).applyTrusted(site.id, edId, [
      op({
        op: "section.insert",
        page: T.home,
        at: "end",
        section: {
          id: "sec_gr1dgr1d02",
          layout: {
            mode: "grid",
            rows: { d: 6 },
            items: { [gridBlock]: { d: { x: 1, y: 1, w: 12, h: 4 } } },
          },
          style: {},
          blocks: [{ id: gridBlock, type: "text", v: 1, fields: { content: para("Grid") } }],
        },
      }),
    ])) as { ok: true; value: { results: SubmitResult[] } };
    expect(r.value.results[0]?.status).toBe("accepted");
    // …its inverse is not Ed's undo, so his role rules apply.
    const del = await submit(app, site.id, ed, {
      ops: [
        op({
          op: "grid.place",
          page: T.home,
          section: "sec_gr1dgr1d02",
          block: gridBlock,
          bp: "d",
          rect: { x: 1, y: 1, w: 6, h: 4 },
        }),
      ],
    });
    expect(del.body.results[0]).toMatchObject({ code: "forbidden" });
  });

  it("refuses trusted applies for people without a role", async () => {
    const { app, site } = await setup(["Maya Lin"]);
    const stranger = await devLogin(app, "Stranger Danger");
    const res = await room(site.id).applyTrusted(site.id, await userId(app, stranger), [
      setText(T.heroTitle, "x"),
    ]);
    expect(res).toMatchObject({ ok: false, error: { status: 403 } });
  });
});

describe("publish and rollback with commits made directly to the draft", () => {
  it("publishes the content on os/draft (offline-mode / CLI commits), never other files", async () => {
    const { app, owner, site } = await setup();
    await post(app, owner, `/api/sites/${site.id}/room/ops`, {
      ops: [setText(T.heroTitle, "Room edit")],
    });
    await room(site.id).flush(site.id);
    const head = (await gh().getRef(repo, "os/draft")) as string;
    await gh().commitFiles(repo, {
      branch: "os/draft",
      expectedHead: head,
      message: "From the CLI",
      files: [
        { path: "README.md", content: "# From the CLI\n" },
        { path: "media/cli-note.txt", content: "from the CLI\n" },
      ],
    });
    const before = await gh().readFiles(repo, "main", { textOnly: true });
    const res = await post(app, owner, `/api/sites/${site.id}/publish`);
    expect(((await res.json()) as { publish: { status: string } }).publish.status).toBe(
      "published",
    );
    const files = await gh().readFiles(repo, "main", { textOnly: true });
    // Content from the draft goes live; the README (like the workflow, package.json and custom
    // code) stays as it is on main.
    expect(files["media/cli-note.txt"]).toBe("from the CLI\n");
    expect(files["README.md"]).toBe(before["README.md"]);
    expect(files["content/pages/home.json"]).toContain("Room edit");
    expect(await gh().getRef(repo, "os/draft")).toBe(await gh().getRef(repo, "main"));
  });

  it("snapshots the actual draft head before rolling back, and accepts a short version id", async () => {
    const { app, owner, site } = await setup();
    const v1 = (await gh().getRef(repo, "main")) as string;
    const head = (await gh().getRef(repo, "os/draft")) as string;
    await gh().commitFiles(repo, {
      branch: "os/draft",
      expectedHead: head,
      message: "Unpublished CLI work",
      files: [{ path: "NOTES.md", content: "keep me\n" }],
    });
    await post(app, owner, `/api/sites/${site.id}/room/ops`, { ops: [setText(T.heroTitle, "v2")] });
    await post(app, owner, `/api/sites/${site.id}/publish`);
    // More CLI work after publishing, then roll back by short id.
    const h2 = (await gh().getRef(repo, "os/draft")) as string;
    await gh().commitFiles(repo, {
      branch: "os/draft",
      expectedHead: h2,
      message: "More CLI work",
      files: [{ path: "NOTES.md", content: "keep me too\n" }],
    });
    const res = await post(app, owner, `/api/sites/${site.id}/rollback`, { sha: v1.slice(0, 9) });
    expect(res.status).toBe(200);
    const { snapshot } = (await res.json()) as { snapshot: string };
    const snap = await gh().readFiles(repo, `tags/${snapshot}`, { textOnly: true });
    expect(snap["NOTES.md"]).toBe("keep me too\n");
  });

  it("an agent session undone after a rollback reports skipped ops instead of failing", async () => {
    const { app, owner, site } = await setup();
    const v1 = (await gh().getRef(repo, "main")) as string;
    const s = await startSession(app, site.id, owner);
    await post(app, owner, `/api/sites/${site.id}/room/ops`, {
      session: s.sessionId,
      ops: [
        op({
          op: "block.insert",
          page: T.home,
          section: T.contact,
          at: "end",
          block: {
            id: "blk_ag0nt00001",
            type: "text",
            v: 1,
            fields: { content: para("Agent block") },
          },
        }),
      ],
    });
    await post(app, owner, `/api/sites/${site.id}/publish`);
    expect((await post(app, owner, `/api/sites/${site.id}/rollback`, { sha: v1 })).status).toBe(
      200,
    );
    const undo = await post(
      app,
      owner,
      `/api/sites/${site.id}/room/agent-sessions/${s.sessionId}/undo`,
    );
    expect(undo.status).toBe(200);
    expect(await undo.json()).toMatchObject({ reverted: 0, skipped: 1 });
    // Stale clients from before the rollback must reload rather than rebase.
    const stale = await submit(app, site.id, owner, {
      ops: [setText(T.heroTitle, "old")],
      baseSeq: 0,
    });
    expect(stale.body.results[0]).toMatchObject({ status: "rejected", code: "stale" });
  });
});

describe("Fix it for me", () => {
  it("goes back to the newest version that worked, even after a failed fix", async () => {
    const { app, owner, site } = await setup();
    const tree = async (ref: string) =>
      (await gh().readTree(repo, ref))
        .map((e) => `${e.path}:${e.sha}`)
        .sort()
        .join("\n");
    const good = (await gh().getRef(repo, "main")) as string;
    const fail = (sha: string) =>
      env.HUB_DB.prepare("UPDATE publishes SET status = 'failure', error_code = NULL WHERE sha = ?")
        .bind(sha)
        .run();

    await post(app, owner, `/api/sites/${site.id}/room/ops`, {
      ops: [setText(T.heroTitle, "Bad one")],
    });
    await post(app, owner, `/api/sites/${site.id}/publish`);
    const bad = (await gh().getRef(repo, "main")) as string;
    await fail(bad);
    await post(app, owner, `/api/sites/${site.id}/fix`);
    const revert1 = (await gh().getRef(repo, "main")) as string;
    // The revert itself fails too (say, a flaky run): the next fix must not go back to `bad`.
    await fail(revert1);
    expect((await post(app, owner, `/api/sites/${site.id}/fix`)).status).toBe(200);
    expect(await tree((await gh().getRef(repo, "main")) as string)).toBe(await tree(good));
  });
});

describe("scheduled publish permissions", () => {
  it("fails a schedule whose creator can't publish any more, and cancels a removed person's schedules", async () => {
    const { app, cookies, site } = await setup(["Maya Lin", "Ed Itor", "Ann Other"]);
    const [maya, ed, ann] = cookies as [string, string, string];
    const edId = await userId(app, ed);
    const annId = await userId(app, ann);
    await addMember(site.id, edId, "editor");
    await addMember(site.id, annId, "editor");
    const at = Date.now() + 120_000;
    const sched = async (cookie: string) =>
      (await (await post(app, cookie, `/api/sites/${site.id}/schedule`, { at })).json()) as {
        id: string;
      };
    const edSched = await sched(ed);
    const annSched = await sched(ann);

    // Ed is demoted outside the API (no cancellation hook ran): the cron re-checks.
    await addMember(site.id, edId, "contributor");
    // Ann is removed through the API: her schedules are cancelled right away.
    await call(app, `/api/sites/${site.id}/collaborators/${annId}`, {
      method: "DELETE",
      cookie: maya,
    });

    const main = await gh().getRef(repo, "main");
    await runScheduled(env, at + 1000);
    expect(await gh().getRef(repo, "main")).toBe(main);
    const rows = await env.HUB_DB.prepare(
      "SELECT id, status, error FROM schedules WHERE site_id = ?",
    )
      .bind(site.id)
      .all<{ id: string; status: string; error: string }>();
    const byId = new Map(rows.results.map((r) => [r.id, r]));
    expect(byId.get(edSched.id)).toMatchObject({
      status: "failed",
      error: "The person who scheduled this can no longer publish this site.",
    });
    expect(byId.get(annSched.id)?.status).toBe("cancelled");
  });

  it("reaps schedules stuck in running", async () => {
    const { site } = await setup();
    await env.HUB_DB.prepare(
      "INSERT INTO schedules (id, site_id, kind, run_at, status, created_at, started_at) VALUES ('sch_stuck', ?, 'publish', 0, 'running', 0, ?)",
    )
      .bind(site.id, Date.now() - 3600_000)
      .run();
    await runScheduled(env, Date.now());
    const row = await env.HUB_DB.prepare(
      "SELECT status, error FROM schedules WHERE id = 'sch_stuck'",
    ).first();
    expect(row).toMatchObject({
      status: "failed",
      error: expect.not.stringMatching(/Error|stack/),
    });
  });
});

describe("approvals", () => {
  it("approves only the version that was submitted and reviewed", async () => {
    const { app, cookies, site } = await setup(["Maya Lin", "Cora Tribute"]);
    const [maya, cora] = cookies as [string, string];
    await addMember(site.id, await userId(app, cora), "contributor");
    await post(app, maya, `/api/sites/${site.id}/room/ops`, {
      ops: [
        op({
          op: "collectionConfig.upsert",
          collection: "journal",
          config: {
            kind: "blog",
            label: "Journal",
            list: { layout: "list", pageSize: 10, sort: "date-desc" },
          },
        }),
      ],
    });
    const item = (body: string, status = "draft") => ({
      kind: "blog",
      slug: "post",
      frontmatter: { title: "Post", status, date: "2026-10-01" },
      body,
    });
    await post(app, cora, `/api/sites/${site.id}/room/ops`, {
      ops: [op({ op: "collection.upsert", collection: "journal", item: item("Reviewed text") })],
    });
    const [pending] = (
      (await (
        await call(app, `/api/sites/${site.id}/approvals?status=pending`, { cookie: maya })
      ).json()) as {
        approvals: Array<{ id: string; contentHash: string }>;
      }
    ).approvals as [{ id: string; contentHash: string }];
    expect(pending.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // Maya (editor+) tweaks the draft without publishing it; the reviewed version is gone.
    await post(app, maya, `/api/sites/${site.id}/room/ops`, {
      ops: [op({ op: "collection.upsert", collection: "journal", item: item("Sneaky change") })],
    });
    const stale = await post(app, maya, `/api/sites/${site.id}/approvals/${pending.id}/approve`, {
      contentHash: pending.contentHash,
    });
    expect(stale.status).toBe(409);
    // Cora saves again: the queue entry tracks the new version, which can be approved.
    await post(app, cora, `/api/sites/${site.id}/room/ops`, {
      ops: [op({ op: "collection.upsert", collection: "journal", item: item("Final text") })],
    });
    const [again] = (
      (await (
        await call(app, `/api/sites/${site.id}/approvals?status=pending`, { cookie: maya })
      ).json()) as {
        approvals: Array<{ id: string; contentHash: string }>;
      }
    ).approvals as [{ id: string; contentHash: string }];
    expect(
      (
        await post(app, maya, `/api/sites/${site.id}/approvals/${again.id}/approve`, {
          contentHash: pending.contentHash,
        })
      ).status,
    ).toBe(409);
    const ok = await post(app, maya, `/api/sites/${site.id}/approvals/${again.id}/approve`, {
      contentHash: again.contentHash,
    });
    expect(await ok.json()).toMatchObject({ status: "approved" });
  });
});
