import { type HtmlPage, parseHtmlPage, stripSuffix } from "../html/extract";
import { themeFromCss } from "../html/theme";
import { socialNetwork } from "../squarespace/crawl";
import type {
  SqCollection,
  SqImage,
  SqItem,
  SqNavItem,
  SqNotice,
  SqPage,
  SqSection,
  SqSite,
  SqTheme,
} from "../types";
import { JekyllLiquid } from "./liquid";
import {
  type FrontMatter,
  firstParagraph,
  isMarkdownPath,
  markdownToHtml,
  parseFrontMatter,
  parseYamlSafe,
} from "./markdown";
import { decodeText, type RepoSource } from "./source";

export interface JekyllCrawlOptions {
  source: RepoSource;
  /** The site's origin (`https://owner.github.io` or its custom domain). */
  origin: string;
  /** Path prefix the site is published under (`/repo` for project sites), when known. */
  baseurl?: string;
  /** CSS of the live site (its compiled theme), when it could be read. */
  liveCss?: string;
  onProgress?: (message: string) => void;
  /** Stop after this many pages and posts. */
  maxPages?: number;
}

interface Doc {
  /** Repo path of the source file. */
  src: string;
  kind: "page" | "post" | "draft" | "item";
  collection?: string;
  fm: FrontMatter;
  body: string;
  markdown: boolean;
  /** HTML without front matter: Jekyll publishes it as is (no Liquid, no layout). */
  raw: boolean;
  /** Published URL as Jekyll writes it (`/about.html`, `/2024/01/02/hello.html`, `/docs/`). */
  url: string;
  /** The same address without `.html`, `index` and the trailing slash (`/about`). */
  clean: string;
  date?: Date;
  slug: string;
  categories: string[];
  tags: string[];
  /** Rendered content (after Liquid and Markdown). */
  html?: string;
}

const DEFAULT_EXCLUDE = [
  /^Gemfile(?:\.lock)?$/,
  /^node_modules\//,
  /^vendor\//,
  /^\.[^/]/,
  /^(?:README|LICENSE|LICENCE|CHANGELOG|CODE_OF_CONDUCT|CONTRIBUTING|SECURITY)(?:\.[a-z]+)?$/i,
  /^package(?:-lock)?\.json$/,
  /^(?:Rakefile|CNAME|_config\.ya?ml|.*\.gemspec)$/,
  /^script\//,
];

const PAGE_EXT = /\.(?:md|markdown|mkd|mkdn|mdown|html?)$/i;

const asArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.map((x) => String(x)).filter(Boolean)
    : typeof v === "string"
      ? v.split(/[\s,]+/).filter(Boolean)
      : [];

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined;

const slugOf = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const titleFromSlug = (s: string) =>
  s
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

/** `/about.html` → `/about`, `/docs/index.html` → `/docs`, `/` → `/`. */
export function cleanPath(url: string): string {
  let p = url.split(/[?#]/)[0] ?? "/";
  if (!p.startsWith("/")) p = `/${p}`;
  p = p
    .replace(/\/index\.html?$/i, "/")
    .replace(/\.html?$/i, "")
    .replace(/\/+$/, "");
  return p || "/";
}

function toDate(v: unknown): Date | undefined {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = str(v);
  if (!s) return undefined;
  // Jekyll accepts "2024-01-02 10:00:00 +0100".
  const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?\s*([+-]\d{2}:?\d{2}|Z)?$/.exec(
    s,
  );
  const iso = m
    ? `${m[1]}T${m[2] ? (m[2].length === 5 ? `${m[2]}:00` : m[2]).padStart(8, "0") : "00:00:00"}${m[3] ? (m[3] === "Z" ? "Z" : m[3].includes(":") ? m[3] : `${m[3].slice(0, 3)}:${m[3].slice(3)}`) : "Z"}`
    : s;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Expand a Jekyll permalink template. */
function expandPermalink(tpl: string, d: Doc, collection?: string): string {
  const date = d.date ?? new Date(0);
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const yday = Math.floor((date.getTime() - start) / 86_400_000);
  const rel = d.src.replace(/^_[^/]+\//, "").replace(PAGE_EXT, "");
  const vars: Record<string, string> = {
    year: String(date.getUTCFullYear()),
    short_year: String(date.getUTCFullYear()).slice(2),
    month: pad(date.getUTCMonth() + 1),
    i_month: String(date.getUTCMonth() + 1),
    day: pad(date.getUTCDate()),
    i_day: String(date.getUTCDate()),
    y_day: String(yday).padStart(3, "0"),
    title: d.slug,
    slug: d.slug,
    name: d.slug,
    basename: d.src.split("/").pop()?.replace(PAGE_EXT, "") ?? d.slug,
    categories: d.categories.map(slugOf).filter(Boolean).join("/"),
    category: d.categories[0] ? slugOf(d.categories[0]) : "",
    collection: collection ?? "",
    path: rel,
    output_ext: ".html",
  };
  const out = tpl.replace(/:([a-z_]+)/g, (m, k: string) => vars[k] ?? m);
  return `/${out.replace(/^\/+/, "").replace(/\/{2,}/g, "/")}`;
}

const PERMALINK_STYLES: Record<string, string> = {
  date: "/:categories/:year/:month/:day/:title:output_ext",
  pretty: "/:categories/:year/:month/:day/:title/",
  ordinal: "/:categories/:year/:y_day/:title:output_ext",
  weekdate: "/:categories/:year/W:week/:short_day/:title:output_ext",
  none: "/:categories/:title:output_ext",
};

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  xml: "application/xml",
  txt: "text/plain",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  pdf: "application/pdf",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  woff2: "font/woff2",
};

export function mimeOf(path: string): string {
  return MIME[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/**
 * A `fetch` that answers the site's own addresses from the repository (assets, images,
 * downloads) and passes everything else to `next`. `extraPages` are rendered pages by path.
 */
export function repoFetch(
  source: RepoSource,
  origin: string,
  opts: { baseurl?: string; next?: typeof fetch; resolvePage?: (path: string) => string[] } = {},
): typeof fetch {
  const host = new URL(origin).host.replace(/^www\./, "");
  const base = (opts.baseurl ?? "").replace(/\/+$/, "");
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.host.replace(/^www\./, "") !== host)
      return opts.next
        ? opts.next(input, init)
        : new Response("not found", { status: 404, statusText: "Not Found" });
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      path = url.pathname;
    }
    if (base && (path === base || path.startsWith(`${base}/`))) path = path.slice(base.length);
    const rel = path.replace(/^\/+/, "");
    const candidates = rel ? [rel] : [];
    if (opts.resolvePage) candidates.push(...opts.resolvePage(path));
    for (const c of candidates) {
      if (c.includes("..")) continue;
      const bytes = await source.read(c);
      if (bytes)
        return new Response(bytes as unknown as BodyInit, {
          status: 200,
          headers: { "content-type": mimeOf(c) },
        });
    }
    return new Response("not found", { status: 404, statusText: "Not Found" });
  }) as typeof fetch;
}

/** Well-known GitHub Pages themes (remote themes have no CSS in the repository). */
const KNOWN_THEMES: Record<string, Partial<SqTheme>> = {
  minima: {
    colors: { accent: "#2a7ae2", black: "#111111", white: "#fdfdfd" },
    fonts: { body: { family: "Helvetica Neue" }, heading: { family: "Helvetica Neue" } },
  },
  cayman: {
    colors: { accent: "#159957", darkAccent: "#155799", black: "#606c71", white: "#ffffff" },
    fonts: { body: { family: "Open Sans" }, heading: { family: "Open Sans" } },
  },
  "jekyll-theme-cayman": {
    colors: { accent: "#159957", darkAccent: "#155799", black: "#606c71", white: "#ffffff" },
    fonts: { body: { family: "Open Sans" }, heading: { family: "Open Sans" } },
  },
  slate: { colors: { accent: "#1e6bb8", black: "#f2f2f2", white: "#212121" } },
  architect: { colors: { accent: "#2879d0", black: "#666666", white: "#f2f2f2" } },
  minimal: { colors: { accent: "#267cb9", black: "#595959", white: "#ffffff" } },
  midnight: { colors: { accent: "#f8f8f8", black: "#eaeaea", white: "#151515" } },
  merlot: { colors: { accent: "#ab6d00", black: "#4c4c4c", white: "#ffffff" } },
  tactile: { colors: { accent: "#53a9e0", black: "#404040", white: "#f2f0ec" } },
  hacker: { colors: { accent: "#b5e853", black: "#eaeaea", white: "#151515" } },
  "leap-day": { colors: { accent: "#3c6eb4", black: "#666666", white: "#f9f9f9" } },
  dinky: { colors: { accent: "#1e6bb8", black: "#222222", white: "#ffffff" } },
  modernist: { colors: { accent: "#c1272d", black: "#333333", white: "#ffffff" } },
  "minimal-mistakes": { colors: { accent: "#7a8288", black: "#494e52", white: "#ffffff" } },
  "just-the-docs": { colors: { accent: "#7253ed", black: "#5c5962", white: "#ffffff" } },
  "al-folio": { colors: { accent: "#b509ac", black: "#000000", white: "#ffffff" } },
  "beautiful-jekyll": { colors: { accent: "#0085a1", black: "#404040", white: "#ffffff" } },
};

function themeName(config: FrontMatter): string | undefined {
  const t = str(config.theme) ?? str(config.remote_theme);
  if (!t) return undefined;
  return t
    .split("@")[0]
    ?.split("/")
    .pop()
    ?.replace(/^jekyll-theme-/, "")
    .toLowerCase();
}

/** Turn SCSS variables into something the CSS reader understands (colors and fonts). */
function scssToCssHints(scss: string): string {
  const vars = new Map<string, string>();
  for (const m of scss.matchAll(/^\s*\$([\w-]+)\s*:\s*([^;]+?)\s*(?:!default)?\s*;/gm))
    vars.set(m[1] as string, (m[2] as string).trim());
  const resolve = (v: string, depth = 0): string =>
    depth > 5
      ? v
      : v.replace(/\$([\w-]+)/g, (x, k: string) => resolve(vars.get(k) ?? x, depth + 1));
  const lines: string[] = [];
  for (const [k, v] of vars) lines.push(`--${k}: ${resolve(v)};`);
  const pick = (re: RegExp) => [...vars.keys()].find((k) => re.test(k));
  const brand = pick(
    /^(?:brand|primary|accent|link|theme)[-_]?colou?r$|^(?:primary|accent|brand)$/i,
  );
  const text = pick(/^(?:text|body|font)[-_]?colou?r$/i);
  const bg = pick(/^(?:background|bg|body[-_]?bg)[-_]?colou?r?$/i);
  const font = pick(/^(?:base|body)[-_]?font[-_]?family$|^font[-_]?family$/i);
  const heading = pick(/^head(?:ing|er)[-_]?font[-_]?family$/i);
  const rules: string[] = [`:root{${lines.join("")}}`];
  const body: string[] = [];
  if (text) body.push(`color: ${resolve(vars.get(text) as string)};`);
  if (bg) body.push(`background-color: ${resolve(vars.get(bg) as string)};`);
  if (font) body.push(`font-family: ${resolve(vars.get(font) as string)};`);
  if (body.length) rules.push(`body{${body.join("")}}`);
  if (brand) rules.push(`a{color: ${resolve(vars.get(brand) as string)};}`);
  if (heading) rules.push(`h1,h2,h3{font-family: ${resolve(vars.get(heading) as string)};}`);
  // Plain CSS inside the SCSS (rules without nesting) is kept as is.
  rules.push(scss.replace(/^\s*@import[^;]*;/gm, "").replace(/^\s*\$[^;]*;/gm, ""));
  return rules.join("\n");
}

interface NavEntry {
  label: string;
  href: string;
  children?: NavEntry[];
}

function navFromData(v: unknown): NavEntry[] {
  const list = Array.isArray(v)
    ? v
    : v && typeof v === "object"
      ? (((v as Record<string, unknown>).main ??
          (v as Record<string, unknown>).header ??
          (v as Record<string, unknown>).navigation ??
          (v as Record<string, unknown>).nav ??
          (v as Record<string, unknown>).menu) as unknown[] | undefined)
      : undefined;
  if (!Array.isArray(list)) return [];
  const out: NavEntry[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const label = str(r.title) ?? str(r.name) ?? str(r.text) ?? str(r.label);
    const href = str(r.url) ?? str(r.link) ?? str(r.href) ?? str(r.path);
    const kids = r.children ?? r.sublinks ?? r.dropdown ?? r.items ?? r.subnav;
    const children = Array.isArray(kids) ? navFromData(kids) : [];
    if (!label) continue;
    out.push({
      label,
      href: href ?? children[0]?.href ?? "/",
      ...(children.length ? { children } : {}),
    });
  }
  return out;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function crawlJekyll(opts: JekyllCrawlOptions): Promise<{
  site: SqSite;
  /** Serves the repository's files at the site's addresses (media downloads). */
  fetch: typeof fetch;
  docs: number;
}> {
  const progress = opts.onProgress ?? (() => undefined);
  const notices: SqNotice[] = [];
  const src = opts.source;
  const files = await src.list();
  const fileSet = new Set(files);
  const readText = async (p: string) => {
    const b = await src.read(p);
    return b ? decodeText(b) : undefined;
  };

  // --- configuration ------------------------------------------------------------------------
  progress("Reading _config.yml");
  const configText = (await readText("_config.yml")) ?? (await readText("_config.yaml")) ?? "";
  const config = (parseYamlSafe(configText) as FrontMatter | undefined) ?? {};
  const origin = new URL(opts.origin).origin;
  const baseurl = (str(config.baseurl) ?? opts.baseurl ?? "")
    .replace(/\/+$/, "")
    .replace(/^(?=[^/])/, "/");
  const userExclude = asArray(config.exclude);
  const userInclude = new Set(asArray(config.include));
  const excluded = (p: string) =>
    !userInclude.has(p) &&
    (DEFAULT_EXCLUDE.some((re) => re.test(p)) ||
      userExclude.some((x) => p === x || p.startsWith(`${x.replace(/\/+$/, "")}/`)));

  // Collections (`collections: [projects]` or `collections: { projects: { output: true } }`).
  const collectionCfg = new Map<string, { output: boolean; permalink?: string }>();
  if (Array.isArray(config.collections))
    for (const c of config.collections) collectionCfg.set(String(c), { output: false });
  else if (config.collections && typeof config.collections === "object")
    for (const [name, v] of Object.entries(config.collections as Record<string, unknown>)) {
      const o = (v ?? {}) as Record<string, unknown>;
      collectionCfg.set(name, {
        output: o.output === true,
        ...(str(o.permalink) ? { permalink: str(o.permalink) as string } : {}),
      });
    }
  const collectionsDir = (str(config.collections_dir) ?? "").replace(/^\/+|\/+$/g, "");
  const inCollectionsDir = (p: string) =>
    collectionsDir ? p.startsWith(`${collectionsDir}/`) : true;
  const underDir = (p: string) =>
    collectionsDir && p.startsWith(`${collectionsDir}/`) ? p.slice(collectionsDir.length + 1) : p;

  // Front matter defaults (`defaults: [{ scope: { path, type }, values }]`).
  const defaults: { path: string; type?: string; values: FrontMatter }[] = [];
  if (Array.isArray(config.defaults))
    for (const d of config.defaults as Record<string, unknown>[]) {
      const scope = (d?.scope ?? {}) as Record<string, unknown>;
      const values = (d?.values ?? {}) as FrontMatter;
      defaults.push({
        path: (str(scope.path) ?? "").replace(/^\/+/, ""),
        ...(str(scope.type) ? { type: str(scope.type) as string } : {}),
        values,
      });
    }
  const withDefaults = (path: string, type: string, fm: FrontMatter): FrontMatter => {
    let out: FrontMatter = {};
    for (const d of defaults)
      if ((!d.path || path.startsWith(d.path)) && (!d.type || d.type === type))
        out = { ...out, ...d.values };
    return { ...out, ...fm };
  };

  // --- data, layouts, includes ----------------------------------------------------------------
  const data: Record<string, unknown> = {};
  for (const p of files.filter((f) => /^_data\/.+\.(?:ya?ml|json)$/i.test(f))) {
    const text = await readText(p);
    if (!text) continue;
    let v: unknown;
    try {
      v = p.endsWith(".json") ? JSON.parse(text) : parseYamlSafe(text);
    } catch {
      v = undefined;
    }
    if (v === undefined) continue;
    const keys = p
      .replace(/^_data\//, "")
      .replace(/\.[^.]+$/, "")
      .split("/");
    let at = data;
    for (const k of keys.slice(0, -1)) {
      at[k] ??= {};
      at = at[k] as Record<string, unknown>;
    }
    at[keys[keys.length - 1] as string] = v;
  }
  const layouts = new Map<string, { fm: FrontMatter; body: string }>();
  for (const p of files.filter((f) => /^_layouts\/.+\.html?$/i.test(f))) {
    const text = await readText(p);
    if (text === undefined) continue;
    const parsed = parseFrontMatter(text);
    layouts.set(p.replace(/^_layouts\//, "").replace(/\.html?$/i, ""), {
      fm: parsed.data,
      body: parsed.body,
    });
  }
  const includes: Record<string, string> = {};
  for (const p of files.filter((f) => f.startsWith("_includes/")))
    if (/\.(?:html?|md|markdown|liquid|svg|txt)$/i.test(p)) {
      const text = await readText(p);
      if (text !== undefined) includes[p.slice("_includes/".length)] = text;
    }
  const theme = themeName(config);
  const hasLocalLayouts = layouts.size > 0;
  if (theme && !hasLocalLayouts)
    notices.push({
      kind: "theme",
      where: "_config.yml",
      message: `The site uses the "${theme}" theme from outside the repository; its look was approximated${opts.liveCss ? " from the published site's CSS" : ""}.`,
    });

  // --- documents --------------------------------------------------------------------------------
  const docs: Doc[] = [];
  const postStyle = str(config.permalink) ?? "date";
  const postTemplate = PERMALINK_STYLES[postStyle] ?? postStyle;
  const prettyPages = postStyle === "pretty" || /\/$/.test(postTemplate);
  const hasIndex = files.some((f) => /^index\.(?:md|markdown|html?)$/i.test(f));
  const limit = opts.maxPages ?? 2000;

  for (const p of files) {
    if (docs.length >= limit) break;
    if (!PAGE_EXT.test(p)) continue;
    const rel = underDir(p);
    const segs = rel.split("/");
    const postIdx = segs.indexOf("_posts");
    const draft = segs[0] === "_drafts";
    const collName = segs[0]?.startsWith("_") ? segs[0].slice(1) : undefined;
    const isCollection =
      collName !== undefined && collectionCfg.has(collName) && inCollectionsDir(p);
    let kind: Doc["kind"];
    if (postIdx >= 0 && inCollectionsDir(p)) kind = "post";
    else if (draft) kind = "draft";
    else if (isCollection) kind = "item";
    else {
      if (segs.some((s) => s.startsWith("_") || s.startsWith("."))) continue;
      if (excluded(p)) {
        // GitHub Pages uses README.md as the home page when there is no index.
        if (!(/^README\.(?:md|markdown)$/i.test(p) && !hasIndex)) continue;
      }
      kind = "page";
    }
    if (kind === "item" && !collectionCfg.get(collName as string)?.output) continue;
    const text = await readText(p);
    if (text === undefined) continue;
    const parsed = parseFrontMatter(text);
    const markdown = isMarkdownPath(p);
    // Jekyll only renders files with front matter; GitHub Pages also renders Markdown without
    // it (jekyll-optional-front-matter). HTML without front matter is published as is.
    const type = kind === "page" ? "pages" : kind === "item" ? (collName as string) : "posts";
    const fm = withDefaults(p, type, parsed.data);
    if (fm.published === false && kind !== "post") continue;
    const name = p.split("/").pop() as string;
    const dated = /^(\d{4}-\d{1,2}-\d{1,2})-(.+?)\.[^.]+$/.exec(name);
    const slug =
      slugOf(str(fm.slug) ?? (dated ? (dated[2] as string) : name.replace(PAGE_EXT, ""))) || "page";
    const date = toDate(fm.date) ?? (dated ? toDate(dated[1]) : undefined);
    const pathCats = postIdx > 0 ? segs.slice(0, postIdx) : [];
    const categories = [...new Set([...pathCats, ...asArray(fm.categories ?? fm.category)])];
    const tags = asArray(fm.tags ?? fm.tag);
    const doc: Doc = {
      src: p,
      kind,
      ...(kind === "item" ? { collection: collName as string } : {}),
      fm,
      body: parsed.body,
      markdown,
      raw: !parsed.hasFrontMatter && !markdown,
      url: "/",
      clean: "/",
      ...(date ? { date } : {}),
      slug,
      categories,
      tags,
    };
    const permalink = str(fm.permalink);
    if (kind === "page") {
      if (permalink) doc.url = expandPermalink(permalink, doc);
      else {
        const noExt = rel.replace(PAGE_EXT, "");
        const isIndex = /(?:^|\/)index$/i.test(noExt) || /^README$/i.test(noExt);
        doc.url = isIndex
          ? `/${noExt.replace(/(?:^|\/)(?:index|README)$/i, "")}/`.replace(/\/{2,}/g, "/")
          : prettyPages
            ? `/${noExt}/`
            : `/${noExt}.html`;
      }
    } else if (kind === "item") {
      const cfg = collectionCfg.get(collName as string);
      doc.url = expandPermalink(
        permalink ?? cfg?.permalink ?? "/:collection/:path:output_ext",
        doc,
        collName,
      );
    } else if (kind === "draft") doc.url = `/drafts/${slug}/`;
    else doc.url = expandPermalink(permalink ?? postTemplate, doc);
    doc.clean = cleanPath(doc.url);
    docs.push(doc);
  }
  if (docs.length >= limit)
    notices.push({
      kind: "other",
      where: "site",
      message: `Stopped after ${limit} pages and posts; raise --max-pages to import the rest.`,
    });

  // Pages that only redirect elsewhere (`redirect_to`) aren't content.
  for (const d of docs.filter((x) => str(x.fm.redirect_to))) {
    notices.push({
      kind: "link",
      where: d.clean,
      message: `This address redirected to ${str(d.fm.redirect_to)}; it wasn't imported as a page. Add the redirect in Settings if you still need it.`,
    });
  }
  const content = docs.filter((d) => !str(d.fm.redirect_to) && !/^\/404$/.test(d.clean));

  // Address maps for links.
  const linkTargets = new Map<string, string>();
  const postTargets = new Map<string, string>();
  const rawToClean = new Map<string, string>();
  for (const d of content) {
    linkTargets.set(d.src, d.url);
    if (d.kind === "post" || d.kind === "draft")
      postTargets.set((d.src.split("/").pop() as string).replace(PAGE_EXT, ""), d.url);
    rawToClean.set(d.url, d.clean);
    rawToClean.set(cleanPath(d.url), d.clean);
  }

  // --- Liquid scope ---------------------------------------------------------------------------
  const siteUrl = `${origin}`;
  const liquid = new JekyllLiquid({ baseurl, url: siteUrl, linkTargets, postTargets, includes });
  const pageVar = (d: Doc): Record<string, unknown> => ({
    ...d.fm,
    url: d.url,
    path: d.src,
    name: d.src.split("/").pop(),
    slug: d.slug,
    title: str(d.fm.title) ?? (d.kind === "page" ? undefined : titleFromSlug(d.slug)),
    ...(d.date ? { date: d.date } : {}),
    categories: d.categories,
    tags: d.tags,
    id: d.url,
    collection: d.kind === "post" ? "posts" : d.collection,
    content: d.html ?? "",
    excerpt: str(d.fm.excerpt) ?? (d.html ? `<p>${firstParagraph(d.html) ?? ""}</p>` : ""),
  });
  const posts = content
    .filter((d) => d.kind === "post" && d.fm.published !== false)
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  const siteVar = (): Record<string, unknown> => {
    const byKey = (key: "categories" | "tags") => {
      const out: Record<string, unknown[]> = {};
      for (const p of posts)
        for (const k of p[key]) {
          out[k] ??= [];
          out[k].push(pageVar(p));
        }
      return out;
    };
    const collectionDocs: Record<string, unknown[]> = {};
    for (const d of content.filter((x) => x.kind === "item")) {
      const key = d.collection as string;
      collectionDocs[key] ??= [];
      collectionDocs[key].push(pageVar(d));
    }
    return {
      ...config,
      ...collectionDocs,
      title: str(config.title) ?? str(config.name) ?? "",
      baseurl,
      url: siteUrl,
      time: new Date(),
      data,
      pages: content.filter((d) => d.kind === "page").map(pageVar),
      posts: posts.map(pageVar),
      related_posts: posts.slice(0, 3).map(pageVar),
      categories: byKey("categories"),
      tags: byKey("tags"),
      collections: [...collectionCfg.keys()].map((label) => ({
        label,
        docs: collectionDocs[label] ?? [],
      })),
      static_files: [],
      html_pages: content.filter((d) => d.kind === "page").map(pageVar),
    };
  };

  const render = async (d: Doc, site: Record<string, unknown>) => {
    const page = pageVar(d);
    let html = d.body;
    if (!d.raw && /\{[{%]/.test(html) && d.fm.render_with_liquid !== false)
      html = await liquid.render(html, {
        site,
        page,
        paginator: { posts: site.posts, page: 1, total_pages: 1 },
        layout: {},
      });
    if (d.markdown) html = markdownToHtml(html);
    d.html = html;
    return html;
  };

  // Posts and items first (pages list them), then pages.
  progress(`Rendering ${content.length} pages and posts`);
  let site0 = siteVar();
  for (const d of content.filter((x) => x.kind !== "page")) await render(d, site0);
  site0 = siteVar();
  for (const d of content.filter((x) => x.kind === "page")) await render(d, site0);
  const siteFinal = siteVar();

  /** The full page through its layout chain, or undefined when the layout isn't in the repo. */
  const withLayout = async (d: Doc): Promise<string | undefined> => {
    if (d.raw) return undefined;
    let name =
      str(d.fm.layout) ?? (d.kind === "post" ? "post" : d.kind === "page" ? "page" : undefined);
    if (!name || name === "none" || name === "null") return undefined;
    let html = d.html ?? "";
    let used = false;
    for (let i = 0; i < 8 && name; i++) {
      const layout =
        layouts.get(name) ??
        (name === "page" || name === "post" ? layouts.get("default") : undefined);
      if (!layout) break;
      used = true;
      html = await liquid.render(layout.body, {
        site: siteFinal,
        page: pageVar(d),
        content: html,
        layout: layout.fm,
        paginator: { posts: siteFinal.posts, page: 1, total_pages: 1 },
      });
      const next = str(layout.fm.layout);
      name = next && next !== name ? next : undefined;
    }
    return used ? html : undefined;
  };

  // --- links and image addresses in rendered HTML ---------------------------------------------
  const originHosts = new Set<string>([new URL(origin).host.replace(/^www\./, "")]);
  const cfgUrl = str(config.url);
  if (cfgUrl)
    try {
      originHosts.add(new URL(cfgUrl).host.replace(/^www\./, ""));
    } catch {
      // not a URL
    }
  const dirOf = (d: Doc | undefined, source = false) => {
    if (!d) return "/";
    const parts = (source ? `/${d.src}` : d.url).split("/");
    parts.pop();
    return `${parts.join("/")}/`;
  };
  const srcToUrl = new Map<string, string>();
  for (const d of content) srcToUrl.set(d.src, d.url);
  /** Normalize one address from the rendered page to a site path (or leave it alone). */
  const fixUrl = (raw: string, d: Doc | undefined): string => {
    const v = raw.trim();
    if (!v || v.startsWith("#") || /^(?:mailto|tel|javascript|data):/i.test(v)) return raw;
    let path: string;
    let suffix = "";
    if (/^(?:https?:)?\/\//i.test(v)) {
      let u: URL;
      try {
        u = new URL(v.startsWith("//") ? `https:${v}` : v);
      } catch {
        return raw;
      }
      if (!originHosts.has(u.host.replace(/^www\./, ""))) return raw;
      path = u.pathname;
      suffix = `${u.search}${u.hash}`;
    } else {
      const [p, ...rest] = v.split(/(?=[?#])/);
      suffix = rest.join("");
      if ((p ?? "").startsWith("/")) path = p as string;
      else {
        // Relative to the page (GitHub Pages' relative links: `other.md` → its page).
        const toSource = isMarkdownPath(p ?? "");
        const resolved = new URL(p ?? "", `https://x${dirOf(d, toSource)}`).pathname;
        const asSrc = resolved.replace(/^\//, "");
        path = srcToUrl.get(asSrc) ?? srcToUrl.get(decodeURIComponent(asSrc)) ?? resolved;
      }
    }
    if (baseurl && (path === baseurl || path.startsWith(`${baseurl}/`)))
      path = path.slice(baseurl.length) || "/";
    // Links to Markdown sources (`about.md`) go to their pages.
    const bySrc = srcToUrl.get(path.replace(/^\//, ""));
    if (bySrc) path = bySrc;
    const clean = rawToClean.get(path) ?? rawToClean.get(cleanPath(path));
    if (clean) path = clean;
    return `${path}${suffix}`;
  };
  const fixHtml = (html: string, d: Doc | undefined) =>
    html
      .replace(
        /(\s(?:href|src|poster|data-src|data-original)\s*=\s*)(["'])([^"']*)\2/gi,
        (_m, a: string, q: string, v: string) => `${a}${q}${fixUrl(v, d)}${q}`,
      )
      .replace(/(\ssrcset\s*=\s*)(["'])([^"']*)\2/gi, (_m, a: string, q: string, v: string) => {
        const parts = v.split(",").map((part) => {
          const [u, ...desc] = part.trim().split(/\s+/);
          return [fixUrl(u ?? "", d), ...desc].join(" ");
        });
        return `${a}${q}${parts.join(", ")}${q}`;
      })
      .replace(
        /(url\(\s*)(["']?)([^"')]+)\2(\s*\))/gi,
        (_m, a: string, q: string, v: string, z: string) => `${a}${q}${fixUrl(v, d)}${q}${z}`,
      );

  const siteTitle =
    str(config.title) ?? str(config.name) ?? str((config.author as FrontMatter | undefined)?.name);
  const docTitle = (d: Doc) =>
    str(d.fm.title) ?? (d.kind === "page" && d.clean === "/" ? siteTitle : undefined);
  const wrap = (d: Doc, body: string) =>
    `<!doctype html><html lang="${escapeHtml(str(config.lang) ?? str(config.locale)?.replace("_", "-") ?? "en")}"><head><title>${escapeHtml(docTitle(d) ?? siteTitle ?? "")}</title>${
      str(d.fm.description)
        ? `<meta name="description" content="${escapeHtml(str(d.fm.description) as string)}">`
        : ""
    }</head><body><main>${body}</main></body></html>`;

  /** Parse a page the way the generic importer would: full layout first, the bare content if the layout hides it. */
  const parseDoc = async (
    d: Doc,
    dropTitle: boolean,
  ): Promise<{ page: HtmlPage; full?: HtmlPage }> => {
    const url = `${origin}${d.clean === "/" ? "/" : d.clean}`;
    const bare = parseHtmlPage(fixHtml(d.raw ? (d.html ?? "") : wrap(d, d.html ?? ""), d), url, {
      dropTitle,
    });
    const layoutHtml = d.kind === "page" ? await withLayout(d) : undefined;
    if (!layoutHtml) return { page: bare };
    const full = parseHtmlPage(fixHtml(layoutHtml, d), url, { dropTitle });
    // The layout's own content (hero from front matter, lists) counts — unless the extractor
    // lost the page's text in it.
    return { page: full.textLength >= bare.textLength * 0.6 ? full : bare, full };
  };

  // --- the blog -----------------------------------------------------------------------------------
  const listsPosts = (d: Doc) =>
    /\b(?:paginator\.posts|site\.posts)\b/.test(d.body) ||
    /\b(?:paginator\.posts|site\.posts)\b/.test(layouts.get(str(d.fm.layout) ?? "")?.body ?? "") ||
    (str(d.fm.layout) === "home" && !layouts.has("home") && posts.length > 0);
  const pages = content.filter((d) => d.kind === "page");
  const home = pages.find((d) => d.clean === "/");
  const listing = pages.find(
    (d) =>
      d.clean !== "/" &&
      listsPosts(d) &&
      /blog|posts|news|journal|writing|archive|articles|notes/i.test(d.clean),
  );
  const blogPath = listing?.clean ?? "/blog";
  const homeListsPosts = !!home && listsPosts(home) && posts.length > 0;

  const imageOf = (v: unknown, d: Doc | undefined): SqImage | undefined => {
    const raw =
      str(v) ??
      (v && typeof v === "object"
        ? (str((v as FrontMatter).path) ??
          str((v as FrontMatter).feature) ??
          str((v as FrontMatter).image) ??
          str((v as FrontMatter).url))
        : undefined);
    if (!raw) return undefined;
    const fixed = fixUrl(raw, d);
    try {
      return { url: new URL(fixed, `${origin}/`).toString(), alt: str(d?.fm.title) ?? "" };
    } catch {
      return undefined;
    }
  };

  const items = async (list: Doc[]): Promise<SqItem[]> => {
    const out: SqItem[] = [];
    for (const d of list) {
      progress(d.clean);
      const title = str(d.fm.title) ?? titleFromSlug(d.slug);
      const firstH1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i
        .exec(d.html ?? "")?.[1]
        ?.replace(/<[^>]+>/g, "")
        .trim();
      const { page } = await parseDoc(
        d,
        !!firstH1 && firstH1.toLowerCase() === title.toLowerCase(),
      );
      const author = d.fm.author;
      const authorName =
        str(author) ??
        str((author as FrontMatter | undefined)?.name) ??
        str((config.author as FrontMatter | undefined)?.name) ??
        str(config.author);
      const excerpt =
        str(d.fm.excerpt) ?? str(d.fm.description) ?? (d.html ? firstParagraph(d.html) : undefined);
      const image = imageOf(
        d.fm.image ??
          (d.fm.header as FrontMatter | undefined)?.image ??
          (d.fm.header as FrontMatter | undefined)?.teaser ??
          d.fm.thumbnail ??
          d.fm.cover ??
          d.fm.feature_image,
        d,
      );
      out.push({
        path: d.clean,
        title,
        ...(d.date ? { date: d.date.toISOString() } : {}),
        ...(authorName ? { author: authorName } : {}),
        tags: d.tags,
        categories: d.categories,
        ...(excerpt ? { excerptHtml: `<p>${escapeHtml(excerpt.slice(0, 600))}</p>` } : {}),
        sections: page.sections.map((s) => ({ ...s, role: undefined })),
        ...(image ? { image } : {}),
        seo: {
          ...(str(d.fm.title) ? { title: str(d.fm.title) as string } : {}),
          ...(str(d.fm.description) ? { description: str(d.fm.description) as string } : {}),
          ...(d.fm.sitemap === false || d.fm.noindex === true ? { noindex: true } : {}),
        },
        ...(d.kind === "draft" || d.fm.published === false ? { draft: true } : {}),
        source: "repo",
      });
    }
    return out;
  };

  const collections: SqCollection[] = [];
  const postDocs = content.filter((d) => d.kind === "post" || d.kind === "draft");
  if (postDocs.length) {
    collections.push({
      path: blogPath,
      title: listing ? (str(listing.fm.title) ?? "Blog") : "Blog",
      kind: "blog",
      seo: listing
        ? {
            ...(str(listing.fm.description)
              ? { description: str(listing.fm.description) as string }
              : {}),
          }
        : {},
      items: await items(postDocs),
      ...(listing && str(listing.fm.description)
        ? { description: str(listing.fm.description) as string }
        : {}),
    });
    notices.push({
      kind: "collection",
      where: blogPath,
      message: `${posts.length} post(s) from _posts${postDocs.length > posts.length ? ` and ${postDocs.length - posts.length} draft(s)` : ""} became the "${collections[0]?.title}" collection, with their dates, tags and categories.`,
    });
  }
  for (const [name, cfg] of collectionCfg) {
    if (!cfg.output) continue;
    const list = content.filter((d) => d.kind === "item" && d.collection === name);
    if (!list.length) continue;
    const dated = list.every((d) => d.date);
    collections.push({
      path: `/${slugOf(name) || name}`,
      title: titleFromSlug(name),
      kind: dated ? "blog" : "portfolio",
      seo: {},
      items: await items(list),
    });
    notices.push({
      kind: "collection",
      where: `/${name}`,
      message: `The "${name}" collection (${list.length} item(s)) became a ${dated ? "blog" : "portfolio"} collection.`,
    });
  }

  // --- pages ---------------------------------------------------------------------------------------
  const sqPages: SqPage[] = [];
  const aliases: { from: string; to: string }[] = [];
  let homeParsed: { page: HtmlPage; full?: HtmlPage } | undefined;
  for (const d of pages) {
    if (listing && d === listing) continue;
    progress(d.clean);
    const parsed = await parseDoc(d, false);
    if (d === home) homeParsed = parsed;
    let p = parsed.page;
    if (d === home && homeListsPosts) {
      // The posts list becomes OpenSpace's own listing of the blog: keep only the page's own
      // words (rendered without posts), so nothing shows twice.
      const withPosts = d.html;
      await render(d, { ...siteFinal, posts: [], related_posts: [], categories: {}, tags: {} });
      const own = parseHtmlPage(fixHtml(wrap(d, d.html ?? ""), d), `${origin}/`, {});
      d.html = withPosts;
      p = { ...own, sections: own.textLength >= 40 ? own.sections : [] };
    }
    const fmTitle = str(d.fm.title);
    const title =
      d.clean === "/"
        ? "Home"
        : (fmTitle ??
          (p.title ? stripSuffix(p.title, siteTitle) : undefined) ??
          titleFromSlug(d.clean.split("/").pop() ?? "Page"));
    sqPages.push({
      path: d.clean,
      title,
      ...((str(d.fm.nav_title) ?? str(d.fm.menu_title))
        ? { navTitle: (str(d.fm.nav_title) ?? str(d.fm.menu_title)) as string }
        : {}),
      seo: {
        ...(fmTitle ? { title: fmTitle } : {}),
        ...(str(d.fm.description)
          ? { description: str(d.fm.description) as string }
          : p.seo.description
            ? { description: p.seo.description }
            : {}),
        ...(d.fm.sitemap === false || d.fm.noindex === true ? { noindex: true } : {}),
      },
      sections: p.sections,
      ...(d === home && homeListsPosts ? { homeOf: blogPath } : {}),
    });
    if (d.url !== d.clean && cleanPath(d.url) === d.clean && d.url !== `${d.clean}/`)
      aliases.push({ from: d.url.replace(/\/+$/, ""), to: d.clean });
  }
  if (!sqPages.some((p) => p.path === "/")) {
    // No home page in the source (a blog-only site): the blog is the home page.
    sqPages.unshift({
      path: "/",
      title: "Home",
      seo: {},
      sections: [],
      ...(collections[0] ? { homeOf: collections[0].path } : {}),
    });
  }

  // --- redirects -----------------------------------------------------------------------------------
  const redirects: { from: string; to: string }[] = [];
  for (const d of content) {
    for (const from of asArray(d.fm.redirect_from)) {
      const f = from.startsWith("/") ? from : `/${from}`;
      redirects.push({ from: f.replace(/\/+$/, "") || "/", to: d.clean });
    }
    if ((d.kind === "post" || d.kind === "item") && d.url !== d.clean) {
      const raw = d.url.replace(/\/+$/, "");
      if (raw !== d.clean) redirects.push({ from: raw, to: d.clean });
    }
  }

  // --- navigation ------------------------------------------------------------------------------------
  const pageByClean = new Map(sqPages.map((p) => [p.path, p]));
  const toNavHref = (href: string) => {
    if (/^(?:https?:)?\/\//i.test(href) || /^(?:mailto|tel):/i.test(href)) {
      const fixed = fixUrl(href, home ?? pages[0]);
      return fixed.startsWith("/") ? `${origin}${fixed}` : fixed;
    }
    const fixed = fixUrl(href.startsWith("/") ? href : `/${href}`, home ?? pages[0]);
    return `${origin}${fixed}`;
  };
  let nav: SqNavItem[] = [];
  const dataNav = navFromData(data.navigation ?? data.nav ?? data.menu ?? data.menus ?? data.main);
  if (dataNav.length) {
    nav = dataNav.map((n) =>
      n.children?.length
        ? {
            type: "folder" as const,
            label: n.label,
            items: n.children.map((c) => ({ label: c.label, href: toNavHref(c.href) })),
          }
        : { type: "link" as const, label: n.label, href: toNavHref(n.href) },
    );
  } else if (Array.isArray(config.header_pages)) {
    for (const f of asArray(config.header_pages)) {
      const d = pages.find((x) => x.src === f.replace(/^\//, ""));
      if (!d) continue;
      nav.push({
        type: "link",
        label: str(d.fm.title) ?? titleFromSlug(d.slug),
        href: `${origin}${d.clean}`,
      });
    }
  } else if (homeParsed?.full?.header.nav.length) {
    nav = homeParsed.full.header.nav;
  } else {
    // Jekyll themes list every page with a title (minima's default).
    for (const d of pages) {
      if (
        d.clean === "/" ||
        !str(d.fm.title) ||
        d.fm.nav_exclude === true ||
        d.fm.sitemap === false
      )
        continue;
      if (d.clean.split("/").length > 2) continue;
      nav.push({
        type: "link",
        label: str(d.fm.nav_title) ?? (str(d.fm.title) as string),
        href: `${origin}${d.clean}`,
      });
    }
    if (listing && !nav.some((n) => n.type === "link" && n.href === `${origin}${listing.clean}`))
      nav.push({
        type: "link",
        label: str(listing.fm.title) ?? "Blog",
        href: `${origin}${listing.clean}`,
      });
    nav = nav.slice(0, 8);
  }
  for (const n of nav)
    if (n.type === "link") {
      const p = pageByClean.get(cleanPath(new URL(n.href, origin).pathname));
      if (p && !p.navTitle && p.title !== n.label) p.navTitle = n.label;
    }

  // --- social, footer, logo --------------------------------------------------------------------------
  const social: SqSite["social"] = [];
  const addSocial = (url: string | undefined) => {
    if (!url) return;
    const network = socialNetwork(url);
    if (network && !social.some((s) => s.network === network)) social.push({ network, url });
  };
  const handles: Record<string, (h: string) => string> = {
    github_username: (h) => `https://github.com/${h}`,
    twitter_username: (h) => `https://x.com/${h}`,
    linkedin_username: (h) => `https://www.linkedin.com/in/${h}`,
    instagram_username: (h) => `https://www.instagram.com/${h}`,
    facebook_username: (h) => `https://www.facebook.com/${h}`,
    youtube_username: (h) => `https://www.youtube.com/${h}`,
    mastodon_username: (h) => h,
  };
  const minima = (config.minima ?? {}) as FrontMatter;
  const socialCfg = (config.social ?? minima.social_links ?? config.social_links ?? {}) as unknown;
  for (const [k, fn] of Object.entries(handles)) {
    const h = str(config[k]) ?? str((socialCfg as FrontMatter)?.[k.replace("_username", "")]);
    if (h) addSocial(/^https?:/.test(h) ? h : fn(h));
  }
  if (Array.isArray(socialCfg))
    for (const s of socialCfg as unknown[])
      addSocial(
        typeof s === "string" ? s : (str((s as FrontMatter).url) ?? str((s as FrontMatter).link)),
      );
  else if (socialCfg && typeof socialCfg === "object")
    for (const v of Object.values(socialCfg as FrontMatter)) {
      const s = str(v);
      if (s && /^https?:/.test(s)) addSocial(s);
      else if (Array.isArray(v)) for (const x of v) addSocial(str(x));
    }
  const authorCfg = (config.author ?? {}) as FrontMatter;
  for (const [k, fn] of Object.entries(handles)) {
    const h = str(authorCfg[k.replace("_username", "")]);
    if (h) addSocial(/^https?:/.test(h) ? h : fn(h));
  }
  if (homeParsed?.full) for (const u of homeParsed.full.social) addSocial(u);
  const email = str(config.email) ?? str(authorCfg.email);

  let footer: SqSection[] = homeParsed?.full?.footer ?? [];
  if (!footer.length) {
    const lines = [
      siteTitle ? `<p><strong>${escapeHtml(siteTitle)}</strong></p>` : "",
      str(config.description) ? `<p>${escapeHtml(str(config.description) as string)}</p>` : "",
      email ? `<p><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>` : "",
    ].filter(Boolean);
    if (lines.length)
      footer = [
        {
          theme: "",
          layout: {
            mode: "classic",
            rows: [{ columns: [{ span: 12, blocks: [{ kind: "text", html: lines.join("") }] }] }],
          },
        },
      ];
  }
  const logoRaw = str(config.logo) ?? str(config.avatar) ?? str(authorCfg.avatar);
  const logo = logoRaw ? imageOf(logoRaw, home ?? pages[0]) : homeParsed?.full?.header.logo;
  const favicon = [
    "favicon.ico",
    "favicon.png",
    "favicon.svg",
    "assets/favicon.ico",
    "assets/images/favicon.ico",
  ].find((f) => fileSet.has(f));

  // --- theme ------------------------------------------------------------------------------------------
  let css = opts.liveCss ?? "";
  if (!css) {
    for (const f of files) {
      if (css.length > 1_500_000) break;
      if (/(?:^|\/)(?:vendor|node_modules|bootstrap|font-?awesome)[^/]*\//i.test(f)) continue;
      if (/\.css$/i.test(f) && !/\.min\.css$/i.test(f)) css += `\n${(await readText(f)) ?? ""}`;
      else if (
        /\.s[ac]ss$/i.test(f) &&
        (/^_sass\//.test(f) || /^assets\/(?:css|styles?)\//.test(f) || /^css\//.test(f))
      )
        css += `\n${scssToCssHints(parseFrontMatter((await readText(f)) ?? "").body)}`;
    }
    if (homeParsed?.full) css += `\n${homeParsed.full.inlineCss}`;
  }
  let siteTheme = themeFromCss(css);
  const known = theme ? KNOWN_THEMES[theme] : undefined;
  if (known && !opts.liveCss) {
    siteTheme = {
      ...siteTheme,
      colors: { ...known.colors, ...siteTheme.colors },
      fonts: { ...known.fonts, ...siteTheme.fonts },
    };
  }

  // --- what isn't moved -------------------------------------------------------------------------------
  const plugins = [...asArray(config.plugins), ...asArray(config.gems)];
  const harmless =
    /^(?:jekyll-(?:feed|seo-tag|sitemap|redirect-from|relative-links|optional-front-matter|readme-index|titles-from-headings|default-layout|github-metadata|paginate|paginate-v2|remote-theme|include-cache|mentions|avatar|coffeescript|gist|commonmark-ghpages)|jemoji|github-pages|kramdown.*)$/;
  const others = plugins.filter((p) => !harmless.test(p));
  if (others.length)
    notices.push({
      kind: "custom-code",
      where: "_config.yml",
      message: `Jekyll plugins ${others.map((p) => `\`${p}\``).join(", ")} add features at build time; what they produced on your pages was imported, but their behaviour (search, galleries, generated pages) needs an OpenSpace block or a check.`,
    });
  const analytics =
    str(config.google_analytics) ?? str((config.analytics as FrontMatter | undefined)?.provider);
  if (analytics)
    notices.push({
      kind: "custom-code",
      where: "_config.yml",
      message:
        "Analytics was set up in _config.yml; it wasn't copied. OpenSpace has its own privacy-friendly analytics (Settings → Analytics), or add your tracking code in Settings → Advanced.",
    });
  const comments = ["disqus", "comments", "giscus", "utterances", "staticman"].filter(
    (k) => config[k] !== undefined,
  );
  if (comments.length)
    notices.push({
      kind: "other",
      where: "_config.yml",
      message: `Comments (${comments.join(", ")}) weren't moved; their threads stay with the comment service.`,
    });
  const scripts = files.filter(
    (f) =>
      /\.js$/i.test(f) && !/(?:^|\/)(?:vendor|node_modules)\//.test(f) && !/\.min\.js$/i.test(f),
  );

  const title =
    siteTitle ??
    homeParsed?.page.siteName ??
    homeParsed?.page.header.siteTitle ??
    new URL(origin).host;
  const site: SqSite = {
    baseUrl: origin,
    title: title.trim(),
    ...((str(config.description) ?? str(config.tagline))
      ? { description: (str(config.description) ?? str(config.tagline)) as string }
      : {}),
    ...(logo ? { logo: { ...logo, alt: logo.alt || title } } : {}),
    ...(favicon ? { favicon: `${origin}/${favicon}` } : {}),
    ...((str(config.lang) ?? str(config.locale))
      ? { locale: (str(config.lang) ?? (str(config.locale) as string)).replace("_", "-") }
      : {}),
    ...(str(config.timezone) ? { timeZone: str(config.timezone) as string } : {}),
    social,
    nav,
    footer,
    theme: siteTheme,
    pages: sqPages,
    collections,
    customCode: scripts.slice(0, 20),
    aliases,
    notices,
    platform: "jekyll",
    generator: "Jekyll",
    redirects,
    sources: [
      `the Jekyll source in ${src.label}${baseurl ? ` (published under ${baseurl})` : ""}`,
      ...(opts.liveCss ? ["the published site's CSS"] : []),
    ],
  };
  return {
    site,
    fetch: repoFetch(src, origin, { baseurl }),
    docs: content.length,
  };
}
