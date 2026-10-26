import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DevGitHubAccess } from "../src/github/dev";
import { toHex } from "../src/lib/crypto";
import { unwrapRoom } from "../src/room";
import { runScheduled } from "../src/scheduled";
import { translateBuildError } from "../src/services/build-errors";
import { call } from "./helpers";
import { RoomClient, room, setText, setup, T } from "./room-helpers";

const repo = { owner: "maya-lin", name: "room-site" };
const gh = () => new DevGitHubAccess(env.HUB_DB);

async function treeKey(ref: string) {
  return (await gh().readTree(repo, ref))
    .map((e) => `${e.path}:${e.sha}`)
    .sort()
    .join("\n");
}

async function edit(app: Parameters<typeof call>[0], siteId: string, cookie: string, text: string) {
  const res = await call(app, `/api/sites/${siteId}/room/ops`, {
    method: "POST",
    cookie,
    json: { ops: [setText(T.heroTitle, text)] },
  });
  expect(res.status).toBe(200);
}

async function publish(app: Parameters<typeof call>[0], siteId: string, cookie: string) {
  const res = await call(app, `/api/sites/${siteId}/publish`, { method: "POST", cookie });
  return {
    res,
    body: (await res.json()) as Record<string, unknown> & { publish: Record<string, unknown> },
  };
}

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `sha256=${toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))}`;
}

const SECRET = ["whsec", "test", "value"].join("_");
const withSecret = {
  ...(env as unknown as Record<string, unknown>),
  GITHUB_WEBHOOK_SECRET: SECRET,
};

async function webhook(
  app: Parameters<typeof call>[0],
  event: string,
  payload: unknown,
  signature?: string,
) {
  const body = JSON.stringify(payload);
  return call(
    app,
    "/webhooks/github",
    {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "x-github-event": event,
        "x-hub-signature-256": signature ?? (await sign(SECRET, body)),
      },
    },
    withSecret,
  );
}

describe("publishing", () => {
  it("squash-publishes the draft: main's tree equals the draft's, with a summary, and the draft resets", async () => {
    const { app, owner, site } = await setup();
    const mainBefore = (await gh().getRef(repo, "main")) as string;
    await edit(app, site.id, owner, "Published title");
    const { res, body } = await publish(app, site.id, owner);
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ id: site.id, status: "live" });
    expect(body.publish).toMatchObject({
      status: "published",
      summary: "Edited Home",
      build: "success",
    });

    const main = (await gh().getRef(repo, "main")) as string;
    const [commit] = await gh().listCommits(repo, { ref: "main", limit: 1 });
    expect(commit?.parents).toEqual([mainBefore]);
    expect(commit?.message).toBe(
      "Edited Home\n\nCo-authored-by: Maya Lin <maya-lin@users.noreply.github.com>",
    );
    // Draft was reset to the new main; trees match; the published content has the edit.
    expect(await gh().getRef(repo, "os/draft")).toBe(main);
    const files = await gh().readFiles(repo, "main", { textOnly: true });
    expect(files["content/pages/home.json"]).toContain("Published title");
    // The dev "workflow" ran for the new commit.
    expect(await gh().workflowStatus(repo, { workflow: "publish.yml", ref: "main" })).toMatchObject(
      {
        state: "success",
        sha: main,
      },
    );

    // Nothing new → no commit.
    const again = await publish(app, site.id, owner);
    expect(again.body.publish).toMatchObject({ status: "no_changes" });
    expect(await gh().getRef(repo, "main")).toBe(main);

    // History lists it with the summary.
    const versions = (await (
      await call(app, `/api/sites/${site.id}/versions`, { cookie: owner })
    ).json()) as {
      versions: Array<{
        sha: string;
        summary: string;
        kind: string;
        status: string | null;
        current: boolean;
      }>;
    };
    expect(versions.versions[0]).toMatchObject({
      sha: main,
      summary: "Edited Home",
      kind: "publish",
      status: "success",
      current: true,
    });
    expect(versions.versions.at(-1)).toMatchObject({ kind: "setup" });
  });

  it("rolls back with a new commit carrying the old tree (no force push) and keeps unpublished work", async () => {
    const { app, owner, site } = await setup();
    const v1 = (await gh().getRef(repo, "main")) as string;
    const v1Tree = await treeKey(v1);
    await edit(app, site.id, owner, "Version two");
    await publish(app, site.id, owner);
    const v2 = (await gh().getRef(repo, "main")) as string;
    // Unpublished edit in the draft.
    await edit(app, site.id, owner, "Work in progress");
    const client = await RoomClient.connect(app, site.id, owner);

    const res = await call(app, `/api/sites/${site.id}/rollback`, {
      method: "POST",
      cookie: owner,
      json: { sha: v1 },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sha: string; snapshot: string | null; summary: string };
    expect(body.summary).toMatch(/^Went back to the version from \d{4}-\d{2}-\d{2}$/);
    const main = (await gh().getRef(repo, "main")) as string;
    expect(main).toBe(body.sha);
    const [commit] = await gh().listCommits(repo, { ref: "main", limit: 1 });
    expect(commit?.parents).toEqual([v2]); // history kept: a new commit on top of v2
    expect(await treeKey(main)).toBe(v1Tree);
    expect(await gh().getRef(repo, "os/draft")).toBe(main);
    // The unpublished draft was saved as a snapshot first.
    expect(body.snapshot).toMatch(/^os\/snap\/before-rollback-\d+$/);
    const snapFiles = await gh().readFiles(repo, `tags/${body.snapshot}`, { textOnly: true });
    expect(snapFiles["content/pages/home.json"]).toContain("Work in progress");
    // Studio is told to reload with the rolled-back document.
    const reload = await client.waitFor((m) => m.type === "reload");
    expect(JSON.stringify(reload)).not.toContain("Work in progress");
    client.close();

    // Unknown versions are refused.
    const bad = await call(app, `/api/sites/${site.id}/rollback`, {
      method: "POST",
      cookie: owner,
      json: { sha: "0".repeat(40) },
    });
    expect(bad.status).toBe(404);
  });

  it("takes named snapshots and restores them into the draft as ops", async () => {
    const { app, owner, site } = await setup();
    await edit(app, site.id, owner, "Snapshot me");
    const snap = await call(app, `/api/sites/${site.id}/snapshots`, {
      method: "POST",
      cookie: owner,
      json: { name: "Before Launch" },
    });
    expect(snap.status).toBe(201);
    expect(await snap.json()).toMatchObject({
      name: "before-launch",
      tag: "os/snap/before-launch",
    });
    await edit(app, site.id, owner, "Changed later");
    const list = (await (
      await call(app, `/api/sites/${site.id}/snapshots`, { cookie: owner })
    ).json()) as {
      snapshots: Array<{ name: string; automatic: boolean }>;
    };
    expect(list.snapshots).toContainEqual(
      expect.objectContaining({ name: "before-launch", automatic: false }),
    );
    const restore = await call(app, `/api/sites/${site.id}/snapshots/before-launch/restore`, {
      method: "POST",
      cookie: owner,
    });
    expect(await restore.json()).toMatchObject({ applied: 1, failed: 0 });
    const { doc } = await unwrapRoom(room(site.id).getDocument(site.id));
    expect(JSON.stringify(doc)).toContain("Snapshot me");
  });

  it("runs scheduled publishes from the cron", async () => {
    const { app, owner, site } = await setup();
    await edit(app, site.id, owner, "Scheduled title");
    const at = Date.now() + 120_000;
    const res = await call(app, `/api/sites/${site.id}/schedule`, {
      method: "POST",
      cookie: owner,
      json: { at: new Date(at).toISOString() },
    });
    expect(res.status).toBe(201);
    const sched = (await res.json()) as { id: string; status: string };
    expect(sched.status).toBe("pending");
    const tooSoon = await call(app, `/api/sites/${site.id}/schedule`, {
      method: "POST",
      cookie: owner,
      json: { at: Date.now() },
    });
    expect(tooSoon.status).toBe(400);

    const mainBefore = await gh().getRef(repo, "main");
    await runScheduled(env, Date.now()); // not due yet
    expect(await gh().getRef(repo, "main")).toBe(mainBefore);
    await runScheduled(env, at + 1000);
    const main = await gh().getRef(repo, "main");
    expect(main).not.toBe(mainBefore);
    expect(
      (await gh().readFiles(repo, "main", { textOnly: true }))["content/pages/home.json"],
    ).toContain("Scheduled title");
    const list = (await (
      await call(app, `/api/sites/${site.id}/schedule`, { cookie: owner })
    ).json()) as {
      schedules: Array<{ id: string; status: string }>;
    };
    expect(list.schedules.find((s) => s.id === sched.id)?.status).toBe("done");
    // Running the cron again doesn't publish twice.
    await runScheduled(env, at + 2000);
    expect(await gh().getRef(repo, "main")).toBe(main);

    // Cancelling a pending schedule.
    const s2 = (await (
      await call(app, `/api/sites/${site.id}/schedule`, {
        method: "POST",
        cookie: owner,
        json: { at: Date.now() + 3600_000 },
      })
    ).json()) as { id: string };
    expect(
      (
        await call(app, `/api/sites/${site.id}/schedule/${s2.id}`, {
          method: "DELETE",
          cookie: owner,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(app, `/api/sites/${site.id}/schedule/${s2.id}`, {
          method: "DELETE",
          cookie: owner,
        })
      ).status,
    ).toBe(404);
  });
});

describe("build status webhook", () => {
  it("verifies signatures", async () => {
    const { app } = await setup();
    const body = JSON.stringify({ zen: "hi" });
    const noSecret = await call(app, "/webhooks/github", {
      method: "POST",
      body,
      headers: { "x-github-event": "ping", "x-hub-signature-256": await sign(SECRET, body) },
    });
    expect(noSecret.status).toBe(503);
    expect((await webhook(app, "ping", { zen: "hi" }, "sha256=deadbeef")).status).toBe(401);
    expect((await webhook(app, "ping", { zen: "hi" }, await sign("wrong", body))).status).toBe(401);
    const ok = await webhook(app, "ping", { zen: "hi" });
    expect(ok.status).toBe(202);
    expect(await ok.json()).toMatchObject({ result: "pong" });
  });

  it("maps a failed run to plain language, pushes it to the room, and 'Fix it for me' reverts", async () => {
    const { app, owner, site } = await setup();
    const good = (await gh().getRef(repo, "main")) as string;
    await edit(app, site.id, owner, "Breaks the site");
    await publish(app, site.id, owner);
    const bad = (await gh().getRef(repo, "main")) as string;
    const client = await RoomClient.connect(app, site.id, owner);
    // Real GitHub reports the run later; the dev emulation already finished it.
    await env.HUB_DB.prepare("UPDATE publishes SET status = 'queued' WHERE sha = ?")
      .bind(bad)
      .run();

    const run = (status: string, conclusion: string | null) => ({
      action: status === "completed" ? "completed" : "in_progress",
      repository: { full_name: "maya-lin/room-site" },
      workflow_run: {
        id: 991,
        name: "Publish",
        path: ".github/workflows/publish.yml",
        head_sha: bad,
        head_branch: "main",
        status,
        conclusion,
        html_url: "https://github.com/maya-lin/room-site/actions/runs/991",
        display_title: "Edited Home",
      },
    });
    expect(
      await (await webhook(app, "workflow_run", run("in_progress", null))).json(),
    ).toMatchObject({
      result: "in_progress",
    });
    await client.waitFor((m) => m.type === "build" && m.state === "in_progress");
    await webhook(app, "workflow_run", run("completed", "failure"));
    const notice = await client.waitFor((m) => m.type === "build" && m.state === "failure");
    expect(notice).toMatchObject({
      sha: bad,
      error: { code: "publish_failed", fix: "revert", title: expect.any(String) },
    });
    const view = (await (await call(app, `/api/sites/${site.id}`, { cookie: owner })).json()) as {
      status: string;
      statusDetail: string;
    };
    expect(view.status).toBe("failed");
    expect(view.statusDetail).not.toMatch(/build|deploy|commit|branch|repositor/i);

    const fix = await call(app, `/api/sites/${site.id}/fix`, { method: "POST", cookie: owner });
    expect(fix.status).toBe(200);
    expect(await fix.json()).toMatchObject({ fix: "revert", site: { status: "live" } });
    const main = (await gh().getRef(repo, "main")) as string;
    expect(await treeKey(main)).toBe(await treeKey(good));
    const [commit] = await gh().listCommits(repo, { ref: "main", limit: 1 });
    expect(commit?.parents).toEqual([bad]);
    // The draft still has the change so it can be corrected.
    const { doc } = await unwrapRoom(room(site.id).getDocument(site.id));
    expect(JSON.stringify(doc)).toContain("Breaks the site");
    // Nothing left to fix.
    expect(
      (await call(app, `/api/sites/${site.id}/fix`, { method: "POST", cookie: owner })).status,
    ).toBe(409);
    client.close();
  });

  it("ignores superseded (cancelled) runs and records installation changes", async () => {
    const { app, site } = await setup();
    const res = await webhook(app, "workflow_run", {
      action: "completed",
      repository: { full_name: "maya-lin/room-site" },
      workflow_run: {
        id: 1,
        path: ".github/workflows/publish.yml",
        head_sha: "a".repeat(40),
        head_branch: "main",
        status: "completed",
        conclusion: "cancelled",
      },
    });
    expect(await res.json()).toMatchObject({ result: "superseded" });
    await webhook(app, "installation_repositories", {
      action: "added",
      installation: { id: 4242 },
      repositories_added: [{ full_name: "maya-lin/room-site" }],
    });
    const row = await env.HUB_DB.prepare("SELECT installation_id FROM sites WHERE id = ?")
      .bind(site.id)
      .first<{ installation_id: number }>();
    expect(row?.installation_id).toBe(4242);
  });

  it("translates common failures into plain language with a fix", () => {
    expect(translateBuildError({ steps: ["build: Run npm ci"] })).toMatchObject({
      code: "install_failed",
      fix: "retry",
    });
    expect(
      translateBuildError({
        steps: ["deploy: Deploy to GitHub Pages"],
        text: "Get Pages site failed. Please verify that the repository has Pages enabled",
      }),
    ).toMatchObject({
      code: "pages_off",
      fix: "enable_pages",
    });
    expect(translateBuildError({ text: "media/2026/10/hero.jpg is too large" })).toMatchObject({
      code: "image_too_large",
    });
    // A failing deploy step on its own is not "Pages is off".
    expect(
      translateBuildError({ steps: ["deploy: Deploy to GitHub Pages (deploy-pages)"] }).code,
    ).toBe("publish_failed");
    expect(translateBuildError({ steps: ["build: Check for secrets in content"] }).code).not.toBe(
      "secret_found",
    );
    expect(translateBuildError({ conclusion: "timed_out" })).toMatchObject({
      code: "timed_out",
      fix: "retry",
    });
    for (const code of [
      "image_too_large",
      "missing_image",
      "content_invalid",
      "pages_off",
      "quota",
    ]) {
      const e = translateBuildError({ text: code.replace("_", " ") });
      expect(`${e.title} ${e.message}`).not.toMatch(/\b(repository|commit|branch|build|deploy)\b/i);
    }
  });
});
