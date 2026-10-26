/**
 * `GitHubAccess` (arch §6): everything the Hub does to a site repository goes through this
 * interface, so the GitHub App permission model (Spike S1) and the dev emulation are swappable.
 *
 * - `GitHubAppAccess` — real REST/GraphQL calls with installation or user tokens.
 * - `DevGitHubAccess` — D1-backed emulation (DEV_MODE / no credentials, Global Constraint 8).
 *
 * File contents are strings: UTF-8 text by default, or base64 for binary files.
 */

export interface RepoRef {
  owner: string;
  name: string;
}

export interface RepoInfo extends RepoRef {
  fullName: string;
  defaultBranch: string;
  htmlUrl: string;
  private: boolean;
  archived: boolean;
  /** GitHub's numeric repository id (stable across renames and transfers). */
  id?: number;
  /** Numeric id of the owning user or organization. */
  ownerId?: number;
}

export type FileEncoding = "utf-8" | "base64";

export interface FileContent {
  content: string;
  encoding?: FileEncoding;
}

/** A change in a commit: new contents for `path`, or `null` to delete it. */
export interface FileChange {
  path: string;
  content: string | null;
  encoding?: FileEncoding;
}

export interface CommitAuthor {
  name: string;
  email?: string;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: CommitAuthor;
  /** ISO timestamp. */
  date: string;
  parents: string[];
}

export interface TreeEntry {
  path: string;
  /** Blob SHA. */
  sha: string;
  size?: number;
}

export interface CommitFilesInput {
  branch: string;
  files: FileChange[];
  message: string;
  /**
   * Optimistic concurrency: the commit fails with `GitHubConflictError` unless the branch
   * currently points at this SHA. `undefined` = commit on whatever the head is.
   */
  expectedHead?: string;
  author?: CommitAuthor;
}

export interface CommitTreeInput {
  branch: string;
  /** Ref or SHA whose whole tree the new commit should have (squash publish / rollback). */
  treeOf: string;
  message: string;
  expectedHead?: string;
  author?: CommitAuthor;
}

export type WorkflowState = "none" | "queued" | "in_progress" | "success" | "failure";

export interface WorkflowRun {
  state: WorkflowState;
  /** Commit the run built, if known. */
  sha?: string;
  url?: string;
  updatedAt?: string;
}

export interface CreateRepoInput {
  owner: string;
  name: string;
  description?: string;
  private?: boolean;
  /**
   * Generate from a GitHub template repository (`POST /repos/{t}/generate`). When absent,
   * an empty repository is created and `files` become its first commit.
   */
  template?: RepoRef;
  files?: Record<string, string | FileContent>;
  message?: string;
  author?: CommitAuthor;
}

export interface PullRequestInput {
  head: string;
  base: string;
  title: string;
  body?: string;
}

export interface PagesInfo {
  url: string | null;
  cname: string | null;
  httpsEnforced: boolean;
  /** GitHub's certificate state: none | new | authorization_created | … | approved | errored. */
  certificate: "none" | "pending" | "approved" | "errored";
}

export type CollaboratorPermission = "pull" | "triage" | "push" | "maintain" | "admin";

export interface GitHubAccess {
  readonly kind: "dev" | "app";

  getRepo(repo: RepoRef): Promise<RepoInfo | null>;
  createRepoFromTemplate(input: CreateRepoInput): Promise<{ repo: RepoInfo; head: string }>;
  archiveRepo(repo: RepoRef): Promise<void>;
  transferRepo(repo: RepoRef, newOwner: string): Promise<RepoInfo>;

  /** SHA a branch (`main`, `os/draft`) or tag (`tags/os/snap/x`) points at; null if missing. */
  getRef(repo: RepoRef, ref: string): Promise<string | null>;
  readTree(repo: RepoRef, ref: string): Promise<TreeEntry[]>;
  readFile(repo: RepoRef, path: string, ref: string): Promise<string | null>;
  /** A file's bytes at `ref` (binary-safe; media), or null if missing. */
  readFileBytes(repo: RepoRef, path: string, ref: string): Promise<Uint8Array | null>;
  /** All files at `ref` (optionally under `prefix`), as text (binary files come back base64). */
  readFiles(
    repo: RepoRef,
    ref: string,
    options?: { prefix?: string; textOnly?: boolean },
  ): Promise<Record<string, string>>;

  commitFiles(repo: RepoRef, input: CommitFilesInput): Promise<CommitInfo>;
  /** Commit on `branch` whose tree equals the tree at `treeOf` (parent = current head). */
  commitTree(repo: RepoRef, input: CommitTreeInput): Promise<CommitInfo>;
  createBranch(repo: RepoRef, branch: string, sha: string): Promise<void>;
  /** Force-move a branch (creating it if needed). */
  resetBranch(repo: RepoRef, branch: string, sha: string): Promise<void>;
  tag(repo: RepoRef, name: string, sha: string): Promise<void>;
  /** Tags whose name starts with `prefix` (e.g. `os/snap/`), newest-created order not guaranteed. */
  listTags(repo: RepoRef, prefix?: string): Promise<Array<{ name: string; sha: string }>>;
  listCommits(
    repo: RepoRef,
    options: { ref: string; limit?: number; path?: string },
  ): Promise<CommitInfo[]>;

  enablePages(repo: RepoRef): Promise<{ url: string }>;
  setPagesDomain(repo: RepoRef, domain: string | null): Promise<void>;
  /** Pages custom-domain + certificate state (Task 16 domains wizard); null if Pages is off. */
  getPages(repo: RepoRef): Promise<PagesInfo | null>;
  /** Turn "Enforce HTTPS" on or off (only possible once the certificate is issued). */
  setPagesHttps(repo: RepoRef, enforced: boolean): Promise<void>;
  dispatchWorkflow(
    repo: RepoRef,
    input: { workflow: string; ref: string; inputs?: Record<string, string> },
  ): Promise<void>;
  workflowStatus(repo: RepoRef, input: { workflow: string; ref?: string }): Promise<WorkflowRun>;

  setSecret(repo: RepoRef, name: string, value: string): Promise<void>;
  /** The repo's Actions public key: browsers seal secret values with it (Task 17 hosting). */
  secretsPublicKey(repo: RepoRef): Promise<{ keyId: string; key: string }>;
  /** Store an Actions secret the caller already sealed (the Hub never sees the value). */
  putSealedSecret(
    repo: RepoRef,
    name: string,
    encryptedValue: string,
    keyId: string,
  ): Promise<void>;
  /** Names of the repo's Actions secrets (values are never readable). */
  listSecretNames(repo: RepoRef): Promise<string[]>;
  /** Create or update an Actions variable (`vars.NAME` in workflows; public values only). */
  setVariable(repo: RepoRef, name: string, value: string): Promise<void>;
  /** An Actions variable's value, or null when it isn't set. */
  getVariable(repo: RepoRef, name: string): Promise<string | null>;
  addCollaborator(repo: RepoRef, login: string, permission?: CollaboratorPermission): Promise<void>;
  removeCollaborator(repo: RepoRef, login: string): Promise<void>;
  /** Names of the failed jobs/steps of a workflow run (for plain-language build errors). */
  failedSteps(repo: RepoRef, runId: number): Promise<string[]>;
  openPullRequest(repo: RepoRef, input: PullRequestInput): Promise<{ number: number; url: string }>;
  /**
   * Squash-merge a pull request (Task 18 update bot). `sha` guards against the head having moved
   * since it was reviewed (conflict otherwise).
   */
  mergePullRequest(
    repo: RepoRef,
    number: number,
    input: { title: string; sha?: string },
  ): Promise<{ sha: string }>;
}

/** Thrown when `expectedHead` does not match (someone else committed first). */
export class GitHubConflictError extends Error {
  constructor(
    message: string,
    readonly actualHead?: string | null,
  ) {
    super(message);
    this.name = "GitHubConflictError";
  }
}

export class GitHubNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubNotFoundError";
  }
}

/** A request the Hub refuses before calling GitHub (bad repo name, unsafe file path…). */
export class GitHubInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubInputError";
  }
}

/** Any other failure talking to GitHub. */
export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export const DRAFT_BRANCH = "os/draft";
export const MAIN_BRANCH = "main";
export const PUBLISH_WORKFLOW = "publish.yml";

export function parseRepo(fullName: string): RepoRef {
  const [owner, name] = fullName.split("/");
  if (!owner || !name || fullName.split("/").length !== 2)
    throw new GitHubInputError(`Invalid repository name ${fullName}`);
  return { owner, name };
}

export const repoFullName = (r: RepoRef) => `${r.owner}/${r.name}`;

/** Normalize a ref: `refs/heads/x` | `heads/x` | `x` → branch; `refs/tags/x` | `tags/x` → tag. */
export function normalizeRef(ref: string): { kind: "branch" | "tag"; name: string } {
  const r = ref.replace(/^refs\//, "");
  if (r.startsWith("tags/")) return { kind: "tag", name: r.slice(5) };
  if (r.startsWith("heads/")) return { kind: "branch", name: r.slice(6) };
  return { kind: "branch", name: r };
}
