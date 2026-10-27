import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { JUNIPER_EXPORT, JUNIPER_URL, juniperFetch } from "@omniharmonic/openspace-import/testing";
import { createMcpServer } from "@omniharmonic/openspace-mcp-tools";
import { afterAll, describe, expect, it } from "vitest";
import { runCheck } from "./check";
import { defaultFolder } from "./import";
import { captureIo } from "./io";
import { FileSiteStore } from "./mcp/file-store";
import { importSquarespaceTool } from "./mcp/import-tool";
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
    expect(r.out).toMatch(/Imported Juniper Ceramics into .*juniper:/);
    expect(r.out).toMatch(/openspace check: OK — 0 error\(s\)/);
    expect(r.out).toContain("/openspace:import-squarespace");
    expect(r.err).toContain("robots.txt is honoured");
  });

  it("supports owner mode, a WordPress export, the Cloudflare target and a structure-only run", async () => {
    const r = await importCli([
      "jc",
      "--owner",
      "--export",
      JUNIPER_EXPORT,
      "--target",
      "cloudflare",
      "--no-media",
      "--delay",
      "0",
      "--title",
      "Juniper Studio",
    ]);
    expect(r.code, r.err).toBe(0);
    const dir = join(r.parent, "jc");
    expect(JSON.parse(await readFile(join(dir, "openspace.json"), "utf8")).deploy.target).toBe(
      "cloudflare",
    );
    expect(existsSync(join(dir, "wrangler.jsonc"))).toBe(true);
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
