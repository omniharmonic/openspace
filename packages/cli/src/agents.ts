import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Render `AGENTS.md` for the site in `root` (title from content/site.json when readable). */
export async function renderAgentsMd(root: string, siteTitle?: string): Promise<string> {
  let title = siteTitle;
  if (!title) {
    try {
      const site = JSON.parse(await readFile(join(root, "content/site.json"), "utf8")) as {
        title?: unknown;
      };
      if (typeof site.title === "string") title = site.title;
    } catch {
      // No site yet: use the generic heading.
    }
  }
  // Loaded lazily: site-kit's entry pulls in the whole build pipeline.
  const { generateAgentsMd } = await import("@openspace/site-kit");
  return generateAgentsMd(title ? { siteTitle: title } : {});
}

export async function writeAgentsMd(
  root: string,
  siteTitle?: string,
): Promise<{ changed: boolean }> {
  const next = await renderAgentsMd(root, siteTitle);
  let prev: string | undefined;
  try {
    prev = await readFile(join(root, "AGENTS.md"), "utf8");
  } catch {
    prev = undefined;
  }
  if (prev === next) return { changed: false };
  await writeFile(join(root, "AGENTS.md"), next);
  return { changed: true };
}
