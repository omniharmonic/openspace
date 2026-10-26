import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { DevGitHubAccess, gitBlobSha } from "../src/github/dev";
import { GitHubConflictError, GitHubNotFoundError } from "../src/github/types";

const repo = { owner: "maya", name: "maya-yoga" };

describe("DevGitHubAccess", () => {
  let gh: DevGitHubAccess;
  let clock = 1_700_000_000_000;

  beforeEach(() => {
    clock = 1_700_000_000_000;
    gh = new DevGitHubAccess(env.HUB_DB, {
      now: () => clock++,
      pagesUrl: () => "http://localhost:8787/s/st_test/",
    });
  });

  async function seed() {
    return gh.createRepoFromTemplate({
      ...repo,
      files: { "README.md": "# Maya Yoga\n", "content/site.json": '{"title":"Maya"}\n' },
      message: "Create site",
      author: { name: "Maya" },
    });
  }

  it("creates a repo with an initial commit on main", async () => {
    const { repo: info, head } = await seed();
    expect(info).toMatchObject({ owner: "maya", name: "maya-yoga", fullName: "maya/maya-yoga" });
    expect(await gh.getRef(repo, "main")).toBe(head);
    expect(await gh.readFile(repo, "README.md", "main")).toBe("# Maya Yoga\n");
    expect(await gh.readFile(repo, "missing.txt", "main")).toBeNull();
    const tree = await gh.readTree(repo, "main");
    expect(tree.map((e) => e.path)).toEqual(["README.md", "content/site.json"]);
    // Blob ids are git's: sha1("blob <len>\0<content>").
    expect(tree[0]?.sha).toBe(await gitBlobSha("# Maya Yoga\n"));
    expect(await gitBlobSha("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
    await expect(seed()).rejects.toBeInstanceOf(GitHubConflictError);
    expect(await gh.getRepo({ owner: "maya", name: "nope" })).toBeNull();
  });

  it("commits with optimistic concurrency and keeps history", async () => {
    const { head } = await seed();
    const c1 = await gh.commitFiles(repo, {
      branch: "main",
      expectedHead: head,
      message: "Update title",
      files: [
        { path: "content/site.json", content: '{"title":"Maya Yoga"}\n' },
        { path: "README.md", content: null },
      ],
    });
    expect(c1.parents).toEqual([head]);
    expect(await gh.readFile(repo, "README.md", "main")).toBeNull();
    expect(await gh.readFile(repo, "README.md", head)).toBe("# Maya Yoga\n"); // read at an old sha
    await expect(
      gh.commitFiles(repo, {
        branch: "main",
        expectedHead: head, // stale
        message: "Lost update",
        files: [{ path: "x.txt", content: "x" }],
      }),
    ).rejects.toMatchObject({ name: "GitHubConflictError", actualHead: c1.sha });
    const log = await gh.listCommits(repo, { ref: "main" });
    expect(log.map((c) => c.message)).toEqual(["Update title", "Create site"]);
    expect(log[1]?.author).toEqual({ name: "Maya" });
    const readmeLog = await gh.listCommits(repo, { ref: "main", path: "README.md" });
    expect(readmeLog.map((c) => c.message)).toEqual(["Update title", "Create site"]);
    const cfgLog = await gh.listCommits(repo, { ref: "main", path: "content", limit: 1 });
    expect(cfgLog.map((c) => c.message)).toEqual(["Update title"]);
  });

  it("dedupes blobs (content addressed) and stores binary as base64", async () => {
    await seed();
    await gh.commitFiles(repo, {
      branch: "main",
      message: "Same content twice + binary",
      files: [
        { path: "a.txt", content: "same" },
        { path: "b.txt", content: "same" },
        { path: "media/dot.png", content: "iVBORw0KGgo=", encoding: "base64" },
      ],
    });
    const tree = await gh.readTree(repo, "main");
    const a = tree.find((e) => e.path === "a.txt");
    const b = tree.find((e) => e.path === "b.txt");
    expect(a?.sha).toBe(b?.sha);
    const all = await gh.readFiles(repo, "main");
    expect(all["media/dot.png"]).toBe("iVBORw0KGgo=");
    const text = await gh.readFiles(repo, "main", { textOnly: true });
    expect(text["media/dot.png"]).toBeUndefined();
    expect(Object.keys(await gh.readFiles(repo, "main", { prefix: "content/" }))).toEqual([
      "content/site.json",
    ]);
    await expect(
      gh.commitFiles(repo, {
        branch: "main",
        message: "bad",
        files: [{ path: "../x", content: "" }],
      }),
    ).rejects.toThrow(/Invalid file path/);
  });

  it("supports branches, resets, tags and tree commits (publish/rollback)", async () => {
    const { head } = await seed();
    await gh.createBranch(repo, "os/draft", head);
    await expect(gh.createBranch(repo, "os/draft", head)).rejects.toBeInstanceOf(
      GitHubConflictError,
    );
    const d1 = await gh.commitFiles(repo, {
      branch: "os/draft",
      message: "Draft edit",
      files: [{ path: "content/site.json", content: '{"title":"Draft"}\n' }],
    });
    expect(await gh.readFile(repo, "content/site.json", "main")).toBe('{"title":"Maya"}\n');
    expect(await gh.readFile(repo, "content/site.json", "os/draft")).toBe('{"title":"Draft"}\n');

    // Publish: a squash commit on main whose tree equals the draft's.
    const pub = await gh.commitTree(repo, {
      branch: "main",
      treeOf: "os/draft",
      message: "Publish",
    });
    expect(pub.parents).toEqual([head]);
    expect(await gh.readFiles(repo, "main")).toEqual(await gh.readFiles(repo, "os/draft"));
    await gh.resetBranch(repo, "os/draft", "main");
    expect(await gh.getRef(repo, "os/draft")).toBe(pub.sha);

    // Snapshot tag + rollback to the first version as a new commit.
    await gh.tag(repo, "os/snap/before-publish", head);
    expect(await gh.getRef(repo, "tags/os/snap/before-publish")).toBe(head);
    await expect(gh.tag(repo, "os/snap/before-publish", pub.sha)).rejects.toBeInstanceOf(
      GitHubConflictError,
    );
    const back = await gh.commitTree(repo, {
      branch: "main",
      treeOf: "tags/os/snap/before-publish",
      message: "Roll back",
      expectedHead: pub.sha,
    });
    expect(await gh.readFile(repo, "content/site.json", "main")).toBe('{"title":"Maya"}\n');
    expect(back.parents).toEqual([pub.sha]);
    await expect(
      gh.commitTree(repo, { branch: "main", treeOf: d1.sha, message: "x", expectedHead: pub.sha }),
    ).rejects.toBeInstanceOf(GitHubConflictError);
    await expect(gh.getRef(repo, "nope")).resolves.toBeNull();
    await expect(gh.readTree(repo, "nope")).rejects.toBeInstanceOf(GitHubNotFoundError);
  });

  it("publishing goes live immediately; pages, secrets, collaborators, PRs, transfer", async () => {
    await seed();
    expect(await gh.workflowStatus(repo, { workflow: "publish.yml" })).toEqual({ state: "none" });
    expect(await gh.enablePages(repo)).toEqual({ url: "http://localhost:8787/s/st_test/" });
    await gh.dispatchWorkflow(repo, { workflow: "publish.yml", ref: "main" });
    const run = await gh.workflowStatus(repo, { workflow: "publish.yml", ref: "main" });
    expect(run.state).toBe("success");
    expect(run.sha).toBe(await gh.getRef(repo, "main"));

    await gh.setPagesDomain(repo, "mayayoga.com");
    await gh.setSecret(repo, "CLOUDFLARE_API_TOKEN", "secret-value");
    const secret = await env.HUB_DB.prepare("SELECT * FROM dev_secrets").first<
      Record<string, unknown>
    >();
    expect(secret?.name).toBe("CLOUDFLARE_API_TOKEN");
    expect(JSON.stringify(secret)).not.toContain("secret-value");
    await gh.addCollaborator(repo, "sam");

    await gh.createBranch(repo, "os/update", (await gh.getRef(repo, "main")) as string);
    const pr = await gh.openPullRequest(repo, {
      head: "os/update",
      base: "main",
      title: "Update kit",
    });
    expect(pr.number).toBe(1);

    const moved = await gh.transferRepo(repo, "client");
    expect(moved.fullName).toBe("client/maya-yoga");
    expect(await gh.getRepo(repo)).toBeNull();
    expect(await gh.readFile({ owner: "client", name: "maya-yoga" }, "README.md", "main")).toBe(
      "# Maya Yoga\n",
    );
    await gh.archiveRepo({ owner: "client", name: "maya-yoga" });
    expect((await gh.getRepo({ owner: "client", name: "maya-yoga" }))?.archived).toBe(true);
  });
});
