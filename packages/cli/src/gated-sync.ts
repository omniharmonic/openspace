/**
 * `openspace gated-sync` — run by the Cloudflare publish workflow before `wrangler deploy`.
 *
 * Members-only and password pages are committed as stubs (title, slug, access, `contentRef`);
 * their content is kept by the Hub. This command asks GitHub for the run's OIDC identity token
 * (audience: the Hub), downloads exactly the content versions the checked-out commit names from
 * `<hub>/ci/sites/<siteId>/gated`, and puts them into the Worker's private R2 bucket at
 * `pages/<pageId>/<contentRef>.json`, where the deployed Worker reads them. Nothing is written to
 * the build output or the repository.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { CliError, type Io } from "./io";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
/** Run wrangler with `args`; resolves with its exit code. */
export type WranglerRunner = (args: string[], cwd: string) => Promise<number>;

export interface GatedSyncDeps {
  fetch?: FetchLike;
  wrangler?: WranglerRunner;
}

interface Stub {
  id: string;
  ref: string;
}

async function pageFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await pageFiles(p)));
    else if (e.name.endsWith(".json")) out.push(p);
  }
  return out;
}

/** Sealed gated-page stubs in the working copy (pages whose content the Hub keeps). */
export async function sealedStubs(root: string): Promise<Stub[]> {
  const stubs: Stub[] = [];
  for (const file of await pageFiles(join(root, "content/pages"))) {
    let page: { id?: unknown; contentRef?: unknown };
    try {
      page = JSON.parse(await readFile(file, "utf8")) as typeof page;
    } catch {
      throw new CliError(`${relative(root, file)} is not valid JSON.`);
    }
    if (typeof page.id === "string" && typeof page.contentRef === "string")
      stubs.push({ id: page.id, ref: page.contentRef });
  }
  return stubs;
}

/** The `OS_GATED` bucket name from wrangler.jsonc (comments allowed). */
export function gatedBucketName(root: string): string | undefined {
  const path = join(root, "wrangler.jsonc");
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,(\s*[}\]])/g, "$1");
  try {
    const config = JSON.parse(text) as {
      r2_buckets?: Array<{ binding?: string; bucket_name?: string }>;
    };
    return config.r2_buckets?.find((b) => b.binding === "OS_GATED")?.bucket_name;
  } catch {
    throw new CliError("wrangler.jsonc could not be read.");
  }
}

function findWranglerBin(cwd: string): string | undefined {
  try {
    const req = createRequire(join(cwd, "package.json"));
    const pkgPath = req.resolve("wrangler/package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const rel = typeof pkg.bin === "string" ? pkg.bin : (pkg.bin?.wrangler ?? pkg.bin?.wrangler2);
    return rel ? join(dirname(pkgPath), rel) : undefined;
  } catch {
    return undefined;
  }
}

const defaultWrangler: WranglerRunner = (args, cwd) => {
  const bin = findWranglerBin(cwd);
  if (!bin) throw new CliError('wrangler is not installed in this site. Run "npm install" first.');
  const child = spawn(process.execPath, [bin, ...args], { cwd, stdio: "inherit" });
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
};

/** The run's GitHub Actions OIDC token for `audience` (needs `permissions: id-token: write`). */
async function actionsToken(io: Io, fetchFn: FetchLike, audience: string): Promise<string> {
  const url = io.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = io.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer)
    throw new CliError(
      "Private pages are published from the site's GitHub Actions workflow only (it needs `permissions: id-token: write`).",
    );
  const u = new URL(url);
  u.searchParams.set("audience", audience);
  const res = await fetchFn(u.toString(), { headers: { authorization: `Bearer ${bearer}` } });
  const body = (await res.json().catch(() => ({}))) as { value?: string };
  if (!res.ok || !body.value)
    throw new CliError(`GitHub didn't issue a workflow identity token (${res.status}).`);
  return body.value;
}

export interface GatedSyncResult {
  uploaded: number;
  bucket: string | null;
}

export async function runGatedSync(
  io: Io,
  opts: { bucket?: string } = {},
  deps: GatedSyncDeps = {},
): Promise<GatedSyncResult> {
  const root = io.cwd;
  const configPath = join(root, "openspace.json");
  if (!existsSync(configPath))
    throw new CliError('No openspace.json here. Run "openspace gated-sync" from the site root.');
  const config = JSON.parse(await readFile(configPath, "utf8")) as {
    siteId: string;
    hub: string;
    deploy?: { target?: string };
  };
  const stubs = await sealedStubs(root);
  if (!stubs.length) {
    io.out("No members-only or password pages to upload.");
    return { uploaded: 0, bucket: null };
  }
  if (config.deploy?.target !== "cloudflare")
    throw new CliError(
      "Members-only and password pages need Cloudflare hosting (Studio → Settings → Hosting).",
    );
  const bucket = opts.bucket ?? gatedBucketName(root);
  if (!bucket)
    throw new CliError('wrangler.jsonc has no "bucket_name" for the OS_GATED R2 binding.');
  const fetchFn = deps.fetch ?? ((input, init) => fetch(input, init));
  const hubUrl = new URL(config.hub);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(hubUrl.hostname);
  if (hubUrl.protocol !== "https:" && !(hubUrl.protocol === "http:" && local))
    throw new CliError(`The Hub address must use https (got ${hubUrl.origin}).`);
  const hub = config.hub.replace(/\/+$/, "");
  const token = await actionsToken(io, fetchFn, hub);
  const res = await fetchFn(`${hub}/ci/sites/${encodeURIComponent(config.siteId)}/gated`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const body = (await res.json().catch(() => ({}))) as {
    pages?: Array<{ id: string; ref: string; page: unknown }>;
    error?: { message?: string };
  };
  if (!res.ok || !Array.isArray(body.pages))
    throw new CliError(
      `The Hub didn't hand over this version's private pages (${res.status}${body.error?.message ? `: ${body.error.message}` : ""}).`,
    );
  const byKey = new Map(body.pages.map((p) => [`${p.id}/${p.ref}`, p]));
  const missing = stubs.filter((s) => !byKey.has(`${s.id}/${s.ref}`));
  if (missing.length)
    throw new CliError(
      `The Hub is missing private page content for ${missing.map((m) => m.id).join(", ")}.`,
    );
  const wrangler = deps.wrangler ?? defaultWrangler;
  // Idempotent: an existing bucket makes this fail, which is fine; `put` below is what counts.
  await wrangler(["r2", "bucket", "create", bucket], root);
  const tmp = await mkdtemp(join(tmpdir(), "os-gated-"));
  try {
    for (const s of stubs) {
      const entry = byKey.get(`${s.id}/${s.ref}`);
      const file = join(tmp, `${s.id}-${s.ref}.json`);
      await writeFile(file, JSON.stringify(entry?.page), { mode: 0o600 });
      const code = await wrangler(
        [
          "r2",
          "object",
          "put",
          `${bucket}/pages/${s.id}/${s.ref}.json`,
          "--file",
          file,
          "--content-type",
          "application/json",
          "--remote",
        ],
        root,
      );
      if (code !== 0) throw new CliError(`Uploading ${s.id} to ${bucket} failed.`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  io.out(`Uploaded ${stubs.length} private page(s) to ${bucket}.`);
  return { uploaded: stubs.length, bucket };
}
