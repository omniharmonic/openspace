import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { CURRENT_SCHEMA_VERSION, newId, type SiteConfig } from "@openspace/schema";
import { loadSiteDocument, writeSiteDocument } from "@openspace/site-kit/content";
import { starterFiles } from "@openspace/template-starter";
import { writeAgentsMd } from "./agents";
import { CliError, type Io } from "./io";
import { monorepoRoot } from "./repo-root";

export interface NewOptions {
  target?: "github-pages" | "cloudflare";
  /** `owner/name`: derives the GitHub Pages URL. */
  repo?: string;
  /** Explicit `deploy.url`. */
  url?: string;
  domain?: string;
  title?: string;
  hub?: string;
  /** Folder holding `<id>/` template directories (default: the checkout's templates/). */
  templatesDir?: string;
}

export interface NewResult {
  dir: string;
  siteId: string;
  templateId: string;
  /** Where the template content came from. */
  contentFrom: string;
  /** True when the template had no content yet and the Meadow fixture stood in. */
  usedFallback: boolean;
  files: number;
}

interface TemplateSource {
  /** Folder with `content/` (and optionally `media/`, `public/`, `openspace.json`). */
  root: string;
  usedFallback: boolean;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "my-site";

/** Template ids that exist as folders under the templates dir (the starter is the shell, not a look). */
async function templateIds(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && d.name !== "starter" && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Templates are data under `templates/<id>/` (content/, media/, …). Until a template ships its
 * content, the Meadow fixture site (tools/fixtures/meadow-site) stands in for it.
 */
async function resolveTemplate(id: string, io: Io, opts: NewOptions): Promise<TemplateSource> {
  const repo = monorepoRoot();
  const dirs = [
    opts.templatesDir,
    io.env.OPENSPACE_TEMPLATES_DIR,
    repo ? join(repo, "templates") : undefined,
  ].filter((d): d is string => Boolean(d));
  let known = false;
  for (const dir of dirs) {
    const root = join(dir, id);
    if (existsSync(join(root, "content", "site.json")) && existsSync(join(root, "openspace.json")))
      return { root, usedFallback: false };
    if (existsSync(root)) known = true;
  }
  const fallback =
    io.env.OPENSPACE_FALLBACK_TEMPLATE ??
    (repo ? join(repo, "tools", "fixtures", "meadow-site") : undefined);
  if ((known || id === "starter") && fallback && existsSync(join(fallback, "content", "site.json")))
    return { root: fallback, usedFallback: true };
  const all = (await Promise.all(dirs.map(templateIds))).flat();
  throw new CliError(
    `Unknown template "${id}".${all.length ? ` Available: ${[...new Set(all)].join(", ")}.` : ""}` +
      (dirs.length ? "" : " Run from an OpenSpace checkout or set OPENSPACE_TEMPLATES_DIR."),
  );
}

async function isEmptyDir(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length === 0;
  } catch {
    return true;
  }
}

/** Scaffold a new site: the starter shell + a template's content, a fresh site id, AGENTS.md. */
export async function runNew(
  io: Io,
  templateId: string,
  dirArg: string,
  opts: NewOptions = {},
): Promise<NewResult> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(templateId))
    throw new CliError(
      `Invalid template id "${templateId}": use lowercase letters, digits and dashes only.`,
    );
  const dir = resolve(io.cwd, dirArg);
  if (!(await isEmptyDir(dir)))
    throw new CliError(`${dir} already exists and is not empty. Choose a new folder.`);
  const tpl = await resolveTemplate(templateId, io, opts);
  // mkdir returns the first directory it had to create (undefined if `dir` already existed),
  // so cleanup removes exactly what this command made.
  const createdRoot = await mkdir(dir, { recursive: true });
  try {
    return await scaffold(templateId, dir, tpl, opts);
  } catch (e) {
    if (createdRoot) await rm(createdRoot, { recursive: true, force: true });
    else
      for (const entry of await readdir(dir))
        await rm(join(dir, entry), { recursive: true, force: true });
    throw e;
  }
}

async function scaffold(
  templateId: string,
  dir: string,
  tpl: TemplateSource,
  opts: NewOptions,
): Promise<NewResult> {
  const targetKind = opts.target ?? "github-pages";
  const slug = slugify(basename(dir));

  // 1. The shell.
  const files = await starterFiles(targetKind);
  for (const [rel, text] of Object.entries(files)) {
    const abs = join(dir, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, text);
  }
  const pkgPath = join(dir, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as Record<string, unknown>;
  pkg.name = slug;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  // 2. The template's content.
  for (const part of ["content", "media", "public"]) {
    const from = join(tpl.root, part);
    if (existsSync(from)) await cp(from, join(dir, part), { recursive: true });
  }
  let tplConfig: Partial<SiteConfig> = {};
  try {
    tplConfig = JSON.parse(await readFile(join(tpl.root, "openspace.json"), "utf8")) as SiteConfig;
  } catch {
    tplConfig = {};
  }
  // Placeholder identity so the content loads; replaced below.
  await writeFile(join(dir, "openspace.json"), `${JSON.stringify(tplConfig, null, 2)}\n`);
  let tplVersion = tplConfig.template?.version ?? "1.0.0";
  try {
    const tp = JSON.parse(await readFile(join(tpl.root, "package.json"), "utf8")) as {
      version?: string;
    };
    if (tp.version && !tpl.usedFallback) tplVersion = tp.version;
  } catch {
    // Fixture sites have no package.json.
  }

  // 3. Identity: fresh site id, current schema, this site's deploy target. All through the
  // validated document writer.
  const url =
    opts.url ??
    (opts.repo
      ? `https://${opts.repo.split("/")[0]}.github.io/${opts.repo.split("/")[1] ?? slug}`
      : targetKind === "cloudflare"
        ? `https://${slug}.pages.dev`
        : `https://example.github.io/${slug}`);
  const doc = await loadSiteDocument(dir);
  const siteId = newId("st");
  doc.config = {
    ...(tplConfig.$schema ? { $schema: tplConfig.$schema } : {}),
    siteId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    template: {
      id: templateId === "starter" ? (tplConfig.template?.id ?? templateId) : templateId,
      version: tplVersion,
    },
    hub: opts.hub ?? tplConfig.hub ?? "https://hub.openspace.dev",
    deploy: { target: targetKind, url, customDomain: opts.domain ?? null },
    features: tplConfig.features ?? {
      forms: true,
      newsletter: false,
      analytics: false,
      search: true,
    },
  };
  if (opts.title) doc.site = { ...doc.site, title: opts.title };
  await writeSiteDocument(dir, doc);

  // 4. AGENTS.md for this site.
  await writeAgentsMd(dir, doc.site.title);

  return {
    dir,
    siteId,
    templateId: doc.config.template.id,
    contentFrom: tpl.root,
    usedFallback: tpl.usedFallback,
    files: Object.keys(files).length,
  };
}
