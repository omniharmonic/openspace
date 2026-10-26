/**
 * Small git helpers for the local MCP store. Everything runs with `cwd` = the site folder, so
 * pathspecs are relative to it even when the site lives in a subfolder of a bigger repository.
 * Snapshots are commits made from a temporary index (the person's index and branch are never
 * touched) and tagged `os/snap/<name>`.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface GitResult {
  stdout: string;
  stderr: string;
}

export class Git {
  constructor(
    readonly cwd: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  run(args: string[], opts: { env?: NodeJS.ProcessEnv; input?: string } = {}): Promise<GitResult> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        "git",
        args,
        { cwd: this.cwd, env: { ...this.env, ...opts.env }, maxBuffer: 64 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            const e = new Error(`git ${args[0]} failed: ${String(stderr || err.message).trim()}`);
            reject(e);
          } else resolve({ stdout: String(stdout), stderr: String(stderr) });
        },
      );
      if (opts.input !== undefined) child.stdin?.end(opts.input);
    });
  }

  async out(args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
    return (await this.run(args, { env })).stdout.trim();
  }

  /** True when the folder is inside a git work tree and git is installed. */
  async available(): Promise<boolean> {
    try {
      if ((await this.out(["rev-parse", "--is-inside-work-tree"])) !== "true") return false;
    } catch {
      return false;
    }
    // A site folder the enclosing repository ignores is not versioned by it.
    try {
      await this.run(["check-ignore", "-q", "openspace.json"]);
      return false;
    } catch {
      return true;
    }
  }

  async head(): Promise<string | null> {
    try {
      return await this.out(["rev-parse", "--verify", "-q", "HEAD"]);
    } catch {
      return null;
    }
  }

  /** `user.name`/`user.email` fallbacks so snapshot commits work on unconfigured machines. */
  async identityEnv(): Promise<NodeJS.ProcessEnv> {
    const get = async (k: string) => {
      try {
        return await this.out(["config", k]);
      } catch {
        return "";
      }
    };
    const env: NodeJS.ProcessEnv = {};
    if (!(await get("user.name"))) {
      env.GIT_AUTHOR_NAME = "OpenSpace";
      env.GIT_COMMITTER_NAME = "OpenSpace";
    }
    if (!(await get("user.email"))) {
      env.GIT_AUTHOR_EMAIL = "mcp@openspace.local";
      env.GIT_COMMITTER_EMAIL = "mcp@openspace.local";
    }
    return env;
  }

  /** Paths (relative to cwd) that exist, from a candidate list. */
  existing(paths: string[]): string[] {
    return paths.filter((p) => existsSync(join(this.cwd, p)));
  }

  /** Uncommitted changes under the given paths (porcelain lines). */
  async status(paths: string[]): Promise<string[]> {
    const out = await this.out(["status", "--porcelain", "--untracked-files=all", "--", ...paths]);
    return out ? out.split("\n") : [];
  }

  /**
   * Commit the current working-tree state of `paths` on top of HEAD without touching the index
   * or branch, and tag it `os/snap/<name>` (`-2`, `-3`… when taken). Returns the tag.
   */
  async snapshot(name: string, paths: string[]): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "os-snap-"));
    const index = join(dir, "index");
    try {
      const env = { ...(await this.identityEnv()), GIT_INDEX_FILE: index };
      const head = await this.head();
      await this.run(head ? ["read-tree", head] : ["read-tree", "--empty"], { env });
      const present = this.existing(paths);
      if (present.length) await this.run(["add", "-A", "--", ...present], { env });
      const tree = await this.out(["write-tree"], env);
      const sha = await this.out(
        ["commit-tree", tree, ...(head ? ["-p", head] : []), "-m", `OpenSpace snapshot: ${name}`],
        env,
      );
      let tag = `os/snap/${name}`;
      for (let n = 2; await this.tagExists(tag); n++) tag = `os/snap/${name}-${n}`;
      await this.run(["tag", tag, sha]);
      return tag;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async tagExists(tag: string): Promise<boolean> {
    try {
      await this.run(["rev-parse", "--verify", "-q", `refs/tags/${tag}`]);
      return true;
    } catch {
      return false;
    }
  }

  /** Extract `paths` (relative to the site folder) of `rev` into `dest`. */
  async extract(rev: string, paths: string[], dest: string): Promise<void> {
    const prefix = await this.out(["rev-parse", "--show-prefix"]);
    const treeish = prefix ? `${rev}:${prefix.replace(/\/$/, "")}` : rev;
    const listed = await this.out(["ls-tree", "--name-only", treeish]);
    const have = new Set(listed.split("\n"));
    const wanted = paths.filter((p) => have.has(p.split("/")[0] as string));
    if (!wanted.length) return;
    const tar = join(dest, ".snapshot.tar");
    await this.run(["archive", "--format=tar", "-o", tar, treeish, "--", ...wanted]);
    await new Promise<void>((resolve, reject) =>
      execFile("tar", ["-xf", tar, "-C", dest], (err) => (err ? reject(err) : resolve())),
    );
    await rm(tar, { force: true });
  }
}
