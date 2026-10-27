import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { GitHubAppConfig } from "../src/env";
import { blobBatches, GitHubAppAccess, type InstallationTokenEntry } from "../src/github/app";
import { utf8ToBase64 } from "../src/lib/crypto";
import { documentFilesKey, readDocumentFiles } from "../src/services/document-files";
import { isDocumentPath } from "../src/services/site-files";
import { basicTemplate } from "../src/templates/basic";
import { call, devLogin } from "./helpers";
import { generateAppKey, pem } from "./keys";
import { mockFetch } from "./mock-fetch";

/**
 * Workers allow a limited number of subrequests per invocation (50 on Workers Free). A moved
 * shop or blog has hundreds of content files, so loading a site's document must cost a small,
 * constant number of GitHub calls — never one per file (wave 3 P0 "Too many subrequests").
 */

const HEAD = "c".repeat(40);
const repo = { owner: "maya", name: "maya-shop" };
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

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const pageId = (n: number) =>
  `pg_${Array.from({ length: 10 }, (_, i) => ALPHABET[Math.floor(n / ALPHABET.length ** i) % 32]).join("")}`;

/** The basic template plus `extra` content pages and 60 images (a moved shop or blog). */
function bigSite(extra: number): Record<string, string> {
  const files: Record<string, string> = { ...basicTemplate.files };
  for (let n = 0; n < extra; n++)
    files[`content/pages/p/item-${n}.json`] = `${JSON.stringify(
      { id: pageId(n + 1000), title: `Item ${n}`, slug: `p/item-${n}`, sections: [] },
      null,
      2,
    )}\n`;
  for (let n = 0; n < 60; n++) files[`media/img-${n}.png`] = "\u0089PNG binary";
  return files;
}

/** A GitHub API fake serving one repository at `HEAD`, counting every request. */
function fakeGitHub(files: Record<string, string>) {
  const entries = Object.entries(files).map(([path, content], i) => ({
    path,
    sha: (i + 1).toString(16).padStart(40, "0"),
    content,
  }));
  const bySha = new Map(entries.map((e) => [e.sha, e]));
  return mockFetch([
    [
      "POST",
      /^\/app\/installations\/77\/access_tokens$/,
      () => ({ token: "ghs_install", expires_at: "2099-01-01T00:00:00Z" }),
    ],
    ["GET", /\/git\/ref\/heads\/(main|os\/draft)$/, () => ({ object: { sha: HEAD } })],
    [
      "GET",
      new RegExp(`/git/trees/${HEAD}\\?recursive=1$`),
      () => ({
        truncated: false,
        tree: entries.map((e) => ({
          path: e.path,
          type: "blob",
          sha: e.sha,
          size: e.content.length,
        })),
      }),
    ],
    [
      "POST",
      /^\/graphql$/,
      (c) => {
        const query = (c.body as { query: string }).query;
        const repository: Record<string, unknown> = {};
        for (const m of query.matchAll(/(f\d+): object\(oid: "([0-9a-f]{40})"\)/g)) {
          const e = bySha.get(m[2] as string);
          const binary = e?.path.startsWith("media/") ?? false;
          repository[m[1] as string] = e
            ? { text: binary ? null : e.content, isBinary: binary, isTruncated: false }
            : null;
        }
        return { data: { repository } };
      },
    ],
    [
      "GET",
      /\/git\/blobs\/([0-9a-f]{40})$/,
      (_c, m) => ({
        encoding: "base64",
        content: utf8ToBase64(bySha.get(m[1] as string)?.content ?? ""),
      }),
    ],
  ]);
}

describe("loading a site's document costs a constant number of GitHub calls", () => {
  it("reads 200+ content files in one tree call and a few GraphQL queries (images skipped)", async () => {
    const files = bigSite(200);
    const gh = fakeGitHub(files);
    const access = new GitHubAppAccess({ app, installationId: 77, fetch: gh.fetch });
    const read = await access.readFiles(repo, HEAD, { textOnly: true, filter: isDocumentPath });
    const wanted = Object.keys(files).filter(isDocumentPath);
    expect(wanted.length).toBeGreaterThan(200);
    expect(Object.keys(read).sort()).toEqual(wanted.sort());
    expect(read["content/pages/p/item-7.json"]).toBe(files["content/pages/p/item-7.json"]);
    // token + tree + 3 GraphQL batches; no per-file blob reads.
    expect(gh.calls.length).toBeLessThanOrEqual(6);
    expect(gh.calls.filter((c) => c.path.includes("/git/blobs/"))).toHaveLength(0);
  });

  it("falls back to REST only for binary blobs when binaries are wanted", async () => {
    const gh = fakeGitHub({ "content/site.json": "{}", "media/a.png": "x" });
    const access = new GitHubAppAccess({ app, installationId: 77, fetch: gh.fetch });
    const all = await access.readFiles(repo, HEAD);
    expect(Object.keys(all).sort()).toEqual(["content/site.json", "media/a.png"]);
    expect(gh.calls.filter((c) => c.path.includes("/git/blobs/"))).toHaveLength(1);
  });

  it("batches by count and by size", () => {
    const sha = (n: number) => n.toString(16).padStart(40, "0");
    const many = Array.from({ length: 250 }, (_, n) => ({
      path: `p${n}`,
      sha: sha(n + 1),
      size: 10,
    }));
    expect(blobBatches(many).map((b) => b.length)).toEqual([100, 100, 50]);
    const big = Array.from({ length: 3 }, (_, n) => ({
      path: `b${n}`,
      sha: sha(n + 1),
      size: 3 * 1024 * 1024,
    }));
    expect(blobBatches(big).map((b) => b.length)).toEqual([1, 1, 1]);
    expect(blobBatches([{ path: "x", sha: 'bad") { x }' }])).toEqual([]);
  });

  it("caches a commit's document files: the next load makes no GitHub call", async () => {
    const files = bigSite(50);
    const gh = fakeGitHub(files);
    const access = new GitHubAppAccess({ app, installationId: 77, fetch: gh.fetch });
    const cache = env.CACHE as unknown as KVNamespace;
    await cache.delete(documentFilesKey("st_cachetest", HEAD));
    const first = await readDocumentFiles(access, repo, HEAD, { siteId: "st_cachetest", cache });
    const before = gh.calls.length;
    const second = await readDocumentFiles(access, repo, HEAD, { siteId: "st_cachetest", cache });
    expect(second).toEqual(first);
    expect(gh.calls.length).toBe(before);
  });

  it("GET /api/sites/:id/document on a 200-file site stays within ~10 subrequests", async () => {
    const files = bigSite(200);
    const gh = fakeGitHub(files);
    const tokens = new Map<number, InstallationTokenEntry>();
    const hub = createApp({
      services: {
        github: () =>
          new GitHubAppAccess({ app, installationId: 77, fetch: gh.fetch, tokenCache: tokens }),
      },
    });
    const cookie = await devLogin(hub, "Shop Owner");
    const me = (await (await call(hub, "/api/me", { cookie })).json()) as { user: { id: string } };
    const siteId = "st_bigshop0001";
    await env.HUB_DB.prepare(
      "INSERT INTO sites (id, owner_id, name, repo, template_id, template_version, installation_id, status, created_at, updated_at) VALUES (?, ?, 'Big shop', ?, 'basic', '1.0.0', 77, 'ready', 0, 0)",
    )
      .bind(siteId, me.user.id, `${repo.owner}/${repo.name}`)
      .run();
    await env.HUB_DB.prepare(
      "INSERT INTO site_roles (site_id, user_id, role, created_at) VALUES (?, ?, 'owner', 0)",
    )
      .bind(siteId, me.user.id)
      .run();
    await (env.CACHE as unknown as KVNamespace).delete(documentFilesKey(siteId, HEAD));

    const res = await call(hub, `/api/sites/${siteId}/document`, { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { document: { pages: Record<string, unknown> } };
    expect(Object.keys(body.document.pages).length).toBe(201);
    const firstLoad = gh.calls.length;
    expect(firstLoad).toBeLessThanOrEqual(10);

    // The same commit again: only the branch lookup, nothing per file.
    const again = await call(hub, `/api/sites/${siteId}/document`, { cookie });
    expect(again.status).toBe(200);
    expect(gh.calls.length - firstLoad).toBeLessThanOrEqual(2);
  });
});
