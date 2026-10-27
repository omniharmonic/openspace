/**
 * Read any site — Wix, Webflow, Carrd, Framer, hand-made HTML — into the source model: the home
 * page (header navigation, logo, footer, look), every page the sitemap lists (or that the site
 * links to), blog-like posts grouped into a collection, SEO and the site's scripts (reported, not
 * copied). Optional browser rendering (`render`) reads pages that JavaScript builds.
 */
import { RobotsDisallowed, type SiteFetcher } from "../fetch";
import { isPagePath, sitemapUrls } from "../html/discover";
import {
  type HtmlPage,
  hiddenClassesFromCss,
  parseHtmlPage,
  sitePath,
  stripSuffix,
} from "../html/extract";
import { type ComputedLook, themeFromCss } from "../html/theme";
import { platformLabel } from "../platform";
import { socialNetwork } from "../squarespace/crawl";
import type { Platform, SqCollection, SqItem, SqNavItem, SqNotice, SqPage, SqSite } from "../types";

/** Renders a page in a real browser (Playwright) for sites built by JavaScript. */
export interface PageRenderer {
  render(url: string): Promise<{ html: string; url: string; look?: ComputedLook }>;
  close(): Promise<void>;
}

export interface GenericCrawlOptions {
  url: string;
  fetcher: SiteFetcher;
  /** What built the site (from detection), for platform hints and the report. */
  platform?: Platform;
  generator?: string;
  maxPages?: number;
  onProgress?: (message: string) => void;
  render?: PageRenderer;
}

const BLOG_NAMES =
  /^\/(?:blog|news|journal|articles|posts|stories|updates|insights|writing|notes|press)$/i;

export async function crawlGeneric(opts: GenericCrawlOptions): Promise<SqSite> {
  const progress = opts.onProgress ?? (() => undefined);
  const notices: SqNotice[] = [];
  const f = opts.fetcher;
  const platform = opts.platform ?? "generic";
  const label = platformLabel(platform);
  let base: string;
  try {
    base = new URL(opts.url.includes("://") ? opts.url : `https://${opts.url}`).origin;
  } catch {
    throw new Error(`"${opts.url}" is not a web address.`);
  }
  let look: ComputedLook | undefined;
  let hiddenClasses = new Set<string>();
  const sources = new Set<string>(["page HTML"]);

  const getPage = async (
    path: string,
    o: { dropTitle?: boolean } = {},
  ): Promise<{ page: HtmlPage; html: string } | undefined> => {
    const url = new URL(path, base).toString();
    try {
      if (opts.render) {
        if (!(await f.allowed(url))) throw new RobotsDisallowed(url);
        const r = await opts.render.render(url);
        sources.add("pages rendered in a browser");
        if (path === "/" && r.look) look = r.look;
        return { page: parseHtmlPage(r.html, r.url || url, { ...o, hiddenClasses }), html: r.html };
      }
      const r = await f.text(url);
      if (!r || r.status >= 400) {
        if (r) notices.push({ kind: "fetch", where: path, message: `HTTP ${r.status}` });
        return undefined;
      }
      if (!/html/i.test(r.contentType) && r.contentType) return undefined;
      return { page: parseHtmlPage(r.text, r.url || url, { ...o, hiddenClasses }), html: r.text };
    } catch (e) {
      if (e instanceof RobotsDisallowed) {
        notices.push({
          kind: "robots",
          where: path,
          message: "robots.txt asks tools not to read this page; skipped.",
        });
        return undefined;
      }
      notices.push({ kind: "fetch", where: path, message: (e as Error).message });
      return undefined;
    }
  };

  progress(`Reading ${base}`);
  let home = await getPage("/");
  if (!home)
    throw new Error(
      `Couldn't read ${base}. Check the address and that the site is public (not password-protected).`,
    );
  // Follow a redirect to the canonical host (http → https, apex → www).
  base = new URL(home.page.url).origin;

  // Theme: inline styles + the first few stylesheets.
  let css = home.page.inlineCss;
  for (const href of home.page.stylesheets.slice(0, 6)) {
    try {
      const u = new URL(href, base);
      if (/fonts\.googleapis|font-awesome|fontawesome|bootstrap-icons/.test(u.href)) continue;
      const r = await f.text(u.toString());
      if (r && r.status < 400) css += `\n${r.text.slice(0, 800_000)}`;
    } catch {
      notices.push({
        kind: "theme",
        where: href,
        message: "Couldn't read a stylesheet; colors and fonts are approximate.",
      });
    }
  }
  const theme = themeFromCss(css, look);
  // Responsive duplicates the CSS hides on desktop: read the home page again without them.
  hiddenClasses = opts.render ? new Set() : hiddenClassesFromCss(css);
  if (hiddenClasses.size)
    home = { html: home.html, page: parseHtmlPage(home.html, home.page.url, { hiddenClasses }) };
  if (home.page.header.sticky) theme.headerFixed = true;
  if (home.page.header.overlay) theme.headerTransparent = true;

  // Addresses: sitemap, navigation, then links.
  progress("Reading the sitemap");
  const sm = await sitemapUrls(f, base, notices);
  if (sm.paths.length) sources.add("the sitemap");
  else
    notices.push({
      kind: "fetch",
      where: "/sitemap.xml",
      message: "No sitemap; pages were found by following the site's own links.",
    });
  const nav = home.page.header.nav;
  const navPaths: string[] = [];
  for (const n of nav)
    for (const h of n.type === "link" ? [n.href] : n.items.map((i) => i.href)) {
      const p = sitePath(h, base);
      if (p && isPagePath(p)) navPaths.push(p);
    }
  const budget = opts.maxPages ?? 400;
  // Navigation first, then the sitemap's shallow pages before deep ones (posts, items).
  const depth = (p: string) => p.split("/").filter(Boolean).length;
  const sitemapOrder = sm.paths
    .map((p, i) => ({ p, i }))
    .sort((a, b) => depth(a.p) - depth(b.p) || a.i - b.i)
    .map((x) => x.p);
  const queue: string[] = [...new Set(["/", ...navPaths, ...sitemapOrder])];
  const seen = new Set<string>(queue);
  const crawlLinks = !sm.paths.length;
  const fetched = new Map<string, HtmlPage>([["/", home.page]]);
  const canonicalOf = new Map<string, string>();
  const canon = (html: string) =>
    /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1];
  const homeCanon = canon(home.html);
  if (homeCanon) canonicalOf.set("/", sitePath(homeCanon, base) ?? "/");
  const enqueueLinks = (p: HtmlPage) => {
    if (!crawlLinks) return;
    for (const l of p.links)
      if (!seen.has(l) && isPagePath(l)) {
        seen.add(l);
        queue.push(l);
      }
  };
  enqueueLinks(home.page);
  for (let i = 1; i < queue.length && fetched.size < budget; i++) {
    const path = queue[i] as string;
    progress(path);
    const got = await getPage(path);
    if (!got) continue;
    const c = canon(got.html);
    const cp = c ? sitePath(c, base) : undefined;
    if (cp && cp !== path) canonicalOf.set(path, cp);
    fetched.set(path, got.page);
    enqueueLinks(got.page);
  }
  if (fetched.size >= budget && queue.length > budget)
    notices.push({
      kind: "other",
      where: "site",
      message: `Stopped after ${budget} pages; raise --max-pages to import the rest.`,
    });

  // Duplicates: pages whose canonical address is another page become aliases of it.
  const aliases: { from: string; to: string }[] = [];
  for (const [from, to] of canonicalOf)
    if (from !== to && fetched.has(to)) {
      aliases.push({ from, to });
      fetched.delete(from);
    }

  // Posts: pages with article metadata, grouped by their parent path.
  const isPost = (p: HtmlPage) =>
    p.path !== "/" &&
    !!p.article?.date &&
    (p.jsonLd.some((o) => /BlogPosting|Article|NewsArticle/.test(String(o["@type"]))) ||
      p.article !== undefined);
  const byParent = new Map<string, HtmlPage[]>();
  for (const p of fetched.values()) {
    if (!isPost(p)) continue;
    const parent = p.path.split("/").slice(0, -1).join("/") || "/";
    byParent.set(parent, [...(byParent.get(parent) ?? []), p]);
  }
  const collections: SqCollection[] = [];
  const asItem = new Set<string>();
  for (const [parent, posts] of byParent) {
    if (parent === "/" ? posts.length < 3 : posts.length < 2 && !BLOG_NAMES.test(parent)) continue;
    let path = parent;
    if (!fetched.has(parent) || parent === "/") {
      const listing = [...fetched.keys()].find(
        (k) => BLOG_NAMES.test(k) && !collections.some((c) => c.path === k),
      );
      path =
        listing ??
        (/^\/(?:post|posts|article|p)$/.test(parent) || parent === "/" ? "/journal" : parent);
    }
    const listPage = fetched.get(path);
    const c: SqCollection = {
      path,
      title: listPage?.title && listPage.title.length < 60 ? listPage.title : "Journal",
      kind: "blog",
      seo: listPage?.seo ?? {},
      items: [],
      ...(listPage?.seo.description ? { description: listPage.seo.description } : {}),
    };
    for (const p of posts) {
      // Re-read the body without its title heading (the title is the item's).
      const again = await getPage(p.path, { dropTitle: true });
      const page = again?.page ?? p;
      const a = page.article ?? { tags: [], categories: [] };
      const item: SqItem = {
        path: p.path,
        title: page.title,
        ...(a.date ? { date: a.date } : {}),
        ...(a.author ? { author: a.author } : {}),
        tags: a.tags,
        categories: a.categories,
        ...(a.excerpt ? { excerptHtml: `<p>${escapeHtml(a.excerpt)}</p>` } : {}),
        sections: page.sections.map((s) => ({ ...s, role: undefined })),
        ...(a.image ? { image: a.image } : {}),
        seo: page.seo,
        source: "html",
      };
      c.items.push(item);
      asItem.add(p.path);
    }
    if (listPage) asItem.add(path);
    collections.push(c);
    notices.push({
      kind: "collection",
      where: path,
      message: `${c.items.length} post(s) found under ${parent === "/" ? "the site root" : parent} became the "${c.title}" collection.`,
    });
  }

  // Pages.
  const navLabelOf = (path: string): string | undefined => {
    const match = (href: string) => sitePath(href, base) === path;
    for (const n of nav) {
      if (n.type === "link" && match(n.href)) return n.label;
      if (n.type === "folder") for (const i of n.items) if (match(i.href)) return i.label;
    }
    return undefined;
  };
  const pages: SqPage[] = [];
  let thin = 0;
  for (const p of fetched.values()) {
    if (asItem.has(p.path)) continue;
    const navTitle = navLabelOf(p.path);
    const sections = p.sections;
    const textual = sections.length > 0 && p.textLength >= 40;
    if (!textual) thin++;
    pages.push({
      path: p.path,
      title:
        p.path === "/" ? "Home" : (navTitle ?? stripSuffix(p.title, home.page.siteName) ?? p.title),
      ...(navTitle ? { navTitle } : {}),
      seo: p.seo,
      sections,
      ...(!navTitle && p.path !== "/" && nav.length ? { hidden: true } : {}),
    });
  }
  if (
    thin &&
    !opts.render &&
    (platform === "wix" || platform === "framer" || thin >= Math.max(2, pages.length / 3))
  )
    notices.push({
      kind: "fetch",
      where: "site",
      message: `${thin} page(s) had little or no readable content in their HTML — ${label} builds them with JavaScript. Re-run with \`--render\` (needs Playwright: \`npx playwright install chromium\`) to read them as a browser sees them.`,
    });
  if (platform === "wix")
    notices.push({
      kind: "other",
      where: "site",
      message:
        "Wix strips and absolute-positioned layouts were turned into OpenSpace sections and columns; check spacing and alignment in the visual parity pass.",
    });
  if (platform === "webflow")
    notices.push({
      kind: "other",
      where: "site",
      message:
        "Webflow interactions and animations were not copied; OpenSpace's own motion setting (Site Styles) is used instead.",
    });

  // Site identity.
  const social: SqSite["social"] = [];
  for (const url of home.page.social) {
    const network = socialNetwork(url);
    if (network && !social.some((s) => s.network === network)) social.push({ network, url });
  }
  const title =
    home.page.siteName ??
    home.page.header.siteTitle ??
    (home.page.docTitle.split(/\s+[—–|·-]\s+/).pop() || undefined) ??
    new URL(base).host.replace(/^www\./, "");
  const scripts = new Set<string>();
  for (const p of fetched.values()) for (const s of p.scripts) scripts.add(s);
  const lang = home.page.lang?.replace("_", "-");
  return {
    baseUrl: base,
    title: title.trim(),
    ...(home.page.seo.description ? { description: home.page.seo.description } : {}),
    ...(home.page.header.logo
      ? { logo: { ...home.page.header.logo, alt: home.page.header.logo.alt || title } }
      : {}),
    ...(home.page.favicon ? { favicon: home.page.favicon } : {}),
    ...(lang ? { locale: lang } : {}),
    social,
    nav: nav as SqNavItem[],
    ...(home.page.header.action ? { headerAction: home.page.header.action } : {}),
    footer: home.page.footer,
    theme,
    pages,
    collections,
    customCode: [...scripts],
    aliases,
    notices,
    platform,
    ...(opts.generator ? { generator: opts.generator } : {}),
    sources: [...sources],
  };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
