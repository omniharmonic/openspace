// Claude app skills (claude.ai / Claude Desktop → Customize → Skills → upload a .zip).
//
// Sources: plugin/claude-app-skills/<name>/SKILL.md (adapted for the remote OpenSpace connector:
// no local CLI, hosted import, cloud screenshots) plus the plugin skill's references/ — a file
// under plugin/claude-app-skills/<name>/references/ replaces the plugin's file of the same name.
//
// Each zip holds `<name>/SKILL.md` (+ `<name>/references/…`) — the skill folder at the top level,
// as Claude requires. Zips are deterministic (fixed timestamps, sorted entries).
//
// Usage: node scripts/skills.mjs [outDir]   (default: public/skills)
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(ROOT, "..", "..");
export const APP_SKILLS_DIR = join(REPO, "plugin", "claude-app-skills");
export const PLUGIN_SKILLS_DIR = join(REPO, "plugin", "skills");
export const SKILL_NAMES = [
  "openspace-migrate",
  "openspace-web-design",
  "openspace-content",
  "openspace-site-setup",
];
/** 1980-01-01, the earliest DOS date: identical bytes on every build. */
const MTIME = new Date(1980, 0, 1, 0, 0, 0);

async function filesIn(dir) {
  if (!existsSync(dir)) return [];
  return (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

/** Files of one skill: `{ "<name>/SKILL.md": bytes, "<name>/references/x.md": bytes, … }`. */
export async function skillFiles(name) {
  const files = {};
  files[`${name}/SKILL.md`] = await readFile(join(APP_SKILLS_DIR, name, "SKILL.md"));
  const refs = new Map();
  for (const f of await filesIn(join(PLUGIN_SKILLS_DIR, name, "references")))
    refs.set(f, join(PLUGIN_SKILLS_DIR, name, "references", f));
  for (const f of await filesIn(join(APP_SKILLS_DIR, name, "references")))
    refs.set(f, join(APP_SKILLS_DIR, name, "references", f));
  for (const [f, path] of [...refs].sort(([a], [b]) => a.localeCompare(b)))
    files[`${name}/references/${f}`] = await readFile(path);
  return files;
}

export async function buildSkillZip(name) {
  const files = await skillFiles(name);
  const entries = {};
  for (const [path, bytes] of Object.entries(files))
    entries[path] = [new Uint8Array(bytes), { mtime: MTIME, level: 9 }];
  return zipSync(entries);
}

/** Write every skill zip into `outDir`; returns the written file names. */
export async function buildSkillZips(outDir) {
  await mkdir(outDir, { recursive: true });
  const written = [];
  for (const name of SKILL_NAMES) {
    await writeFile(join(outDir, `${name}.zip`), await buildSkillZip(name));
    written.push(`${name}.zip`);
  }
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(ROOT, process.argv[2] ?? join("public", "skills"));
  const written = await buildSkillZips(out);
  console.log(`Wrote ${written.length} Claude app skills to ${out}`);
}
