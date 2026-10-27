/**
 * Read a site from its GitHub repository (or a checkout of it): find where GitHub Pages builds
 * from (`/` or `/docs`, which branch), tell what builds it, and read it the best way:
 * - Jekyll: from the source (pages, posts, collections, front matter, layouts, includes);
 * - plain HTML: the repository *is* the published site, read page by page without the network;
 * - Hugo, Eleventy and other generators: the published pages (their output isn't in the
 *   repository), with Markdown front matter filling in post dates, tags and drafts.
 */
import { SiteFetcher } from "../fetch";
import { crawlGeneric } from "../generic/crawl";
import type { SqSite } from "../types";
import { detectRepo, type RepoDetection } from "./detect";
import { cleanPath, crawlJekyll, repoFetch } from "./jekyll";
import { isMarkdownPath, parseFrontMatter } from "./markdown";
import {
  decodeText,
  type GitHubRepoInfo,
  GitHubSourceError,
  githubRepoInfo,
  githubRepoSource,
  localRepoSource,
  type RepoSource,
  subSource,
} from "./source";
import { crawlStructured, findStructuredPages } from "./structured";
import { type GitHubTarget, pagesUrlFor, parseGitHubTarget } from "./target";

export interface GitHubCrawlOptions {
  /** `owner/name`, a github.com or github.io address. Ignored for the repo when `dir` is set. */
  input?: string;
  /** Read the source from this folder instead of the network (a checkout). */
  dir?: string;
  /** The published address, when known (custom domain); otherwise derived. */
  siteUrl?: string;
  fetch?: typeof fetch;
  token?: string;
  maxPages?: number;
  /** Don't read the published site (CSS for the look, generator output). */
  offline?: boolean;
  onProgress?: (message: string) => void;
  apiBase?: string;
  rawBase?: string;
}

export interface GitHubCrawl {
  site: SqSite;
  /** A fetcher that serves the repository's files at the site's addresses (media). */
  fetcher: SiteFetcher;
  detection: RepoDetection;
  repo?: { owner: string; repo: string; ref: string; path: string; private: boolean };
  /** The custom domain the site used (its CNAME), if any. */
  domain?: string;
}

const SITE_MARKERS =
  /^(?:_config\.ya?ml|index\.(?:html?|md|markdown)|README\.md|hugo\.toml|config\.toml)$/i;

/** The folder GitHub Pages builds from, when the API didn't say: the root, else `docs/`. */
function siteFolder(files: readonly string[]): string {
  if (files.some((f) => SITE_MARKERS.test(f) && !f.includes("/"))) {
    const rootHasSite = files.some((f) =>
      /^(?:_config\.ya?ml|index\.(?:html?|md|markdown))$/i.test(f),
    );
    if (rootHasSite) return "";
  }
  if (files.some((f) => /^docs\/(?:_config\.ya?ml|index\.(?:html?|md|markdown))$/i.test(f)))
    return "docs";
  return "";
}

async function readText(src: RepoSource, p: string): Promise<string | undefined> {
  const b = await src.read(p);
  return b ? decodeText(b) : undefined;
}

/** The published site's CSS (its compiled theme), best effort. */
async function liveCss(url: string, f: SiteFetcher): Promise<string | undefined> {
  try {
    const home = await f.text(url);
    if (!home || home.status >= 400) return undefined;
    let css = [...home.text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
      .map((m) => m[1])
      .join("\n");
    const hrefs = [...home.text.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)]
      .map((m) => /href=["']([^"']+)["']/i.exec(m[0])?.[1])
      .filter((h): h is string => !!h)
      .slice(0, 6);
    for (const h of hrefs) {
      const u = new URL(h, home.url || url);
      if (/fonts\.googleapis|font-?awesome/.test(u.href)) continue;
      const r = await f.text(u.toString()).catch(() => undefined);
      if (r && r.status < 400) css += `\n${r.text.slice(0, 800_000)}`;
    }
    return css || undefined;
  } catch {
    return undefined;
  }
}

async function resolveRemote(
  target: GitHubTarget,
  opts: GitHubCrawlOptions,
): Promise<{ info: GitHubRepoInfo; target: GitHubTarget }> {
  const tries = [target.repo, ...(target.alternatives ?? [])];
  let last: unknown;
  for (const repo of tries) {
    try {
      const info = await githubRepoInfo({
        owner: target.owner,
        repo,
        ...(opts.fetch ? { fetch: opts.fetch } : {}),
        ...(opts.token ? { token: opts.token } : {}),
        ...(opts.apiBase ? { apiBase: opts.apiBase } : {}),
      });
      return { info, target: { ...target, repo: info.repo } };
    } catch (e) {
      last = e;
      if (!(e instanceof GitHubSourceError) || e.status !== 404) throw e;
    }
  }
  throw last;
}

export async function crawlGitHub(opts: GitHubCrawlOptions): Promise<GitHubCrawl> {
  const progress = opts.onProgress ?? (() => undefined);
  const net = opts.fetch ?? ((u, i) => fetch(u, i));
  let root: RepoSource;
  let repo: GitHubCrawl["repo"];
  let pagesUrl: string | undefined;
  let cname: string | undefined;
  let baseurl = "";
  const target = opts.input ? parseGitHubTarget(opts.input) : undefined;

  if (opts.dir) {
    root = localRepoSource(opts.dir);
    const files = await root.list();
    const folder = siteFolder(files);
    root = subSource(root, folder);
    if (target) {
      pagesUrl = target.pagesUrl ?? pagesUrlFor(target.owner, target.repo);
      repo = { owner: target.owner, repo: target.repo, ref: "local", path: folder, private: false };
    }
  } else {
    if (!target)
      throw new Error(
        `"${opts.input ?? ""}" isn't a GitHub repository or GitHub Pages address. Use owner/name, https://github.com/owner/name or https://owner.github.io/name/.`,
      );
    progress(`Looking up ${target.owner}/${target.repo} on GitHub`);
    const { info, target: t } = await resolveRemote(target, opts);
    // Pages may build from another branch (gh-pages) or folder (/docs).
    const ref = t.ref ?? info.pages?.branch ?? info.defaultBranch;
    let path = t.path ?? (info.pages?.path ?? "").replace(/^\/+|\/+$/g, "");
    const whole = githubRepoSource({
      owner: info.owner,
      repo: info.repo,
      ref,
      fetch: net,
      ...(opts.token ? { token: opts.token } : {}),
      ...(opts.apiBase ? { apiBase: opts.apiBase } : {}),
      ...(opts.rawBase ? { rawBase: opts.rawBase } : {}),
    });
    if (!t.path && !info.pages?.path) path = siteFolder(await whole.list());
    root = subSource(whole, path);
    repo = { owner: info.owner, repo: info.repo, ref, path, private: info.private };
    pagesUrl = info.pages?.url ?? t.pagesUrl ?? pagesUrlFor(info.owner, info.repo);
    cname = info.pages?.cname;
    if (info.private)
      progress("This repository is private; only you and people you invite can read it.");
  }

  const files = await root.list();
  cname ??= (await readText(root, "CNAME"))?.trim().split(/\s+/)[0] || undefined;
  if (cname) pagesUrl = `https://${cname.replace(/^https?:\/\//, "").replace(/\/+$/, "")}/`;
  if (opts.siteUrl) pagesUrl = opts.siteUrl;
  let origin = "https://site.example";
  if (pagesUrl) {
    const u = new URL(pagesUrl);
    origin = u.origin;
    baseurl = u.pathname.replace(/\/+$/, "");
  }
  const detection: RepoDetection = detectRepo(files, await readText(root, "package.json"));
  progress(
    `Found a ${detection.kind === "html" ? "plain HTML" : detection.kind} site (${detection.evidence.join(", ")})`,
  );

  const live = new SiteFetcher({ fetch: net });
  const domain = cname?.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  if (detection.kind === "jekyll") {
    const css = !opts.offline && pagesUrl ? await liveCss(pagesUrl, live) : undefined;
    const j = await crawlJekyll({
      source: root,
      origin,
      baseurl,
      ...(css ? { liveCss: css } : {}),
      onProgress: progress,
      ...(opts.maxPages ? { maxPages: opts.maxPages } : {}),
    });
    const host = new URL(origin).host;
    const fetcher = new SiteFetcher({
      fetch: repoFetch(root, origin, { baseurl, next: net }),
      hostDelay: (h) => (h === host ? 0 : undefined),
      robots: false,
    });
    if (repo?.private)
      j.site.notices.push({
        kind: "other",
        where: "site",
        message:
          "The repository is private: the imported site is published publicly once you publish it. Check that nothing private came across.",
      });
    return {
      site: j.site,
      fetcher,
      detection,
      ...(repo ? { repo } : {}),
      ...(domain ? { domain } : {}),
    };
  }

  if (detection.kind === "html") {
    const pagesFiles = files.filter((f) => /\.html?$/i.test(f) && !/(?:^|\/)(?:_|\.)/.test(f));
    const cleanToFile = new Map<string, string>();
    for (const f of pagesFiles) {
      const clean = cleanPath(`/${f}`);
      if (!cleanToFile.has(clean) || /index\.html?$/i.test(f)) cleanToFile.set(clean, f);
    }
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset>${[...cleanToFile.keys()]
      .filter((p) => !/^\/404$/.test(p))
      .map((p) => `<url><loc>${origin}${p === "/" ? "/" : p}</loc></url>`)
      .join("")}</urlset>`;
    const files404 = new Set(["robots.txt"]);
    const serve = repoFetch(root, origin, {
      baseurl,
      next: net,
      resolvePage: (path) => {
        const f = cleanToFile.get(cleanPath(path));
        return f ? [f] : [];
      },
    });
    const host = new URL(origin).host;
    const shim = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(String(input instanceof Request ? input.url : input));
      if (u.host === host && u.pathname === "/sitemap.xml" && !files.includes("sitemap.xml"))
        return new Response(sitemap, { headers: { "content-type": "application/xml" } });
      if (
        u.host === host &&
        files404.has(u.pathname.slice(1)) &&
        !files.includes(u.pathname.slice(1))
      )
        return new Response("not found", { status: 404 });
      return serve(input, init);
    }) as typeof fetch;
    const fetcher = new SiteFetcher({
      fetch: shim,
      hostDelay: (h) => (h === host ? 0 : undefined),
    });
    const site = await crawlGeneric({
      url: origin,
      fetcher,
      platform: "github",
      onProgress: progress,
      ...(opts.maxPages ? { maxPages: opts.maxPages } : {}),
    });
    // Pages reached by their file name (`/concerts.html` from the menu) are the clean ones.
    const kept = new Map<string, (typeof site.pages)[number]>();
    for (const p of site.pages) {
      const clean = cleanPath(p.path);
      if (clean !== p.path) site.aliases.push({ from: p.path, to: clean });
      const prev = kept.get(clean);
      if (!prev || (prev.path !== clean && p.path === clean))
        kept.set(clean, { ...p, path: clean });
    }
    site.pages = [...kept.values()];
    // Links to `about.html` reach the page now at `/about`.
    for (const [clean, f] of cleanToFile) {
      const from = `/${f}`;
      if (from !== clean && site.pages.some((p) => p.path === clean))
        site.aliases.push({ from: from.replace(/\/index\.html?$/i, "") || "/", to: clean });
    }
    site.aliases = site.aliases.filter(
      (a, i, all) => a.from !== a.to && all.findIndex((b) => b.from === a.from) === i,
    );
    site.sources = [`the HTML files in ${root.label}`];
    return { site, fetcher, detection, ...(repo ? { repo } : {}), ...(domain ? { domain } : {}) };
  }

  // Structured content (a headless CMS's page files with typed sections): read the fields.
  const structured = await findStructuredPages(root, files);
  if (structured.length) {
    detection.kind = "structured";
    detection.evidence = [
      `${structured.length} content file(s) with typed sections (${structured
        .slice(0, 3)
        .map((s) => s.path)
        .join(", ")}${structured.length > 3 ? "…" : ""})`,
      ...detection.evidence,
    ];
    progress(`Reading ${structured.length} structured content file(s)`);
    const s = await crawlStructured({
      source: root,
      files,
      pages: structured,
      origin,
      baseurl,
      next: net,
      ...(pagesUrl && !opts.offline ? { live: { fetcher: live, url: pagesUrl } } : {}),
      onProgress: progress,
    });
    const host = new URL(origin).host;
    const fetcher = new SiteFetcher({
      fetch: s.fetch,
      hostDelay: (h) => (h === host ? 0 : undefined),
      robots: false,
    });
    return {
      site: s.site,
      fetcher,
      detection,
      ...(repo ? { repo } : {}),
      ...(domain ? { domain } : {}),
    };
  }

  // Hugo, Eleventy and other generators: their output isn't in the repository.
  const label =
    detection.kind === "hugo"
      ? "Hugo"
      : detection.kind === "eleventy"
        ? "Eleventy"
        : (detection.generator ?? "a site generator");
  if (!pagesUrl || opts.offline)
    throw new Error(
      `This site is built with ${label}, so its pages aren't in the repository. Import its published address instead (for example https://owner.github.io/name/).`,
    );
  progress(`Reading the published ${label} site at ${pagesUrl}`);
  const fetcher = new SiteFetcher({ fetch: net });
  const site = await crawlGeneric({
    url: pagesUrl,
    fetcher,
    platform:
      detection.kind === "hugo" ? "hugo" : detection.kind === "eleventy" ? "eleventy" : "github",
    onProgress: progress,
    ...(opts.maxPages ? { maxPages: opts.maxPages } : {}),
  });
  // Markdown sources: dates, tags and drafts for the posts that were found.
  let enriched = 0;
  const md = files.filter((f) => isMarkdownPath(f)).slice(0, 3000);
  const bySlug = new Map<string, Record<string, unknown>>();
  for (const f of md) {
    const text = await readText(root, f);
    if (!text) continue;
    const fm = parseFrontMatter(text).data;
    const name = (f.split("/").pop() ?? f).replace(/\.[^.]+$/, "");
    const slug = String(
      fm.slug ?? (name === "index" ? f.split("/").slice(-2, -1)[0] : name) ?? "",
    ).toLowerCase();
    if (slug) bySlug.set(slug, fm);
  }
  for (const c of site.collections)
    for (const item of c.items) {
      const fm = bySlug.get(item.path.split("/").filter(Boolean).pop()?.toLowerCase() ?? "");
      if (!fm) continue;
      enriched++;
      if (!item.date && fm.date) item.date = new Date(String(fm.date)).toISOString();
      const list = (v: unknown) =>
        Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [];
      if (!item.tags.length) item.tags = list(fm.tags);
      if (!item.categories.length) item.categories = list(fm.categories);
      if (fm.draft === true) item.draft = true;
    }
  site.sources = [
    ...(site.sources ?? []),
    `${label} Markdown sources in ${root.label}${enriched ? ` (${enriched} post(s) matched)` : ""}`,
  ];
  site.generator = label;
  return { site, fetcher, detection, ...(repo ? { repo } : {}), ...(domain ? { domain } : {}) };
}
