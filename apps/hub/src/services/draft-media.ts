import { DRAFT_BRANCH, type GitHubAccess, MAIN_BRANCH, type RepoRef } from "../github/types";

/**
 * Draft media bytes for Studio (`GET /api/sites/:id/media/*`), cheap on the GitHub API:
 *
 * - **draft head**: resolved once per short window (`REF_TTL_S`) per site, so a canvas page load
 *   of N images shares one ref lookup;
 * - **path → blob sha**: the media part of the tree at that commit, cached by commit sha
 *   (immutable);
 * - **bytes**: cached by blob sha (immutable, content-addressed).
 *
 * Repeated loads of unchanged files therefore cost no API calls. A file missing from a cached
 * head (just uploaded) re-resolves the head once. Cached in the Workers Cache API (a no-op on
 * `*.workers.dev`; effective on a custom domain), so correctness never depends on it.
 */
export const REF_TTL_S = 15;
const ORIGIN = "https://draft-media.openspace.internal";

export interface DraftMediaCache {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, res: Response): Promise<void>;
}

function defaultCache(): DraftMediaCache | null {
  try {
    return (
      (globalThis as unknown as { caches?: { default?: DraftMediaCache } }).caches?.default ?? null
    );
  } catch {
    return null;
  }
}

const key = (path: string) => new Request(`${ORIGIN}/${path}`);

async function get(cache: DraftMediaCache | null, k: string): Promise<Response | undefined> {
  if (!cache) return undefined;
  try {
    return await cache.match(key(k));
  } catch {
    return undefined;
  }
}

async function put(cache: DraftMediaCache | null, k: string, body: BodyInit, maxAge: number) {
  if (!cache) return;
  try {
    await cache.put(
      key(k),
      new Response(body, { headers: { "Cache-Control": `public, max-age=${maxAge}` } }),
    );
  } catch {
    /* caching is best effort */
  }
}

export async function readDraftMedia(
  gh: GitHubAccess,
  repo: RepoRef,
  siteId: string,
  path: string,
  cache: DraftMediaCache | null = defaultCache(),
): Promise<Uint8Array | null> {
  const resolveHead = async (): Promise<string | null> => {
    const head = (await gh.getRef(repo, DRAFT_BRANCH)) ?? (await gh.getRef(repo, MAIN_BRANCH));
    if (head) await put(cache, `ref/${siteId}`, head, REF_TTL_S);
    return head;
  };
  const blobShaAt = async (head: string): Promise<string | null> => {
    const k = `tree/${siteId}/${head}`;
    const hit = await get(cache, k);
    let tree: Record<string, string>;
    if (hit) tree = (await hit.json()) as Record<string, string>;
    else {
      tree = {};
      for (const e of await gh.readTree(repo, head))
        if (e.path.startsWith("media/")) tree[e.path] = e.sha;
      await put(cache, k, JSON.stringify(tree), 31_536_000);
    }
    return tree[path] ?? null;
  };

  const cachedHead = await (await get(cache, `ref/${siteId}`))?.text();
  let head = cachedHead || (await resolveHead());
  if (!head) return null;
  let sha = await blobShaAt(head);
  if (!sha && cachedHead) {
    // Uploaded since the head was cached: look again once.
    head = await resolveHead();
    if (!head) return null;
    sha = await blobShaAt(head);
  }
  if (!sha) return null;

  const hit = await get(cache, `blob/${sha}`);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const bytes = await gh.readFileBytes(repo, path, head);
  if (bytes) await put(cache, `blob/${sha}`, bytes, 31_536_000);
  return bytes;
}
