/**
 * Switching a site between GitHub Pages and Cloudflare hosting (Studio Settings → Hosting):
 * `openspace.json` `deploy.target`, the starter shell's hosting files (publish workflow, Astro
 * config, `wrangler.jsonc`) and the Cloudflare packages in `package.json` (merged, so update-bot
 * bumps and owner additions stay). Secrets are sealed in the browser and only relayed.
 */
import type { DeployTarget, SiteConfig } from "@openspace/schema";
import type { FileChange } from "../github/types";
import { CLOUDFLARE_PACKAGE_ADDITIONS, STARTER_HOSTING_FILES } from "../templates/starter-hosting";
import { CONFIG_PATH } from "./site-files";

/** Secrets a Cloudflare-hosted site's publish workflow needs. */
export const CLOUDFLARE_SECRETS = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"] as const;

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** Worker names: lowercase letters, digits and dashes. */
export function workerName(repoName: string): string {
  return (
    repoName
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 63) || "openspace-site"
  );
}

/**
 * The file changes that move one branch's files to `target`. `read` returns a file's current
 * contents (null when missing).
 */
export async function hostingChanges(
  read: (path: string) => Promise<string | null>,
  target: DeployTarget,
  repoName: string,
): Promise<FileChange[]> {
  const changes: FileChange[] = [];
  const configText = await read(CONFIG_PATH);
  if (configText) {
    const config = JSON.parse(configText) as SiteConfig;
    config.deploy = { ...config.deploy, target };
    const next = json(config);
    if (next !== configText) changes.push({ path: CONFIG_PATH, content: next });
  }
  const files: Record<string, string> = { ...STARTER_HOSTING_FILES[target] };
  if (target === "cloudflare" && files["wrangler.jsonc"])
    files["wrangler.jsonc"] = files["wrangler.jsonc"].replace(
      '"name": "openspace-site"',
      `"name": ${JSON.stringify(workerName(repoName))}`,
    );
  for (const [path, content] of Object.entries(files))
    if ((await read(path)) !== content) changes.push({ path, content });
  if (target === "github-pages" && (await read("wrangler.jsonc")) !== null)
    changes.push({ path: "wrangler.jsonc", content: null });
  const pkgText = await read("package.json");
  if (pkgText) {
    const pkg = JSON.parse(pkgText) as Record<string, Record<string, string> | unknown>;
    for (const [section, deps] of Object.entries(CLOUDFLARE_PACKAGE_ADDITIONS)) {
      const current = { ...((pkg[section] as Record<string, string> | undefined) ?? {}) };
      for (const [name, version] of Object.entries(deps)) {
        if (target === "cloudflare") current[name] ??= version;
        else delete current[name];
      }
      pkg[section] = Object.fromEntries(
        Object.entries(current).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    const next = json(pkg);
    if (next !== pkgText) changes.push({ path: "package.json", content: next });
  }
  return changes;
}
