import { describe, expect, it } from "vitest";
import type { GitHubAccess } from "../src/github/types";
import { type DraftMediaCache, readDraftMedia } from "../src/services/draft-media";

/** Cache API stand-in (keys by URL, ignores TTLs). */
function memoryCache(): DraftMediaCache & { size: () => number } {
  const m = new Map<string, Response>();
  return {
    async match(k) {
      return m.get(k.url)?.clone();
    },
    async put(k, res) {
      m.set(k.url, res);
    },
    size: () => m.size,
  };
}

/** A GitHubAccess with just the reads the proxy uses, counting calls. */
function fakeGitHub(files: Record<string, { sha: string; bytes: Uint8Array }>, head = "c1") {
  const calls = { getRef: 0, readTree: 0, readFileBytes: 0 };
  const state = { head, files };
  const gh = {
    async getRef() {
      calls.getRef++;
      return state.head;
    },
    async readTree() {
      calls.readTree++;
      return Object.entries(state.files).map(([path, f]) => ({ path, sha: f.sha }));
    },
    async readFileBytes(_repo: unknown, path: string) {
      calls.readFileBytes++;
      return state.files[path]?.bytes ?? null;
    },
  } as unknown as GitHubAccess;
  return { gh, calls, state };
}

const repo = { owner: "maya", name: "yoga" };
const bytes = (n: number) => new Uint8Array([n, n, n]);

describe("draft media proxy reads", () => {
  it("resolves the head once, the tree once per commit and each blob once", async () => {
    const cache = memoryCache();
    const { gh, calls } = fakeGitHub({
      "media/a.jpg": { sha: "sha-a", bytes: bytes(1) },
      "media/b.jpg": { sha: "sha-b", bytes: bytes(2) },
    });
    expect(await readDraftMedia(gh, repo, "st_1", "media/a.jpg", cache)).toEqual(bytes(1));
    expect(await readDraftMedia(gh, repo, "st_1", "media/b.jpg", cache)).toEqual(bytes(2));
    expect(calls).toEqual({ getRef: 1, readTree: 1, readFileBytes: 2 });
    // Loading the page again costs no API calls at all.
    for (const p of ["media/a.jpg", "media/b.jpg", "media/a.jpg"])
      await readDraftMedia(gh, repo, "st_1", p, cache);
    expect(calls).toEqual({ getRef: 1, readTree: 1, readFileBytes: 2 });
  });

  it("finds a file uploaded after the head was cached (re-resolves once), shares blobs by sha", async () => {
    const cache = memoryCache();
    const { gh, calls, state } = fakeGitHub({ "media/a.jpg": { sha: "sha-a", bytes: bytes(1) } });
    await readDraftMedia(gh, repo, "st_1", "media/a.jpg", cache);
    state.head = "c2";
    state.files["media/new.jpg"] = { sha: "sha-a", bytes: bytes(1) };
    expect(await readDraftMedia(gh, repo, "st_1", "media/new.jpg", cache)).toEqual(bytes(1));
    // One more ref + tree; the bytes came from the blob cache (same content sha).
    expect(calls).toEqual({ getRef: 2, readTree: 2, readFileBytes: 1 });
    expect(await readDraftMedia(gh, repo, "st_1", "media/missing.jpg", cache)).toBeNull();
  });

  it("works without a cache", async () => {
    const { gh } = fakeGitHub({ "media/a.jpg": { sha: "sha-a", bytes: bytes(1) } });
    expect(await readDraftMedia(gh, repo, "st_1", "media/a.jpg", null)).toEqual(bytes(1));
  });
});
