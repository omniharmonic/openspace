import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import {
  type Block,
  findBrokenLinks,
  type Page,
  type SiteConfig,
  SiteDocumentSchema,
} from "@omniharmonic/openspace-schema";
import { markdocToBlocks } from "@omniharmonic/openspace-site-kit/markdoc";
import { beforeAll, describe, expect, it } from "vitest";
import { detectRepo } from "./github/detect";
import { cleanPath } from "./github/jekyll";
import { markdownToHtml, parseFrontMatter } from "./github/markdown";
import { githubRepoSource } from "./github/source";
import { isGitHubAddress, parseGitHubTarget } from "./github/target";
import { type ImportResult, importGitHub, importSite } from "./index";

const FIXTURES = join(fileURLToPath(new URL(".", import.meta.url)), "__fixtures__");
const CONFIG: SiteConfig = {
  siteId: "st_9g7hb00000",
  schemaVersion: 1,
  template: { id: "starter", version: "1.0.0" },
  hub: "https://hub.openspace.dev",
  deploy: { target: "github-pages", url: "https://example.github.io/site", customDomain: null },
  features: { forms: true, newsletter: false, analytics: false, search: true },
};
const NOW = new Date("2026-10-27T12:00:00Z");
const registry = blocksRegistry();
/** No network in tests: every request that isn't served from the repository is a 404. */
const offline: typeof fetch = (async () =>
  new Response("not found", { status: 404 })) as typeof fetch;

const pageBySlug = (r: ImportResult, slug: string) =>
  Object.values(r.doc.pages).find((p) => p.slug === slug) as Page;
const blocksOf = (p: Page): Block[] => p.sections.flatMap((s) => s.blocks);
const text = (v: unknown) => JSON.stringify(v);

function expectValid(r: ImportResult) {
  const parsed = SiteDocumentSchema.safeParse(r.doc);
  expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
  expect(registry.validateDocument(r.doc)).toEqual([]);
  expect(findBrokenLinks(r.doc).filter((l) => l.severity === "error")).toEqual([]);
  for (const [name, items] of Object.entries(r.doc.collections))
    for (const item of Object.values(items))
      expect(
        markdocToBlocks(item.body, { registry, idSeed: `${name}/${item.slug}`, media: r.doc.media })
          .issues,
        `${name}/${item.slug}`,
      ).toEqual([]);
  for (const path of Object.keys(r.doc.media)) expect(r.files.has(path), path).toBe(true);
}

describe("GitHub addresses", () => {
  it.each([
    ["octo/garden", { owner: "octo", repo: "garden" }],
    ["https://github.com/octo/garden", { owner: "octo", repo: "garden" }],
    ["https://github.com/octo/garden.git", { owner: "octo", repo: "garden" }],
    ["git@github.com:octo/garden.git", { owner: "octo", repo: "garden" }],
    [
      "https://github.com/octo/garden/tree/gh-pages/docs",
      { owner: "octo", repo: "garden", ref: "gh-pages", path: "docs" },
    ],
    ["https://octo.github.io/", { owner: "octo", repo: "octo.github.io" }],
    ["https://octo.github.io/garden/about.html", { owner: "octo", repo: "garden" }],
  ])("%s", (input, expected) => {
    expect(parseGitHubTarget(input)).toMatchObject(expected);
  });
  it("ignores other addresses", () => {
    expect(parseGitHubTarget("https://www.example.com/about")).toBeUndefined();
    expect(parseGitHubTarget("example.com")).toBeUndefined();
    expect(isGitHubAddress("https://octo.github.io/garden/")).toBe(true);
    expect(isGitHubAddress("https://squarespace.com/")).toBe(false);
  });
  it("cleans Jekyll addresses", () => {
    expect(cleanPath("/about.html")).toBe("/about");
    expect(cleanPath("/docs/index.html")).toBe("/docs");
    expect(cleanPath("/2024/01/02/x/")).toBe("/2024/01/02/x");
    expect(cleanPath("/")).toBe("/");
  });
});

describe("front matter and Markdown", () => {
  it("reads YAML and TOML front matter", () => {
    expect(parseFrontMatter("---\ntitle: Hi\ntags: [a, b]\n---\nBody").data).toEqual({
      title: "Hi",
      tags: ["a", "b"],
    });
    const toml = parseFrontMatter('+++\ntitle = "Hugo"\ndraft = true\ntags = ["x"]\n+++\nBody');
    expect(toml.data).toEqual({ title: "Hugo", draft: true, tags: ["x"] });
    expect(parseFrontMatter("No front matter").hasFrontMatter).toBe(false);
  });
  it("renders GitHub-flavoured Markdown and drops kramdown attribute lists", () => {
    const html = markdownToHtml(
      "| a | b |\n| - | - |\n| 1 | 2 |\n\nText\n{: .note }\n\n<div>raw</div>",
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<div>raw</div>");
    expect(html).not.toContain("{:");
  });
});

describe("repository detection", () => {
  it.each([
    [["_config.yml", "index.md"], "jekyll"],
    [["_posts/2024-01-01-a.md"], "jekyll"],
    [["README.md", "about.md"], "jekyll"],
    [["hugo.toml", "content/posts/a.md"], "hugo"],
    [[".eleventy.js", "src/index.njk"], "eleventy"],
    [["index.html", "about.html", ".nojekyll"], "html"],
    [["mkdocs.yml", "docs/index.md"], "built"],
  ])("%j → %s", (files, kind) => {
    expect(detectRepo(files).kind).toBe(kind);
  });
  it("names generators from package.json", () => {
    expect(
      detectRepo(["package.json", "src/pages/index.astro"], '{"dependencies":{"astro":"5"}}'),
    ).toMatchObject({ kind: "built", generator: "Astro" });
  });
});

describe("Jekyll from source", () => {
  let r: ImportResult;
  beforeAll(async () => {
    r = await importGitHub({
      url: "ada-gardens/garden-notes",
      repoDir: join(FIXTURES, "jekyll"),
      config: CONFIG,
      fetch: offline,
      now: NOW,
      delayMs: 0,
    });
  });

  it("produces a valid site", () => expectValid(r));

  it("reads the config, pages and navigation", () => {
    expect(r.doc.site.title).toBe("Garden Notes");
    expect(r.site.platform).toBe("jekyll");
    const slugs = Object.values(r.doc.pages).map((p) => p.slug);
    expect(slugs.sort()).toEqual(["", "about"]);
    // Excluded and 404 pages are not imported.
    expect(text(r.doc)).not.toContain("Private notes");
    const about = pageBySlug(r, "about");
    expect(about.title).toBe("About the garden");
    expect(about.seo?.description).toBe("Who we are and when we meet.");
    expect(blocksOf(about).some((b) => b.type === "table")).toBe(true);
    const nav = r.doc.site.nav.map((n) => n.label);
    expect(nav).toEqual(expect.arrayContaining(["About", "Journal", "Projects"]));
  });

  it("renders Liquid and links between pages", () => {
    const home = pageBySlug(r, "");
    const s = text(home);
    expect(s).toContain("Grow with us");
    // `about.md` and `{{ site.baseurl }}/journal/` resolved to OpenSpace links.
    expect(s).not.toContain("{{");
    expect(s).not.toContain("about.md");
    // The seedlings image came from the repository.
    expect(Object.keys(r.doc.media).some((p) => /seeds/.test(p))).toBe(true);
  });

  it("turns _posts into a blog with dates, tags, categories and drafts", () => {
    const journal = r.doc.collections.journal ?? {};
    const items = Object.values(journal);
    expect(items.map((i) => i.slug).sort()).toEqual(["first-seeds", "summer-beds", "winter-plans"]);
    const first = items.find((i) => i.slug === "first-seeds") as (typeof items)[number];
    const fm = first.frontmatter as {
      title: string;
      date: string;
      tags?: string[];
      draft?: boolean;
    };
    expect(fm.title).toBe("First seeds of the year");
    expect(String(fm.date)).toContain("2024-03-02");
    expect(fm.tags).toEqual(expect.arrayContaining(["seeds", "spring"]));
    expect(first.body).toContain("Sow 6mm deep");
    expect(
      (items.find((i) => i.slug === "winter-plans")?.frontmatter as { status?: string } | undefined)
        ?.status,
    ).toBe("draft");
    expect(Object.values(r.doc.collections.projects ?? {}).map((i) => i.slug)).toEqual([
      "seed-library",
    ]);
  });

  it("keeps every old address working", () => {
    const from = r.build.redirects.map((x) => x.from);
    expect(from).toEqual(
      expect.arrayContaining([
        "/about.html",
        "/who-we-are",
        "/seasons/2024/03/02/first-seeds.html",
        "/2024/05/10/summer-beds",
      ]),
    );
  });

  it("reports what wasn't moved and writes the setup checklist", () => {
    expect(r.report).toContain("jekyll-gallery-generator");
    expect(r.checklist.items.map((i) => i.kind)).toContain("analytics");
  });

  it("reads the theme's SCSS variables for the look", () => {
    expect(r.build.themeNotes.join(" ")).toContain("#2f7d4f");
  });
});

describe("structured content (headless CMS sections)", () => {
  let r: ImportResult;
  beforeAll(async () => {
    r = await importGitHub({
      url: "june-park/meadow-book",
      repoDir: join(FIXTURES, "structured"),
      config: CONFIG,
      fetch: offline,
      now: NOW,
      delayMs: 0,
      // No sharp in tests: a 1×1 PNG stands in for the rasterized icon.
      rasterizeSvg: async () =>
        Uint8Array.from(
          atob(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
          ),
          (c) => c.charCodeAt(0),
        ),
    });
  });

  it("produces a valid site", () => expectValid(r));

  it("maps each page file and skips the 404 page", () => {
    expect(
      Object.values(r.doc.pages)
        .map((p) => p.slug)
        .sort(),
    ).toEqual(["", "about"]);
    expect(r.doc.site.title).toBe("Meadow Book");
  });

  it("maps section fields to blocks", () => {
    const home = pageBySlug(r, "");
    const types = blocksOf(home).map((b) => b.type);
    const s = text(home);
    expect(s).toContain("A field guide to slow attention");
    expect(s).toContain("Three ways of looking.");
    expect(types).toContain("newsletter");
    expect(types).toContain("accordion");
    // Hidden sections and placeholder links stay out.
    expect(s).not.toContain("An endorsement");
    expect(s).not.toContain("Essays URL");
    expect(s).toContain("INVITE JUNE TO SPEAK");
    // Icons rasterized for the cards, the cover image from public/uploads.
    expect(Object.keys(r.doc.media).length).toBeGreaterThanOrEqual(2);
  });

  it("turns rich forms into forms and gives section backgrounds themes", () => {
    const about = pageBySlug(r, "about");
    expect(blocksOf(about).map((b) => b.type)).toContain("form");
    const themes = pageBySlug(r, "").sections.map((s) => s.style?.colorTheme);
    expect(new Set(themes).size).toBeGreaterThan(1);
  });

  it("reads navigation, footer and the design tokens", () => {
    expect(r.doc.site.nav.map((n) => n.label)).toEqual(
      expect.arrayContaining(["ABOUT", "GET CHAPTER ONE"]),
    );
    expect(r.build.themeNotes.join(" ")).toMatch(/#a4502e/i);
    expect(text(r.doc.site.footer)).toContain("JUNE PARK");
  });

  it("lists the sign-up service and the CMS for after launch", () => {
    expect(r.report).toMatch(/server function|api\/subscribe/);
    expect(r.report).toMatch(/Decap|Sveltia|content editor/);
    expect(r.checklist.items.map((i) => i.kind)).toEqual(
      expect.arrayContaining(["newsletter", "forms-email"]),
    );
  });
});

describe("plain HTML repositories", () => {
  it("reads the pages from the files and redirects .html addresses", async () => {
    const r = await importGitHub({
      url: "pine-street/choir",
      repoDir: join(FIXTURES, "html-site"),
      config: CONFIG,
      fetch: offline,
      now: NOW,
      delayMs: 0,
    });
    expectValid(r);
    expect(
      Object.values(r.doc.pages)
        .map((p) => p.slug)
        .sort(),
    ).toEqual(["", "concerts", "join"]);
    expect(r.build.redirects.map((x) => x.from)).toContain("/concerts.html");
    expect(text(pageBySlug(r, ""))).toContain("Sing with your neighbours");
    expect(Object.keys(r.doc.media).length).toBe(1);
  });
});

describe("remote repositories", () => {
  /** A fake GitHub: the API (repo, Pages, tree) and raw downloads served from a fixture folder. */
  function fakeGitHub(root: string, opts: { pagesPath?: string; cname?: string } = {}) {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const abs = join(d, n);
        if (statSync(abs).isDirectory()) walk(abs);
        else files.push(relative(root, abs).split(sep).join("/"));
      }
    };
    walk(root);
    const calls: string[] = [];
    const f = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const json = (v: unknown) =>
        new Response(JSON.stringify(v), { headers: { "content-type": "application/json" } });
      if (url === "https://api.github.com/repos/octo/garden")
        return json({
          owner: { login: "octo" },
          name: "garden",
          default_branch: "main",
          has_pages: true,
        });
      if (url === "https://api.github.com/repos/octo/garden/pages")
        return json({
          html_url: opts.cname ? `https://${opts.cname}/` : "https://octo.github.io/garden/",
          cname: opts.cname ?? null,
          source: { branch: "main", path: opts.pagesPath ?? "/" },
        });
      if (url.startsWith("https://api.github.com/repos/octo/garden/git/trees/main"))
        return json({
          tree: files.map((p) => ({
            path: `${opts.pagesPath === "/docs" ? "docs/" : ""}${p}`,
            type: "blob",
            size: statSync(join(root, p)).size,
          })),
        });
      const raw = /^https:\/\/raw\.githubusercontent\.com\/octo\/garden\/main\/(.+)$/.exec(url);
      if (raw) {
        const rel = decodeURIComponent(raw[1] as string).replace(
          /^docs\//,
          opts.pagesPath === "/docs" ? "" : "docs/",
        );
        try {
          return new Response(readFileSync(join(root, rel)));
        } catch {
          return new Response("", { status: 404 });
        }
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    return { fetch: f, calls };
  }

  it("lists and reads a repository through the API and raw downloads", async () => {
    const gh = fakeGitHub(join(FIXTURES, "jekyll"));
    const src = githubRepoSource({ owner: "octo", repo: "garden", ref: "main", fetch: gh.fetch });
    expect(await src.list()).toContain("_config.yml");
    expect(new TextDecoder().decode(await src.read("_config.yml"))).toContain("Garden Notes");
    expect(await src.read("missing.md")).toBeUndefined();
  });

  it("imports a github.io address from the repository Pages builds from (/docs, custom domain)", async () => {
    const gh = fakeGitHub(join(FIXTURES, "jekyll"), {
      pagesPath: "/docs",
      cname: "garden-notes.org",
    });
    const r = await importSite({
      url: "https://octo.github.io/garden/",
      config: CONFIG,
      fetch: gh.fetch,
      now: NOW,
      delayMs: 0,
    });
    expectValid(r);
    expect(r.site.platform).toBe("jekyll");
    expect(r.github?.repo).toMatchObject({ owner: "octo", repo: "garden", path: "docs" });
    expect(r.github?.domain).toBe("garden-notes.org");
    expect(r.site.baseUrl).toBe("https://garden-notes.org");
    expect(r.checklist.items.map((i) => i.kind)).toContain("domain");
  });
});
