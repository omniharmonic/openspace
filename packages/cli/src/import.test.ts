import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  FERNHILL_EXPORT,
  FERNHILL_URL,
  fernhillFetch,
  JUNIPER_EXPORT,
  JUNIPER_URL,
  juniperFetch,
  TIDEWATER_URL,
  tidewaterFetch,
} from "@omniharmonic/openspace-import/testing";
import { createMcpServer } from "@omniharmonic/openspace-mcp-tools";
import { afterAll, describe, expect, it } from "vitest";
import { runCheck } from "./check";
import { originalUrl } from "./fidelity";
import { defaultFolder } from "./import";
import { captureIo } from "./io";
import { compareFidelityTool } from "./mcp/fidelity-tool";
import { FileSiteStore } from "./mcp/file-store";
import { importSiteTool, importSquarespaceTool } from "./mcp/import-tool";
import { screenshotUrlTool } from "./mcp/reference-tool";
import { run } from "./program";
import { cleanup, meadowCopy, tmpDir } from "./test-helpers";

afterAll(cleanup);

async function importCli(args: string[], cwd?: string) {
  const parent = cwd ?? (await tmpDir());
  const cap = captureIo(parent, { NO_COLOR: "1" });
  const code = await run(["import", "squarespace", JUNIPER_URL, ...args], cap.io, {
    fetch: juniperFetch() as typeof fetch,
  });
  return { parent, code, out: cap.text(), err: cap.errText() };
}

describe("openspace import squarespace", () => {
  it("creates a complete site folder that passes openspace check", async () => {
    const r = await importCli(["juniper", "--delay", "0", "--repo", "juniper/site"]);
    expect(r.code, r.err).toBe(0);
    const dir = join(r.parent, "juniper");
    for (const f of [
      "openspace.json",
      "package.json",
      "astro.config.mjs",
      ".github/workflows/publish.yml",
      "AGENTS.md",
      "IMPORT-REPORT.md",
      "content/site.json",
      "content/styles.json",
      "content/media.json",
      "content/pages/home.json",
      "content/pages/about-us.json",
      "content/collections/journal/_collection.json",
      "content/collections/journal/first-firing-of-spring.mdoc",
      "content/collections/shop/speckled-mug.mdoc",
    ])
      expect(existsSync(join(dir, f)), f).toBe(true);
    const config = JSON.parse(await readFile(join(dir, "openspace.json"), "utf8"));
    expect(config.siteId).toMatch(/^st_[0-9a-z]{10}$/);
    expect(config.deploy).toEqual({
      target: "github-pages",
      url: "https://juniper.github.io/site",
      customDomain: null,
    });
    expect(JSON.parse(await readFile(join(dir, "package.json"), "utf8")).name).toBe("juniper");
    expect(await readFile(join(dir, "AGENTS.md"), "utf8")).toContain("Juniper Ceramics");
    const check = await runCheck(dir);
    expect(check.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(r.out).toMatch(/Imported Juniper Ceramics \(Squarespace\) into .*juniper:/);
    expect(r.out).toMatch(/openspace check: OK — 0 error\(s\)/);
    expect(r.out).toContain("/openspace:import-squarespace");
    expect(r.err).toContain("robots.txt is honoured");
  });

  it("supports owner mode, a WordPress export and a structure-only run — always on GitHub Pages", async () => {
    const refused = await importCli(["jc2", "--target", "cloudflare", "--delay", "0"]);
    expect(refused.code).toBe(1);
    expect(refused.err).toContain("always start on free GitHub Pages");
    const r = await importCli([
      "jc",
      "--owner",
      "--export",
      JUNIPER_EXPORT,
      "--no-media",
      "--delay",
      "0",
      "--title",
      "Juniper Studio",
    ]);
    expect(r.code, r.err).toBe(0);
    const dir = join(r.parent, "jc");
    // A shop never moves the import off free GitHub Pages: it becomes a setup step instead.
    expect(JSON.parse(await readFile(join(dir, "openspace.json"), "utf8")).deploy.target).toBe(
      "github-pages",
    );
    expect(existsSync(join(dir, "wrangler.jsonc"))).toBe(false);
    const checklist = JSON.parse(await readFile(join(dir, "content/setup-checklist.json"), "utf8"));
    expect(checklist.items.map((i: { kind: string }) => i.kind)).toContain("store");
    expect(JSON.parse(await readFile(join(dir, "content/site.json"), "utf8")).title).toBe(
      "Juniper Studio",
    );
    expect(existsSync(join(dir, "content/collections/journal/notes-on-wedging.mdoc"))).toBe(true);
    expect(existsSync(join(dir, "media"))).toBe(false);
    expect((await runCheck(dir)).ok).toBe(true);
  });

  it("names the folder after the address and refuses non-empty folders", async () => {
    expect(defaultFolder("https://www.juniperceramics.example")).toBe("juniperceramics");
    expect(defaultFolder("maya-yoga.squarespace.com")).toBe("maya-yoga");
    const parent = await tmpDir();
    await mkdir(join(parent, "juniperceramics"));
    await writeFile(join(parent, "juniperceramics", "x.txt"), "x");
    const r = await importCli([], parent);
    expect(r.code).toBe(1);
    expect(r.err).toContain("already exists and is not empty");
  });

  it("explains when the address is not a Squarespace site and leaves nothing behind", async () => {
    const parent = await tmpDir();
    const cap = captureIo(parent, { NO_COLOR: "1" });
    const code = await run(
      ["import", "squarespace", "https://plain.example", "plain", "--delay", "0"],
      cap.io,
      {
        fetch: (async (u: string | URL | Request) =>
          String(u).endsWith("/robots.txt")
            ? new Response("", { status: 404 })
            : new Response("<html><body>Hello</body></html>")) as typeof fetch,
      },
    );
    expect(code).toBe(1);
    expect(cap.errText()).toContain("doesn't look like a Squarespace site");
    expect(existsSync(join(parent, "plain"))).toBe(false);
  });
});

describe("openspace import <url> (any platform)", () => {
  const cli = async (args: string[], fetchFn: typeof fetch) => {
    const parent = await tmpDir();
    const cap = captureIo(parent, { NO_COLOR: "1" });
    const code = await run(["import", ...args, "--delay", "0"], cap.io, { fetch: fetchFn });
    return { parent, code, out: cap.text(), err: cap.errText() };
  };

  it("detects a Webflow site, imports it with the generic importer and passes openspace check", async () => {
    const r = await cli([TIDEWATER_URL, "tide"], tidewaterFetch() as typeof fetch);
    expect(r.code, r.err).toBe(0);
    const dir = join(r.parent, "tide");
    expect(r.out).toMatch(/Imported Tidewater Studio \(Webflow\) into .*tide:/);
    expect(r.out).toMatch(/openspace check: OK — 0 error\(s\)/);
    expect(r.out).toContain(`/openspace:migrate ${TIDEWATER_URL}`);
    expect(r.err).toContain("Webflow (generator");
    expect(existsSync(join(dir, "content/collections/journal/tide-tables.mdoc"))).toBe(true);
    expect(await readFile(join(dir, "IMPORT-REPORT.md"), "utf8")).toContain("openspace import url");
    const check = await runCheck(dir);
    expect(check.findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("imports WordPress from the REST API and an export (openspace import wordpress)", async () => {
    const r = await cli(
      ["wordpress", FERNHILL_URL, "fern", "--export", FERNHILL_EXPORT],
      fernhillFetch() as typeof fetch,
    );
    expect(r.code, r.err).toBe(0);
    const dir = join(r.parent, "fern");
    expect(r.out).toMatch(/Imported Fernhill Bakery \(WordPress\)/);
    expect(existsSync(join(dir, "content/collections/news/winter-menu.mdoc"))).toBe(true);
    const site = JSON.parse(await readFile(join(dir, "content/site.json"), "utf8"));
    expect(site.redirects).toEqual(
      expect.arrayContaining([
        { from: "/2025/03/our-first-loaf", to: "/news/our-first-loaf/", status: 301 },
      ]),
    );
    expect((await runCheck(dir)).ok).toBe(true);
  });

  it("accepts --platform and rejects unknown ones", async () => {
    const ok = await cli(
      [TIDEWATER_URL, "tw", "--platform", "url", "--no-media"],
      tidewaterFetch() as typeof fetch,
    );
    expect(ok.code, ok.err).toBe(0);
    expect(ok.err).not.toContain("Detecting");
    const bad = await cli(
      [TIDEWATER_URL, "tw2", "--platform", "myspace"],
      tidewaterFetch() as typeof fetch,
    );
    expect(bad.code).toBe(1);
    expect(bad.err).toContain('Unknown --platform "myspace"');
  });

  it("names folders after platform hosting addresses", () => {
    expect(defaultFolder("https://amanda.wixsite.com/my-site")).toBe("amanda");
    expect(defaultFolder("https://tidewater.webflow.io")).toBe("tidewater");
  });
});

describe("import_site (local MCP tool)", () => {
  it("detects the platform, needs confirm: true and keeps import_squarespace as an alias", async () => {
    const site = await meadowCopy();
    const store = await FileSiteStore.open(site);
    const server = createMcpServer(
      store,
      { sites: "*", publish: false, role: "owner" },
      {
        tools: [
          importSiteTool({ siteRoot: site, fetch: tidewaterFetch() as typeof fetch, delayMs: 0 }),
          importSquarespaceTool({
            siteRoot: site,
            fetch: juniperFetch() as typeof fetch,
            delayMs: 0,
          }),
        ],
      },
    );
    await server.handle({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "t", version: "1" },
      },
    });
    const list = (await server.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    })) as unknown as {
      result: { tools: { name: string }[] };
    };
    expect(list.result.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["import_site", "import_squarespace"]),
    );
    const call = async (name: string, args: Record<string, unknown>) =>
      (
        (await server.handle({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        })) as unknown as {
          result: {
            isError?: boolean;
            content: { text: string }[];
            structuredContent?: Record<string, unknown>;
          };
        }
      ).result;
    const refused = await call("import_site", { url: TIDEWATER_URL, folder: "tide" });
    expect(refused.isError).toBe(true);
    expect(refused.content[0]?.text).toContain("confirm: true");
    const done = await call("import_site", { url: TIDEWATER_URL, folder: "tide", confirm: true });
    expect(done.isError, done.content[0]?.text).toBeFalsy();
    expect(done.structuredContent).toMatchObject({
      platform: "webflow",
      check: { ok: true, errors: 0 },
    });
    expect(done.content[0]?.text).toContain("# Import report: Tidewater Studio");
    const legacy = await call("import_squarespace", {
      url: JUNIPER_URL,
      folder: "jun",
      confirm: true,
    });
    expect(legacy.isError, legacy.content[0]?.text).toBeFalsy();
    expect(legacy.structuredContent).toMatchObject({ platform: "squarespace" });
    await store.close();
  });
});

describe("import_squarespace (local MCP tool)", () => {
  it("needs confirm: true, then writes a new folder next to the served site", async () => {
    const site = await meadowCopy();
    const store = await FileSiteStore.open(site);
    const server = createMcpServer(
      store,
      { sites: "*", publish: false, role: "owner" },
      {
        tools: [
          importSquarespaceTool({
            siteRoot: site,
            fetch: juniperFetch() as typeof fetch,
            delayMs: 0,
          }),
        ],
      },
    );
    await server.handle({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "t", version: "1" },
      },
    });
    const call = async (args: Record<string, unknown>) =>
      (
        (await server.handle({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "import_squarespace", arguments: args },
        })) as unknown as {
          result: {
            isError?: boolean;
            content: { text: string }[];
            structuredContent?: Record<string, unknown>;
          };
        }
      ).result;
    const list = (await server.handle({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    })) as unknown as {
      result: { tools: { name: string; annotations?: Record<string, unknown> }[] };
    };
    expect(
      list.result.tools.find((t) => t.name === "import_squarespace")?.annotations,
    ).toMatchObject({ openWorldHint: true });

    const refused = await call({ url: JUNIPER_URL, folder: "juniper" });
    expect(refused.isError).toBe(true);
    expect(refused.content[0]?.text).toContain("confirm: true");
    expect(existsSync(join(site, "..", "juniper"))).toBe(false);

    const intoSelf = await call({ url: JUNIPER_URL, folder: site, confirm: true });
    expect(intoSelf.isError).toBe(true);
    expect(intoSelf.content[0]?.text).toContain("never writes into the site being served");

    const done = await call({ url: JUNIPER_URL, folder: "juniper", confirm: true });
    expect(done.isError, done.content[0]?.text).toBeFalsy();
    expect(done.structuredContent).toMatchObject({
      check: { ok: true, errors: 0 },
      dir: join(site, "..", "juniper"),
    });
    expect(done.content[0]?.text).toContain("# Import report: Juniper Ceramics");
    expect(existsSync(join(site, "..", "juniper", "IMPORT-REPORT.md"))).toBe(true);
    await store.close();
  });
});

describe("screenshot_url (local MCP tool)", () => {
  const callTool = async (
    shooter: Parameters<typeof screenshotUrlTool>[0],
    args: Record<string, unknown>,
  ) => {
    const site = await meadowCopy();
    const store = await FileSiteStore.open(site);
    const server = createMcpServer(
      store,
      { sites: "*", publish: false, role: "owner" },
      {
        tools: [screenshotUrlTool(shooter, "Playwright is not installed")],
        assumeInitialized: true,
      },
    );
    const r = (await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "screenshot_url", arguments: args },
    })) as unknown as {
      result: { isError?: boolean; content: { type: string; text?: string; data?: string }[] };
    };
    await store.close();
    return r.result;
  };

  it("captures the original page at each device width", async () => {
    const widths: number[] = [];
    const r = await callTool(
      {
        capture: async (_url, width) => {
          widths.push(width);
          return { base64: "iVBORw0KGgo=", width, height: 2000 };
        },
        close: async () => undefined,
      },
      { url: `${JUNIPER_URL}/about-us`, device: "all" },
    );
    expect(r.isError).toBeFalsy();
    expect(widths).toEqual([1440, 834, 390]);
    expect(r.content.filter((c) => c.type === "image")).toHaveLength(3);
  });

  it("explains how to enable it and refuses non-web addresses", async () => {
    const none = await callTool(undefined, { url: JUNIPER_URL });
    expect(none.isError).toBe(true);
    expect(none.content[0]?.text).toContain("Playwright");
    const file = await callTool(undefined, { url: "file:///etc/passwd" });
    expect(file.content[0]?.text).toContain("Only http(s)");
  });
});

describe("compare_fidelity (local MCP tool)", () => {
  const callTool = async (
    opts: Partial<Parameters<typeof compareFidelityTool>[0]>,
    args: Record<string, unknown>,
  ) => {
    const site = await meadowCopy();
    const store = await FileSiteStore.open(site);
    const server = createMcpServer(
      store,
      { sites: "*", publish: false, role: "owner" },
      { tools: [compareFidelityTool({ siteRoot: site, ...opts })], assumeInitialized: true },
    );
    const r = (await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "compare_fidelity", arguments: args },
    })) as unknown as {
      result: {
        isError?: boolean;
        structuredContent?: { score?: number };
        content: { type: string; text?: string }[];
      };
    };
    await store.close();
    return { r: r.result, site };
  };

  it("compares the served site with the original and returns the report", async () => {
    const seen: { original: string; dir: string; widths?: number[] }[] = [];
    const { r } = await callTool(
      {
        compare: async (original, dir, o = {}) => {
          seen.push({ original, dir, ...(o.widths ? { widths: o.widths } : {}) });
          return {
            report: { score: 91, pages: [] },
            markdown: "# Visual fidelity\n\nOverall match: **91/100**",
            out: join(dir, ".fidelity"),
            images: [],
          };
        },
      },
      { original: "life-culture.github.io/powerwith/", device: "desktop" },
    );
    expect(r.isError).toBeFalsy();
    expect(seen[0]?.original).toBe("https://life-culture.github.io/powerwith/");
    expect(seen[0]?.widths).toEqual([1440]);
    expect(r.content[0]?.text).toContain("91/100");
  });

  it("explains how to enable it without a browser", async () => {
    const { r } = await callTool(
      { unavailable: "Playwright is not installed" },
      { original: "https://example.com" },
    );
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toContain("Playwright");
  });

  it("maps site paths to the original's addresses", () => {
    expect(originalUrl("https://life-culture.github.io/powerwith/", "/introduction")).toBe(
      "https://life-culture.github.io/powerwith/introduction/",
    );
    expect(originalUrl("https://www.example.com", "/")).toBe("https://www.example.com/");
    expect(originalUrl("example.com/", "/a/b")).toBe("https://example.com/a/b/");
  });
});

describe("openspace import github", () => {
  const fixtures = join(__dirname, "..", "..", "import", "src", "__fixtures__");
  const offline = (async () => new Response("not found", { status: 404 })) as typeof fetch;

  it("imports a Jekyll repository checkout into a new folder that passes openspace check", async () => {
    const parent = await tmpDir();
    const cap = captureIo(parent, { NO_COLOR: "1" });
    const code = await run(
      [
        "import",
        "github",
        "ada-gardens/garden-notes",
        "--source-dir",
        join(fixtures, "jekyll"),
        "--delay",
        "0",
        "--summary",
        "summary.json",
      ],
      cap.io,
      { fetch: offline },
    );
    expect(code, cap.errText()).toBe(0);
    const dir = join(parent, "garden-notes");
    expect(existsSync(join(dir, "content/collections/journal/first-seeds.mdoc"))).toBe(true);
    expect(existsSync(join(dir, "content/setup-checklist.json"))).toBe(true);
    const summary = JSON.parse(await readFile(join(parent, "summary.json"), "utf8"));
    expect(summary).toMatchObject({ title: "Garden Notes", platform: "jekyll", pages: 2 });
    expect(summary.check.ok).toBe(true);
  });

  it("imports into an existing site folder, keeping its identity (the hosted import)", async () => {
    const parent = await tmpDir();
    void parent;
    const dir = await meadowCopy();
    const before = JSON.parse(await readFile(join(dir, "openspace.json"), "utf8"));
    const cap = captureIo(dir, { NO_COLOR: "1" });
    const code = await run(
      [
        "import",
        "github",
        "pine-street/choir",
        ".",
        "--into-existing",
        "--source-dir",
        join(fixtures, "html-site"),
        "--delay",
        "0",
      ],
      cap.io,
      { fetch: offline },
    );
    expect(code, `${cap.text()}\n${cap.errText()}`).toBe(0);
    const after = JSON.parse(await readFile(join(dir, "openspace.json"), "utf8"));
    expect(after.siteId).toBe(before.siteId);
    expect(after.deploy).toEqual(before.deploy);
    expect(JSON.parse(await readFile(join(dir, "content/site.json"), "utf8")).title).toBe(
      "Pine Street Choir",
    );
    expect(existsSync(join(dir, "content/pages/concerts.json"))).toBe(true);
    expect((await runCheck(dir)).ok).toBe(true);
  });

  it("refuses --into-existing outside an OpenSpace site folder", async () => {
    const parent = await tmpDir();
    const cap = captureIo(parent, { NO_COLOR: "1" });
    const code = await run(
      [
        "import",
        "github",
        "a/b",
        ".",
        "--into-existing",
        "--source-dir",
        join(fixtures, "html-site"),
      ],
      cap.io,
      { fetch: offline },
    );
    expect(code).toBe(1);
    expect(cap.errText()).toContain("isn't an OpenSpace site folder");
  });
});
