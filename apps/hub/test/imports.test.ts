import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import cliPackage from "../../../packages/cli/package.json";
import { createApp } from "../src/app";
import { getImport } from "../src/db/imports";
import { readConfig } from "../src/env";
import { DevGitHubAccess } from "../src/github/dev";
import { DRAFT_BRANCH } from "../src/github/types";
import { finishLine, needsFinishing } from "../src/mcp/tools/imports";
import { createServices } from "../src/services";
import { guessSiteName, parseImportSource, placeholderDocument } from "../src/services/import-site";
import { plainWords } from "../src/services/import-words";
import {
  attentionFromReport,
  differsWords,
  failureMessage,
  honestFidelity,
  type ImportView,
  isCalibrated,
  liveWords,
  parseFidelitySummary,
  parseLive,
  recordProgress,
  rescaleLegacyScore,
  toImportView,
} from "../src/services/imports";
import { loadSiteDocument, siteDocumentToFiles } from "../src/services/site-files";
import {
  IMPORT_CLI_VERSION,
  IMPORT_FIDELITY_DIR,
  IMPORT_HELPER_MJS,
  IMPORT_PLAYWRIGHT_VERSION,
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
    expect(Object.values(again.pages)[0]?.seo?.noindex).toBe(true);
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
    // Progress from the importer's own lines while it runs (pages read / made / compared).
    expect(IMPORT_HELPER_MJS).toContain("runWithProgress(");
    expect(IMPORT_HELPER_MJS).toContain('progress("importing", { live: live() })');
    expect(IMPORT_HELPER_MJS).toContain('"workflow", "run", "publish.yml"');
    // --owner/--render are only passed for website addresses: CLI 0.1.8's `import github`
    // rejected --owner, so every GitHub Pages move failed (wave 3 P0).
    expect(IMPORT_HELPER_MJS).toContain('if (req.owner && !fromGitHub) args.push("--owner")');
    expect(IMPORT_HELPER_MJS).toContain('req.mode === "convert" || req.platform === "github"');
    // The hosted import must run the CLI release this repo publishes.
    expect(IMPORT_CLI_VERSION).toBe(cliPackage.version);
  });

  it("reads the site in a real browser (cached), compares and tunes, and saves the comparison", () => {
    // Chromium is always there (cached between runs), like an import on a computer.
    expect(IMPORT_WORKFLOW_YML).toContain("name: Getting a browser ready");
    expect(IMPORT_WORKFLOW_YML).toContain("uses: actions/cache@v6");
    expect(IMPORT_WORKFLOW_YML).toContain("path: ~/.cache/ms-playwright");
    expect(IMPORT_WORKFLOW_YML).toContain(`key: openspace-chromium-${IMPORT_PLAYWRIGHT_VERSION}-`);
    expect(IMPORT_WORKFLOW_YML).toContain("install --with-deps chromium");
    expect(IMPORT_WORKFLOW_YML).toContain("install-deps chromium");
    expect(IMPORT_WORKFLOW_YML).not.toContain("steps.ready.outputs.render == 'true'");
    expect(IMPORT_HELPER_MJS).toContain('"-p", process.env.OPENSPACE_PLAYWRIGHT]');
    for (const flag of [
      '"--tune"',
      '"--compare-thumbs"',
      '"--compare-out"',
      `"${IMPORT_FIDELITY_DIR}"`,
    ])
      expect(IMPORT_HELPER_MJS).toContain(flag);
  });

  it("keeps only a well-formed fidelity summary, with thumbnails it names", () => {
    expect(parseFidelitySummary(null)).toBeUndefined();
    expect(parseFidelitySummary("{nope")).toBeUndefined();
    expect(parseFidelitySummary(JSON.stringify({ pages: [] }))).toBeUndefined();
    const f = parseFidelitySummary(
      JSON.stringify({
        score: 92.4,
        before: 80,
        withoutComponents: 88,
        withComponents: 92,
        changes: ["h2: 60px", 7],
        pages: [
          {
            path: "/",
            device: "desktop",
            score: 94,
            before: 81,
            image: "thumb-home-d.jpg",
            differs: ["Columns"],
          },
          { path: "/about", device: "phone", score: 300, image: "../../secrets.json" },
          { path: "about", score: 50 },
        ],
      }),
    );
    expect(f).toEqual({
      score: 92,
      before: 80,
      withoutComponents: 88,
      withComponents: 92,
      changes: ["h2: 60px"],
      pages: [
        {
          path: "/",
          device: "desktop",
          score: 94,
          before: 81,
          image: "thumb-home-d.jpg",
          differs: ["Columns"],
        },
        { path: "/about", device: "phone", score: 100 },
      ],
    });
    // Each difference once, in plain words (wave 4: "Present, Present", "Height, Height, Height").
    expect(differsWords(["Height", "Height", "Height"])).toEqual(["Section heights"]);
    expect(differsWords(["Present", "Present", "Columns"])).toEqual([
      "A section that didn’t come across",
      "columns",
    ]);
    expect(differsWords(["Label font", "Buttons size", "Buttons letter spacing and case"])).toEqual(
      ["Label font", "button size", "button lettering"],
    );
    expect(differsWords(["Heading 2: present"])).toEqual(["Heading 2 style"]);
  });

  it("keeps the strict v3 score beside the corrected one (and stays readable without it)", () => {
    const f = parseFidelitySummary(
      JSON.stringify({
        version: 1,
        score: 91,
        strict: 88.4,
        scorer: "v3.1-corrected",
        before: 80,
        strictBefore: 77,
        pages: [
          {
            path: "/",
            device: "desktop",
            score: 93,
            strict: 90,
            before: 79,
            strictBefore: 76,
            corrections: ["Section 3: columns counted on screen only.", 5, "x".repeat(400)],
          },
        ],
      }),
    );
    expect(f).toEqual({
      score: 91,
      strict: 88,
      scorer: "v3.1-corrected",
      before: 80,
      strictBefore: 77,
      pages: [
        {
          path: "/",
          device: "desktop",
          score: 93,
          strict: 90,
          before: 79,
          strictBefore: 76,
          corrections: ["Section 3: columns counted on screen only.", "x".repeat(240)],
        },
      ],
    });
    // An older summary (no strict score) reads as before.
    expect(parseFidelitySummary(JSON.stringify({ score: 70, pages: [] }))).toEqual({
      score: 70,
      pages: [],
    });
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

  it("What needs your attention speaks the owner's language, not the importer's", () => {
    const report = [
      "# Import report",
      "",
      "## Needs attention",
      "",
      "### Commerce",
      "",
      "- 15 product(s) imported as catalog content. Selling needs the Cloudflare target and Stripe connected in the Hub; orders, customers, inventory, discounts, shipping and tax settings stay in Squarespace. _(/shop)_",
      "",
      "### Forms and newsletter",
      "",
      "- Newsletter signup recreated. Squarespace Email Campaigns / Mailchimp subscribers are not moved: export your list from Squarespace and import it in the Hub. _(/)_",
      "",
      "### Other",
      "",
      "- The page had no Heading 1; its first heading was made the Heading 1 (search engines and screen readers use it). _(/about)_",
      "- The home page was a collection on Squarespace; it is now a page listing that collection (the collection has its own address, with a redirect). _(site)_",
      "- Member area: its content isn't public, so it was not imported. Recreate it as a members-only page (Cloudflare target). _(/members)_",
      "",
    ].join("\n");
    const all = attentionFromReport(report).flatMap((g) => g.items);
    expect(all).toHaveLength(5);
    const text = all.join("\n");
    for (const jargon of [/Cloudflare/, /\bHub\b/, /Heading 1/, /target/, /\(s\)/, /collection on/])
      expect(text).not.toMatch(jargon);
    expect(all[0]).toContain("Your 15 products came across");
    expect(all[0]).toContain("(/shop)");
    expect(all[1]).toContain("Inbox → Subscribers → Import");
    expect(all[2]).toContain("main title");
    expect(plainWords("1 form(s) came across.")).toBe("1 form came across.");
    // GitHub Pages never kept subscribers: no "export them there" (wave 4).
    const pages = plainWords(
      "Sign-up forms came across, but subscribers stay with GitHub Pages. Export them there and import them here.",
    );
    expect(pages).not.toMatch(/GitHub Pages|Export them there/);
    expect(pages).toMatch(/didn’t keep a subscriber list/);
    expect(
      plainWords(
        "Newsletter signup recreated. Subscribers are not moved: export your list from Jekyll (GitHub Pages) (or your email service) and import it in the Hub.",
      ),
    ).toMatch(/didn’t keep a subscriber list/);
    expect(
      plainWords(
        "Sign-up forms came across, but subscribers stay with Squarespace. Export them there and import them here.",
      ),
    ).toContain("download it from Squarespace");
    expect(
      plainWords("Selling needs the Cloudflare target and Stripe connected in the Hub."),
    ).not.toMatch(/Cloudflare|Hub/);
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
    // The comparison with the old site: before → after tuning, with side-by-side thumbnails.
    expect(view.fidelity).toMatchObject({ score: 93, before: 81, strict: 91, strictBefore: 80 });
    const thumb = view.fidelity?.pages[0]?.image as string;
    expect(thumb).toMatch(
      new RegExp(`/api/imports/${created.import.id}/fidelity/thumb-home-d\\.jpg$`),
    );
    expect(view.fidelity?.pages[1]).toMatchObject({ device: "phone", image: null });
    const img = await call(app, new URL(thumb).pathname, { cookie });
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect((await img.arrayBuffer()).byteLength).toBeGreaterThan(10);
    // Only the thumbnails the summary names, only for the site's people.
    expect(
      (await call(app, `/api/imports/${created.import.id}/fidelity/thumb-other.jpg`, { cookie }))
        .status,
    ).toBe(404);
    expect(
      (
        await call(app, `/api/imports/${created.import.id}/fidelity/fidelity-summary.json`, {
          cookie,
        })
      ).status,
    ).toBe(404);
    const stranger = await devLogin(app, "Someone Else");
    expect([403, 404]).toContain(
      (await call(app, new URL(thumb).pathname, { cookie: stranger })).status,
    );

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

    // Live progress while pages come across (wave 4: one step sat still for 8 minutes).
    await recordProgress(services, created.import.id, {
      phase: "importing",
      live: parseLive({ stage: "comparing", done: 3, total: 8, round: 1 }, 1) as never,
    });
    const liveRow = await getImport(env.HUB_DB, created.import.id);
    const view = toImportView(
      services,
      liveRow as never,
      {
        id: created.site.id,
        name: created.site.name,
        url: null,
        github_access: null,
      } as never,
    );
    expect(view.steps.find((st) => st.id === "pages")).toMatchObject({
      state: "active",
      detail: "Comparing with your old site: page 3 of 8",
    });
    expect(view.counts).toBeNull();
    expect(parseLive({ stage: "nope", done: 1 }, 1)).toBeUndefined();
    expect(liveWords({ stage: "reading", done: 1, at: 0 })).toBe("1 page read so far");
    expect(liveWords({ stage: "comparing", done: 2, total: 8, round: 2, at: 0 })).toBe(
      "Fine-tuning: page 2 of 8 (pass 2)",
    );
    // The finished run's counts replace the live progress.
    await recordProgress(services, created.import.id, {
      phase: "imported",
      counts: { pages: 8, items: 0, media: 3, redirects: 0 },
    });
    const done = toImportView(
      services,
      (await getImport(env.HUB_DB, created.import.id)) as never,
      {
        id: created.site.id,
        name: created.site.name,
        url: null,
        github_access: null,
      } as never,
    );
    expect(done.counts?.pages).toBe(8);

    // A failed move can still be deleted (clean-up of test or abandoned sites).
    await env.HUB_DB.prepare("UPDATE site_imports SET state = 'failed' WHERE id = ?")
      .bind(created.import.id)
      .run();
    const gone = await call(app, `/api/sites/${created.site.id}`, {
      method: "DELETE",
      cookie,
      json: { confirmName: created.site.name },
    });
    expect(gone.status).toBe(200);
    expect((await call(app, `/api/sites/${created.site.id}`, { cookie })).status).toBe(404);
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
    expect(toolText(status)).toContain(
      "How close it looks to the original: 93/100 (measured the strict way: 91/100)",
    );
    // The next step straight after the score, not at the end.
    const text = toolText(status);
    expect(text.indexOf("Next step — finish it with Claude")).toBe(
      text.indexOf("How close it looks to the original") +
        text.slice(text.indexOf("How close it looks to the original")).indexOf("\n") +
        1,
    );
    expect(toolText(status)).toContain("Finish setting up");
    // Enough for Claude to take the move further: the old address, each page and what differs.
    expect(toolText(status)).toContain("Moved from: https://clara.example.com");
    expect(toolText(status)).toContain("/ on a phone: 91/100 — still differs: Image placement");
    expect(toolText(status)).toContain("finish-a-move");
    // The moved site is now part of this connection.
    const sites = await mcp.tool("list_sites");
    expect(
      ((sites.result?.structuredContent?.sites ?? []) as Array<{ id: string }>).map((s) => s.id),
    ).toEqual([data.site.id]);
  });
});

describe("when import_status suggests finishing a move by hand", () => {
  const view = (fidelity: ImportView["fidelity"], attention: ImportView["attention"] = []) =>
    ({ fidelity, attention }) as ImportView;
  it("below 90, with listed differences, or with things that didn't come across", () => {
    expect(needsFinishing(view({ score: 84, pages: [] }))).toBe(true);
    expect(
      needsFinishing(
        view({ score: 95, pages: [{ path: "/", device: "phone", score: 95, image: null }] }),
      ),
    ).toBe(false);
    expect(
      needsFinishing(
        view({
          score: 93,
          pages: [{ path: "/", device: "phone", score: 91, image: null, differs: ["Fonts"] }],
        }),
      ),
    ).toBe(true);
    expect(needsFinishing(view(null, [{ title: "Embeds", items: ["A widget"] }]))).toBe(true);
    expect(needsFinishing(view(null))).toBe(false);
  });

  it("says plainly how close it came, then offers finishing with Claude as the next step", () => {
    const rough = finishLine(view({ score: 12, pages: [] }));
    expect(rough).toMatch(
      /^Next step — finish it with Claude: the automatic move is rough \(12\/100\)/,
    );
    expect(rough).toContain("don't call it a close match");
    expect(rough).toContain("finish-a-move");
    expect(finishLine(view({ score: 72, pages: [] }))).toContain(
      "the automatic move got the basics (72/100), but it isn't a close match yet",
    );
    expect(finishLine(view({ score: 93, pages: [] }))).toContain("it's close");
  });
});

describe("fidelity summaries saved before the score was calibrated", () => {
  it("are re-scaled, so an old move isn't over-trusted", () => {
    expect(isCalibrated("v4-calibrated")).toBe(true);
    expect(isCalibrated("v5")).toBe(true);
    expect(isCalibrated("v3.1-corrected")).toBe(false);
    expect(isCalibrated(undefined)).toBe(false);
    // The tester's Framer move: shown 50/100, honestly ~10.
    expect(rescaleLegacyScore(50)).toBe(0);
    expect(rescaleLegacyScore(100)).toBe(100);
    expect(rescaleLegacyScore(82)).toBe(60);
    const old = {
      score: 70,
      before: 60,
      strict: 68,
      scorer: "v3.1-corrected",
      pages: [
        { path: "/", device: "desktop" as const, score: 50, before: 45 },
        { path: "/", device: "phone" as const, score: 90, before: 75 },
      ],
    };
    const shown = honestFidelity(old);
    expect(shown.rescaledFrom).toBe(70);
    expect(shown.pages.map((p) => p.score)).toEqual([0, 78]);
    // A good phone doesn't hide a broken computer page: halfway between average and weakest.
    expect(shown.score).toBe(Math.round(0.5 * 39 + 0.5 * 0));
    expect(shown.before).toBe(Math.round(0.5 * 22 + 0.5 * 0));
    // Without the strict number per page, the site's own strict score is re-scaled.
    expect(shown.strict).toBe(rescaleLegacyScore(68));
    // A calibrated summary is shown as it is.
    const now = { ...old, scorer: "v4-calibrated" };
    expect(honestFidelity(now)).toBe(now);
  });
});
