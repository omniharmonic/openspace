import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { readConfig } from "../src/env";
import { DevGitHubAccess } from "../src/github/dev";
import { DRAFT_BRANCH } from "../src/github/types";
import { createServices } from "../src/services";
import { guessSiteName, parseImportSource, placeholderDocument } from "../src/services/import-site";
import {
  attentionFromReport,
  failureMessage,
  type ImportView,
  recordProgress,
} from "../src/services/imports";
import { loadSiteDocument, siteDocumentToFiles } from "../src/services/site-files";
import {
  IMPORT_CLI_VERSION,
  IMPORT_HELPER_MJS,
  IMPORT_REQUEST_PATH,
  IMPORT_WORKFLOW_PATH,
  IMPORT_WORKFLOW_YML,
} from "../src/templates/import-workflow";
import { call, cookieFrom } from "./helpers";
import { HUB, McpTestClient, oauthConnect, toolText } from "./mcp-helpers";

type App = ReturnType<typeof createApp>;

async function devLogin(app: App, name: string, installApp?: boolean) {
  const res = await call(app, "/auth/dev/login", {
    method: "POST",
    json: { name, ...(installApp === undefined ? {} : { installApp }) },
  });
  expect(res.status).toBe(200);
  return cookieFrom(res);
}

interface Created {
  site: { id: string; repo: string; name: string; status: string; import: { id: string } | null };
  import: ImportView;
}

async function move(app: App, cookie: string, json: Record<string, unknown>) {
  return call(app, "/api/imports", {
    method: "POST",
    cookie,
    json: { confirmOwnership: true, ...json },
  });
}

const gh = () => new DevGitHubAccess(env.HUB_DB);
const ref = (repo: string) => {
  const [owner, name] = repo.split("/") as [string, string];
  return { owner, name };
};

describe("what the person pastes", () => {
  it.each([
    [
      "www.maya-yoga.com",
      { kind: "url", source: "https://www.maya-yoga.com/", label: "maya-yoga.com" },
    ],
    ["http://maya.example.org/about", { kind: "url", source: "https://maya.example.org/about" }],
    ["life-culture/powerwith", { kind: "github", source: "life-culture/powerwith" }],
    [
      "https://github.com/life-culture/powerwith",
      { kind: "github", source: "life-culture/powerwith" },
    ],
    [
      "https://life-culture.github.io/powerwith/",
      {
        kind: "url",
        source: "https://life-culture.github.io/powerwith/",
        github: { owner: "life-culture", repo: "powerwith" },
      },
    ],
  ])("%s", (input, expected) => {
    expect(parseImportSource(input)).toMatchObject(expected);
  });

  it("refuses addresses that aren't public websites", () => {
    for (const bad of [
      "localhost:8080",
      "http://127.0.0.1/",
      "http://10.0.0.5",
      "ftp://x.example.com",
      "https://u:p@x.example.com",
    ])
      expect(() => parseImportSource(bad), bad).toThrow();
  });

  it("names the new site after the address", () => {
    expect(guessSiteName(parseImportSource("https://www.maya-yoga.com"))).toBe("Maya Yoga");
    expect(guessSiteName(parseImportSource("bedford-demo.squarespace.com"))).toBe("Bedford Demo");
    expect(guessSiteName(parseImportSource("life-culture/powerwith"))).toBe("Powerwith");
    expect(guessSiteName(parseImportSource("https://ada.github.io/"))).toBe("Ada");
  });

  it("the placeholder page is a valid site that publishes cleanly", () => {
    const doc = placeholderDocument({
      siteId: "st_0123456789",
      name: "Maya Yoga",
      hubUrl: "https://hub.openspace.host",
      deployUrl: "https://maya.github.io/maya-yoga/",
      sourceLabel: "maya-yoga.com",
    });
    const again = loadSiteDocument(siteDocumentToFiles(doc));
    expect(again.site.title).toBe("Maya Yoga");
    // Public while the move runs: it says "being set up", never promises a time.
    expect(JSON.stringify(again)).toContain("This site is being set up");
    expect(JSON.stringify(again)).not.toContain("few minutes");
    expect(again.pages[Object.keys(again.pages)[0] as string]?.seo?.noindex).toBe(true);
  });
});

describe("the import workflow", () => {
  it("pins the CLI release, runs on Node 24, triggers on the request and reports progress", () => {
    expect(IMPORT_WORKFLOW_YML).toContain(`@omniharmonic/openspace-cli@${IMPORT_CLI_VERSION}`);
    expect(IMPORT_WORKFLOW_YML).toContain("node-version: 24");
    expect(IMPORT_WORKFLOW_YML).toContain('paths: [".github/openspace/import.json"]');
    expect(IMPORT_WORKFLOW_YML).toContain("workflow_dispatch:");
    expect(IMPORT_WORKFLOW_YML).toMatch(
      /permissions: \{ contents: write, actions: write, id-token: write \}/,
    );
    for (const step of [
      "Reading your site",
      "Bringing pages across",
      "Checking the site",
      "Saving the imported site",
      "Publishing",
    ])
      expect(IMPORT_WORKFLOW_YML).toContain(`name: ${step}`);
    // Inputs reach the helper through the environment, never interpolated into a shell line.
    expect(IMPORT_WORKFLOW_YML).not.toMatch(/run: .*\$\{\{ inputs\./);
    expect(IMPORT_HELPER_MJS).toContain('"--into-existing"');
    expect(IMPORT_HELPER_MJS).toContain("/ci/sites/");
    expect(IMPORT_HELPER_MJS).toContain('"workflow", "run", "publish.yml"');
    // --owner/--render are only passed for website addresses: CLI 0.1.8's `import github`
    // rejected --owner, so every GitHub Pages move failed (wave 3 P0).
    expect(IMPORT_HELPER_MJS).toContain('if (req.owner && !fromGitHub) args.push("--owner")');
    expect(IMPORT_HELPER_MJS).toContain('req.mode === "convert" || req.platform === "github"');
    expect(IMPORT_CLI_VERSION).toBe("0.1.9");
  });

  it("explains failed runs without blaming the person's site for our problems", () => {
    const row = { kind: "url" } as Parameters<typeof failureMessage>[0];
    const ours = failureMessage(
      row,
      ["Bringing pages across"],
      "npm warn exec\nerror: unknown option '--owner'\n",
    );
    expect(ours).toContain("on our side");
    expect(ours).not.toMatch(/public/);
    const gone = failureMessage(
      row,
      ["Bringing pages across"],
      "Error: GET https://x.example/ failed with 404 Not Found",
    );
    expect(gone).toContain("opens in a private browser window");
    expect(failureMessage(row, ["Bringing pages across"], "")).toBe(
      "The move stopped while bringing pages across. This is usually temporary — choose Try again.",
    );
  });

  it("turns IMPORT-REPORT.md into What needs your attention", () => {
    const groups = attentionFromReport(
      "# Import report\n\n## Needs attention\n\n### Forms and newsletter\n\n- Newsletter signup recreated. _(/, /about)_\n- **Bold** and `code`. _(site)_\n\n### Links\n\n- A link. _(navigation)_\n\n## Redirects\n\n- not this\n",
    );
    expect(groups).toEqual([
      {
        title: "Forms and newsletter",
        items: ["Newsletter signup recreated. (/, /about)", "Bold and code."],
      },
      { title: "Links", items: ["A link. (navigation)"] },
    ]);
  });
});

describe("Move my site (hosted import, dev emulation)", () => {
  it("creates the site, runs the import, publishes and is ready to review", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Maya Mover");
    const res = await move(app, cookie, { url: "https://www.maya-yoga.com" });
    expect(res.status).toBe(201);
    const created = (await res.json()) as Created;
    expect(created.site.name).toBe("Maya Yoga");
    expect(created.site.import?.id).toBe(created.import.id);
    const view = (await (
      await call(app, `/api/imports/${created.import.id}`, { cookie })
    ).json()) as ImportView;
    expect(view.state).toBe("ready");
    expect(view.headline).toContain("is live");
    expect(view.steps.every((s) => s.state === "done")).toBe(true);
    expect(view.steps.find((s) => s.id === "pages")?.detail).toBe("2 pages, 0 images");
    expect(view.attention.map((g) => g.title)).toEqual(["Forms and newsletter", "Links"]);
    expect(view.checklist.map((i) => i.kind)).toEqual(["newsletter"]);
    expect(view.siteUrl).toMatch(/\/s\/st_/);

    // The repository: the imported content on main, the draft at the same commit.
    const repo = ref(created.site.repo);
    const main = (await gh().getRef(repo, "main")) as string;
    expect(await gh().getRef(repo, DRAFT_BRANCH)).toBe(main);
    expect(await gh().readFile(repo, IMPORT_REQUEST_PATH, main)).toBeNull();
    expect(await gh().readFile(repo, IMPORT_WORKFLOW_PATH, main)).toContain(IMPORT_CLI_VERSION);
    expect(await gh().readFile(repo, "IMPORT-REPORT.md", main)).toContain("Needs attention");
    const doc = await call(app, `/api/sites/${created.site.id}/document`, { cookie });
    const body = (await doc.json()) as { document: { pages: Record<string, { slug: string }> } };
    expect(
      Object.values(body.document.pages)
        .map((p) => p.slug)
        .sort(),
    ).toEqual(["", "about"]);

    // The site is live, and the dashboard knows it was moved in.
    const site = (await (await call(app, `/api/sites/${created.site.id}`, { cookie })).json()) as {
      status: string;
      import: { state: string } | null;
    };
    expect(site.status).toBe("live");
    expect(site.import?.state).toBe("ready");
    const latest = (await (
      await call(app, `/api/sites/${created.site.id}/import`, { cookie })
    ).json()) as {
      import: ImportView;
    };
    expect(latest.import.id).toBe(created.import.id);
  });

  it("needs the person to confirm the site is theirs, and a public address", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Careful Carl");
    const no = await call(app, "/api/imports", {
      method: "POST",
      cookie,
      json: { url: "https://example.com" },
    });
    expect(no.status).toBe(400);
    expect(await no.text()).toContain("your site");
    const local = await move(app, cookie, { url: "http://localhost:3000" });
    expect(local.status).toBe(400);
    expect(await local.text()).toContain("isn't a public website");
  });

  it("explains a failed move in plain words and can try again", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Fail Fiona");
    const created = (await (
      await move(app, cookie, { url: "https://fail.example.com" })
    ).json()) as Created;
    const view = (await (
      await call(app, `/api/imports/${created.import.id}`, { cookie })
    ).json()) as ImportView;
    expect(view.state).toBe("failed");
    expect(view.error).toContain("bringing pages across");
    expect(view.error).toContain("Couldn't read https://fail.example.com");
    expect(view.steps.find((s) => s.id === "pages")?.state).toBe("failed");
    const again = await call(app, `/api/imports/${created.import.id}/retry`, {
      method: "POST",
      cookie,
    });
    expect(again.status).toBe(200);
    const after = (await again.json()) as ImportView;
    expect(after.state).toBe("failed"); // the emulated address fails every time
    const row = await env.HUB_DB.prepare("SELECT attempt FROM site_imports WHERE id = ?")
      .bind(created.import.id)
      .first<{ attempt: number }>();
    expect(row?.attempt).toBe(2);
  });

  it("a failed move is never shown as live, and progress never goes backwards", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Fail Fred");
    const created = (await (
      await move(app, cookie, { url: "https://fail.example.com" })
    ).json()) as Created;
    const site = (await (await call(app, `/api/sites/${created.site.id}`, { cookie })).json()) as {
      status: string;
      statusDetail: string | null;
    };
    expect(site.status).toBe("failed");
    expect(site.statusDetail).toContain("The move didn't finish");

    // A running move: "failed" (the run's last report) and late reports keep the step reached.
    const services = createServices(env, readConfig(env));
    await env.HUB_DB.prepare(
      "UPDATE site_imports SET state = 'running', phase = 'importing', error = NULL WHERE id = ?",
    )
      .bind(created.import.id)
      .run();
    const moving = (await (
      await call(app, `/api/sites/${created.site.id}`, { cookie })
    ).json()) as {
      status: string;
    };
    expect(moving.status).toBe("building");
    await recordProgress(services, created.import.id, { phase: "failed" });
    await recordProgress(services, created.import.id, { phase: "reading" });
    const row = await env.HUB_DB.prepare("SELECT phase FROM site_imports WHERE id = ?")
      .bind(created.import.id)
      .first<{ phase: string }>();
    expect(row?.phase).toBe("importing");
  });

  it("waits for the GitHub App install step, then moves the site", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Install Iris", false);
    const created = (await (
      await move(app, cookie, { url: "https://iris.example.com" })
    ).json()) as Created;
    expect(created.import.state).toBe("waiting");
    expect(created.import.connectUrl).toContain(`/auth/github/install?site=${created.site.id}`);
    expect(created.import.headline).toContain("connect GitHub");
    const go = await call(app, `/auth/github/install?site=${created.site.id}`, { cookie });
    const state = new URL(go.headers.get("location") as string).searchParams.get("state");
    let next = `/auth/github/dev-install/confirm?state=${state}&selection=all`;
    for (let i = 0; i < 6 && (next.startsWith("/") || next.startsWith(HUB)); i++)
      next = (await call(app, next.replace(HUB, ""), { cookie })).headers.get("location") as string;
    const view = (await (
      await call(app, `/api/imports/${created.import.id}`, { cookie })
    ).json()) as ImportView;
    expect(view.state).toBe("ready");
  });

  it("only the site's own people can see a move", async () => {
    const app = createApp();
    const a = await devLogin(app, "Owner Olga");
    const b = await devLogin(app, "Stranger Sid");
    const created = (await (
      await move(app, a, { url: "https://olga.example.com" })
    ).json()) as Created;
    expect((await call(app, `/api/imports/${created.import.id}`, { cookie: b })).status).toBe(404);
  });
});

describe("Make an existing GitHub Pages repository editable in place", () => {
  async function jekyllRepo(owner: string, name: string) {
    await gh().createRepoFromTemplate({
      owner,
      name,
      files: {
        "_config.yml": "title: Power With\n",
        "index.md": "---\ntitle: Home\n---\n# Power With\n",
        CNAME: "powerwith.example.org\n",
        "README.md": "# My site\n",
        ".github/workflows/jekyll.yml":
          "jobs:\n  deploy:\n    steps:\n      - uses: actions/deploy-pages@v4\n",
        ".github/workflows/lint.yml": "jobs:\n  lint:\n    steps:\n      - run: echo ok\n",
      },
      message: "Old site",
    });
    await gh()
      .setPagesDomain({ owner, name }, null)
      .catch(() => undefined);
  }

  it("prepares a branch, opens a pull request, and publishes once it's merged", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Sophia Life");
    await jekyllRepo("sophia-life", "power-with");
    const res = await call(app, "/api/imports/convert", {
      method: "POST",
      cookie,
      json: { repo: "https://github.com/sophia-life/power-with", confirmOwnership: true },
    });
    expect(res.status, await res.clone().text()).toBe(201);
    const created = (await res.json()) as Created;
    expect(created.site.repo).toBe("sophia-life/power-with");
    let view = (await (
      await call(app, `/api/imports/${created.import.id}`, { cookie })
    ).json()) as ImportView;
    expect(view.state).toBe("review");
    expect(view.pullRequest?.url).toContain("/pull/1");
    expect(view.headline).toContain("Approve the change on GitHub");
    const repo = { owner: "sophia-life", name: "power-with" };
    const branch = (await gh().getRef(repo, "openspace/convert")) as string;
    // The old site left the branch (history kept); its Pages workflow too; README and lint stay.
    expect(await gh().readFile(repo, "_config.yml", branch)).toBeNull();
    expect(await gh().readFile(repo, ".github/workflows/jekyll.yml", branch)).toBeNull();
    expect(await gh().readFile(repo, ".github/workflows/lint.yml", branch)).not.toBeNull();
    expect(await gh().readFile(repo, "README.md", branch)).not.toBeNull();
    expect(await gh().readFile(repo, "openspace.json", branch)).toContain(created.site.id);
    const pr = await env.HUB_DB.prepare("SELECT body FROM dev_pull_requests WHERE repo = ?")
      .bind("sophia-life/power-with")
      .first<{ body: string }>();
    expect(pr?.body).toContain("Undo it");
    expect(pr?.body).toContain("Revert");
    // Publishing waits for the merge.
    const early = await call(app, `/api/sites/${created.site.id}/publish`, {
      method: "POST",
      cookie,
    });
    expect(early.status).toBe(409);

    await gh().mergePullRequest(repo, 1, { title: "Make this site editable in OpenSpace" });
    view = (await (
      await call(app, `/api/imports/${created.import.id}`, { cookie })
    ).json()) as ImportView;
    expect(view.state).toBe("ready");
    expect(await gh().getRef(repo, DRAFT_BRANCH)).toBe(await gh().getRef(repo, "main"));
  });

  it("refuses repositories that are already sites or not GitHub", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Repo Rita");
    const notGh = await call(app, "/api/imports/convert", {
      method: "POST",
      cookie,
      json: { repo: "https://www.example.com", confirmOwnership: true },
    });
    expect(notGh.status).toBe(400);
    const missing = await call(app, "/api/imports/convert", {
      method: "POST",
      cookie,
      json: { repo: "repo-rita/nothing-here", confirmOwnership: true },
    });
    expect(missing.status).toBe(404);
  });
});

describe("progress reports from the run", () => {
  it("needs the run's identity token", async () => {
    const app = createApp();
    const res = await call(app, "/ci/sites/st_0123456789/import", {
      method: "POST",
      json: { phase: "importing" },
    });
    expect(res.status).toBe(401);
  });
});

describe("remote MCP: import_site", () => {
  it("moves a site from the Claude app and reports progress", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Claude Clara");
    const { accessToken } = await oauthConnect(app, cookie, { sites: [], create: true });
    const mcp = new McpTestClient(app, `${HUB}/mcp`, accessToken);
    await mcp.initialize();
    const refused = await mcp.tool("import_site", {
      url: "https://clara.example.com",
      confirmOwnership: false,
    });
    expect(refused.result?.isError).toBe(true);
    expect(toolText(refused)).toContain("confirm");
    const made = await mcp.tool("import_site", {
      url: "https://clara.example.com",
      confirmOwnership: true,
    });
    expect(made.result?.isError, toolText(made)).toBeFalsy();
    const data = made.result?.structuredContent as { site: { id: string }; import: ImportView };
    expect(data.import.studioUrl).toBe(`http://localhost:5173/sites/${data.site.id}`);
    const status = await mcp.tool("import_status", { site: data.site.id });
    expect(toolText(status)).toContain("is live at");
    expect(toolText(status)).toContain("Finish setting up");
    // The moved site is now part of this connection.
    const sites = await mcp.tool("list_sites");
    expect(
      ((sites.result?.structuredContent?.sites ?? []) as Array<{ id: string }>).map((s) => s.id),
    ).toEqual([data.site.id]);
  });
});
