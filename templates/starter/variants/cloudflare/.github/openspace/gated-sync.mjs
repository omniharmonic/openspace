// Members-only and password pages → the Worker's private R2 bucket (generated; managed by
// site-kit updates). Runs in the publish workflow's `gated` job — the only job allowed to mint
// the run's GitHub OIDC identity token — with no packages installed: Node built-ins only.
//
// The committed page files are stubs (`contentRef`, no sections); the OpenSpace Hub keeps their
// content. This asks the Hub for exactly the versions this commit names and puts them at
// `pages/<pageId>/<contentRef>.json` through the Cloudflare API, before the Worker deploys.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const CF_API = "https://api.cloudflare.com/client/v4";

async function pageFiles(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await pageFiles(p)));
    else if (e.name.endsWith(".json")) out.push(p);
  }
  return out;
}

/** The OS_GATED bucket name from wrangler.jsonc (line comments and trailing commas allowed). */
function bucketName(text) {
  const json = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(json).r2_buckets?.find((b) => b.binding === "OS_GATED")?.bucket_name;
}

/** The Hub must be https (plain http only for a local Hub). */
function hubOrigin(raw) {
  const url = new URL(String(raw));
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    throw new Error(`The Hub address must use https (got ${url.origin}).`);
  return String(raw).replace(/\/+$/, "");
}

export async function main({
  cwd = process.cwd(),
  env = process.env,
  fetch = globalThis.fetch,
  log = console.log,
} = {}) {
  const config = JSON.parse(await readFile(join(cwd, "openspace.json"), "utf8"));
  const hub = hubOrigin(config.hub);
  const stubs = [];
  for (const file of await pageFiles(join(cwd, "content/pages"))) {
    const page = JSON.parse(await readFile(file, "utf8"));
    if (typeof page.id === "string" && typeof page.contentRef === "string")
      stubs.push({ id: page.id, ref: page.contentRef });
  }
  if (!stubs.length) {
    log("No members-only or password pages to upload.");
    return 0;
  }
  const bucket = bucketName(await readFile(join(cwd, "wrangler.jsonc"), "utf8"));
  if (!bucket) throw new Error('wrangler.jsonc has no "bucket_name" for the OS_GATED binding.');
  const { CLOUDFLARE_API_TOKEN: cfToken, CLOUDFLARE_ACCOUNT_ID: account } = env;
  if (!cfToken || !account)
    throw new Error("CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are needed.");
  if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
    throw new Error("This job needs `permissions: id-token: write`.");
  const tokenUrl = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  tokenUrl.searchParams.set("audience", hub);
  const idRes = await fetch(tokenUrl.toString(), {
    headers: { authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
  });
  const idToken = idRes.ok ? (await idRes.json()).value : undefined;
  if (!idToken) throw new Error(`GitHub didn't issue an identity token (${idRes.status}).`);
  const res = await fetch(`${hub}/ci/sites/${encodeURIComponent(config.siteId)}/gated`, {
    headers: { authorization: `Bearer ${idToken}`, accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(body.pages))
    throw new Error(
      `The Hub didn't hand over the private pages (${res.status} ${body.error?.message ?? ""}).`,
    );
  const byKey = new Map(body.pages.map((p) => [`${p.id}/${p.ref}`, p]));
  const missing = stubs.filter((s) => !byKey.has(`${s.id}/${s.ref}`));
  if (missing.length)
    throw new Error(`Missing private page content: ${missing.map((m) => m.id).join(", ")}.`);
  const cf = (path, init = {}) =>
    fetch(`${CF_API}/accounts/${account}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${cfToken}`, ...init.headers },
    });
  // Create the bucket on the first run (an existing bucket answers 409).
  const created = await cf("/r2/buckets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: bucket }),
  });
  if (!created.ok && created.status !== 409)
    throw new Error(`Creating ${bucket} failed (${created.status}).`);
  for (const s of stubs) {
    const put = await cf(`/r2/buckets/${bucket}/objects/pages/${s.id}/${s.ref}.json`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(byKey.get(`${s.id}/${s.ref}`).page),
    });
    if (!put.ok) throw new Error(`Uploading ${s.id} failed (${put.status}).`);
  }
  log(`Uploaded ${stubs.length} private page(s) to ${bucket}.`);
  return stubs.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((err) => {
    console.error(`::error::${err.message}`);
    process.exit(1);
  });
