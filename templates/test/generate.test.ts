import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSiteDocument, writeSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { describe, expect, it } from "vitest";
import { loadTemplate, TEMPLATE_IDS, templateFolderFiles } from "../index";

/**
 * Templates are data in the repo: `templates/<id>/` holds the files generated from
 * `templates/<id>/src/build.ts`. `pnpm --filter @omniharmonic/openspace-templates generate` (UPDATE_TEMPLATES=1)
 * rewrites them through site-kit's `writeSiteDocument`; otherwise this test fails when the
 * committed files drift from the generators.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED = ["openspace.json", "template.json", "content", "media"];

async function walk(dir: string, base = dir): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(abs, base)));
    else out.push(relative(base, abs).split(sep).join("/"));
  }
  return out;
}

async function generatedOnDisk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const part of GENERATED) {
    const abs = join(dir, part);
    if (!existsSync(abs)) continue;
    if (part.endsWith(".json")) out.push(part);
    else out.push(...(await walk(abs)).map((f) => `${part}/${f}`));
  }
  return out.sort();
}

describe.each(TEMPLATE_IDS)("template %s on disk", (id) => {
  it("matches its generator (UPDATE_TEMPLATES=1 rewrites it)", async () => {
    const t = loadTemplate(id);
    if (!t) throw new Error(id);
    const dir = join(ROOT, id);
    const expected = templateFolderFiles(t.doc, t.meta, t.licenses);
    if (process.env.UPDATE_TEMPLATES) {
      for (const rel of await generatedOnDisk(dir))
        if (!(rel in expected)) await rm(join(dir, rel));
      await writeSiteDocument(dir, t.doc);
      for (const rel of ["media/LICENSES.json", "template.json"]) {
        await mkdir(dirname(join(dir, rel)), { recursive: true });
        await writeFile(join(dir, rel), expected[rel] as string);
      }
    }
    expect(await generatedOnDisk(dir)).toEqual(Object.keys(expected).sort());
    for (const [rel, text] of Object.entries(expected))
      expect(await readFile(join(dir, rel), "utf8"), rel).toBe(text);
    expect(await loadSiteDocument(dir)).toEqual(JSON.parse(JSON.stringify(t.doc)));
  });
});
