import type { GitHubAccess, RepoRef } from "../github/types";
import { isDocumentPath } from "./site-files";

/**
 * A commit's document files (`openspace.json` + `content/…`), read from GitHub once per commit.
 *
 * GitHub reads are few by construction (`readFiles` with a filter: one tree call plus a GraphQL
 * query per ~100 files), and the result is cached in KV under the commit SHA — commits never
 * change, so every later load of the same version (Studio, Claude's tools, previews, forms)
 * costs no GitHub call at all. Caching is best effort: correctness never depends on it.
 */
export interface DocumentFilesCache {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

const SHA_RE = /^[0-9a-f]{40}$/;
/** KV values may be up to 25 MiB; documents far smaller than that are the norm. */
const MAX_CACHED_CHARS = 20 * 1024 * 1024;
const TTL_S = 30 * 24 * 3600;

export const documentFilesKey = (siteId: string, sha: string) => `docfiles/v1/${siteId}/${sha}`;

export async function readDocumentFiles(
  gh: GitHubAccess,
  repo: RepoRef,
  ref: string,
  options: { siteId: string; cache?: DocumentFilesCache | null | undefined },
): Promise<Record<string, string>> {
  const cache = SHA_RE.test(ref) ? options.cache : null;
  const key = documentFilesKey(options.siteId, ref);
  if (cache) {
    try {
      const hit = await cache.get(key, "json");
      if (hit && typeof hit === "object" && !Array.isArray(hit))
        return { ...(hit as Record<string, string>) };
    } catch {
      /* fall through to GitHub */
    }
  }
  const files = await gh.readFiles(repo, ref, { textOnly: true, filter: isDocumentPath });
  if (cache) {
    try {
      const text = JSON.stringify(files);
      if (text.length <= MAX_CACHED_CHARS) await cache.put(key, text, { expirationTtl: TTL_S });
    } catch {
      /* caching is best effort */
    }
  }
  return files;
}
