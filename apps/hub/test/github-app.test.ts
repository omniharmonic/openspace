import nacl from "tweetnacl";
import { beforeAll, describe, expect, it } from "vitest";
import type { GitHubAppConfig } from "../src/env";
import { GitHubAppAccess } from "../src/github/app";
import { sealedBoxOpen } from "../src/github/sealed-box";
import { GitHubApiError, GitHubConflictError } from "../src/github/types";
import { base64ToBytes, base64ToUtf8, bytesToBase64, utf8ToBase64 } from "../src/lib/crypto";
import { generateAppKey, pem } from "./keys";
import { mockFetch, type RecordedCall, status } from "./mock-fetch";

interface CommitInput {
  branch: unknown;
  message: { headline: string; body: string };
  fileChanges: { additions: unknown[]; deletions: unknown[] };
}

const repo = { owner: "maya", name: "maya-yoga" };
const HEAD = "a".repeat(40);
const NEXT = "b".repeat(40);
let app: GitHubAppConfig;

beforeAll(async () => {
  const { pkcs8 } = await generateAppKey();
  app = {
    appId: "4242",
    privateKey: pem("PRIVATE KEY", pkcs8),
    clientId: "Iv1.abc",
    clientSecret: "shh",
    slug: "openspace",
  };
});

const restRepo = (owner: string, name: string) => ({
  name,
  full_name: `${owner}/${name}`,
  owner: { login: owner },
  default_branch: "main",
  html_url: `https://github.com/${owner}/${name}`,
  private: false,
  archived: false,
});

function installationRoute(): [string, RegExp, () => unknown] {
  return [
    "POST",
    /^\/app\/installations\/77\/access_tokens$/,
    () => ({ token: "ghs_install", expires_at: "2099-01-01T00:00:00Z" }),
  ];
}

describe("GitHubAppAccess", () => {
  it("mints an installation token with the App JWT and reuses it", async () => {
    const m = mockFetch([
      installationRoute(),
      ["GET", /\/git\/ref\/heads\/os\/draft$/, () => ({ object: { sha: HEAD, type: "commit" } })],
      ["GET", /\/git\/ref\/heads\/missing$/, () => status(404, { message: "Not Found" })],
    ]);
    const gh = new GitHubAppAccess({ app, installationId: 77, fetch: m.fetch });
    expect(await gh.getRef(repo, "os/draft")).toBe(HEAD);
    expect(await gh.getRef(repo, "missing")).toBeNull();
    const tokenCalls = m.calls.filter((c) => c.path.includes("access_tokens"));
    expect(tokenCalls).toHaveLength(1);
    const auth = tokenCalls[0]?.headers.get("authorization") ?? "";
    expect(auth).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    const payload = JSON.parse(
      atob((auth.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")),
    );
    expect(payload.iss).toBe("4242");
    const refCall = m.calls.find((c) => c.path.endsWith("/heads/os/draft"));
    expect(refCall?.path).toBe("/repos/maya/maya-yoga/git/ref/heads/os/draft");
    expect(refCall?.headers.get("authorization")).toBe("Bearer ghs_install");
    expect(refCall?.headers.get("x-github-api-version")).toBe("2022-11-28");
  });

  it("falls back to the user token, and fails clearly with no credentials", async () => {
    const m = mockFetch([["GET", /\/git\/ref\/heads\/main$/, () => ({ object: { sha: HEAD } })]]);
    const gh = new GitHubAppAccess({ app, fetch: m.fetch, userToken: async () => "ghu_user" });
    await gh.getRef(repo, "main");
    expect(m.calls[0]?.headers.get("authorization")).toBe("Bearer ghu_user");
    const none = new GitHubAppAccess({ app, fetch: m.fetch });
    await expect(none.getRef(repo, "main")).rejects.toBeInstanceOf(GitHubApiError);
  });

  it("commits through createCommitOnBranch with expectedHeadOid", async () => {
    const m = mockFetch([
      installationRoute(),
      [
        "POST",
        /^\/graphql$/,
        (call) => {
          const input = (call.body as { variables: { input: Record<string, unknown> } }).variables
            .input;
          if (input.expectedHeadOid !== HEAD)
            return {
              errors: [
                {
                  type: "STALE_DATA",
                  message: `Expected branch to point to "${input.expectedHeadOid}" but it did not`,
                },
              ],
            };
          return {
            data: {
              createCommitOnBranch: {
                commit: { oid: NEXT, committedDate: "2026-10-26T00:00:00Z" },
              },
            },
          };
        },
      ],
    ]);
    const gh = new GitHubAppAccess({ app, installationId: 77, fetch: m.fetch });
    const commit = await gh.commitFiles(repo, {
      branch: "os/draft",
      expectedHead: HEAD,
      message: "Edit home\n\nAgent: claude",
      author: { name: "Maya", email: "maya@example.com" },
      files: [
        { path: "content/pages/home.json", content: '{"title":"Home"}\n' },
        { path: "media/a.png", content: "iVBORw0KGgo=", encoding: "base64" },
        { path: "content/pages/old.json", content: null },
      ],
    });
    expect(commit).toMatchObject({ sha: NEXT, parents: [HEAD] });
    const input = ((m.calls.at(-1) as RecordedCall).body as { variables: { input: CommitInput } })
      .variables.input;
    expect(input.branch).toEqual({
      repositoryNameWithOwner: "maya/maya-yoga",
      branchName: "os/draft",
    });
    expect(input.message.headline).toBe("Edit home");
    expect(input.message.body).toBe("Agent: claude\n\nCo-authored-by: Maya <maya@example.com>");
    expect(input.fileChanges.additions).toEqual([
      { path: "content/pages/home.json", contents: utf8ToBase64('{"title":"Home"}\n') },
      { path: "media/a.png", contents: "iVBORw0KGgo=" },
    ]);
    expect(input.fileChanges.deletions).toEqual([{ path: "content/pages/old.json" }]);

    await expect(
      gh.commitFiles(repo, { branch: "os/draft", expectedHead: NEXT, message: "x", files: [] }),
    ).rejects.toBeInstanceOf(GitHubConflictError);
  });

  it("commits a whole tree (publish) and maps non-fast-forward to a conflict", async () => {
    let refUpdate = 0;
    const m = mockFetch([
      installationRoute(),
      ["GET", /\/git\/ref\/heads\/main$/, () => ({ object: { sha: HEAD } })],
      ["GET", /\/git\/ref\/heads\/os\/draft$/, () => ({ object: { sha: NEXT } })],
      [
        "GET",
        new RegExp(`/git/commits/${NEXT}$`),
        () => ({ sha: NEXT, tree: { sha: "t".repeat(40) } }),
      ],
      [
        "POST",
        /\/git\/commits$/,
        (call) => ({
          sha: "c".repeat(40),
          author: { name: "openspace[bot]", email: "bot@x", date: "2026-10-26T00:00:00Z" },
          echo: call.body,
        }),
      ],
      [
        "PATCH",
        /\/git\/refs\/heads\/main$/,
        () =>
          refUpdate++ === 0
            ? { object: { sha: "c".repeat(40) } }
            : status(422, { message: "Update is not a fast forward" }),
      ],
    ]);
    const gh = new GitHubAppAccess({ app, installationId: 77, fetch: m.fetch });
    const commit = await gh.commitTree(repo, {
      branch: "main",
      treeOf: "os/draft",
      message: "Publish",
    });
    expect(commit.parents).toEqual([HEAD]);
    const created = m.calls.find((c) => c.method === "POST" && c.path.endsWith("/git/commits"));
    expect(created?.body).toEqual({ message: "Publish", tree: "t".repeat(40), parents: [HEAD] });
    const patch = m.calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toEqual({ sha: "c".repeat(40), force: false });
    await expect(
      gh.commitTree(repo, { branch: "main", treeOf: "os/draft", message: "Again" }),
    ).rejects.toBeInstanceOf(GitHubConflictError);
    await expect(
      gh.commitTree(repo, { branch: "main", treeOf: "os/draft", message: "x", expectedHead: NEXT }),
    ).rejects.toBeInstanceOf(GitHubConflictError);
  });

  it("creates a repo with the user token, waits for main, then commits the files", async () => {
    let refPolls = 0;
    const m = mockFetch([
      installationRoute(),
      ["POST", /^\/user\/repos$/, () => status(201, restRepo("maya", "maya-yoga"))],
      [
        "GET",
        /\/git\/ref\/heads\/main$/,
        () => (refPolls++ < 1 ? status(404, { message: "Not Found" }) : { object: { sha: HEAD } }),
      ],
      [
        "POST",
        /^\/graphql$/,
        () => ({ data: { createCommitOnBranch: { commit: { oid: NEXT, committedDate: "x" } } } }),
      ],
    ]);
    const gh = new GitHubAppAccess({
      app,
      installationId: 77,
      fetch: m.fetch,
      userToken: async () => "ghu_user",
      userLogin: "maya",
      pollDelayMs: 0,
    });
    const out = await gh.createRepoFromTemplate({
      owner: "maya",
      name: "maya-yoga",
      files: { "openspace.json": "{}\n" },
      message: "Set up",
    });
    expect(out).toMatchObject({
      head: NEXT,
      repo: { fullName: "maya/maya-yoga", defaultBranch: "main" },
    });
    const create = m.calls.find((c) => c.path === "/user/repos");
    expect(create?.headers.get("authorization")).toBe("Bearer ghu_user");
    expect(create?.body).toMatchObject({ name: "maya-yoga", auto_init: true, private: false });

    const org = mockFetch([
      ["POST", /^\/orgs\/studio\/repos$/, () => status(201, restRepo("studio", "x"))],
      ["GET", /\/git\/ref\/heads\/main$/, () => ({ object: { sha: HEAD } })],
    ]);
    const gh2 = new GitHubAppAccess({
      app,
      fetch: org.fetch,
      userToken: async () => "ghu",
      userLogin: "maya",
    });
    expect((await gh2.createRepoFromTemplate({ owner: "studio", name: "x" })).head).toBe(HEAD);

    const tpl = mockFetch([
      [
        "POST",
        /^\/repos\/openspace-templates\/meadow\/generate$/,
        (c) => status(201, { ...restRepo("maya", "y"), echo: c.body }),
      ],
      ["GET", /\/git\/ref\/heads\/main$/, () => ({ object: { sha: HEAD } })],
    ]);
    const gh3 = new GitHubAppAccess({ app, fetch: tpl.fetch, userToken: async () => "ghu" });
    await gh3.createRepoFromTemplate({
      owner: "maya",
      name: "y",
      template: { owner: "openspace-templates", name: "meadow" },
    });
    expect(tpl.calls[0]?.body).toMatchObject({
      owner: "maya",
      name: "y",
      include_all_branches: false,
    });
  });

  it("reads trees and files (text and binary)", async () => {
    const m = mockFetch([
      installationRoute(),
      ["GET", /\/git\/ref\/heads\/main$/, () => ({ object: { sha: HEAD } })],
      [
        "GET",
        new RegExp(`/git/trees/${HEAD}\\?recursive=1$`),
        () => ({
          truncated: false,
          tree: [
            { path: "content", type: "tree", sha: "d".repeat(40) },
            { path: "content/site.json", type: "blob", sha: "1".repeat(40), size: 10 },
            { path: "media/a.png", type: "blob", sha: "2".repeat(40), size: 3 },
          ],
        }),
      ],
      [
        "GET",
        /\/git\/blobs\/1{40}$/,
        () => ({
          encoding: "base64",
          content: `${utf8ToBase64('{"title":"Maya"}').slice(0, 8)}\n${utf8ToBase64('{"title":"Maya"}').slice(8)}`,
        }),
      ],
      [
        "GET",
        /\/git\/blobs\/2{40}$/,
        () => ({ encoding: "base64", content: bytesToBase64(new Uint8Array([0xff, 0xfe, 0x00])) }),
      ],
      [
        "POST",
        /^\/graphql$/,
        () => ({
          data: {
            repository: {
              f0: { text: '{"title":"Maya"}', isBinary: false, isTruncated: false },
              f1: { text: null, isBinary: true, isTruncated: false },
            },
          },
        }),
      ],
      [
        "GET",
        /\/contents\/content\/site\.json\?ref=os%2Fdraft$/,
        () => new Response('{"title":"Draft"}'),
      ],
      ["GET", /\/contents\/nope\.txt/, () => status(404)],
    ]);
    const gh = new GitHubAppAccess({ app, installationId: 77, fetch: m.fetch });
    expect((await gh.readTree(repo, "main")).map((e) => e.path)).toEqual([
      "content/site.json",
      "media/a.png",
    ]);
    const files = await gh.readFiles(repo, "main");
    expect(files["content/site.json"]).toBe('{"title":"Maya"}');
    expect(base64ToBytes(files["media/a.png"] as string)).toEqual(
      new Uint8Array([0xff, 0xfe, 0x00]),
    );
    expect(Object.keys(await gh.readFiles(repo, "main", { textOnly: true }))).toEqual([
      "content/site.json",
    ]);
    expect(await gh.readFile(repo, "content/site.json", "os/draft")).toBe('{"title":"Draft"}');
    expect(await gh.readFile(repo, "nope.txt", "main")).toBeNull();
    expect(base64ToUtf8(utf8ToBase64("é"))).toBe("é");
  });

  it("enables Pages (idempotently), dispatches and reads workflow status", async () => {
    let pagesPosts = 0;
    let runStatus = { status: "in_progress", conclusion: null as string | null };
    const m = mockFetch([
      installationRoute(),
      [
        "POST",
        /\/pages$/,
        () =>
          pagesPosts++ === 0
            ? status(201, { html_url: "https://maya.github.io/maya-yoga/" })
            : status(409, { message: "already enabled" }),
      ],
      ["GET", /\/pages$/, () => ({ html_url: "https://maya.github.io/maya-yoga/" })],
      ["PUT", /\/pages$/, () => new Response(null, { status: 204 })],
      [
        "POST",
        /\/actions\/workflows\/publish\.yml\/dispatches$/,
        () => new Response(null, { status: 204 }),
      ],
      [
        "GET",
        /\/actions\/workflows\/publish\.yml\/runs\?per_page=1&branch=main$/,
        () => ({
          workflow_runs: [
            {
              ...runStatus,
              head_sha: HEAD,
              html_url: "https://github.com/run/1",
              updated_at: "2026-10-26T00:00:00Z",
            },
          ],
        }),
      ],
    ]);
    const gh = new GitHubAppAccess({ app, installationId: 77, fetch: m.fetch });
    expect(await gh.enablePages(repo)).toEqual({ url: "https://maya.github.io/maya-yoga/" });
    expect(await gh.enablePages(repo)).toEqual({ url: "https://maya.github.io/maya-yoga/" });
    expect(m.calls.find((c) => c.method === "POST" && c.path.endsWith("/pages"))?.body).toEqual({
      build_type: "workflow",
    });
    await gh.setPagesDomain(repo, "mayayoga.com");
    expect(m.calls.find((c) => c.method === "PUT")?.body).toEqual({ cname: "mayayoga.com" });
    await gh.dispatchWorkflow(repo, { workflow: "publish.yml", ref: "main" });
    expect(m.calls.find((c) => c.path.endsWith("/dispatches"))?.body).toEqual({ ref: "main" });
    expect((await gh.workflowStatus(repo, { workflow: "publish.yml", ref: "main" })).state).toBe(
      "in_progress",
    );
    runStatus = { status: "completed", conclusion: "success" };
    expect(await gh.workflowStatus(repo, { workflow: "publish.yml", ref: "main" })).toEqual({
      state: "success",
      sha: HEAD,
      url: "https://github.com/run/1",
      updatedAt: "2026-10-26T00:00:00Z",
    });
    runStatus = { status: "completed", conclusion: "failure" };
    expect((await gh.workflowStatus(repo, { workflow: "publish.yml", ref: "main" })).state).toBe(
      "failure",
    );
  });

  it("reads a failed run's steps and job logs (following the download redirect without the token)", async () => {
    const LOG =
      "2026-10-27T09:14:05.1Z ##[error]content/pages/home.json error link sections.0.blocks.1.fields.link: Link to /book does not lead to any page";
    const m = mockFetch([
      installationRoute(),
      [
        "GET",
        /\/actions\/runs\/991\/jobs$/,
        () => ({
          jobs: [
            {
              id: 5,
              name: "build",
              conclusion: "failure",
              steps: [
                { name: "Install", conclusion: "success" },
                { name: "Check site", conclusion: "failure" },
              ],
            },
            { id: 6, name: "deploy", conclusion: "skipped", steps: [] },
          ],
        }),
      ],
      [
        "GET",
        /\/actions\/jobs\/5\/logs$/,
        () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://logs.example.net/job-5.txt?sig=abc" },
          }),
      ],
      [
        "GET",
        /^logs\.example\.net\/job-5\.txt/,
        () => new Response(LOG, { headers: { "content-type": "text/plain" } }),
      ],
    ]);
    const gh = new GitHubAppAccess({ app, installationId: 77, fetch: m.fetch });
    expect(await gh.failedRun(repo, 991)).toEqual({ steps: ["build: Check site"], log: LOG });
    const download = m.calls.find((c) => c.path.startsWith("logs.example.net"));
    expect(download?.headers.get("authorization")).toBeNull();
    expect(m.calls.find((c) => c.path.endsWith("/jobs/5/logs"))?.headers.get("authorization")).toBe(
      "Bearer ghs_install",
    );
  });

  it("writes Actions secrets as sealed boxes; collaborators, PRs, tags, transfer, archive", async () => {
    const recipient = nacl.box.keyPair();
    const m = mockFetch([
      installationRoute(),
      [
        "GET",
        /\/actions\/secrets\/public-key$/,
        () => ({ key_id: "k1", key: bytesToBase64(recipient.publicKey) }),
      ],
      [
        "PUT",
        /\/actions\/secrets\/CLOUDFLARE_API_TOKEN$/,
        () => new Response(null, { status: 201 }),
      ],
      ["PUT", /\/collaborators\/sam$/, () => new Response(null, { status: 201 })],
      [
        "POST",
        /\/pulls$/,
        () => status(201, { number: 7, html_url: "https://github.com/maya/maya-yoga/pull/7" }),
      ],
      ["GET", /\/git\/ref\/heads\/main$/, () => ({ object: { sha: HEAD } })],
      [
        "POST",
        /\/git\/refs$/,
        (c) =>
          (c.body as { ref: string }).ref === "refs/tags/dupe"
            ? status(422, { message: "Reference already exists" })
            : status(201, {}),
      ],
      ["POST", /\/transfer$/, () => status(202, restRepo("client", "maya-yoga"))],
      [
        "PATCH",
        /^\/repos\/maya\/maya-yoga$/,
        (c) => ({
          ...restRepo("maya", "maya-yoga"),
          archived: (c.body as { archived: boolean }).archived,
        }),
      ],
    ]);
    const gh = new GitHubAppAccess({
      app,
      installationId: 77,
      fetch: m.fetch,
      userToken: async () => "ghu",
    });
    await gh.setSecret(repo, "CLOUDFLARE_API_TOKEN", "cf-token");
    const put = m.calls.find((c) => c.path.endsWith("/CLOUDFLARE_API_TOKEN"))?.body as {
      encrypted_value: string;
      key_id: string;
    };
    expect(put.key_id).toBe("k1");
    const opened = sealedBoxOpen(
      base64ToBytes(put.encrypted_value),
      recipient.publicKey,
      recipient.secretKey,
    );
    expect(opened && new TextDecoder().decode(opened)).toBe("cf-token");
    await gh.addCollaborator(repo, "sam");
    expect(m.calls.find((c) => c.path.endsWith("/collaborators/sam"))?.body).toEqual({
      permission: "push",
    });
    expect(
      await gh.openPullRequest(repo, { head: "os/update", base: "main", title: "Update" }),
    ).toEqual({
      number: 7,
      url: "https://github.com/maya/maya-yoga/pull/7",
    });
    await gh.tag(repo, "os/snap/x", "main");
    expect(m.calls.find((c) => c.path.endsWith("/git/refs"))?.body).toEqual({
      ref: "refs/tags/os/snap/x",
      sha: HEAD,
    });
    await expect(gh.tag(repo, "dupe", HEAD)).rejects.toBeInstanceOf(GitHubConflictError);
    expect((await gh.transferRepo(repo, "client")).fullName).toBe("client/maya-yoga");
    expect(m.calls.find((c) => c.path.endsWith("/transfer"))?.headers.get("authorization")).toBe(
      "Bearer ghu",
    );
    await gh.archiveRepo(repo);
    expect(m.calls.at(-1)?.body).toEqual({ archived: true });
  });

  it("maps API errors", async () => {
    const m = mockFetch([
      installationRoute(),
      ["GET", /\/commits\?/, () => status(500, { message: "boom" })],
    ]);
    const gh = new GitHubAppAccess({ app, installationId: 77, fetch: m.fetch });
    await expect(gh.listCommits(repo, { ref: "main" })).rejects.toMatchObject({
      name: "GitHubApiError",
      status: 500,
      message: "boom",
    });
  });
});
