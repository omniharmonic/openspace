// Copies the starter shell (templates/starter/{site,variants}) and every launch template's site
// files (templates/<id>/{content,media,public,openspace.json,template.json}) into dist/, so the
// published CLI can run `openspace new <template>` without the monorepo checkout.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const templatesRoot = join(pkgRoot, "..", "..", "templates");
const out = join(pkgRoot, "dist");

const starterOut = join(out, "starter");
rmSync(starterOut, { recursive: true, force: true });
for (const part of ["site", "variants"])
  cpSync(join(templatesRoot, "starter", part), join(starterOut, part), { recursive: true });

const tplOut = join(out, "templates");
rmSync(tplOut, { recursive: true, force: true });
const ids = readdirSync(templatesRoot, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() &&
      d.name !== "starter" &&
      existsSync(join(templatesRoot, d.name, "template.json")) &&
      existsSync(join(templatesRoot, d.name, "content", "site.json")),
  )
  .map((d) => d.name)
  .sort();
for (const id of ids) {
  const from = join(templatesRoot, id);
  const to = join(tplOut, id);
  mkdirSync(to, { recursive: true });
  for (const part of ["content", "media", "public", "openspace.json", "template.json"])
    if (existsSync(join(from, part))) cpSync(join(from, part), join(to, part), { recursive: true });
}
console.log(`bundled starter + ${ids.length} templates into dist/: ${ids.join(", ")}`);
