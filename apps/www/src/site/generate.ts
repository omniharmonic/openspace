/**
 * Writes openspace.dev's site files (`openspace.json`, `content/**`, `media/LICENSES.json`) from
 * the document in `www.ts`, through site-kit's own writer — the same files any OpenSpace site
 * has, so the build and the editor treat this site like every other.
 */
import { statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { documentFiles, formatJson } from "../../../../templates/lib/files";
import { buildWww } from "./www";

/** The site root (`apps/www`). */
export const WWW_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const bytesOnDisk = (root: string) => (path: string) => statSync(join(root, path)).size;

/** Every generated file keyed by path, as it should be on disk. */
export function wwwFiles(root = WWW_ROOT): Record<string, string> {
  const { doc, licenses } = buildWww(bytesOnDisk(root));
  return { ...documentFiles(doc), "media/LICENSES.json": formatJson(licenses) };
}

/** Write the site files to `root` (removing pages that no longer exist). */
export async function writeWww(root = WWW_ROOT): Promise<void> {
  const { doc, licenses } = buildWww(bytesOnDisk(root));
  await writeSiteDocument(root, doc);
  await writeFile(join(root, "media", "LICENSES.json"), formatJson(licenses));
}
