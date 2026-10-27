import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { WWW_ROOT, writeWww, wwwFiles } from "./generate";

/**
 * openspace.host is data in the repo, like a template: `pnpm --filter @omniharmonic/openspace-www generate`
 * (UPDATE_WWW=1) rewrites `openspace.json`, `content/` and `media/LICENSES.json` from `www.ts`;
 * otherwise this test fails when the committed files drift from the source.
 */
async function walk(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(abs)));
    else out.push(relative(WWW_ROOT, abs).split(sep).join("/"));
  }
  return out;
}

describe("generated site files", () => {
  it("match www.ts", async () => {
    if (process.env.UPDATE_WWW) await writeWww();
    const expected = wwwFiles();
    const onDisk = [
      ...(existsSync(join(WWW_ROOT, "openspace.json")) ? ["openspace.json"] : []),
      ...(await walk(join(WWW_ROOT, "content"))),
      "media/LICENSES.json",
    ].sort();
    expect(onDisk).toEqual(Object.keys(expected).sort());
    for (const [path, text] of Object.entries(expected))
      expect(await readFile(join(WWW_ROOT, path), "utf8"), path).toBe(text);
  });
});

describe("media", () => {
  it("records the real type and size of every image", async () => {
    const { buildWww } = await import("./www");
    const { doc } = buildWww(() => 1);
    for (const [path, meta] of Object.entries(doc.media)) {
      const file = await readFile(join(WWW_ROOT, path));
      if (meta.mime === "image/svg+xml") {
        expect(file.toString("utf8"), path).toMatch(/^<svg [^>]*viewBox="0 0 64 64"/);
        continue;
      }
      const info = await sharp(file).metadata();
      expect(`image/${info.format === "jpeg" ? "jpeg" : info.format}`, path).toBe(meta.mime);
      expect([info.width, info.height], path).toEqual([meta.width, meta.height]);
    }
  });
});
