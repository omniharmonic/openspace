import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { newId } from "@openspace/schema";
import { afterAll, describe, expect, it } from "vitest";
import { type CheckReport, runCheck } from "./check";
import { cleanup, cli, editJson, meadowCopy } from "./test-helpers";

afterAll(cleanup);

const rules = (r: CheckReport, severity = "error") =>
  r.findings.filter((f) => f.severity === severity).map((f) => f.rule);

describe("openspace check", () => {
  it("passes on the Meadow fixture site", async () => {
    const root = await meadowCopy();
    const report = await runCheck(root);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.stats.pages).toBeGreaterThan(3);
    expect(report.stats.mediaFiles).toBeGreaterThan(3);
    const r = await cli(root, ["check"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^OK:/m);
  });

  it("fails on invalid schema, naming the file and field", async () => {
    const root = await meadowCopy();
    await editJson(join(root, "content/pages/about.json"), (p) => {
      p.title = "";
    });
    const r = await cli(root, ["check"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("content/pages/about.json");
    expect(r.out).toMatch(/error\s+schema\s+title/);
    expect(r.out).toMatch(/FAILED: 1 error/);
  });

  it("fails on unparseable JSON and a missing openspace.json", async () => {
    const root = await meadowCopy();
    await writeFile(join(root, "content/pages/about.json"), "{ nope");
    const report = await runCheck(root);
    expect(report.ok).toBe(false);
    expect(report.findings.some((f) => /Invalid JSON/.test(f.message))).toBe(true);
  });

  it("reports broken page, item, nav, internal-url and redirect links", async () => {
    const root = await meadowCopy();
    const ghost = newId("pg");
    await editJson(join(root, "content/site.json"), (s) => {
      s.nav.push({ type: "page", page: ghost });
      s.nav.push({ type: "collection", collection: "nothing-here", label: "Nope" });
      s.nav.push({
        type: "button",
        label: "Go",
        style: "primary",
        link: { type: "item", collection: "journal", slug: "no-such-post" },
      });
      s.nav.push({
        type: "button",
        label: "Go2",
        style: "primary",
        link: { type: "url", url: "/nowhere-at-all" },
      });
      s.redirects = [
        ...(s.redirects ?? []),
        { from: "/old-page", to: "/missing-target", status: 301 },
        { from: "/loop", to: "/loop/", status: 301 },
      ];
    });
    const report = await runCheck(root);
    const msgs = report.findings.map((f) => `${f.rule}:${f.message}`).join("\n");
    expect(msgs).toContain(`link:Link to page ${ghost} but no such page exists`);
    expect(msgs).toContain('Navigation points at collection "nothing-here"');
    expect(msgs).toContain("journal/no-such-post but no such item exists");
    expect(msgs).toContain("Link to /nowhere-at-all does not lead to any page");
    expect(msgs).toContain("destination does not lead to any page");
    expect(msgs).toContain("points at itself");
    expect(report.ok).toBe(false);
    expect((await cli(root, ["check"])).code).toBe(1);
  });

  it("reports broken links inside Markdoc post bodies", async () => {
    const root = await meadowCopy();
    const file = join(root, "content/collections/journal");
    const { readdir } = await import("node:fs/promises");
    const post = (await readdir(file)).find((f) => f.endsWith(".mdoc"));
    if (!post) throw new Error("no post in the fixture");
    const text = await readFile(join(file, post), "utf8");
    await writeFile(join(file, post), `${text}\nSee [the gone page](/definitely-gone).\n`);
    const report = await runCheck(root);
    const hit = report.findings.find((f) => f.message.includes("/definitely-gone"));
    expect(hit?.file).toBe(`content/collections/journal/${post}`);
  });

  it("reports images missing from media/ and from media.json", async () => {
    const root = await meadowCopy();
    const pageFile = join(root, "content/pages/about.json");
    const text = await readFile(pageFile, "utf8");
    const refs = [...new Set(text.match(/media\/[A-Za-z0-9_\-./]+\.[a-z]+/g) ?? [])];
    expect(refs.length).toBeGreaterThan(0);
    await writeFile(pageFile, text.replaceAll(refs[0] as string, "media/gone/missing.jpg"));
    // A real file that nobody described in media.json.
    const other = [...new Set(text.match(/media\/[A-Za-z0-9_\-./]+\.[a-z]+/g) ?? [])][1];
    if (other) {
      await editJson(join(root, "content/media.json"), (m) => {
        delete m[other];
      });
    }
    const report = await runCheck(root);
    expect(
      report.findings.some(
        (f) => f.rule === "image" && f.message.includes("media/gone/missing.jpg"),
      ),
    ).toBe(true);
    expect(report.ok).toBe(false);
    if (other)
      expect(report.findings.some((f) => f.rule === "media" && f.message.includes(other))).toBe(
        true,
      );
  });

  it("enforces the media size meter (warn, then fail) and the per-image edge cap", async () => {
    const root = await meadowCopy();
    const base = await runCheck(root);
    expect(base.stats.mediaBytes).toBeGreaterThan(10_000);
    // Just above warn threshold, below fail.
    const warn = await runCheck(root, {
      budgets: { mediaWarnBytes: 1000, mediaFailBytes: 1e12 },
    });
    expect(warn.ok).toBe(true);
    expect(warn.findings.filter((f) => f.rule === "size" && f.severity === "warning")).toHaveLength(
      1,
    );
    // Above fail threshold through the CLI flags.
    const r = await cli(root, ["check", "--media-warn-mb", "0.001", "--media-fail-mb", "0.002"]);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/error\s+size\s+media\/ is/);

    await editJson(join(root, "content/media.json"), (m) => {
      const first = Object.values(
        m as Record<string, { kind?: string; width?: number; height?: number }>,
      ).find((e) => e.kind === "image") as { width?: number; height?: number };
      first.width = 6000;
      first.height = 4000;
    });
    const edge = await runCheck(root);
    expect(edge.findings.some((f) => f.rule === "size" && /at most 2400px/.test(f.message))).toBe(
      true,
    );
  });

  it("finds secrets anywhere in content/ without echoing them", async () => {
    const root = await meadowCopy();
    const secret = ["sk", "live", "A1b2C3d4E5f6G7h8I9j0K1l2"].join("_");
    await writeFile(join(root, "content/notes.md"), `intro\nstripe: ${secret}\n`);
    const r = await cli(root, ["check"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("content/notes.md");
    expect(r.out).toMatch(/secret\s+line 2:/);
    expect(r.out).not.toContain(secret);
    const json = await cli(root, ["check", "--json"]);
    expect(JSON.stringify(JSON.parse(json.out))).not.toContain(secret);
  });

  it("scans dotfiles inside content/ for secrets", async () => {
    const root = await meadowCopy();
    const secret = ["ghp", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("_");
    await writeFile(join(root, "content/.env"), `TOKEN=${secret}\n`);
    const report = await runCheck(root);
    expect(report.findings.some((f) => f.rule === "secret" && f.file === "content/.env")).toBe(
      true,
    );
  });

  it("only demands dimensions and alt text for images in media.json", async () => {
    const root = await meadowCopy();
    const { writeFile: wf } = await import("node:fs/promises");
    await wf(join(root, "media/guide.pdf"), "%PDF-1.4\n");
    await wf(join(root, "media/extra.jpg"), "x");
    await editJson(join(root, "content/pages/about.json"), (p) => {
      p.sections[0].blocks[0].fields.note = "See media/guide.pdf and media/extra.jpg";
    });
    const report = await runCheck(root);
    const pdf = report.findings.find((f) => f.message.startsWith("media/guide.pdf is used"));
    const jpg = report.findings.find((f) => f.message.startsWith("media/extra.jpg is used"));
    expect(pdf?.severity).toBe("warning");
    expect(pdf?.message).not.toMatch(/alt text/);
    expect(jpg?.severity).toBe("error");
    expect(jpg?.message).toMatch(/width, height and alt text/);
  });

  it("flags gated page content in the files; stubs pass (a note on GitHub Pages)", async () => {
    const root = await meadowCopy();
    await editJson(join(root, "content/pages/about.json"), (p) => {
      p.access = { members: true };
    });
    const pages = await runCheck(root);
    const finding = pages.findings.find((f) => f.rule === "gating");
    expect(finding).toMatchObject({ severity: "warning", file: "content/pages/about.json" });
    expect(finding?.message).toContain("anyone can read");

    await editJson(join(root, "openspace.json"), (c) => {
      c.deploy.target = "cloudflare";
    });
    // Content in the files is flagged on Cloudflare too: it's public there.
    expect(rules(await runCheck(root), "warning")).toContain("gating");

    // The stub the Hub commits is fine.
    await editJson(join(root, "content/pages/about.json"), (p) => {
      p.sections = [];
      p.contentRef = "abcdef0123456789abcdef0123456789abcdef01";
    });
    const cf = await runCheck(root);
    expect(cf.findings.map((f) => f.rule)).not.toContain("gating");
    await editJson(join(root, "openspace.json"), (c) => {
      c.deploy.target = "github-pages";
    });
    const gp = await runCheck(root);
    expect(gp.findings.find((f) => f.rule === "gating")?.severity).toBe("warning");
  });

  it("prints JSON and GitHub annotations", async () => {
    const root = await meadowCopy();
    await editJson(join(root, "content/pages/about.json"), (p) => {
      p.title = "";
    });
    const json = await cli(root, ["check", "--json"]);
    const parsed = JSON.parse(json.out) as CheckReport;
    expect(parsed.ok).toBe(false);
    expect(parsed.errors).toBe(1);
    expect(json.code).toBe(1);
    const ci = await cli(root, ["check", "--ci"]);
    expect(ci.out).toMatch(/^::error file=content\/pages\/about\.json,title=schema::/m);
  });

  it("emits no colour escapes under NO_COLOR", async () => {
    const root = await meadowCopy();
    await editJson(join(root, "content/pages/about.json"), (p) => {
      p.title = "";
    });
    const r = await cli(root, ["check"], { NO_COLOR: "1" });
    // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting absence of ANSI
    expect(r.out).not.toMatch(/\u001b\[/);
  });
});
