/**
 * Where a site's source files come from: a folder on disk (a checkout, the repository being
 * converted in place) or a GitHub repository read over the network (the tree API once, then raw
 * file downloads, which don't count against the API rate limit). Paths are repo-relative with
 * forward slashes, inside the site's source folder (`/docs` for Pages sites built from it).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import type { FetchFn } from "../fetch";

export interface RepoSource {
  /** For messages and the report: `owner/name` or a folder. */
  readonly label: string;
  /** Every file under the source root (repo-relative paths, no directories). */
  list(): Promise<string[]>;
  /** A file's bytes, or undefined when it doesn't exist. */
  read(path: string): Promise<Uint8Array | undefined>;
}

/** Folders that are never part of the site's source. */
const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".bundle",
  "vendor",
  ".jekyll-cache",
  ".sass-cache",
  "_site",
  ".cache",
  ".github",
  ".vscode",
  ".idea",
]);

const MAX_FILE = 25 * 1024 * 1024;
const MAX_FILES = 20_000;

/** A folder on disk. `root` is the source folder (e.g. `<checkout>/docs`). */
export function localRepoSource(root: string): RepoSource {
  const abs = resolve(root);
  let cached: Promise<string[]> | undefined;
  return {
    label: abs,
    list() {
      cached ??= (async () => {
        const out: string[] = [];
        const walk = async (dir: string) => {
          if (out.length >= MAX_FILES) return;
          let entries: import("node:fs").Dirent[];
          try {
            entries = await readdir(dir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const e of entries) {
            if (e.isDirectory()) {
              if (!SKIP_DIRS.has(e.name)) await walk(join(dir, e.name));
            } else if (e.isFile()) out.push(relative(abs, join(dir, e.name)).split(sep).join("/"));
          }
        };
        await walk(abs);
        return out.sort();
      })();
      return cached;
    },
    async read(path) {
      const p = resolve(abs, path);
      if (p !== abs && !p.startsWith(`${abs}${sep}`)) return undefined;
      try {
        if ((await stat(p)).size > MAX_FILE) return undefined;
        return new Uint8Array(await readFile(p));
      } catch {
        return undefined;
      }
    },
  };
}

export interface GitHubRepoRef {
  owner: string;
  repo: string;
  /** Branch, tag or SHA (default: the repository's default branch). */
  ref?: string;
  /** Source folder inside the repository (`docs`), default the root. */
  path?: string;
}

export interface GitHubSourceOptions extends GitHubRepoRef {
  fetch?: FetchFn;
  /** A token for the API (private repositories, higher rate limits). */
  token?: string;
  apiBase?: string;
  rawBase?: string;
}

export class GitHubSourceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GitHubSourceError";
  }
}

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
  defaultBranch: string;
  private: boolean;
  homepage?: string;
  /** Where GitHub Pages builds from (`/` or `/docs`, branch), when the API says. */
  pages?: { branch?: string; path?: string; url?: string; cname?: string; buildType?: string };
}

/** Repository metadata, and its Pages configuration when readable. */
export async function githubRepoInfo(opts: GitHubSourceOptions): Promise<GitHubRepoInfo> {
  const f = opts.fetch ?? ((u, i) => fetch(u, i));
  const api = opts.apiBase ?? "https://api.github.com";
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "OpenSpace-Importer",
    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
  };
  const res = await f(`${api}/repos/${opts.owner}/${opts.repo}`, { headers });
  if (res.status === 404)
    throw new GitHubSourceError(
      `Couldn't find the repository ${opts.owner}/${opts.repo}. Check the address; a private repository needs access (sign in with GitHub and install OpenSpace on it).`,
      404,
    );
  if (res.status === 403 || res.status === 429)
    throw new GitHubSourceError(
      "GitHub's rate limit was reached. Try again in an hour, or set GITHUB_TOKEN.",
      res.status,
    );
  if (!res.ok)
    throw new GitHubSourceError(`GitHub answered ${res.status} for ${opts.owner}/${opts.repo}.`);
  const body = (await res.json()) as {
    owner?: { login?: string };
    name?: string;
    default_branch?: string;
    private?: boolean;
    homepage?: string | null;
    has_pages?: boolean;
  };
  const info: GitHubRepoInfo = {
    owner: body.owner?.login ?? opts.owner,
    repo: body.name ?? opts.repo,
    defaultBranch: body.default_branch ?? "main",
    private: body.private === true,
    ...(body.homepage ? { homepage: body.homepage } : {}),
  };
  if (body.has_pages) {
    try {
      const p = await f(`${api}/repos/${info.owner}/${info.repo}/pages`, { headers });
      if (p.ok) {
        const pages = (await p.json()) as {
          html_url?: string;
          cname?: string | null;
          build_type?: string;
          source?: { branch?: string; path?: string };
        };
        info.pages = {
          ...(pages.source?.branch ? { branch: pages.source.branch } : {}),
          ...(pages.source?.path ? { path: pages.source.path } : {}),
          ...(pages.html_url ? { url: pages.html_url } : {}),
          ...(pages.cname ? { cname: pages.cname } : {}),
          ...(pages.build_type ? { buildType: pages.build_type } : {}),
        };
      }
    } catch {
      // The Pages API needs a token for some repositories; the importer guesses instead.
    }
  }
  return info;
}

/** A GitHub repository read over the network (tree API + raw downloads). */
export function githubRepoSource(opts: GitHubSourceOptions & { ref: string }): RepoSource {
  const f = opts.fetch ?? ((u, i) => fetch(u, i));
  const api = opts.apiBase ?? "https://api.github.com";
  const raw = opts.rawBase ?? "https://raw.githubusercontent.com";
  const prefix = (opts.path ?? "").replace(/^\/+|\/+$/g, "");
  const headers: Record<string, string> = {
    "user-agent": "OpenSpace-Importer",
    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
  };
  let tree: Promise<Map<string, number>> | undefined;
  const loadTree = () => {
    tree ??= (async () => {
      const res = await f(
        `${api}/repos/${opts.owner}/${opts.repo}/git/trees/${encodeURIComponent(opts.ref)}?recursive=1`,
        { headers: { ...headers, accept: "application/vnd.github+json" } },
      );
      if (!res.ok)
        throw new GitHubSourceError(
          `Couldn't list the files of ${opts.owner}/${opts.repo} (GitHub answered ${res.status}).`,
          res.status,
        );
      const body = (await res.json()) as {
        tree?: { path: string; type: string; size?: number }[];
        truncated?: boolean;
      };
      const out = new Map<string, number>();
      for (const e of body.tree ?? []) {
        if (e.type !== "blob") continue;
        let p = e.path;
        if (prefix) {
          if (!p.startsWith(`${prefix}/`)) continue;
          p = p.slice(prefix.length + 1);
        }
        if (p.split("/").some((seg) => SKIP_DIRS.has(seg))) continue;
        out.set(p, e.size ?? 0);
        if (out.size >= MAX_FILES) break;
      }
      return out;
    })();
    return tree;
  };
  return {
    label: `${opts.owner}/${opts.repo}${prefix ? `/${prefix}` : ""}`,
    async list() {
      return [...(await loadTree()).keys()].sort();
    },
    async read(path) {
      const files = await loadTree();
      const size = files.get(path);
      if (size === undefined || size > MAX_FILE) return undefined;
      const full = prefix ? `${prefix}/${path}` : path;
      const url = `${raw}/${opts.owner}/${opts.repo}/${encodeURIComponent(opts.ref)}/${full
        .split("/")
        .map(encodeURIComponent)
        .join("/")}`;
      const res = await f(url, { headers });
      if (!res.ok) return undefined;
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}

/** A source restricted to a sub-folder of another (Pages sites built from `/docs`). */
export function subSource(src: RepoSource, folder: string): RepoSource {
  const pre = folder.replace(/^\/+|\/+$/g, "");
  if (!pre) return src;
  return {
    label: `${src.label}/${pre}`,
    async list() {
      return (await src.list())
        .filter((p) => p.startsWith(`${pre}/`))
        .map((p) => p.slice(pre.length + 1));
    },
    read: (path) => src.read(`${pre}/${path}`),
  };
}

/** Text helper: UTF-8 decode (BOM stripped). */
export function decodeText(bytes: Uint8Array): string {
  const s = new TextDecoder("utf-8").decode(bytes);
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}
