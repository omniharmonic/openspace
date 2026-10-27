/**
 * The Claude app skills (/skills/<name>.zip) are valid uploads for claude.ai and Claude Desktop
 * (Customize → Skills): the skill folder at the top of the zip, `SKILL.md` frontmatter within the
 * Agent Skills spec and claude.ai's limits, every referenced file present, only real tool names,
 * and no local-install instructions (this is the no-install path).
 */
import { ALL_TOOLS } from "@omniharmonic/openspace-mcp-tools";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs build script without types
import { buildSkillZip, SKILL_NAMES } from "../scripts/skills.mjs";

const buildZip = buildSkillZip as (name: string) => Promise<Uint8Array>;
const names = SKILL_NAMES as string[];

/** Tools only some servers add (the Hub's and the local server's web-reaching tools). */
const WEB_TOOLS = ["screenshot_url", "import_site", "import_squarespace", "import_status"];
const TOOLS = new Set([...ALL_TOOLS.map((t) => t.name), ...WEB_TOOLS]);
const SPEC_KEYS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);

function frontmatter(text: string): {
  keys: string[];
  fields: Record<string, string>;
  body: string;
} {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error("no frontmatter");
  const fields: Record<string, string> = {};
  const keys: string[] = [];
  for (const line of (m[1] as string).split("\n")) {
    const kv = /^([A-Za-z][\w-]*):\s?(.*)$/.exec(line);
    if (!kv) continue;
    keys.push(kv[1] as string);
    fields[kv[1] as string] = (kv[2] as string).trim();
  }
  return { keys, fields, body: text.slice(m[0].length) };
}

describe("Claude app skills", () => {
  it("packages the four skills", () => {
    expect(names).toEqual([
      "openspace-migrate",
      "openspace-web-design",
      "openspace-content",
      "openspace-site-setup",
    ]);
  });

  for (const name of names)
    it(`${name}.zip is a valid claude.ai skill upload`, async () => {
      const zip = await buildZip(name);
      // Deterministic: the same bytes on every build.
      expect(Buffer.from(await buildZip(name)).equals(Buffer.from(zip))).toBe(true);
      const files = unzipSync(zip);
      const paths = Object.keys(files);
      for (const p of paths) expect(p.startsWith(`${name}/`), p).toBe(true);
      expect(paths).toContain(`${name}/SKILL.md`);
      expect(zip.length).toBeLessThan(1024 * 1024);

      const skill = strFromU8(files[`${name}/SKILL.md`] as Uint8Array);
      const { keys, fields, body } = frontmatter(skill);
      for (const k of keys) expect(SPEC_KEYS.has(k), `frontmatter key ${k}`).toBe(true);
      expect(fields.name).toBe(name);
      expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(name.length).toBeLessThanOrEqual(64);
      expect(name).not.toMatch(/anthropic|claude/);
      const description = fields.description ?? "";
      expect(description.length).toBeGreaterThan(40);
      expect(
        description.length,
        "claude.ai limits descriptions to 200 characters",
      ).toBeLessThanOrEqual(200);
      expect(description).not.toMatch(/[<>]/);
      expect(body.split("\n").length).toBeLessThan(500);

      // Every referenced file ships in the zip.
      for (const m of body.matchAll(/`(references\/[\w.-]+)`/g))
        expect(paths, m[1]).toContain(`${name}/${m[1]}`);

      // Only real tool names, in the skill and its references.
      const unknown: string[] = [];
      for (const p of paths) {
        const text = strFromU8(files[p] as Uint8Array);
        for (const m of text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g))
          if (!TOOLS.has(m[1] as string)) unknown.push(`${p}: ${m[1]}`);
      }
      expect(unknown).toEqual([]);

      // The no-install path: the instructions never send the owner to a terminal.
      expect(body).not.toMatch(
        /\bnpx\b|npm (i|install)\b|playwright install|claude mcp add|openspace (mcp|new|import|check)\b|cd my-site/i,
      );
      expect(body).toContain("https://hub.openspace.host/mcp");
    });

  it("the migration skill uses the hosted import and the cloud screenshot tools", async () => {
    const files = unzipSync(await buildZip("openspace-migrate"));
    const skill = strFromU8(files["openspace-migrate/SKILL.md"] as Uint8Array);
    for (const t of ["import_site", "screenshot_url", "screenshot", "design_check", "list_sites"])
      expect(skill, t).toContain(`\`${t}\``);
    expect(skill).toMatch(/GitHub Pages/);
    expect(skill).toMatch(/Squarespace/);
  });

  it("the design skill describes cloud screenshots, not a local browser", async () => {
    const files = unzipSync(await buildZip("openspace-web-design"));
    const skill = strFromU8(files["openspace-web-design/SKILL.md"] as Uint8Array);
    expect(skill).toMatch(/taken by OpenSpace in the cloud/);
    expect(skill).not.toMatch(/Playwright/);
  });
});
