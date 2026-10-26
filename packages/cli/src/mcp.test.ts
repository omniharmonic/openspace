import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createMcpServer, type OpenSpaceMcpServer } from "@openspace/mcp-tools";
import { afterAll, describe, expect, it } from "vitest";
import { FileSiteStore } from "./mcp/file-store";
import { createScreenshotter, loadPlaywright } from "./mcp/screenshot";
import { cleanup, MEADOW, meadowCopy } from "./test-helpers";

const exec = promisify(execFile);
const git = (cwd: string, ...args: string[]) =>
  exec("git", args, { cwd }).then((r) => r.stdout.trim());

async function gitSite(): Promise<string> {
  const dir = await meadowCopy();
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.name", "Maya Test");
  await git(dir, "config", "user.email", "maya@example.com");
  await git(dir, "add", "-A");
  await git(dir, "commit", "-q", "-m", "Initial site");
  return dir;
}

function driver(server: OpenSpaceMcpServer) {
  let n = 0;
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await server.handle({
      jsonrpc: "2.0",
      id: ++n,
      method: "tools/call",
      params: { name, arguments: args },
    })) as unknown as {
      result: {
        isError?: boolean;
        content: Array<{ type: string; text?: string; data?: string }>;
        structuredContent?: Record<string, unknown>;
      };
    };
    return r.result;
  };
  const ok = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await call(name, args);
    if (r.isError) throw new Error(`${name}: ${r.content[0]?.text}`);
    // biome-ignore lint/suspicious/noExplicitAny: test convenience
    return r.structuredContent as any;
  };
  return { call, ok };
}

const outside: string[] = [];
afterAll(async () => {
  await cleanup();
  for (const d of outside) await rm(d, { recursive: true, force: true });
});

describe("FileSiteStore (local MCP)", () => {
  it("edits files through ops, snapshots the session start and publishes as a git commit", async () => {
    const dir = await gitSite();
    const store = await FileSiteStore.open(dir);
    expect(store.capabilities.canPublish).toBe(true);
    const server = createMcpServer(store, { sites: "*", publish: true, role: "owner" });
    const { ok, call } = driver(server);
    try {
      expect((await ok("get_draft_diff")).hasChanges).toBe(false);
      await ok("update_site", { set: { tagline: "Slow yoga by the creek" } });
      const site = JSON.parse(await readFile(join(dir, "content/site.json"), "utf8"));
      expect(site.tagline).toBe("Slow yoga by the creek");
      // The session started with a snapshot tag; the person's index and branch are untouched.
      const tags = await git(dir, "tag", "--list", "os/snap/*");
      expect(tags).toMatch(/^os\/snap\/agent-\d+$/m);
      expect(await git(dir, "diff", "--cached", "--name-only")).toBe("");
      expect(await git(dir, "rev-list", "--count", "HEAD")).toBe("1");

      const created = await ok("create_page", {
        title: "Retreats",
        presets: ["hero/centered", "cta/banner"],
      });
      expect(existsSync(join(dir, "content/pages/retreats.json"))).toBe(true);
      const diff = await ok("get_draft_diff");
      expect(diff.hasChanges).toBe(true);
      expect(diff.summary).toMatch(/Retreats/);

      const denied = await call("publish", {});
      expect(denied.isError).toBe(true);
      const pub = await ok("publish", { confirm: true });
      expect(pub.status).toBe("published");
      expect(await git(dir, "log", "-1", "--format=%s")).toBe(pub.summary);
      expect(await git(dir, "log", "-1", "--format=%b")).toMatch(/Agent: agent:/);
      expect(await git(dir, "status", "--porcelain")).toBe("");
      expect((await ok("get_draft_diff")).hasChanges).toBe(false);

      const versions = (await ok("list_versions")).versions;
      expect(versions).toHaveLength(2);
      await ok("rollback", { version: versions[1].version, confirm: true });
      expect(existsSync(join(dir, "content/pages/retreats.json"))).toBe(false);
      expect(await git(dir, "tag", "--list", "os/snap/before-rollback-*")).toMatch(
        /before-rollback/,
      );

      await ok("update_site", { set: { tagline: "Throwaway" } });
      const discard = await ok("discard_draft", { confirm: true });
      expect(discard.discarded).toBe(true);
      expect(JSON.parse(await readFile(join(dir, "content/site.json"), "utf8")).tagline).not.toBe(
        "Throwaway",
      );
      void created;
    } finally {
      await server.close();
      await store.close();
    }
  }, 60_000);

  it("uploads media into media/, serves a live preview and works without git", async () => {
    // Outside any git work tree (the package's temp folder is inside the monorepo).
    const dir = await mkdtemp(join(tmpdir(), "os-nogit-"));
    outside.push(dir);
    await cp(MEADOW, dir, { recursive: true });
    const store = await FileSiteStore.open(dir);
    expect(store.capabilities.canPublish).toBe(false);
    const server = createMcpServer(store, { sites: "*", publish: true });
    const { ok, call } = driver(server);
    try {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==",
        "base64",
      ).toString("base64");
      const img = await ok("upload_image", {
        base64: png,
        alt: "Two mats by the window",
        filename: "mats.png",
      });
      expect(existsSync(join(dir, img.src))).toBe(true);
      const media = JSON.parse(await readFile(join(dir, "content/media.json"), "utf8"));
      expect(media[img.src].alt).toBe("Two mats by the window");

      await ok("update_site", { set: { tagline: "Fresh tagline" } });
      const { url } = await ok("preview", { page: "/" });
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      const html = await (await fetch(url)).text();
      expect(html).toContain("<main");
      const mediaRes = await fetch(new URL(img.src, url));
      expect(mediaRes.status).toBe(200);
      expect(mediaRes.headers.get("content-type")).toBe("image/png");
      expect((await fetch(new URL("/media/../openspace.json", url))).status).toBe(404);

      const pub = await call("publish", { confirm: true });
      expect(pub.isError).toBe(true);
      expect(pub.content[0]?.text).toMatch(/isn't available|git/);
      expect((await ok("get_draft_diff")).hasChanges).toBe(true);
    } finally {
      await server.close();
      await store.close();
    }
  }, 60_000);

  it("takes real screenshots with Playwright when a browser is available", async (t) => {
    const pw = await loadPlaywright();
    if (!("chromium" in pw)) return t.skip();
    const shooter = createScreenshotter(pw.chromium);
    const dir = await meadowCopy();
    const store = await FileSiteStore.open(dir, { screenshotter: shooter });
    const server = createMcpServer(store, { sites: "*", publish: false });
    const { call } = driver(server);
    try {
      const r = await call("screenshot", { page: "/", device: "mobile", fullPage: false });
      if (r.isError && /Couldn't start a browser/.test(r.content[0]?.text ?? "")) return t.skip();
      expect(r.isError).toBeFalsy();
      const image = r.content.find((c) => c.type === "image");
      const bytes = Buffer.from(image?.data ?? "", "base64");
      expect(bytes.subarray(1, 4).toString()).toBe("PNG");
      expect(bytes.readUInt32BE(16)).toBe(390);
      const doc = await store.getDocument((await store.listSites())[0]?.id as string);
      const home = Object.values(doc.pages).find((p) => p.slug === "");
      const sec = await call("screenshot", {
        page: "/",
        section: home?.sections[0]?.id,
        device: "desktop",
      });
      expect(sec.isError).toBeFalsy();
    } finally {
      await server.close();
      await store.close();
    }
  }, 120_000);
});
