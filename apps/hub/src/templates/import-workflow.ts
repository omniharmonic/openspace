// biome-ignore-all lint/suspicious/noTemplateCurlyInString: GitHub Actions expressions in workflow files
/**
 * The hosted import ("Move my site"): a one-off GitHub Actions workflow the Hub adds to the
 * site's repository with a request file. The push of the request starts it (no dispatch needed,
 * so a brand-new repository never races GitHub's workflow indexing); `workflow_dispatch` lets
 * the owner run it again by hand. It runs the published CLI — `openspace import … --into-existing`
 * keeps the site's identity and replaces its content — checks the result, commits it and starts
 * the normal publish. Progress goes back to the Hub with the run's own identity token (OIDC), so
 * no secret is stored anywhere.
 *
 * It reads the site exactly like a local import: a real browser (Playwright's Chromium, cached
 * between runs) measures the live site's fonts, type scale and layout, and after the import the
 * same browser compares both sites page by page and auto-tunes the new one (bounded rounds, the
 * best version kept). The comparison — score before and after tuning, per-page scores and small
 * side-by-side pictures — is saved with the site in `.openspace/fidelity/`, which Studio shows
 * under "What needs your attention".
 */

/** The CLI release the workflow runs. Bump with each CLI release that changes the importer. */
export const IMPORT_CLI_VERSION = "0.1.17";
/** Image processing (resizing, SVG icons) for the importer, installed next to the CLI. */
export const IMPORT_SHARP_VERSION = "0.34.5";
/** The browser that measures the live site, renders script-built pages and compares the result. */
export const IMPORT_PLAYWRIGHT_VERSION = "1.64.1";
/** Where the hosted import saves its fidelity comparison (committed with the site). */
export const IMPORT_FIDELITY_DIR = ".openspace/fidelity";
/** Rounds of auto-tuning after a hosted import. */
export const IMPORT_TUNE_ROUNDS = 3;

export const IMPORT_WORKFLOW = "openspace-import.yml";
export const IMPORT_WORKFLOW_PATH = `.github/workflows/${IMPORT_WORKFLOW}`;
export const IMPORT_REQUEST_PATH = ".github/openspace/import.json";
export const IMPORT_HELPER_PATH = ".github/openspace/import.mjs";
export const CONVERT_BRANCH = "openspace/convert";

/** What the workflow is asked to do (`.github/openspace/import.json`). */
export interface ImportRequest {
  version: 1;
  /** `site_imports.id` (progress reports name it). */
  id: string;
  siteId: string;
  hub: string;
  mode: "url" | "convert";
  /** The address to read, or `owner/name` of the repository (GitHub sources). */
  source: string;
  /** auto | squarespace | wordpress | wix | … | github | url */
  platform: string;
  /** The person confirmed the site is theirs (Squarespace `?format=json`). */
  owner: boolean;
  /** Render pages in a browser (sites built by JavaScript). */
  render: boolean;
  /** Convert: the commit the conversion branch started from (the old site's files). */
  base?: string;
  /** Convert: files that stay (everything else of the old site is removed in the branch). */
  keep?: string[];
  /** Bumped by "Try again" so the request file changes and the workflow runs again. */
  attempt: number;
}

export const IMPORT_WORKFLOW_YML = `# ${IMPORT_WORKFLOW_PATH} — added by OpenSpace to move your site in. It only runs when
# .github/openspace/import.json changes (or by hand); you can delete it once your site is moved.
name: OpenSpace import
on:
  push:
    branches: [main, ${CONVERT_BRANCH}]
    paths: [".github/openspace/import.json"]
  workflow_dispatch:
    inputs:
      url:
        description: "The address (or GitHub repository) of the site to move"
        required: false
      platform:
        description: "auto, squarespace, wordpress, wix, webflow, framer, carrd, github or url"
        required: false
        default: auto
      options:
        description: "Extra options: owner (it's my site), render (script-built pages)"
        required: false
        default: ""
permissions: { contents: write, actions: write, id-token: write }
concurrency: { group: openspace-import, cancel-in-progress: false }
env:
  OPENSPACE_CLI: "@omniharmonic/openspace-cli@${IMPORT_CLI_VERSION}"
  OPENSPACE_SHARP: "sharp@${IMPORT_SHARP_VERSION}"
  OPENSPACE_PLAYWRIGHT: "playwright@${IMPORT_PLAYWRIGHT_VERSION}"
jobs:
  import:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v7
        with: { node-version: 24 }
      - name: Reading your site
        id: ready
        env:
          IN_URL: \${{ inputs.url }}
          IN_PLATFORM: \${{ inputs.platform }}
          IN_OPTIONS: \${{ inputs.options }}
        run: node ${IMPORT_HELPER_PATH} start
      # The browser that measures your site (cached between runs, so later runs start faster).
      - name: Getting a browser ready
        id: browser
        uses: actions/cache@v6
        with:
          path: ~/.cache/ms-playwright
          key: openspace-chromium-${IMPORT_PLAYWRIGHT_VERSION}-\${{ runner.os }}
      - name: Installing the browser
        run: |
          if [ "\${{ steps.browser.outputs.cache-hit }}" = "true" ]; then
            npx -y "$OPENSPACE_PLAYWRIGHT" install-deps chromium
          else
            npx -y "$OPENSPACE_PLAYWRIGHT" install --with-deps chromium
          fi
      - name: Bringing pages across
        env:
          GITHUB_TOKEN: \${{ github.token }}
        run: node ${IMPORT_HELPER_PATH} run
      - name: Checking the site
        run: node ${IMPORT_HELPER_PATH} check
      - name: Saving the imported site
        run: node ${IMPORT_HELPER_PATH} save
      - name: Publishing
        if: steps.ready.outputs.mode == 'url'
        env:
          GH_TOKEN: \${{ github.token }}
        run: node ${IMPORT_HELPER_PATH} publish
      - name: Telling OpenSpace it didn't finish
        if: failure()
        run: node ${IMPORT_HELPER_PATH} failed
`;

/** The workflow's helper (Node 24, no dependencies): requests, the CLI, git, progress reports. */
export const IMPORT_HELPER_MJS = String.raw`// ${IMPORT_HELPER_PATH} — the OpenSpace import's steps (see ../workflows/${IMPORT_WORKFLOW}).
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TEMP = process.env.RUNNER_TEMP || "/tmp";
const STATE = join(TEMP, "openspace-import.json");
const SUMMARY = join(TEMP, "openspace-import-summary.json");
const SOURCE = join(TEMP, "openspace-source");
const REQUEST = ".github/openspace/import.json";

const sh = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) process.exit(r.status || 1);
  return r;
};
const out = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8" }).stdout.trim();
const output = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, k + "=" + v + "\n");
const state = () => JSON.parse(readFileSync(STATE, "utf8"));

/** Tell the Hub how far the import is (best effort: never fails the run). */
async function progress(phase, extra = {}) {
  try {
    const req = state();
    const tokenUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    if (!req.hub || !req.siteId || !tokenUrl) return;
    const t = await fetch(tokenUrl + "&audience=" + encodeURIComponent(req.hub), {
      headers: { authorization: "bearer " + process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN },
    }).then((r) => r.json());
    await fetch(req.hub + "/ci/sites/" + req.siteId + "/import", {
      method: "POST",
      headers: { authorization: "Bearer " + t.value, "content-type": "application/json" },
      body: JSON.stringify({ id: req.id, phase, ...extra }),
    });
  } catch (e) {
    console.log("(progress report skipped: " + e.message + ")");
  }
}

/**
 * Run the importer, showing its output as usual, and tell the Hub how far it is from the lines
 * it prints (pages read, pages made, pages compared with the old site), at most every 10 s — so
 * the person sees "page 5 of 8" instead of one step that sits still for minutes.
 */
function runWithProgress(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["inherit", "inherit", "pipe"] });
    const read = new Set();
    const made = [];
    const compared = new Set();
    let round = 1;
    let stage = "reading";
    let last = 0;
    let buf = "";
    const live = () => {
      const pages = Math.max(made.length, read.size);
      if (stage === "reading") return { stage, done: read.size };
      if (stage === "mapping") return { stage, done: made.length, total: Math.max(made.length, read.size) };
      const paths = new Set([...compared].map((k) => k.split("@")[0]));
      return { stage, done: paths.size, total: Math.max(paths.size, made.length || pages), round };
    };
    const report = (force) => {
      const now = Date.now();
      if (!force && now - last < 10000) return;
      last = now;
      void progress("importing", { live: live() });
    };
    const line = (l) => {
      let m;
      if ((m = /^\s+Comparing (\S+) at (\d+)px/.exec(l))) {
        stage = "comparing";
        const k = m[1] + "@" + m[2];
        if (compared.has(k)) {
          round++;
          compared.clear();
        }
        compared.add(k);
      } else if ((m = /^\s+Page (\/\S*)/.exec(l))) {
        stage = "mapping";
        if (!made.includes(m[1])) made.push(m[1]);
      } else if (stage === "reading" && (m = /^\s+(\/\S*)(?: \((\w+)\))?\s*$/.exec(l))) {
        read.add(m[1]);
      } else return;
      report(false);
    };
    child.stderr.on("data", (d) => {
      process.stderr.write(d);
      buf += d.toString("utf8");
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const l of lines) line(l);
    });
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

const step = process.argv[2];

if (step === "start") {
  let req = existsSync(REQUEST) ? JSON.parse(readFileSync(REQUEST, "utf8")) : {};
  const cfg = existsSync("openspace.json") ? JSON.parse(readFileSync("openspace.json", "utf8")) : {};
  if (process.env.IN_URL) {
    const opts = (process.env.IN_OPTIONS || "").toLowerCase();
    req = {
      ...req,
      mode: req.mode || "url",
      source: process.env.IN_URL.trim(),
      platform: process.env.IN_PLATFORM || "auto",
      owner: /owner/.test(opts),
      render: /render/.test(opts),
    };
  }
  req.siteId = req.siteId || cfg.siteId;
  req.hub = (req.hub || cfg.hub || "").replace(/\/+$/, "");
  if (!req.source) {
    console.log("Nothing to import: no address in " + REQUEST + " or the run's inputs.");
    process.exit(1);
  }
  writeFileSync(STATE, JSON.stringify(req));
  output("mode", req.mode === "convert" ? "convert" : "url");
  output("render", req.render ? "true" : "false");
  if (req.mode === "convert") {
    // The old site's files, as they were before the conversion branch, for the importer to read.
    mkdirSync(SOURCE, { recursive: true });
    const base = req.base || "HEAD~1";
    const tar = spawnSync("git", ["archive", base], { maxBuffer: 1 << 30 });
    if (tar.status !== 0) process.exit(1);
    sh("tar", ["-x", "-C", SOURCE], { input: tar.stdout, stdio: ["pipe", "inherit", "inherit"] });
    // The old site leaves the branch (its history stays): only the OpenSpace site and the
    // repository's own files remain.
    const keep = new Set(req.keep || []);
    const keepRe = /^(?:\.github\/|docs\/|CNAME$|README|LICEN[CS]E|\.gitignore$|\.gitattributes$)/i;
    const files = out("git", ["ls-files", "-z"]).split("\0").filter(Boolean);
    const gone = files.filter((f) => !keep.has(f) && !keepRe.test(f));
    for (let i = 0; i < gone.length; i += 200) sh("git", ["rm", "-q", "--", ...gone.slice(i, i + 200)]);
  }
  await progress("reading");
}

if (step === "run") {
  const req = state();
  await progress("importing");
  const cli = process.env.OPENSPACE_CLI;
  // The browser always comes along: it measures the live site's fonts and layout, and compares
  // and tunes the result (exactly like an import on a computer).
  const pkgs = ["-p", cli, "-p", process.env.OPENSPACE_SHARP, "-p", process.env.OPENSPACE_PLAYWRIGHT];
  const common = [
    ".",
    "--into-existing",
    "--summary",
    SUMMARY,
    "--tune",
    "${IMPORT_TUNE_ROUNDS}",
    "--compare-thumbs",
    "--compare-out",
    "${IMPORT_FIDELITY_DIR}",
  ];
  const args =
    req.mode === "convert"
      ? ["import", "github", req.source, ...common, "--source-dir", SOURCE]
      : req.platform === "github"
        ? ["import", "github", req.source, ...common]
        : ["import", req.source, ...common, ...(req.platform && req.platform !== "auto" ? ["--platform", req.platform] : [])];
  // --owner (Squarespace's ?format=json) and --render (a browser) only mean something for a
  // website address; a GitHub repository is read from its source.
  const fromGitHub = req.mode === "convert" || req.platform === "github";
  if (req.owner && !fromGitHub) args.push("--owner");
  if (req.render && !fromGitHub) args.push("--render");
  const status = await runWithProgress("npx", ["-y", ...pkgs, "openspace", ...args]);
  const summary = existsSync(SUMMARY) ? JSON.parse(readFileSync(SUMMARY, "utf8")) : undefined;
  await progress("imported", summary ? { counts: summary } : {});
  if (status !== 0) process.exit(status || 1);
}

if (step === "check") {
  await progress("checking");
  sh("npx", ["-y", "-p", process.env.OPENSPACE_CLI, "openspace", "check"]);
}

if (step === "save") {
  const req = state();
  await progress("saving");
  if (existsSync(REQUEST)) sh("git", ["rm", "-q", "--", REQUEST]);
  sh("git", ["config", "user.name", "OpenSpace"]);
  sh("git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);
  sh("git", ["add", "-A"]);
  const label = req.mode === "convert" ? "Make this site editable in OpenSpace" : "Move " + req.source + " into OpenSpace";
  sh("git", ["commit", "-q", "-m", label]);
  sh("git", ["push", "-q", "origin", "HEAD"]);
  await progress("saved", { sha: out("git", ["rev-parse", "HEAD"]) });
}

if (step === "publish") {
  sh("gh", ["workflow", "run", "publish.yml", "--ref", "main"]);
  await progress("publishing");
}

if (step === "failed") await progress("failed");
`;

/** The workflow, its helper and the request: the files an import adds to a repository. */
export function importFiles(request: ImportRequest): Record<string, string> {
  return {
    [IMPORT_WORKFLOW_PATH]: IMPORT_WORKFLOW_YML,
    [IMPORT_HELPER_PATH]: IMPORT_HELPER_MJS,
    [IMPORT_REQUEST_PATH]: `${JSON.stringify(request, null, 2)}\n`,
  };
}
