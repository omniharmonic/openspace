import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DevGitHubAccess } from "../src/github/dev";
import { contentKeyOf } from "../src/room/draft-room";
import { call } from "./helpers";
import { RoomClient, setText, setup, T } from "./room-helpers";

/**
 * Work that reaches the live site without going through the draft (Claude Code or the CLI
 * committing to `main` and pushing, an edit on GitHub) must never be hidden by an older draft,
 * nor put back to the old content by publishing that draft.
 */
const repo = { owner: "maya-lin", name: "room-site" };
const gh = () => new DevGitHubAccess(env.HUB_DB);
const HOME = "content/pages/home.json";

type App = Awaited<ReturnType<typeof setup>>["app"];

async function edit(app: App, siteId: string, cookie: string, block: string, text: string) {
  const res = await call(app, `/api/sites/${siteId}/room/ops`, {
    method: "POST",
    cookie,
    json: { ops: [setText(block, text)] },
  });
  expect(res.status).toBe(200);
}

async function flush(app: App, siteId: string, cookie: string) {
  expect(
    (await call(app, `/api/sites/${siteId}/room/flush`, { method: "POST", cookie })).status,
  ).toBe(200);
}

async function publish(app: App, siteId: string, cookie: string, json?: unknown) {
  const res = await call(app, `/api/sites/${siteId}/publish`, {
    method: "POST",
    cookie,
    ...(json ? { json } : {}),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function live(app: App, siteId: string, cookie: string) {
  const res = await call(app, `/api/sites/${siteId}/room/live`, { cookie });
  expect(res.status).toBe(200);
  return (await res.json()) as {
    liveChanged: boolean;
    draftHasChanges: boolean;
    followed: boolean;
    liveSha: string | null;
  };
}

async function roomText(app: App, siteId: string, cookie: string) {
  const res = await call(app, `/api/sites/${siteId}/room/document`, { cookie });
  return JSON.stringify(((await res.json()) as { document: unknown }).document);
}

/** Claude Code (or the CLI) edits the home page in a clone, commits on main and pushes. */
async function claudePushesToMain(from: string, to: string) {
  const home = (await gh().readFile(repo, HOME, "main")) as string;
  expect(home).toContain(from);
  await gh().commitFiles(repo, {
    branch: "main",
    message: "Improve the home page",
    files: [{ path: HOME, content: home.replace(from, to) }],
  });
}

describe("the live site changed outside the editor", () => {
  it("a draft with no changes of its own follows the live site; publishing never reverts it", async () => {
    const { app, owner, site } = await setup();
    await edit(app, site.id, owner, T.heroTitle, "Owner title");
    expect((await publish(app, site.id, owner)).status).toBe(200);
    const studio = await RoomClient.connect(app, site.id, owner);

    await claudePushesToMain("Owner title", "Claude's much better title");
    const main = (await gh().getRef(repo, "main")) as string;

    // Before the fix the editor kept showing "Owner title", and Publish put it back live.
    const status = await live(app, site.id, owner);
    expect(status).toMatchObject({
      followed: true,
      liveChanged: false,
      draftHasChanges: false,
      liveSha: main,
    });
    expect(await gh().getRef(repo, "os/draft")).toBe(main);
    expect(await roomText(app, site.id, owner)).toContain("Claude's much better title");
    // Everyone editing gets the live version.
    const reload = await studio.waitFor((m) => m.type === "reload");
    expect(JSON.stringify(reload)).toContain("Claude's much better title");
    studio.close();

    const again = await publish(app, site.id, owner);
    expect(again.status).toBe(200);
    expect(again.body.publish).toMatchObject({ status: "no_changes" });
    expect(await gh().getRef(repo, "main")).toBe(main);
    expect(await live(app, site.id, owner)).toMatchObject({
      followed: false,
      liveChanged: false,
      draftHasChanges: false,
    });
  });

  it("publishing a draft started before the live change needs an explicit say-so", async () => {
    const { app, owner, site } = await setup();
    await edit(app, site.id, owner, T.heroTitle, "Owner title");
    expect((await publish(app, site.id, owner)).status).toBe(200);
    // The owner keeps editing in Studio…
    await edit(app, site.id, owner, T.offerTitle, "Owner's draft offer");
    await flush(app, site.id, owner);
    // …while Claude Code publishes a redesign straight to main.
    await claudePushesToMain("Owner title", "Claude's much better title");
    const main = (await gh().getRef(repo, "main")) as string;

    const status = await live(app, site.id, owner);
    expect(status).toMatchObject({
      liveChanged: true,
      draftHasChanges: true,
      followed: false,
      liveSha: main,
    });
    // Nothing moved: the draft is kept for the person to decide.
    expect(await roomText(app, site.id, owner)).toContain("Owner's draft offer");

    const refused = await publish(app, site.id, owner);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: { code: "live_changed" } });
    expect((refused.body.error as { message: string }).message).toMatch(/would replace them/);
    expect(await gh().getRef(repo, "main")).toBe(main);

    // An unflushed edit counts as the draft's own change too.
    await edit(app, site.id, owner, T.offerTitle, "Owner's newest offer");
    expect((await live(app, site.id, owner)).liveChanged).toBe(true);

    const forced = await publish(app, site.id, owner, { overwriteLive: true });
    expect(forced.status).toBe(200);
    expect(forced.body.publish).toMatchObject({ status: "published" });
    const home = (await gh().readFile(repo, HOME, "main")) as string;
    expect(home).toContain("Owner's newest offer");
    // This is what used to happen silently: the stale draft put the old title back live.
    expect(home).not.toContain("Claude's much better title");
    expect(await live(app, site.id, owner)).toMatchObject({
      liveChanged: false,
      draftHasChanges: false,
    });
  });

  it("using the live version (discard) clears the notice", async () => {
    const { app, owner, site } = await setup();
    await edit(app, site.id, owner, T.heroTitle, "Owner title");
    expect((await publish(app, site.id, owner)).status).toBe(200);
    await edit(app, site.id, owner, T.offerTitle, "Owner's draft offer");
    await flush(app, site.id, owner);
    await claudePushesToMain("Owner title", "Claude's much better title");
    expect((await live(app, site.id, owner)).liveChanged).toBe(true);

    const res = await call(app, `/api/sites/${site.id}/discard`, { method: "POST", cookie: owner });
    expect(res.status).toBe(200);
    const text = await roomText(app, site.id, owner);
    expect(text).toContain("Claude's much better title");
    expect(text).not.toContain("Owner's draft offer");
    await flush(app, site.id, owner);
    expect(await live(app, site.id, owner)).toMatchObject({
      liveChanged: false,
      draftHasChanges: false,
    });
  });

  it("commits on main that don't change what visitors see are not a live change", async () => {
    const { app, owner, site } = await setup();
    await edit(app, site.id, owner, T.heroTitle, "Owner title");
    expect((await publish(app, site.id, owner)).status).toBe(200);
    await edit(app, site.id, owner, T.offerTitle, "Owner's draft offer");
    await flush(app, site.id, owner);
    // A custom domain and a kit update land on main.
    const config = JSON.parse((await gh().readFile(repo, "openspace.json", "main")) as string);
    config.deploy.customDomain = "maya.example";
    await gh().commitFiles(repo, {
      branch: "main",
      message: "Use custom domain maya.example",
      files: [
        { path: "openspace.json", content: `${JSON.stringify(config, null, 2)}\n` },
        { path: "package.json", content: "{}\n" },
      ],
    });
    expect(await live(app, site.id, owner)).toMatchObject({
      liveChanged: false,
      draftHasChanges: true,
    });
    const published = await publish(app, site.id, owner);
    expect(published.status).toBe(200);
    expect(published.body.publish).toMatchObject({ status: "published" });
  });
});

describe("contentKeyOf", () => {
  const tree = [
    { path: "content/pages/home.json", sha: "a" },
    { path: "media/x.png", sha: "b" },
    { path: "package.json", sha: "c" },
  ];
  const config = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      siteId: "s",
      schemaVersion: 1,
      hub: "https://hub.example",
      deploy: { target: "github-pages", url: "https://x", customDomain: null },
      features: { forms: true },
      ...over,
    });

  it("ignores Hub-managed settings and files outside content", () => {
    const k = contentKeyOf(tree, config());
    expect(
      contentKeyOf(
        [...tree.slice(0, 2), { path: "package.json", sha: "z" }],
        config({
          hub: "https://other.example",
          deploy: { target: "cloudflare", url: "https://y", customDomain: "a.example" },
        }),
      ),
    ).toBe(k);
  });

  it("changes with content, media or site settings", () => {
    const k = contentKeyOf(tree, config());
    const media = { path: "media/x.png", sha: "b" };
    expect(contentKeyOf([{ path: "content/pages/home.json", sha: "z" }, media], config())).not.toBe(
      k,
    );
    expect(contentKeyOf(tree, config({ features: { forms: false } }))).not.toBe(k);
  });
});

/**
 * Owner report: "it asks me to update to the live version but when i click to make it live, it
 * just infinitely loops back". Claude Code wrote the same content as the editor, formatted
 * differently, so every file's fingerprint differed and the draft never stopped counting as
 * changed — while the editor, comparing what the files say, had nothing to undo.
 */
describe("the same content written differently", () => {
  /** Claude Code commits the home page to main with the same content, formatted its own way. */
  async function claudeReformatsMain() {
    const home = (await gh().readFile(repo, HOME, "main")) as string;
    const reformatted = JSON.stringify(JSON.parse(home), null, 4);
    expect(reformatted).not.toBe(home);
    await gh().commitFiles(repo, {
      branch: "main",
      message: "Format the home page",
      files: [{ path: HOME, content: reformatted }],
    });
  }

  it("is not an unpublished change, nor a live change", async () => {
    const { app, owner, site } = await setup();
    await edit(app, site.id, owner, T.heroTitle, "Owner title");
    expect((await publish(app, site.id, owner)).status).toBe(200);
    // The same change reaches both: the editor's draft (through the connector) and main
    // (Claude Code), each file written its own way.
    await edit(app, site.id, owner, T.heroTitle, "Claude's title");
    await flush(app, site.id, owner);
    const draftHome = (await gh().readFile(repo, HOME, "os/draft")) as string;
    await gh().commitFiles(repo, {
      branch: "main",
      message: "Claude's title",
      files: [{ path: HOME, content: JSON.stringify(JSON.parse(draftHome), null, 4) }],
    });
    expect(await live(app, site.id, owner)).toMatchObject({
      liveChanged: false,
      draftHasChanges: false,
    });
  });

  it("going back to the live version makes the draft exactly live", async () => {
    const { app, owner, site } = await setup();
    await edit(app, site.id, owner, T.heroTitle, "Owner title");
    expect((await publish(app, site.id, owner)).status).toBe(200);
    await claudeReformatsMain();
    // A site update also lands on the draft outside the room (its package.json bump).
    const pkg = (await gh().readFile(repo, "package.json", "os/draft")) ?? "{}";
    await gh().commitFiles(repo, {
      branch: "os/draft",
      message: "OpenSpace update",
      files: [{ path: "package.json", content: `${pkg.trimEnd()}\n\n` }],
    });
    const main = (await gh().getRef(repo, "main")) as string;
    expect(await gh().getRef(repo, "os/draft")).not.toBe(main);

    const res = await call(app, `/api/sites/${site.id}/discard`, { method: "POST", cookie: owner });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ applied: 0, hadChanges: true });
    expect(await gh().getRef(repo, "os/draft")).toBe(main);
    expect(await live(app, site.id, owner)).toMatchObject({ draftHasChanges: false });
    expect(await roomText(app, site.id, owner)).toContain("Owner title");
  });
});
