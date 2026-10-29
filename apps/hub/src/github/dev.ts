import { base64ToBytes, sha1Hex } from "../lib/crypto";
import {
  type CollaboratorPermission,
  type CommitAuthor,
  type CommitFilesInput,
  type CommitInfo,
  type CommitTreeInput,
  type CreateRepoInput,
  type FileChange,
  type FileContent,
  type FileEncoding,
  type GitHubAccess,
  GitHubConflictError,
  GitHubInputError,
  GitHubNotFoundError,
  normalizeRef,
  type PagesInfo,
  type PullRequestInput,
  type ReadFilesOptions,
  type RepoInfo,
  type RepoRef,
  repoFullName,
  type TreeEntry,
  type WorkflowRun,
} from "./types";

/**
 * D1-backed GitHub emulation (Global Constraint 8). Semantics mirror Git closely enough for the
 * Hub: content-addressed blobs (git blob SHA-1), commits with full trees and parents, branches
 * and tags as refs, optimistic `expectedHead`, history. "Publishing" (workflow dispatch) records a
 * run that completes successfully at once, so a dev site goes live immediately.
 */

type Tree = Record<string, string>;

interface CommitRow {
  sha: string;
  repo: string;
  tree_json: string;
  parents_json: string;
  message: string;
  author_name: string;
  author_email: string | null;
  created_at: number;
}

/** A stable numeric "account id" for a dev owner login. */
export function devOwnerId(login: string): number {
  let h = 0;
  for (const ch of login.toLowerCase()) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return Math.abs(h) || 1;
}

interface RepoRow {
  rid?: number;
  full_name: string;
  owner: string;
  name: string;
  default_branch: string;
  private: number;
  archived: number;
  pages_enabled: number;
  pages_url: string | null;
  pages_domain: string | null;
}

export interface DevGitHubOptions {
  /** Where a dev repo's "Pages" site is served (the Hub's /s/:siteId preview). */
  pagesUrl?: (repo: RepoRef) => Promise<string> | string;
  /** Base for fake html URLs. */
  htmlBase?: string;
  /** Clock (tests). */
  now?: () => number;
  /** Author used when a commit names none. */
  defaultAuthor?: CommitAuthor;
  /**
   * What a dispatched workflow does in dev mode, by file name (the hosted import's workflow
   * commits an emulated import). Workflows without a runner succeed at once (publishing).
   */
  runners?: Record<string, DevWorkflowRunner>;
}

/** Emulates one workflow run; returns the conclusion (and failure details for `failedRun`). */
export type DevWorkflowRunner = (
  gh: DevGitHubAccess,
  repo: RepoRef,
  input: { workflow: string; ref: string; inputs?: Record<string, string> },
) => Promise<{ conclusion: "success" | "failure"; failedStep?: string; failedLog?: string }>;

const SHA_RE = /^[0-9a-f]{40}$/;
const enc = new TextEncoder();

function key(repo: RepoRef): string {
  return repoFullName(repo).toLowerCase();
}

/** Git blob id: sha1("blob <len>\0" + bytes). */
export async function gitBlobSha(
  content: string,
  encoding: FileEncoding = "utf-8",
): Promise<string> {
  const bytes = encoding === "base64" ? base64ToBytes(content) : enc.encode(content);
  const header = enc.encode(`blob ${bytes.length}\0`);
  const buf = new Uint8Array(header.length + bytes.length);
  buf.set(header, 0);
  buf.set(bytes, header.length);
  return sha1Hex(buf);
}

function validPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= 1024 &&
    !path.startsWith("/") &&
    !path.split("/").some((seg) => seg === "" || seg === "." || seg === "..")
  );
}

export class DevGitHubAccess implements GitHubAccess {
  readonly kind = "dev" as const;
  private readonly now: () => number;

  constructor(
    private readonly db: D1Database,
    private readonly options: DevGitHubOptions = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  // --- repos ----------------------------------------------------------------------------------

  private toInfo(row: RepoRow): RepoInfo {
    return {
      owner: row.owner,
      name: row.name,
      fullName: `${row.owner}/${row.name}`,
      defaultBranch: row.default_branch,
      htmlUrl: `${this.options.htmlBase ?? "https://github.dev.invalid"}/${row.owner}/${row.name}`,
      private: row.private === 1,
      archived: row.archived === 1,
      // SQLite's rowid survives renames/transfers like GitHub's repository id.
      ...(typeof row.rid === "number" ? { id: row.rid } : {}),
      ownerId: devOwnerId(row.owner),
    };
  }

  private async repoRow(repo: RepoRef): Promise<RepoRow | null> {
    return this.db
      .prepare("SELECT rowid AS rid, * FROM dev_repos WHERE full_name = ?")
      .bind(key(repo))
      .first<RepoRow>();
  }

  private async requireRepo(repo: RepoRef): Promise<RepoRow> {
    const row = await this.repoRow(repo);
    if (!row) throw new GitHubNotFoundError(`Repository ${repoFullName(repo)} not found`);
    return row;
  }

  async getRepo(repo: RepoRef): Promise<RepoInfo | null> {
    const row = await this.repoRow(repo);
    return row ? this.toInfo(row) : null;
  }

  async createRepoFromTemplate(input: CreateRepoInput): Promise<{ repo: RepoInfo; head: string }> {
    const ref = { owner: input.owner, name: input.name };
    if (await this.repoRow(ref))
      throw new GitHubConflictError(`Repository ${repoFullName(ref)} already exists`);
    await this.db
      .prepare(
        "INSERT INTO dev_repos (full_name, owner, name, description, private, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        key(ref),
        input.owner,
        input.name,
        input.description ?? null,
        input.private ? 1 : 0,
        this.now(),
      )
      .run();

    let files: Record<string, string | FileContent> = input.files ?? {};
    if (input.template) {
      const tpl = await this.requireRepo(input.template);
      const head = await this.getRef(input.template, tpl.default_branch);
      if (head) {
        const tree = (await this.commitRow(key(input.template), head))?.tree ?? {};
        const copied: Record<string, FileContent> = {};
        for (const [path, sha] of Object.entries(tree)) {
          const blob = await this.blob(sha);
          if (blob) copied[path] = blob;
        }
        files = { ...copied, ...files };
      }
    }
    const changes: FileChange[] = Object.entries(files).map(([path, v]) =>
      typeof v === "string"
        ? { path, content: v }
        : { path, content: v.content, encoding: v.encoding ?? "utf-8" },
    );
    const commit = await this.writeCommit(ref, {
      parents: [],
      base: {},
      changes,
      message: input.message ?? "Initial commit",
      author: input.author,
    });
    await this.setRef(ref, "refs/heads/main", commit.sha);
    return { repo: this.toInfo(await this.requireRepo(ref)), head: commit.sha };
  }

  async archiveRepo(repo: RepoRef): Promise<void> {
    await this.requireRepo(repo);
    await this.db
      .prepare("UPDATE dev_repos SET archived = 1 WHERE full_name = ?")
      .bind(key(repo))
      .run();
  }

  async transferRepo(repo: RepoRef, newOwner: string): Promise<RepoInfo> {
    const row = await this.requireRepo(repo);
    const to = { owner: newOwner, name: row.name };
    if (await this.repoRow(to))
      throw new GitHubConflictError(`Repository ${repoFullName(to)} already exists`);
    const from = key(repo);
    const dest = key(to);
    await this.db.batch([
      this.db
        .prepare("UPDATE dev_repos SET full_name = ?, owner = ? WHERE full_name = ?")
        .bind(dest, newOwner, from),
      this.db.prepare("UPDATE dev_commits SET repo = ? WHERE repo = ?").bind(dest, from),
      this.db.prepare("UPDATE dev_refs SET repo = ? WHERE repo = ?").bind(dest, from),
      this.db.prepare("UPDATE dev_workflow_runs SET repo = ? WHERE repo = ?").bind(dest, from),
      this.db.prepare("UPDATE dev_secrets SET repo = ? WHERE repo = ?").bind(dest, from),
      this.db.prepare("UPDATE dev_variables SET repo = ? WHERE repo = ?").bind(dest, from),
      this.db.prepare("UPDATE dev_collaborators SET repo = ? WHERE repo = ?").bind(dest, from),
      this.db.prepare("UPDATE dev_pull_requests SET repo = ? WHERE repo = ?").bind(dest, from),
    ]);
    return this.toInfo(await this.requireRepo(to));
  }

  // --- refs and commits -----------------------------------------------------------------------

  private refName(ref: string): string {
    const r = normalizeRef(ref);
    return r.kind === "tag" ? `refs/tags/${r.name}` : `refs/heads/${r.name}`;
  }

  async getRef(repo: RepoRef, ref: string): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT sha FROM dev_refs WHERE repo = ? AND ref = ?")
      .bind(key(repo), this.refName(ref))
      .first<{ sha: string }>();
    return row?.sha ?? null;
  }

  private async setRef(repo: RepoRef, ref: string, sha: string): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO dev_refs (repo, ref, sha) VALUES (?, ?, ?) ON CONFLICT (repo, ref) DO UPDATE SET sha = excluded.sha",
      )
      .bind(key(repo), ref, sha)
      .run();
  }

  /** Resolve a branch, tag or commit SHA to a commit SHA. */
  private async resolve(repo: RepoRef, ref: string): Promise<string> {
    const sha = await this.getRef(repo, ref);
    if (sha) return sha;
    if (SHA_RE.test(ref) && (await this.commitRow(key(repo), ref))) return ref;
    throw new GitHubNotFoundError(`Ref ${ref} not found in ${repoFullName(repo)}`);
  }

  private async commitRow(
    repo: string,
    sha: string,
  ): Promise<{ row: CommitRow; tree: Tree; parents: string[] } | null> {
    const row = await this.db
      .prepare("SELECT * FROM dev_commits WHERE repo = ? AND sha = ?")
      .bind(repo, sha)
      .first<CommitRow>();
    if (!row) return null;
    return { row, tree: JSON.parse(row.tree_json) as Tree, parents: JSON.parse(row.parents_json) };
  }

  private toCommit(row: CommitRow): CommitInfo {
    return {
      sha: row.sha,
      message: row.message,
      author: row.author_email
        ? { name: row.author_name, email: row.author_email }
        : { name: row.author_name },
      date: new Date(row.created_at).toISOString(),
      parents: JSON.parse(row.parents_json) as string[],
    };
  }

  private async blob(sha: string): Promise<FileContent | null> {
    const row = await this.db
      .prepare("SELECT content, encoding FROM dev_files WHERE sha = ?")
      .bind(sha)
      .first<{ content: string; encoding: FileEncoding }>();
    return row ? { content: row.content, encoding: row.encoding } : null;
  }

  /** Store blobs, compute the new tree and write the commit object (does not move refs). */
  private async writeCommit(
    repo: RepoRef,
    input: {
      parents: string[];
      base: Tree;
      changes: FileChange[];
      message: string;
      author?: CommitAuthor | undefined;
      tree?: Tree;
    },
  ): Promise<CommitInfo> {
    const tree: Tree = input.tree ? { ...input.tree } : { ...input.base };
    const blobInserts: D1PreparedStatement[] = [];
    for (const change of input.changes) {
      if (!validPath(change.path))
        throw new GitHubInputError(`Invalid file path ${JSON.stringify(change.path)}`);
      if (change.content === null) {
        delete tree[change.path];
        continue;
      }
      const encoding = change.encoding ?? "utf-8";
      const sha = await gitBlobSha(change.content, encoding);
      tree[change.path] = sha;
      const size =
        encoding === "base64"
          ? base64ToBytes(change.content).length
          : enc.encode(change.content).length;
      blobInserts.push(
        this.db
          .prepare(
            "INSERT INTO dev_files (sha, encoding, content, size) VALUES (?, ?, ?, ?) ON CONFLICT (sha) DO NOTHING",
          )
          .bind(sha, encoding, change.content, size),
      );
    }
    const sorted: Tree = {};
    for (const p of Object.keys(tree).sort()) sorted[p] = tree[p] as string;
    const author = input.author ?? this.options.defaultAuthor ?? { name: "OpenSpace" };
    const at = this.now();
    const treeJson = JSON.stringify(sorted);
    const parentsJson = JSON.stringify(input.parents);
    const sha = await sha1Hex(
      `commit\0${treeJson}\0${parentsJson}\0${author.name} <${author.email ?? ""}>\0${at}\0${input.message}\0${crypto.randomUUID()}`,
    );
    await this.db.batch([
      ...blobInserts,
      this.db
        .prepare(
          "INSERT INTO dev_commits (sha, repo, tree_json, parents_json, message, author_name, author_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          sha,
          key(repo),
          treeJson,
          parentsJson,
          input.message,
          author.name,
          author.email ?? null,
          at,
        ),
    ]);
    return {
      sha,
      message: input.message,
      author,
      date: new Date(at).toISOString(),
      parents: input.parents,
    };
  }

  /** Move `branch` from `expected` to `sha` atomically (compare-and-swap on the ref row). */
  private async advance(repo: RepoRef, branch: string, expected: string | null, sha: string) {
    const ref = this.refName(branch);
    const res = expected
      ? await this.db
          .prepare("UPDATE dev_refs SET sha = ? WHERE repo = ? AND ref = ? AND sha = ?")
          .bind(sha, key(repo), ref, expected)
          .run()
      : await this.db
          .prepare("INSERT INTO dev_refs (repo, ref, sha) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
          .bind(key(repo), ref, sha)
          .run();
    if (res.meta.changes !== 1)
      throw new GitHubConflictError(
        `Branch ${branch} moved while committing`,
        await this.getRef(repo, branch),
      );
  }

  private async checkHead(repo: RepoRef, branch: string, expectedHead: string | undefined) {
    const head = await this.getRef(repo, branch);
    if (expectedHead !== undefined && head !== expectedHead)
      throw new GitHubConflictError(
        `Branch ${branch} is at ${head ?? "nothing"}, expected ${expectedHead}`,
        head,
      );
    return head;
  }

  async commitFiles(repo: RepoRef, input: CommitFilesInput): Promise<CommitInfo> {
    await this.requireRepo(repo);
    const head = await this.checkHead(repo, input.branch, input.expectedHead);
    if (!head) throw new GitHubNotFoundError(`Branch ${input.branch} not found`);
    const base = (await this.commitRow(key(repo), head))?.tree ?? {};
    const commit = await this.writeCommit(repo, {
      parents: [head],
      base,
      changes: input.files,
      message: input.message,
      author: input.author,
    });
    await this.advance(repo, input.branch, head, commit.sha);
    return commit;
  }

  async commitTree(repo: RepoRef, input: CommitTreeInput): Promise<CommitInfo> {
    await this.requireRepo(repo);
    const head = await this.checkHead(repo, input.branch, input.expectedHead);
    if (!head) throw new GitHubNotFoundError(`Branch ${input.branch} not found`);
    const source = await this.resolve(repo, input.treeOf);
    const from = (await this.commitRow(key(repo), source))?.tree ?? {};
    let tree = from;
    if (input.onlyPaths) {
      const only = input.onlyPaths;
      const current = (await this.commitRow(key(repo), head))?.tree ?? {};
      tree = Object.fromEntries([
        ...Object.entries(current).filter(([p]) => !only(p)),
        ...Object.entries(from).filter(([p]) => only(p)),
      ]) as typeof from;
    }
    const commit = await this.writeCommit(repo, {
      parents: [head],
      base: {},
      tree,
      changes: [],
      message: input.message,
      author: input.author,
    });
    await this.advance(repo, input.branch, head, commit.sha);
    return commit;
  }

  async createBranch(repo: RepoRef, branch: string, sha: string): Promise<void> {
    await this.requireRepo(repo);
    if (!(await this.commitRow(key(repo), sha)))
      throw new GitHubNotFoundError(`Commit ${sha} not found`);
    if (await this.getRef(repo, branch))
      throw new GitHubConflictError(`Branch ${branch} already exists`);
    await this.setRef(repo, this.refName(branch), sha);
  }

  async resetBranch(repo: RepoRef, branch: string, sha: string): Promise<void> {
    await this.requireRepo(repo);
    const target = await this.resolve(repo, sha);
    await this.setRef(repo, this.refName(branch), target);
    // Like GitHub: a pull request whose head is moved onto its base's commit has nothing left
    // to merge and is closed (for good: it can't be reopened or merged).
    const prs = await this.db
      .prepare(
        "SELECT number, base FROM dev_pull_requests WHERE repo = ? AND head = ? AND state = 'open'",
      )
      .bind(key(repo), branch)
      .all<{ number: number; base: string }>();
    for (const pr of prs.results)
      if ((await this.getRef(repo, pr.base)) === target)
        await this.db
          .prepare("UPDATE dev_pull_requests SET state = 'closed' WHERE repo = ? AND number = ?")
          .bind(key(repo), pr.number)
          .run();
  }

  async tag(repo: RepoRef, name: string, sha: string): Promise<void> {
    await this.requireRepo(repo);
    const target = await this.resolve(repo, sha);
    const ref = `refs/tags/${name}`;
    const existing = await this.getRef(repo, `tags/${name}`);
    if (existing) throw new GitHubConflictError(`Tag ${name} already exists`, existing);
    await this.setRef(repo, ref, target);
  }

  async listTags(repo: RepoRef, prefix = ""): Promise<Array<{ name: string; sha: string }>> {
    await this.requireRepo(repo);
    const res = await this.db
      .prepare("SELECT ref, sha FROM dev_refs WHERE repo = ? AND ref LIKE ? ORDER BY ref")
      .bind(key(repo), `refs/tags/${prefix.replace(/[%_]/g, "")}%`)
      .all<{ ref: string; sha: string }>();
    return res.results.map((r) => ({ name: r.ref.slice("refs/tags/".length), sha: r.sha }));
  }

  async listCommits(
    repo: RepoRef,
    options: { ref: string; limit?: number; path?: string },
  ): Promise<CommitInfo[]> {
    await this.requireRepo(repo);
    const limit = options.limit ?? 30;
    const out: CommitInfo[] = [];
    let sha: string | undefined = await this.resolve(repo, options.ref);
    while (sha && out.length < limit) {
      const c = await this.commitRow(key(repo), sha);
      if (!c) break;
      const parent = c.parents[0];
      if (options.path) {
        const p = options.path;
        const parentTree = parent ? ((await this.commitRow(key(repo), parent))?.tree ?? {}) : {};
        const touched = (t: Tree) =>
          Object.entries(t).filter(([k]) => k === p || k.startsWith(`${p.replace(/\/$/, "")}/`));
        const a = JSON.stringify(touched(c.tree));
        const b = JSON.stringify(touched(parentTree));
        if (a !== b) out.push(this.toCommit(c.row));
      } else out.push(this.toCommit(c.row));
      sha = parent;
    }
    return out;
  }

  // --- reading --------------------------------------------------------------------------------

  private async treeAt(repo: RepoRef, ref: string): Promise<Tree> {
    await this.requireRepo(repo);
    const sha = await this.resolve(repo, ref);
    return (await this.commitRow(key(repo), sha))?.tree ?? {};
  }

  async readTree(repo: RepoRef, ref: string): Promise<TreeEntry[]> {
    const tree = await this.treeAt(repo, ref);
    return Object.entries(tree).map(([path, sha]) => ({ path, sha }));
  }

  async readFile(repo: RepoRef, path: string, ref: string): Promise<string | null> {
    const tree = await this.treeAt(repo, ref);
    const sha = tree[path];
    if (!sha) return null;
    return (await this.blob(sha))?.content ?? null;
  }

  async readFileBytes(repo: RepoRef, path: string, ref: string): Promise<Uint8Array | null> {
    const tree = await this.treeAt(repo, ref);
    const sha = tree[path];
    const blob = sha ? await this.blob(sha) : null;
    if (!blob) return null;
    if (blob.encoding === "base64")
      return Uint8Array.from(atob(blob.content), (ch) => ch.charCodeAt(0));
    return new TextEncoder().encode(blob.content);
  }

  async readFiles(
    repo: RepoRef,
    ref: string,
    options: ReadFilesOptions = {},
  ): Promise<Record<string, string>> {
    const tree = await this.treeAt(repo, ref);
    const wanted = Object.entries(tree).filter(
      ([p]) =>
        (!options.prefix || p.startsWith(options.prefix)) && (!options.filter || options.filter(p)),
    );
    const out: Record<string, string> = {};
    // D1 caps bound parameters per statement; fetch blobs in chunks.
    for (let i = 0; i < wanted.length; i += 50) {
      const chunk = wanted.slice(i, i + 50);
      const shas = [...new Set(chunk.map(([, s]) => s))];
      const rows = await this.db
        .prepare(
          `SELECT sha, content, encoding FROM dev_files WHERE sha IN (${shas.map(() => "?").join(",")})`,
        )
        .bind(...shas)
        .all<{ sha: string; content: string; encoding: FileEncoding }>();
      const bySha = new Map(rows.results.map((r) => [r.sha, r]));
      for (const [path, sha] of chunk) {
        const r = bySha.get(sha);
        if (!r) continue;
        if (options.textOnly && r.encoding !== "utf-8") continue;
        out[path] = r.content;
      }
    }
    return out;
  }

  // --- pages, workflows, secrets, collaborators, PRs ------------------------------------------

  async enablePages(repo: RepoRef): Promise<{ url: string }> {
    const row = await this.requireRepo(repo);
    const url =
      (await this.options.pagesUrl?.(repo)) ??
      row.pages_url ??
      `${this.options.htmlBase ?? "https://github.dev.invalid"}/${row.owner}/${row.name}/pages/`;
    await this.db
      .prepare("UPDATE dev_repos SET pages_enabled = 1, pages_url = ? WHERE full_name = ?")
      .bind(url, key(repo))
      .run();
    return { url };
  }

  async setPagesDomain(repo: RepoRef, domain: string | null): Promise<void> {
    await this.requireRepo(repo);
    await this.db
      .prepare("UPDATE dev_repos SET pages_domain = ? WHERE full_name = ?")
      .bind(domain, key(repo))
      .run();
  }

  async getPages(repo: RepoRef): Promise<PagesInfo | null> {
    const row = await this.requireRepo(repo);
    if (!row.pages_enabled) return null;
    const https = await this.db
      .prepare("SELECT pages_https FROM dev_repos WHERE full_name = ?")
      .bind(key(repo))
      .first<{ pages_https: number | null }>();
    return {
      url: row.pages_url,
      cname: row.pages_domain,
      httpsEnforced: https?.pages_https === 1,
      // Dev: the "certificate" is issued as soon as a domain is set.
      certificate: row.pages_domain ? "approved" : "none",
    };
  }

  async setPagesHttps(repo: RepoRef, enforced: boolean): Promise<void> {
    await this.requireRepo(repo);
    await this.db
      .prepare("UPDATE dev_repos SET pages_https = ? WHERE full_name = ?")
      .bind(enforced ? 1 : 0, key(repo))
      .run();
  }

  async dispatchWorkflow(
    repo: RepoRef,
    input: { workflow: string; ref: string; inputs?: Record<string, string> },
  ): Promise<void> {
    await this.requireRepo(repo);
    const sha = await this.resolve(repo, input.ref);
    // Dev "publishing" is instant: the run completes successfully as soon as it is dispatched.
    const runner = this.options.runners?.[input.workflow];
    const outcome = runner ? await runner(this, repo, input) : { conclusion: "success" as const };
    const now = this.now();
    const details =
      outcome.conclusion === "failure"
        ? { failedStep: outcome.failedStep, failedLog: outcome.failedLog }
        : {};
    await this.db
      .prepare(
        "INSERT INTO dev_workflow_runs (repo, workflow, ref, head_sha, inputs_json, status, conclusion, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?)",
      )
      .bind(
        key(repo),
        input.workflow,
        normalizeRef(input.ref).name,
        sha,
        JSON.stringify({ ...(input.inputs ?? {}), ...details }),
        outcome.conclusion,
        now,
        now,
      )
      .run();
  }

  async workflowStatus(
    repo: RepoRef,
    input: { workflow: string; ref?: string },
  ): Promise<WorkflowRun> {
    await this.requireRepo(repo);
    const row = input.ref
      ? await this.db
          .prepare(
            "SELECT * FROM dev_workflow_runs WHERE repo = ? AND workflow = ? AND ref = ? ORDER BY id DESC LIMIT 1",
          )
          .bind(key(repo), input.workflow, normalizeRef(input.ref).name)
          .first<{
            status: string;
            conclusion: string | null;
            head_sha: string | null;
            updated_at: number;
          }>()
      : await this.db
          .prepare(
            "SELECT * FROM dev_workflow_runs WHERE repo = ? AND workflow = ? ORDER BY id DESC LIMIT 1",
          )
          .bind(key(repo), input.workflow)
          .first<{
            status: string;
            conclusion: string | null;
            head_sha: string | null;
            updated_at: number;
          }>();
    if (!row) return { state: "none" };
    const runId = (row as { id?: number }).id;
    const state =
      row.status === "completed"
        ? row.conclusion === "success"
          ? "success"
          : "failure"
        : row.status === "queued"
          ? "queued"
          : "in_progress";
    return {
      state,
      ...(typeof runId === "number" ? { id: runId } : {}),
      ...(row.head_sha ? { sha: row.head_sha } : {}),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async setSecret(repo: RepoRef, name: string, _value: string): Promise<void> {
    await this.requireRepo(repo);
    // Like GitHub, the value is write-only; dev mode doesn't even keep it.
    await this.db
      .prepare(
        "INSERT INTO dev_secrets (repo, name, updated_at) VALUES (?, ?, ?) ON CONFLICT (repo, name) DO UPDATE SET updated_at = excluded.updated_at",
      )
      .bind(key(repo), name, this.now())
      .run();
  }

  /** A stable per-repo 32-byte "public key" (dev values are never decrypted or kept). */
  async secretsPublicKey(repo: RepoRef): Promise<{ keyId: string; key: string }> {
    await this.requireRepo(repo);
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`dev-secrets:${key(repo)}`)),
    );
    let bin = "";
    for (const b of digest) bin += String.fromCharCode(b);
    return { keyId: `dev-${key(repo).length}${digest[0]}`, key: btoa(bin) };
  }

  async putSealedSecret(
    repo: RepoRef,
    name: string,
    _encryptedValue: string,
    keyId: string,
  ): Promise<void> {
    if (keyId !== (await this.secretsPublicKey(repo)).keyId)
      throw new GitHubConflictError("The secrets key changed");
    await this.setSecret(repo, name, "");
  }

  async listSecretNames(repo: RepoRef): Promise<string[]> {
    await this.requireRepo(repo);
    const res = await this.db
      .prepare("SELECT name FROM dev_secrets WHERE repo = ? ORDER BY name")
      .bind(key(repo))
      .all<{ name: string }>();
    return res.results.map((r) => r.name);
  }

  async setVariable(repo: RepoRef, name: string, value: string): Promise<void> {
    await this.requireRepo(repo);
    await this.db
      .prepare(
        "INSERT INTO dev_variables (repo, name, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (repo, name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      )
      .bind(key(repo), name, value, this.now())
      .run();
  }

  async getVariable(repo: RepoRef, name: string): Promise<string | null> {
    await this.requireRepo(repo);
    const row = await this.db
      .prepare("SELECT value FROM dev_variables WHERE repo = ? AND name = ?")
      .bind(key(repo), name)
      .first<{ value: string }>();
    return row?.value ?? null;
  }

  async addCollaborator(
    repo: RepoRef,
    login: string,
    permission: CollaboratorPermission = "push",
  ): Promise<void> {
    await this.requireRepo(repo);
    await this.db
      .prepare(
        "INSERT INTO dev_collaborators (repo, login, permission) VALUES (?, ?, ?) ON CONFLICT (repo, login) DO UPDATE SET permission = excluded.permission",
      )
      .bind(key(repo), login, permission)
      .run();
  }

  async removeCollaborator(repo: RepoRef, login: string): Promise<void> {
    await this.requireRepo(repo);
    await this.db
      .prepare("DELETE FROM dev_collaborators WHERE repo = ? AND login = ? COLLATE NOCASE")
      .bind(key(repo), login)
      .run();
  }

  async failedRun(_repo: RepoRef, runId: number): Promise<{ steps: string[]; log: string }> {
    const row = await this.db
      .prepare("SELECT inputs_json FROM dev_workflow_runs WHERE id = ?")
      .bind(runId)
      .first<{ inputs_json: string | null }>();
    try {
      const inputs = JSON.parse(row?.inputs_json ?? "{}") as {
        failedStep?: string;
        failedLog?: string;
      };
      return {
        steps: inputs.failedStep ? [inputs.failedStep] : [],
        log: inputs.failedLog ?? "",
      };
    } catch {
      return { steps: [], log: "" };
    }
  }

  async openPullRequest(
    repo: RepoRef,
    input: PullRequestInput,
  ): Promise<{ number: number; url: string }> {
    const row = await this.requireRepo(repo);
    await this.resolve(repo, input.head);
    await this.resolve(repo, input.base);
    const last = await this.db
      .prepare("SELECT MAX(number) AS n FROM dev_pull_requests WHERE repo = ?")
      .bind(key(repo))
      .first<{ n: number | null }>();
    const number = (last?.n ?? 0) + 1;
    await this.db
      .prepare(
        "INSERT INTO dev_pull_requests (repo, number, head, base, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(key(repo), number, input.head, input.base, input.title, input.body ?? null, this.now())
      .run();
    return { number, url: `${this.toInfo(row).htmlUrl}/pull/${number}` };
  }

  async mergePullRequest(
    repo: RepoRef,
    number: number,
    input: { title: string; sha?: string },
  ): Promise<{ sha: string }> {
    const pr = await this.db
      .prepare("SELECT head, base, state FROM dev_pull_requests WHERE repo = ? AND number = ?")
      .bind(key(repo), number)
      .first<{ head: string; base: string; state: string }>();
    if (!pr) throw new GitHubNotFoundError(`Pull request #${number} not found`);
    if (pr.state !== "open")
      throw new GitHubConflictError(`Pull request #${number} is ${pr.state}`);
    const headSha = await this.resolve(repo, pr.head);
    if (input.sha && input.sha !== headSha)
      throw new GitHubConflictError("Pull request head moved", headSha);
    // Squash: one commit on the base whose tree is the head's tree.
    const commit = await this.commitTree(repo, {
      branch: pr.base,
      treeOf: headSha,
      message: input.title,
    });
    await this.db
      .prepare("UPDATE dev_pull_requests SET state = 'merged' WHERE repo = ? AND number = ?")
      .bind(key(repo), number)
      .run();
    return { sha: commit.sha };
  }
}
