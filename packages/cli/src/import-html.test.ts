import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pngBytes } from "@omniharmonic/openspace-import/testing";
import { createMcpServer } from "@omniharmonic/openspace-mcp-tools";
import { afterAll, describe, expect, it } from "vitest";
import { captureIo } from "./io";
import { FileSiteStore } from "./mcp/file-store";
import { importSiteTool } from "./mcp/import-tool";
import { run } from "./program";
import { cleanup, meadowCopy, tmpDir } from "./test-helpers";

afterAll(cleanup);

const FIX = join(__dirname, "..", "..", "import", "src", "__fixtures__", "claude-html");
const net = (async (url: string) =>
  /images\.example/.test(String(url))
    ? new Response(pngBytes(1200, 900) as unknown as BodyInit, {
        headers: { "content-type": "image/png" },
      })
    : new Response("no", { status: 404 })) as typeof fetch;

describe("openspace import html", () => {
  it("imports a single HTML file into a site folder that passes openspace check", async () => {
    const parent = await tmpDir();
    const cap = captureIo(parent, { NO_COLOR: "1" });
    const code = await run(
      ["import", "html", join(FIX, "bakery.html"), "bakery", "--summary", "summary.json"],
      cap.io,
      { fetch: net },
    );
    expect(code, `${cap.text()}\n${cap.errText()}`).toBe(0);
    const dir = join(parent, "bakery");
    for (const f of [
      "openspace.json",
      "package.json",
      "content/site.json",
      "content/design-system.json",
      "content/pages/home.json",
      "IMPORT-REPORT.md",
      "AGENTS.md",
    ])
      expect(existsSync(join(dir, f)), f).toBe(true);
    const summary = JSON.parse(await readFile(join(parent, "summary.json"), "utf8"));
    expect(summary).toMatchObject({ platform: "html", pages: 1 });
    expect(summary.components).toBeGreaterThanOrEqual(5);
    expect(summary.check.ok).toBe(true);
    expect(cap.text()).toMatch(/keep their own design as designer components/);
  });

  it("imports a folder of pages (and routes .html files from plain `openspace import`)", async () => {
    const parent = await tmpDir();
    const cap = captureIo(parent, { NO_COLOR: "1" });
    expect(
      await run(["import", "html", join(FIX, "studio"), "ana"], cap.io, { fetch: net }),
      cap.errText(),
    ).toBe(0);
    expect(existsSync(join(parent, "ana", "content/pages/about.json"))).toBe(true);
    const cap2 = captureIo(parent, { NO_COLOR: "1" });
    expect(
      await run(["import", join(FIX, "bakery.html"), "bakery2"], cap2.io, { fetch: net }),
      cap2.errText(),
    ).toBe(0);
    expect(existsSync(join(parent, "bakery2", "content/design-system.json"))).toBe(true);
  });
});

describe("import_site with a page's HTML (local MCP)", () => {
  it("makes a new site folder from html Claude passes in", async () => {
    const site = await meadowCopy();
    const store = await FileSiteStore.open(site);
    const server = createMcpServer(
      store,
      { sites: "*", publish: false, role: "owner" },
      { tools: [importSiteTool({ siteRoot: site, fetch: net })] },
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
    const res = (await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "import_site",
        arguments: {
          html: readFileSync(join(FIX, "bakery.html"), "utf8"),
          folder: "bakery",
          confirm: true,
        },
      },
    })) as unknown as {
      result: {
        isError?: boolean;
        content: { text: string }[];
        structuredContent?: Record<string, unknown>;
      };
    };
    expect(res.result.isError, res.result.content[0]?.text).toBeFalsy();
    expect(res.result.structuredContent).toMatchObject({ platform: "html", check: { ok: true } });
    expect(res.result.content[0]?.text).toContain("## Designed sections");
    await store.close();
  });
});
