import type { GitHubAppConfig } from "../env";
import { base64ToBytes, utf8ToBase64 } from "../lib/crypto";
import { type FetchLike, GITHUB_API, githubRequest } from "./http";
import { createAppJwt } from "./jwt";
import { encryptGitHubSecret } from "./sealed-box";
import {
  type CollaboratorPermission,
  type CommitAuthor,
  type CommitFilesInput,
  type CommitInfo,
  type CommitTreeInput,
  type CreateRepoInput,
  type GitHubAccess,
  GitHubApiError,
  GitHubConflictError,
  GitHubNotFoundError,
  normalizeRef,
  type PullRequestInput,
  type RepoInfo,
  type RepoRef,
  type TreeEntry,
  type WorkflowRun,
  type WorkflowState,
} from "./types";

/**
 * Real GitHub access (arch §6): REST + GraphQL via fetch.
 *
 * Tokens: installation tokens (minted per instance from the App JWT, 1-hour expiry) for
 * server-side work on repos the App is installed on; the person's user token (8-hour, refreshed
 * by the caller) for things only a user can do — creating a repo in their account, transfers —
 * and as a fallback when no installation covers the repo (Spike S1, option 4).
 */
export interface GitHubAppAccessOptions {
  app: GitHubAppConfig;
  installationId?: number | null;
  /** Lazily provides a valid user access token (refreshing it if needed). */
  userToken?: () => Promise<string | null>;
  /** The signed-in user's login (to choose /user/repos vs /orgs/{org}/repos). */
  userLogin?: string;
  fetch?: FetchLike;
  apiBase?: string;
  now?: () => number;
  /** Polls for a freshly created repo's first commit. */
  pollDelayMs?: number;
}

interface RestRepo {
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
  html_url: string;
  private: boolean;
  archived: boolean;
}

interface RestCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email?: string; date: string } | null;
    tree?: { sha: string };
  };
  parents: Array<{ sha: string }>;
}

const SHA_RE = /^[0-9a-f]{40}$/;
const enc = (s: string) => encodeURIComponent(s);
/** Encode each path segment but keep the slashes (branch names like `os/draft`). */
const encPath = (s: string) => s.split("/").map(enc).join("/");

function toRepoInfo(r: RestRepo): RepoInfo {
  return {
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    defaultBranch: r.default_branch,
    htmlUrl: r.html_url,
    private: r.private,
    archived: r.archived,
  };
}

function mapRunState(status: string, conclusion: string | null): WorkflowState {
  if (status === "completed") return conclusion === "success" ? "success" : "failure";
  if (status === "queued" || status === "requested" || status === "waiting" || status === "pending")
    return "queued";
  return "in_progress";
}

function withCoAuthor(message: string, author?: CommitAuthor): string {
  if (!author?.email) return message;
  const trailer = `Co-authored-by: ${author.name} <${author.email}>`;
  return message.includes(trailer) ? message : `${message.trimEnd()}\n\n${trailer}`;
}

export class GitHubAppAccess implements GitHubAccess {
  readonly kind = "app" as const;
  private readonly fetchFn: FetchLike;
  private readonly base: string;
  private readonly now: () => number;
  private installationToken: { token: string; expiresAt: number } | null = null;

  constructor(private readonly options: GitHubAppAccessOptions) {
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.base = options.apiBase ?? GITHUB_API;
    this.now = options.now ?? Date.now;
  }

  // --- tokens ---------------------------------------------------------------------------------

  /** Mint (or reuse) an installation access token. */
  async getInstallationToken(): Promise<string | null> {
    const id = this.options.installationId;
    if (!id) return null;
    if (this.installationToken && this.installationToken.expiresAt - 60_000 > this.now())
      return this.installationToken.token;
    const jwt = await createAppJwt(this.options.app.appId, this.options.app.privateKey, this.now());
    const data = await githubRequest<{ token: string; expires_at: string }>(
      this.fetchFn,
      this.base,
      `/app/installations/${id}/access_tokens`,
      { method: "POST", token: jwt },
    );
    if (!data) throw new GitHubApiError("No installation token returned", 502);
    this.installationToken = { token: data.token, expiresAt: Date.parse(data.expires_at) };
    return data.token;
  }

  private async token(prefer: "installation" | "user" = "installation"): Promise<string> {
    const order =
      prefer === "user"
        ? [() => this.options.userToken?.() ?? null, () => this.getInstallationToken()]
        : [() => this.getInstallationToken(), () => this.options.userToken?.() ?? null];
    for (const get of order) {
      const t = await get();
      if (t) return t;
    }
    throw new GitHubApiError("No GitHub credentials available for this request", 401);
  }

  private async rest<T>(
    path: string,
    init: {
      method?: string;
      body?: unknown;
      accept?: string;
      allow404?: boolean;
      as?: "user";
    } = {},
  ): Promise<T | null> {
    const token = await this.token(init.as === "user" ? "user" : "installation");
    return githubRequest<T>(this.fetchFn, this.base, path, { ...init, token });
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const token = await this.token();
    const data = await githubRequest<{
      data?: T;
      errors?: Array<{ message: string; type?: string }>;
    }>(this.fetchFn, this.base, "/graphql", { method: "POST", token, body: { query, variables } });
    if (data?.errors?.length) {
      const msg = data.errors.map((e) => e.message).join("; ");
      if (
        /expected branch to point to|expectedHeadOid|is at .* but expected/i.test(msg) ||
        data.errors.some((e) => e.type === "STALE_DATA")
      )
        throw new GitHubConflictError(msg);
      if (data.errors.some((e) => e.type === "NOT_FOUND")) throw new GitHubNotFoundError(msg);
      throw new GitHubApiError(msg, 422, data.errors);
    }
    if (!data?.data) throw new GitHubApiError("Empty GraphQL response", 502);
    return data.data;
  }

  private repoPath(repo: RepoRef): string {
    return `/repos/${enc(repo.owner)}/${enc(repo.name)}`;
  }

  // --- repos ----------------------------------------------------------------------------------

  async getRepo(repo: RepoRef): Promise<RepoInfo | null> {
    const r = await this.rest<RestRepo>(this.repoPath(repo), { allow404: true, as: "user" });
    return r ? toRepoInfo(r) : null;
  }

  async createRepoFromTemplate(input: CreateRepoInput): Promise<{ repo: RepoInfo; head: string }> {
    let created: RestRepo | null;
    if (input.template) {
      created = await this.rest<RestRepo>(`${this.repoPath(input.template)}/generate`, {
        method: "POST",
        as: "user",
        body: {
          owner: input.owner,
          name: input.name,
          description: input.description ?? "",
          private: input.private ?? false,
          include_all_branches: false,
        },
      });
    } else {
      const isUser =
        !this.options.userLogin ||
        this.options.userLogin.toLowerCase() === input.owner.toLowerCase();
      created = await this.rest<RestRepo>(
        isUser ? "/user/repos" : `/orgs/${enc(input.owner)}/repos`,
        {
          method: "POST",
          as: "user",
          body: {
            name: input.name,
            description: input.description ?? "",
            private: input.private ?? false,
            auto_init: true,
            has_wiki: false,
            has_projects: false,
          },
        },
      );
    }
    if (!created) throw new GitHubApiError("Repository creation returned nothing", 502);
    const repo = toRepoInfo(created);
    // Generation / auto_init are asynchronous: wait for the default branch to exist.
    let head: string | null = null;
    for (let attempt = 0; attempt < 10 && !head; attempt++) {
      head = await this.getRef(repo, repo.defaultBranch);
      if (!head) await new Promise((r) => setTimeout(r, this.options.pollDelayMs ?? 500));
    }
    if (!head) throw new GitHubApiError("The new repository has no initial commit yet", 504);
    if (input.files && Object.keys(input.files).length) {
      const commit = await this.commitFiles(repo, {
        branch: repo.defaultBranch,
        expectedHead: head,
        message: input.message ?? "Set up site",
        files: Object.entries(input.files).map(([path, v]) =>
          typeof v === "string"
            ? { path, content: v }
            : { path, content: v.content, encoding: v.encoding ?? "utf-8" },
        ),
        ...(input.author ? { author: input.author } : {}),
      });
      head = commit.sha;
    }
    return { repo, head };
  }

  async archiveRepo(repo: RepoRef): Promise<void> {
    await this.rest(this.repoPath(repo), { method: "PATCH", body: { archived: true }, as: "user" });
  }

  async transferRepo(repo: RepoRef, newOwner: string): Promise<RepoInfo> {
    const r = await this.rest<RestRepo>(`${this.repoPath(repo)}/transfer`, {
      method: "POST",
      as: "user",
      body: { new_owner: newOwner },
    });
    if (!r) throw new GitHubApiError("Transfer returned nothing", 502);
    return toRepoInfo(r);
  }

  // --- refs and commits -----------------------------------------------------------------------

  async getRef(repo: RepoRef, ref: string): Promise<string | null> {
    const r = normalizeRef(ref);
    const data = await this.rest<{ object: { sha: string; type: string } }>(
      `${this.repoPath(repo)}/git/ref/${r.kind === "tag" ? "tags" : "heads"}/${encPath(r.name)}`,
      { allow404: true },
    );
    return data?.object.sha ?? null;
  }

  private async resolve(repo: RepoRef, ref: string): Promise<string> {
    if (SHA_RE.test(ref)) return ref;
    const sha = await this.getRef(repo, ref);
    if (!sha) throw new GitHubNotFoundError(`Ref ${ref} not found`);
    return sha;
  }

  async commitFiles(repo: RepoRef, input: CommitFilesInput): Promise<CommitInfo> {
    const head = input.expectedHead ?? (await this.getRef(repo, input.branch));
    if (!head) throw new GitHubNotFoundError(`Branch ${input.branch} not found`);
    const message = withCoAuthor(input.message, input.author);
    const [headline, ...rest] = message.split("\n");
    const additions = input.files
      .filter((f) => f.content !== null)
      .map((f) => ({
        path: f.path,
        contents:
          f.encoding === "base64" ? (f.content as string) : utf8ToBase64(f.content as string),
      }));
    const deletions = input.files.filter((f) => f.content === null).map((f) => ({ path: f.path }));
    const data = await this.graphql<{
      createCommitOnBranch: { commit: { oid: string; committedDate: string } };
    }>(
      `mutation($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) { commit { oid committedDate } }
      }`,
      {
        input: {
          branch: {
            repositoryNameWithOwner: `${repo.owner}/${repo.name}`,
            branchName: input.branch,
          },
          message: { headline: headline ?? "", body: rest.join("\n").trim() },
          expectedHeadOid: head,
          fileChanges: { additions, deletions },
        },
      },
    );
    const commit = data.createCommitOnBranch.commit;
    return {
      sha: commit.oid,
      message,
      author: input.author ?? { name: this.options.app.slug },
      date: commit.committedDate,
      parents: [head],
    };
  }

  async commitTree(repo: RepoRef, input: CommitTreeInput): Promise<CommitInfo> {
    const head = await this.getRef(repo, input.branch);
    if (!head) throw new GitHubNotFoundError(`Branch ${input.branch} not found`);
    if (input.expectedHead !== undefined && head !== input.expectedHead)
      throw new GitHubConflictError(`Branch ${input.branch} moved`, head);
    const source = await this.resolve(repo, input.treeOf);
    const src = await this.rest<{ tree: { sha: string } }>(
      `${this.repoPath(repo)}/git/commits/${source}`,
    );
    if (!src) throw new GitHubNotFoundError(`Commit ${source} not found`);
    const message = withCoAuthor(input.message, input.author);
    const created = await this.rest<{
      sha: string;
      author: { name: string; email: string; date: string };
    }>(`${this.repoPath(repo)}/git/commits`, {
      method: "POST",
      body: { message, tree: src.tree.sha, parents: [head] },
    });
    if (!created) throw new GitHubApiError("Commit creation returned nothing", 502);
    try {
      await this.rest(`${this.repoPath(repo)}/git/refs/heads/${encPath(input.branch)}`, {
        method: "PATCH",
        body: { sha: created.sha, force: false },
      });
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 422)
        throw new GitHubConflictError(`Branch ${input.branch} moved while committing`);
      throw err;
    }
    return {
      sha: created.sha,
      message,
      author: input.author ?? { name: created.author.name, email: created.author.email },
      date: created.author.date,
      parents: [head],
    };
  }

  async createBranch(repo: RepoRef, branch: string, sha: string): Promise<void> {
    try {
      await this.rest(`${this.repoPath(repo)}/git/refs`, {
        method: "POST",
        body: { ref: `refs/heads/${branch}`, sha },
      });
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 422)
        throw new GitHubConflictError(`Branch ${branch} already exists`);
      throw err;
    }
  }

  async resetBranch(repo: RepoRef, branch: string, sha: string): Promise<void> {
    const target = await this.resolve(repo, sha);
    const exists = await this.getRef(repo, branch);
    if (!exists) return this.createBranch(repo, branch, target);
    await this.rest(`${this.repoPath(repo)}/git/refs/heads/${encPath(branch)}`, {
      method: "PATCH",
      body: { sha: target, force: true },
    });
  }

  async tag(repo: RepoRef, name: string, sha: string): Promise<void> {
    const target = await this.resolve(repo, sha);
    try {
      await this.rest(`${this.repoPath(repo)}/git/refs`, {
        method: "POST",
        body: { ref: `refs/tags/${name}`, sha: target },
      });
    } catch (err) {
      if (err instanceof GitHubApiError && err.status === 422)
        throw new GitHubConflictError(`Tag ${name} already exists`);
      throw err;
    }
  }

  async listCommits(
    repo: RepoRef,
    options: { ref: string; limit?: number; path?: string },
  ): Promise<CommitInfo[]> {
    const q = new URLSearchParams({
      sha: options.ref,
      per_page: String(Math.min(options.limit ?? 30, 100)),
    });
    if (options.path) q.set("path", options.path);
    const data = await this.rest<RestCommit[]>(`${this.repoPath(repo)}/commits?${q}`);
    return (data ?? []).map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author?.email
        ? { name: c.commit.author.name, email: c.commit.author.email }
        : { name: c.commit.author?.name ?? "unknown" },
      date: c.commit.author?.date ?? new Date(0).toISOString(),
      parents: c.parents.map((p) => p.sha),
    }));
  }

  // --- reading --------------------------------------------------------------------------------

  async readTree(repo: RepoRef, ref: string): Promise<TreeEntry[]> {
    const sha = await this.resolve(repo, ref);
    const data = await this.rest<{
      tree: Array<{ path: string; type: string; sha: string; size?: number }>;
      truncated: boolean;
    }>(`${this.repoPath(repo)}/git/trees/${sha}?recursive=1`);
    if (data?.truncated)
      throw new GitHubApiError("Repository tree is too large to read at once", 413);
    return (data?.tree ?? [])
      .filter((e) => e.type === "blob")
      .map((e) =>
        e.size === undefined
          ? { path: e.path, sha: e.sha }
          : { path: e.path, sha: e.sha, size: e.size },
      );
  }

  async readFile(repo: RepoRef, path: string, ref: string): Promise<string | null> {
    const token = await this.token();
    const res = await this.fetchFn(
      `${this.base}${this.repoPath(repo)}/contents/${encPath(path)}?ref=${enc(ref)}`,
      {
        headers: {
          Accept: "application/vnd.github.raw+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "openspace-hub",
        },
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new GitHubApiError(`Reading ${path} failed (${res.status})`, res.status);
    return res.text();
  }

  async readFiles(
    repo: RepoRef,
    ref: string,
    options: { prefix?: string; textOnly?: boolean } = {},
  ): Promise<Record<string, string>> {
    const entries = (await this.readTree(repo, ref)).filter(
      (e) => !options.prefix || e.path.startsWith(options.prefix),
    );
    const out: Record<string, string> = {};
    const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
    let next = 0;
    const worker = async () => {
      while (next < entries.length) {
        const entry = entries[next++] as TreeEntry;
        const blob = await this.rest<{ content: string; encoding: string }>(
          `${this.repoPath(repo)}/git/blobs/${entry.sha}`,
        );
        if (!blob) continue;
        const b64 = blob.content.replace(/\n/g, "");
        try {
          out[entry.path] = decoder.decode(base64ToBytes(b64));
        } catch {
          if (!options.textOnly) out[entry.path] = b64;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(8, entries.length) }, worker));
    return out;
  }

  // --- pages, workflows, secrets, collaborators, PRs ------------------------------------------

  async enablePages(repo: RepoRef): Promise<{ url: string }> {
    try {
      const data = await this.rest<{ html_url: string }>(`${this.repoPath(repo)}/pages`, {
        method: "POST",
        body: { build_type: "workflow" },
      });
      if (data?.html_url) return { url: data.html_url };
    } catch (err) {
      if (!(err instanceof GitHubConflictError)) throw err; // 409: already enabled
    }
    const existing = await this.rest<{ html_url: string }>(`${this.repoPath(repo)}/pages`);
    if (!existing) throw new GitHubApiError("Pages is not enabled", 502);
    return { url: existing.html_url };
  }

  async setPagesDomain(repo: RepoRef, domain: string | null): Promise<void> {
    await this.rest(`${this.repoPath(repo)}/pages`, { method: "PUT", body: { cname: domain } });
  }

  async dispatchWorkflow(
    repo: RepoRef,
    input: { workflow: string; ref: string; inputs?: Record<string, string> },
  ): Promise<void> {
    await this.rest(`${this.repoPath(repo)}/actions/workflows/${enc(input.workflow)}/dispatches`, {
      method: "POST",
      body: { ref: input.ref, ...(input.inputs ? { inputs: input.inputs } : {}) },
    });
  }

  async workflowStatus(
    repo: RepoRef,
    input: { workflow: string; ref?: string },
  ): Promise<WorkflowRun> {
    const q = new URLSearchParams({ per_page: "1" });
    if (input.ref) q.set("branch", normalizeRef(input.ref).name);
    const data = await this.rest<{
      workflow_runs: Array<{
        status: string;
        conclusion: string | null;
        head_sha: string;
        html_url: string;
        updated_at: string;
      }>;
    }>(`${this.repoPath(repo)}/actions/workflows/${enc(input.workflow)}/runs?${q}`, {
      allow404: true,
    });
    const run = data?.workflow_runs[0];
    if (!run) return { state: "none" };
    return {
      state: mapRunState(run.status, run.conclusion),
      sha: run.head_sha,
      url: run.html_url,
      updatedAt: run.updated_at,
    };
  }

  async setSecret(repo: RepoRef, name: string, value: string): Promise<void> {
    const key = await this.rest<{ key_id: string; key: string }>(
      `${this.repoPath(repo)}/actions/secrets/public-key`,
    );
    if (!key) throw new GitHubApiError("No public key for secrets", 502);
    await this.rest(`${this.repoPath(repo)}/actions/secrets/${enc(name)}`, {
      method: "PUT",
      body: { encrypted_value: encryptGitHubSecret(key.key, value), key_id: key.key_id },
    });
  }

  async addCollaborator(
    repo: RepoRef,
    login: string,
    permission: CollaboratorPermission = "push",
  ): Promise<void> {
    await this.rest(`${this.repoPath(repo)}/collaborators/${enc(login)}`, {
      method: "PUT",
      body: { permission },
    });
  }

  async openPullRequest(
    repo: RepoRef,
    input: PullRequestInput,
  ): Promise<{ number: number; url: string }> {
    const pr = await this.rest<{ number: number; html_url: string }>(
      `${this.repoPath(repo)}/pulls`,
      {
        method: "POST",
        body: { head: input.head, base: input.base, title: input.title, body: input.body ?? "" },
      },
    );
    if (!pr) throw new GitHubApiError("Pull request creation returned nothing", 502);
    return { number: pr.number, url: pr.html_url };
  }
}
