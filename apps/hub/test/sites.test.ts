import { env } from "cloudflare:test";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { DevGitHubAccess } from "../src/github/dev";
import { GitHubApiError } from "../src/github/types";
import { bytesToBase64 } from "../src/lib/crypto";
import { loadSiteDocument } from "../src/services/site-files";
import { slugifyRepoName } from "../src/services/sites";
import { basicTemplate } from "../src/templates/basic";
import { call, cookieFrom, devLogin } from "./helpers";
import { generateAppKey, pem } from "./keys";
import { mockFetch, type RecordedCall, status } from "./mock-fetch";

interface LookJson {
  styles: Record<string, unknown>;
  siteStyles: { choices: { pairing: string } };
}

interface SiteJson {
  id: string;
  name: string;
  repo: string;
  status: string;
  url: string;
  template: string;
  look: string;
  role: string;
  createdAt: string;
  inboxCount: number;
  updateAvailable: boolean;
  statusDetail: string | null;
}

async function create(
  app: ReturnType<typeof createApp>,
  cookie: string,
  body: Record<string, unknown>,
) {
  const res = await call(app, "/api/sites", { method: "POST", cookie, json: body });
  return { res, site: (await res.json()) as SiteJson };
}

describe("templates API", () => {
  it("lists the launch templates without an account and serves a template document", async () => {
    const app = createApp();
    const res = await call(app, "/api/templates");
    expect(res.status).toBe(200);
    const { templates: items } = (await res.json()) as {
      templates: Array<Record<string, unknown>>;
    };
    expect(items).toHaveLength(12);
    expect(items.map((t) => t.id)).not.toContain("basic");
    expect(items[0]).toMatchObject({
      id: "meadow",
      name: "Meadow",
      persona: expect.any(String),
      mood: expect.any(String),
      version: "1.0.0",
      thumbnailUrl: expect.stringMatching(/^https:\/\//),
      previewUrl: "http://localhost:8787/t/meadow/",
      sample: { name: expect.any(String), tagline: expect.any(String) },
    });
    for (const item of items) expect((item.looks as unknown[]).length).toBe(3);
    // Studio's compact look preview (solved colors, font stacks, radius, image shape).
    const look = ((items[0] as Record<string, unknown>).looks as LookJson[])[0];
    expect(look?.styles).toMatchObject({
      colors: {
        background: expect.stringMatching(/^#[0-9a-f]{6}$/),
        accent: expect.stringMatching(/^#[0-9a-f]{6}$/),
        onAccent: expect.stringMatching(/^#[0-9a-f]{6}$/),
      },
      fonts: { heading: expect.any(String), body: expect.any(String) },
    });
    expect(look?.siteStyles.choices.pairing).toEqual(expect.any(String));

    const one = await call(app, "/api/templates/meadow");
    const body = (await one.json()) as { document: SiteDocument };
    expect(Object.values(body.document.pages).some((p) => p.slug === "")).toBe(true);
    expect((await call(app, "/api/templates/nope")).status).toBe(404);
    // The small "basic" fixture is still loadable (tests), just not listed.
    expect((await call(app, "/api/templates/basic")).status).toBe(200);

    const preview = await call(app, "/t/meadow/");
    expect(preview.status).toBe(200);
    const tplHtml = await preview.text();
    expect(tplHtml).toContain("data-os-page=");
    expect(tplHtml).toContain("Fernwood");
  });

  it("creates a site from a launch template with the starter shell", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Kai Moreno");
    const { res, site } = await create(app, cookie, {
      template: "meadow",
      look: "oat-sage",
      name: "Fernwood Studio",
    });
    expect(res.status, JSON.stringify(site)).toBe(201);
    const doc = (await (await call(app, `/api/sites/${site.id}/document`, { cookie })).json()) as {
      document: SiteDocument;
    };
    expect(doc.document.site.title).toBe("Fernwood Studio");
    const files = await env.HUB_DB.prepare(
      "SELECT COUNT(*) AS n FROM dev_files f WHERE f.content LIKE '%name: Publish%'",
    ).first<{ n: number }>();
    expect(files?.n).toBeGreaterThan(0);
  });
});

describe("template personalization slots", () => {
  const headings = (doc: SiteDocument) =>
    Object.values(doc.pages)
      .find((p) => p.slug === "")
      ?.sections.slice(0, 2)
      .flatMap((s) => s.blocks)
      .filter((b) => b.type === "heading")
      .map((b) => (b.fields as { text?: string }).text) ?? [];

  async function created(template: string, name: string, tagline?: string) {
    const app = createApp();
    const cookie = await devLogin(app, `Owner ${template}`);
    const { res, site } = await create(app, cookie, {
      template,
      name,
      ...(tagline ? { tagline } : {}),
    });
    expect(res.status, JSON.stringify(site)).toBe(201);
    const body = (await (await call(app, `/api/sites/${site.id}/document`, { cookie })).json()) as {
      document: SiteDocument;
    };
    return body.document;
  }

  it("puts the tagline in the hero headline that carried the demo tagline", async () => {
    const doc = await created("meadow", "Cedar Yoga", "Gentle classes for tired bodies.");
    expect(headings(doc)).toContain("Gentle classes for tired bodies.");
    expect(headings(doc)).not.toContain("Slow yoga and bodywork for real bodies");
    expect(doc.site.title).toBe("Cedar Yoga");
  });

  it("replaces the demo owner's name, whole or inside a headline", async () => {
    const link = await created("link", "Ana Ruiz");
    expect(headings(link)).toContain("Ana Ruiz");
    expect(headings(link)).not.toContain("Kai Moreno");
    const vow = await created("vow", "Sam & Lee");
    expect(headings(vow)).toContain("Sam & Lee are getting married");
  });

  it("leaves headlines alone when no tagline is given", async () => {
    const doc = await created("meadow", "Cedar Yoga");
    expect(headings(doc)).toContain("Slow yoga and bodywork for real bodies");
  });
});

describe("sites API (dev GitHub)", () => {
  it("creates a site end to end: repo, draft branch, live dev URL, personalized content", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Maya Lin");
    const { res, site } = await create(app, cookie, {
      template: "basic",
      look: "warm",
      name: "Maya Yoga",
      tagline: "Slow, grounded yoga in Boulder.",
      brandColor: "#2f6f4e",
    });
    expect(res.status).toBe(201);
    expect(site).toMatchObject({
      name: "Maya Yoga",
      repo: "maya-lin/maya-yoga",
      status: "live",
      template: "basic",
      look: "warm",
      role: "owner",
      tagline: "Slow, grounded yoga in Boulder.",
      owner: "maya-lin",
      ownerName: "Maya Lin",
      inboxCount: 0,
      updateAvailable: false,
      statusDetail: null,
    });
    expect(site.id).toMatch(/^st_[0-9a-hjkmnp-tv-z]{10}$/);
    expect(site.url).toBe(`http://localhost:8787/s/${site.id}/`);
    expect(new Date(site.createdAt).toString()).not.toBe("Invalid Date");

    // The repo exists with the template's non-content files and the personalized document.
    const gh = new DevGitHubAccess(env.HUB_DB);
    const repo = { owner: "maya-lin", name: "maya-yoga" };
    const files = await gh.readFiles(repo, "main");
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        "openspace.json",
        "content/site.json",
        "content/styles.json",
        "content/pages/home.json",
        "AGENTS.md",
        ".github/workflows/publish.yml",
        "package.json",
      ]),
    );
    expect(await gh.getRef(repo, "os/draft")).toBe(await gh.getRef(repo, "main"));
    const config = JSON.parse(files["openspace.json"] as string);
    expect(config).toMatchObject({
      siteId: site.id,
      hub: "http://localhost:8787",
      template: { id: "basic", version: "1.0.0" },
      deploy: { target: "github-pages", url: site.url, customDomain: null },
    });

    const docRes = await call(app, `/api/sites/${site.id}/document`, { cookie });
    expect(docRes.status).toBe(200);
    const { document, head, branch } = (await docRes.json()) as {
      document: SiteDocument;
      head: string;
      branch: string;
    };
    expect(branch).toBe("os/draft");
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(document.site.title).toBe("Maya Yoga");
    expect(document.site.tagline).toBe("Slow, grounded yoga in Boulder.");
    expect(document.site.seo?.titleTemplate).toBe("%s — Maya Yoga");
    expect(document.styles.choices.pairing).toBe("lora-inter");
    expect(document.styles.choices.palette).toMatchObject({ brand: "#2f6f4e", source: "brand" });
    const home = Object.values(document.pages)[0];
    const heroTitle = home?.sections[0]?.blocks[0]?.fields.content as {
      content: Array<Record<string, unknown>>;
    };
    expect(heroTitle.content[0]).toEqual({
      type: "heading",
      attrs: { level: 1, preset: "display" },
      content: [{ type: "text", text: "Maya Yoga" }],
    });
    expect(home?.seo?.description).toBe("Slow, grounded yoga in Boulder.");

    // The published site is served by the dev preview without signing in.
    const live = await call(app, `/s/${site.id}/`);
    expect(live.status).toBe(200);
    // Owner content on the Hub origin is sandboxed (opaque origin: no Hub cookies or APIs).
    expect(live.headers.get("content-security-policy")).toBe(
      "sandbox allow-scripts allow-popups allow-forms",
    );
    expect(live.headers.get("x-content-type-options")).toBe("nosniff");
    const html = await live.text();
    // The real renderer (ADR-3): the same document a published build produces.
    expect(html).toMatch(/<title>Maya Yoga[^<]*<\/title>/);
    expect(html).toContain('<style data-os="blocks">');
    expect(html).toContain("Slow, grounded yoga in Boulder.");
    expect(html).toContain(`data-os-page="${home?.id}"`);
    expect((await call(app, `/s/${site.id}`)).status).toBe(200);
    expect((await call(app, `/s/${site.id}/missing-page`)).status).toBe(404);
    expect((await call(app, "/s/st_0000000000/")).status).toBe(404);

    // Draft preview is for collaborators only.
    expect((await call(app, `/p/${site.id}/`)).status).toBe(401);
    const draft = await call(app, `/p/${site.id}/`, { cookie });
    expect(draft.status).toBe(200);
    expect(draft.headers.get("content-security-policy")).toContain("sandbox");
    expect(draft.headers.get("content-security-policy")).not.toContain("allow-same-origin");
    const notFoundPage = await call(app, `/s/${site.id}/missing`);
    expect(notFoundPage.headers.get("content-security-policy")).toContain("sandbox");
    expect(draft.headers.get("cache-control")).toBe("no-store");
    expect(await draft.text()).toContain('<meta name="robots" content="noindex">');
    const stranger = await devLogin(app, "Stranger");
    expect((await call(app, `/p/${site.id}/`, { cookie: stranger })).status).toBe(404);
    expect((await call(app, `/api/sites/${site.id}`, { cookie: stranger })).status).toBe(404);

    // Behaviors: none from the placeholder renderer.
    expect((await call(app, "/_os/behaviors/gallery.js")).status).toBe(404);

    // Audit trail.
    const audit = await env.HUB_DB.prepare("SELECT action FROM audit_log WHERE site_id = ?")
      .bind(site.id)
      .all();
    expect(audit.results).toEqual([{ action: "site.create" }]);
  });

  it("lists, gets, renames; repo names are unique per owner", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Sam");
    const a = (await create(app, cookie, { template: "basic", name: "Corner Café" })).site;
    const b = (await create(app, cookie, { template: "basic", name: "Corner Cafe" })).site;
    expect(a.repo).toBe("sam/corner-cafe");
    expect(b.repo).toBe("sam/corner-cafe-2");
    expect(a.look).toBe("calm"); // first look by default

    const list = await call(app, "/api/sites", { cookie });
    const { sites: items } = (await list.json()) as { sites: SiteJson[] };
    expect(items.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    const other = await devLogin(app, "Other");
    expect(
      ((await (await call(app, "/api/sites", { cookie: other })).json()) as { sites: unknown[] })
        .sites,
    ).toEqual([]);

    const got = await call(app, `/api/sites/${a.id}`, { cookie });
    expect(((await got.json()) as SiteJson).name).toBe("Corner Café");
    const renamed = await call(app, `/api/sites/${a.id}`, {
      method: "PATCH",
      cookie,
      json: { name: "The Corner" },
    });
    expect(((await renamed.json()) as SiteJson).name).toBe("The Corner");
    expect(
      (await call(app, `/api/sites/${a.id}`, { method: "PATCH", cookie, json: { repo: "x" } }))
        .status,
    ).toBe(400);
    expect((await call(app, "/api/sites")).status).toBe(401);
  });

  it("stores an uploaded logo as site media", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Logo Owner");
    // A 3x2 PNG header is enough for the size sniffer; content is opaque to the Hub.
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0,
      3, 0, 0, 0, 2, 8, 6, 0, 0, 0,
    ]);
    const logo = `data:image/png;base64,${bytesToBase64(png)}`;
    const { res, site } = await create(app, cookie, { template: "basic", name: "Logo Co", logo });
    expect(res.status).toBe(201);
    const doc = (
      (await (await call(app, `/api/sites/${site.id}/document`, { cookie })).json()) as {
        document: SiteDocument;
      }
    ).document;
    const src = doc.site.logo?.src as string;
    expect(src).toMatch(/^media\/\d{4}\/\d{2}\/logo-[0-9a-z]{6}\.png$/);
    expect(doc.site.logo).toMatchObject({ alt: "Logo Co", width: 3, height: 2 });
    expect(doc.media[src as keyof typeof doc.media]).toMatchObject({
      kind: "image",
      mime: "image/png",
      bytes: png.length,
      width: 3,
      height: 2,
    });
    const files = await new DevGitHubAccess(env.HUB_DB).readFiles(
      { owner: "logo-owner", name: "logo-co" },
      "main",
    );
    expect(files[src]).toBe(bytesToBase64(png));

    for (const bad of [
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      `data:image/jpeg;base64,${bytesToBase64(png)}`, // declared type doesn't match bytes
      `data:image/png;base64,${bytesToBase64(new Uint8Array(1024 * 1024 + 1))}`,
      "not a data url",
    ]) {
      const r = await create(app, cookie, { template: "basic", name: "Bad Logo", logo: bad });
      expect(r.res.status).toBe(400);
      expect((r.site as unknown as { error: { code: string } }).error.code).toMatch(
        /invalid_logo|invalid_request/,
      );
    }
  });

  it("validates input and refuses secrets in content", async () => {
    const app = createApp();
    const cookie = await devLogin(app);
    expect((await create(app, cookie, { template: "nope", name: "X" })).res.status).toBe(404);
    expect(
      (await create(app, cookie, { template: "basic", look: "nope", name: "X" })).res.status,
    ).toBe(400);
    expect((await create(app, cookie, { template: "basic", name: "" })).res.status).toBe(400);
    expect(
      (await create(app, cookie, { template: "basic", name: "X", brandColor: "red; x" })).res
        .status,
    ).toBe(400);
    const secret = await create(app, cookie, {
      template: "basic",
      name: "Shop",
      tagline: `api_key = ${["sk", "live", "51HxQ2aBcDeFgHiJkLmNoPqRs"].join("_")}`,
    });
    expect(secret.res.status).toBe(422);
    expect((secret.site as unknown as { error: { code: string } }).error.code).toBe(
      "secret_detected",
    );
    const count = await env.HUB_DB.prepare("SELECT COUNT(*) AS n FROM sites").first<{
      n: number;
    }>();
    expect(count?.n).toBe(0);
  });

  it("archives with typed confirmation and 30-day retention (owner only)", async () => {
    const now = Date.UTC(2026, 9, 26);
    const app = createApp({ services: { now: () => now } });
    const cookie = await devLogin(app, "Maya");
    const { site } = await create(app, cookie, { template: "basic", name: "Maya Yoga" });
    const wrong = await call(app, `/api/sites/${site.id}`, {
      method: "DELETE",
      cookie,
      json: { confirm: "maya" },
    });
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { error: { code: string } }).error.code).toBe(
      "confirmation_mismatch",
    );
    const ok = await call(app, `/api/sites/${site.id}`, {
      method: "DELETE",
      cookie,
      json: { confirmName: "Maya Yoga" },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      id: site.id,
      archivedAt: new Date(now).toISOString(),
      purgeAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(
      (await new DevGitHubAccess(env.HUB_DB).getRepo({ owner: "maya", name: "maya-yoga" }))
        ?.archived,
    ).toBe(true);
    expect((await call(app, `/api/sites/${site.id}`, { cookie })).status).toBe(404);
    expect((await call(app, `/s/${site.id}/`)).status).toBe(404);
    // The name is free again.
    expect((await create(app, cookie, { template: "basic", name: "Maya Yoga" })).site.repo).toBe(
      "maya/maya-yoga-2",
    );
  });

  it("transfers ownership; the previous owner stays as designer", async () => {
    const app = createApp();
    const pro = await devLogin(app, "Gardener");
    const client = await devLogin(app, "Client Co");
    const { site } = await create(app, pro, { template: "basic", name: "Client Site" });
    const missing = await call(app, `/api/sites/${site.id}/transfer`, {
      method: "POST",
      cookie: pro,
      json: { to: "nobody" },
    });
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe(
      "user_not_found",
    );
    const res = await call(app, `/api/sites/${site.id}/transfer`, {
      method: "POST",
      cookie: pro,
      json: { to: "client-co" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "complete",
      site: { repo: "client-co/client-site", role: "designer", owner: "client-co" },
    });
    const clientView = (await (
      await call(app, `/api/sites/${site.id}`, { cookie: client })
    ).json()) as SiteJson;
    expect(clientView).toMatchObject({ role: "owner", repo: "client-co/client-site" });
    // Designers can't transfer or delete.
    expect(
      (
        await call(app, `/api/sites/${site.id}/transfer`, {
          method: "POST",
          cookie: pro,
          json: { to: "gardener" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(app, `/api/sites/${site.id}`, {
          method: "DELETE",
          cookie: pro,
          json: { confirm: "Client Site" },
        })
      ).status,
    ).toBe(403);
    // Content still reads from the moved repo.
    expect((await call(app, `/api/sites/${site.id}/document`, { cookie: client })).status).toBe(
      200,
    );
    expect((await call(app, `/s/${site.id}/`)).status).toBe(200);
  });

  it("resumes setup after a failure creating the repo", async () => {
    let failCreate = true;
    const app = createApp({
      services: {
        github: (_ctx, sv) => {
          const dev = new DevGitHubAccess(sv.db, { pagesUrl: () => "http://localhost:8787/s/x/" });
          const create = dev.createRepoFromTemplate.bind(dev);
          dev.createRepoFromTemplate = async (input) => {
            if (failCreate) throw new GitHubApiError("GitHub is down", 503);
            return create(input);
          };
          return dev;
        },
      },
    });
    const cookie = await devLogin(app, "Retry One");
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0,
      4, 0, 0, 0, 4,
    ]);
    const { site } = await create(app, cookie, {
      template: "basic",
      look: "bold",
      name: "Second Try",
      tagline: "Persistence pays.",
      brandColor: "#123456",
      logo: `data:image/png;base64,${bytesToBase64(png)}`,
    });
    expect(site.status).toBe("failed");
    const gh = new DevGitHubAccess(env.HUB_DB);
    const repo = { owner: "retry-one", name: "second-try" };
    expect(await gh.getRepo(repo)).toBeNull();

    failCreate = false;
    const retry = await call(app, `/api/sites/${site.id}/publish`, { method: "POST", cookie });
    expect(await retry.json()).toMatchObject({ status: "live", statusDetail: null });
    // The repo was created from the stored setup: same look, tagline, color and logo.
    const doc = loadSiteDocument(await gh.readFiles(repo, "main", { textOnly: true }));
    expect(doc.config.siteId).toBe(site.id);
    expect(doc.site.tagline).toBe("Persistence pays.");
    expect(doc.styles.choices.pairing).toBe("space-grotesk-inter");
    expect(doc.styles.choices.palette.brand).toBe("#123456");
    const logoPath = doc.site.logo?.src as string;
    expect((await gh.readFiles(repo, "main"))[logoPath]).toBe(bytesToBase64(png));
    expect(await gh.getRef(repo, "os/draft")).toBe(await gh.getRef(repo, "main"));
  });

  it("resumes setup after a failure committing the initial content", async () => {
    let failCommit = true;
    const app = createApp({
      services: {
        github: (_ctx, sv) => {
          const dev = new DevGitHubAccess(sv.db, { pagesUrl: () => "http://localhost:8787/s/x/" });
          const create = dev.createRepoFromTemplate.bind(dev);
          dev.createRepoFromTemplate = async (input) => {
            if (!failCommit) return create(input);
            // Like GitHub: the repo exists (auto-init README) but the content commit failed.
            await create({ ...input, files: { "README.md": "# New repo\n" } });
            throw new GitHubApiError("Commit failed", 502);
          };
          return dev;
        },
      },
    });
    const cookie = await devLogin(app, "Retry Two");
    const { site } = await create(app, cookie, { template: "basic", name: "Half Done" });
    expect(site.status).toBe("failed");
    const gh = new DevGitHubAccess(env.HUB_DB);
    const repo = { owner: "retry-two", name: "half-done" };
    expect(await gh.readFile(repo, "openspace.json", "main")).toBeNull();
    expect(await gh.getRef(repo, "os/draft")).toBeNull();

    failCommit = false;
    const retry = await call(app, `/api/sites/${site.id}/publish`, { method: "POST", cookie });
    expect(await retry.json()).toMatchObject({ status: "live" });
    const files = await gh.readFiles(repo, "main");
    expect(files["README.md"]).toBe("# New repo\n");
    expect(JSON.parse(files["openspace.json"] as string).siteId).toBe(site.id);
    expect(await gh.getRef(repo, "os/draft")).toBe(await gh.getRef(repo, "main"));
    // Publishing again is a no-op for setup (no duplicate content commit).
    await call(app, `/api/sites/${site.id}/publish`, { method: "POST", cookie });
    const log = await gh.listCommits(repo, { ref: "main" });
    expect(log.map((c) => c.message)).toEqual(["Set up Half Done", "Create Half Done"]);
  });

  it("retries with the next name when a concurrent create claims the repo name", async () => {
    let raced = false;
    const app = createApp({
      services: {
        github: (ctx, sv) => {
          const dev = new DevGitHubAccess(sv.db);
          const getRepo = dev.getRepo.bind(dev);
          dev.getRepo = async (repo) => {
            if (!raced && repo.name === "racy" && ctx.user) {
              raced = true;
              // Another request claims "racy" between our availability check and our insert.
              await sv.db
                .prepare(
                  "INSERT INTO sites (id, owner_id, name, repo, template_id, template_version, created_at, updated_at) VALUES ('st_0therrace0', ?, 'Racy', ?, 'basic', '1.0.0', 0, 0)",
                )
                .bind(ctx.user.id, `${repo.owner}/racy`)
                .run();
            }
            return getRepo(repo);
          };
          return dev;
        },
      },
    });
    const cookie = await devLogin(app, "Racer");
    const { res, site } = await create(app, cookie, { template: "basic", name: "Racy" });
    expect(res.status).toBe(201);
    expect(site.repo).toBe("racer/racy-2");
  });

  it("maps invalid repository names to 400", async () => {
    const app = createApp();
    const cookie = await devLogin(app, "Broken");
    const { site } = await create(app, cookie, { template: "basic", name: "Broken" });
    await env.HUB_DB.prepare("UPDATE sites SET repo = 'no-slash' WHERE id = ?").bind(site.id).run();
    const res = await call(app, `/api/sites/${site.id}/document`, { cookie });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("bad_request");
  });

  it("transfers immediately in dev mode", async () => {
    const app = createApp();
    const pro = await devLogin(app, "Dev Pro");
    await devLogin(app, "Dev Client");
    const { site } = await create(app, pro, { template: "basic", name: "Handoff" });
    const res = await call(app, `/api/sites/${site.id}/transfer`, {
      method: "POST",
      cookie: pro,
      json: { to: "dev-client" },
    });
    expect(await res.json()).toMatchObject({
      status: "complete",
      site: { repo: "dev-client/handoff", role: "designer", transfer: null },
    });
  });

  it("records a failed site when GitHub fails mid-way", async () => {
    const app = createApp({
      services: {
        github: (_ctx, s) => {
          const dev = new DevGitHubAccess(s.db);
          dev.enablePages = async () => {
            throw new GitHubApiError("Pages unavailable", 503);
          };
          return dev;
        },
      },
    });
    const cookie = await devLogin(app);
    const { res, site } = await create(app, cookie, { template: "basic", name: "Flaky" });
    expect(res.status).toBe(201);
    expect(site.status).toBe("failed");
    expect(site.statusDetail).toMatch(/couldn't finish/);
    const { sites: items } = (await (await call(app, "/api/sites", { cookie })).json()) as {
      sites: SiteJson[];
    };
    expect(items[0]?.status).toBe("failed");

    // Retrying the publish once GitHub is healthy brings the site live.
    const healthy = createApp();
    const retry = await call(healthy, `/api/sites/${site.id}/publish`, { method: "POST", cookie });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ id: site.id, status: "live", statusDetail: null });
    expect((await call(healthy, `/s/${site.id}/`)).status).toBe(200);
    const stranger = await devLogin(healthy, "Someone Else");
    expect(
      (await call(healthy, `/api/sites/${site.id}/publish`, { method: "POST", cookie: stranger }))
        .status,
    ).toBe(404);
  });

  it("reports updates when the template has a newer version", async () => {
    const app = createApp();
    const cookie = await devLogin(app);
    const { site } = await create(app, cookie, { template: "basic", name: "Old" });
    const newer = createApp({
      services: {
        templates: {
          list: async () => [{ ...basicTemplate.meta, version: "1.1.0" }],
          load: async () => basicTemplate,
        },
      },
    });
    expect(
      ((await (await call(newer, `/api/sites/${site.id}`, { cookie })).json()) as SiteJson)
        .updateAvailable,
    ).toBe(true);
  });

  it("slugifies repo names", () => {
    expect(slugifyRepoName("Maya Yoga")).toBe("maya-yoga");
    expect(slugifyRepoName("Café  & Co.")).toBe("cafe-co");
    expect(slugifyRepoName("!!!")).toBe("site");
  });
});

describe("sites API (GitHub App, mocked GitHub)", () => {
  it("creates the repo with the user token and commits with the installation token", async () => {
    const { pkcs8 } = await generateAppKey();
    const encKey = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
    const HEAD = "a".repeat(40);
    const COMMIT = "b".repeat(40);
    let mainHead = HEAD;
    let clientAccepted = false;
    const gh = mockFetch([
      [
        "POST",
        /^github\.com\/login\/oauth\/access_token$/,
        () => ({
          access_token: "ghu_user",
          expires_in: 28800,
          refresh_token: "ghr_1",
          refresh_token_expires_in: 999999,
        }),
      ],
      [
        "GET",
        /^\/user$/,
        () => ({ id: 1, login: "maya", name: "Maya", email: null, avatar_url: null }),
      ],
      [
        "GET",
        /^\/user\/installations/,
        () => ({ installations: [{ id: 77, account: { login: "maya" } }] }),
      ],
      [
        "POST",
        /^\/app\/installations\/77\/access_tokens$/,
        () => ({ token: "ghs_install", expires_at: "2099-01-01T00:00:00Z" }),
      ],
      ["GET", /^\/repos\/maya\/maya-yoga$/, () => status(404, { message: "Not Found" })],
      [
        "GET",
        /^\/repos\/client\/maya-yoga$/,
        () =>
          clientAccepted
            ? {
                name: "maya-yoga",
                full_name: "client/maya-yoga",
                owner: { login: "client" },
                default_branch: "main",
                html_url: "https://github.com/client/maya-yoga",
                private: false,
                archived: false,
              }
            : status(404, { message: "Not Found" }),
      ],
      [
        "POST",
        /^\/repos\/maya\/maya-yoga\/transfer$/,
        () =>
          status(202, {
            name: "maya-yoga",
            full_name: "maya/maya-yoga",
            owner: { login: "maya" },
            default_branch: "main",
            html_url: "https://github.com/maya/maya-yoga",
            private: false,
            archived: false,
          }),
      ],
      [
        "POST",
        /^\/user\/repos$/,
        () =>
          status(201, {
            name: "maya-yoga",
            full_name: "maya/maya-yoga",
            owner: { login: "maya" },
            default_branch: "main",
            html_url: "https://github.com/maya/maya-yoga",
            private: false,
            archived: false,
          }),
      ],
      ["GET", /\/git\/ref\/heads\/main$/, () => ({ object: { sha: mainHead } })],
      ["GET", /\/git\/ref\/heads\/os\/draft$/, () => status(404, { message: "Not Found" })],
      [
        "POST",
        /^\/graphql$/,
        () => {
          mainHead = COMMIT;
          return {
            data: {
              createCommitOnBranch: {
                commit: { oid: COMMIT, committedDate: "2026-10-26T00:00:00Z" },
              },
            },
          };
        },
      ],
      ["POST", /\/git\/refs$/, () => status(201, {})],
      ["POST", /\/pages$/, () => status(201, { html_url: "https://maya.github.io/maya-yoga/" })],
      ["POST", /\/dispatches$/, () => new Response(null, { status: 204 })],
      [
        "GET",
        /\/runs\?/,
        () => ({
          workflow_runs: [
            {
              status: "queued",
              conclusion: null,
              head_sha: COMMIT,
              html_url: "x",
              updated_at: "x",
            },
          ],
        }),
      ],
    ]);
    const githubEnv = {
      ...env,
      DEV_MODE: "false",
      HUB_URL: "https://hub.openspace.test",
      STUDIO_ORIGIN: "https://studio.openspace.test",
      GITHUB_APP_ID: "4242",
      GITHUB_APP_PRIVATE_KEY: pem("PRIVATE KEY", pkcs8),
      GITHUB_CLIENT_ID: "Iv1.client",
      GITHUB_CLIENT_SECRET: "client-secret",
      TOKEN_ENC_KEY: encKey,
    };
    const app = createApp({ services: { fetch: gh.fetch } });
    const start = await call(
      app,
      "/auth/github/start?template=basic&name=Maya%20Yoga&look=bold",
      {},
      githubEnv,
    );
    const state = new URL(start.headers.get("location") as string).searchParams.get("state");
    const cb = await call(
      app,
      `/auth/github/callback?code=c&state=${state}`,
      { cookie: cookieFrom(start, "os_oauth_state") },
      githubEnv,
    );
    expect(cb.status).toBe(302);
    const loc = cb.headers.get("location") as string;
    expect(loc).toMatch(/^https:\/\/studio\.openspace\.test\/sites\/st_[0-9a-z]{10}\?welcome=1$/);
    const siteId = loc.split("/sites/")[1]?.split("?")[0] as string;

    const createRepo = gh.calls.find((c) => c.path === "/user/repos");
    expect(createRepo?.headers.get("authorization")).toBe("Bearer ghu_user");
    const commit = gh.calls.find((c) => c.path === "/graphql");
    expect(commit?.headers.get("authorization")).toBe("Bearer ghs_install");
    const additions = (
      (commit as RecordedCall).body as {
        variables: { input: { fileChanges: { additions: Array<{ path: string }> } } };
      }
    ).variables.input.fileChanges.additions;
    expect(additions.map((a) => a.path)).toEqual(
      expect.arrayContaining([
        "openspace.json",
        "content/pages/home.json",
        ".github/workflows/publish.yml",
      ]),
    );
    const draft = gh.calls.find((c) => c.path.endsWith("/git/refs"));
    expect(draft?.body).toEqual({ ref: "refs/heads/os/draft", sha: COMMIT });

    const cookie = cookieFrom(cb);
    const site = (await (
      await call(app, `/api/sites/${siteId}`, { cookie }, githubEnv)
    ).json()) as SiteJson;
    expect(site).toMatchObject({
      status: "building",
      url: "https://maya.github.io/maya-yoga/",
      repo: "maya/maya-yoga",
      look: "bold",
    });
    const row = await env.HUB_DB.prepare("SELECT installation_id FROM sites WHERE id = ?")
      .bind(siteId)
      .first<{ installation_id: number }>();
    expect(row?.installation_id).toBe(77);

    // With real GitHub, sites are served by Pages: the Hub's dev preview is off.
    expect((await call(app, `/s/${siteId}/`, {}, githubEnv)).status).toBe(404);
    expect((await call(app, "/t/basic/", {}, githubEnv)).status).toBe(404);

    // Transfers need the recipient to accept on GitHub: pending, nothing changes yet.
    await env.HUB_DB.prepare(
      "INSERT INTO users (id, github_id, login, name, is_dev, created_at, updated_at) VALUES ('usr_client', 9002, 'client', 'Client', 0, 0, 0)",
    ).run();
    const pending = await call(
      app,
      `/api/sites/${siteId}/transfer`,
      { method: "POST", cookie, json: { to: "client" } },
      githubEnv,
    );
    expect(pending.status).toBe(200);
    expect(await pending.json()).toMatchObject({
      status: "pending",
      site: {
        repo: "maya/maya-yoga",
        role: "owner",
        transfer: { to: "client", status: "pending" },
      },
    });
    expect(gh.calls.find((c) => c.path.endsWith("/transfer"))?.body).toEqual({
      new_owner: "client",
    });
    const again = await call(
      app,
      `/api/sites/${siteId}/transfer`,
      { method: "POST", cookie, json: { to: "client" } },
      githubEnv,
    );
    expect(again.status).toBe(409);
    const roles = await env.HUB_DB.prepare("SELECT user_id, role FROM site_roles WHERE site_id = ?")
      .bind(siteId)
      .all();
    expect(roles.results).toHaveLength(1);

    // Once GitHub shows the repo under the recipient, the next status poll completes it.
    clientAccepted = true;
    const done = (await (
      await call(app, `/api/sites/${siteId}`, { cookie }, githubEnv)
    ).json()) as SiteJson & { transfer: unknown };
    expect(done).toMatchObject({
      repo: "client/maya-yoga",
      role: "designer",
      owner: "client",
      transfer: null,
    });
  });
});
