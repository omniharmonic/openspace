/**
 * Which addresses a site has: the sitemaps robots.txt announces (and the usual `/sitemap.xml`,
 * `/sitemap_index.xml`), following sitemap indexes, filtered to same-site HTML pages; plus, when
 * there is no sitemap, a breadth-first walk of the site's own links.
 */
import { RobotsDisallowed, type SiteFetcher } from "../fetch";
import type { SqNotice } from "../types";
import { sitePath } from "./extract";

/** Paths that are never content pages. */
const NOT_PAGES =
  /^\/(?:cart|checkout|basket|account|my-account|login|log-in|signin|sign-in|signup|sign-up|register|logout|search|wp-admin|wp-login\.php|wp-json|xmlrpc\.php|feed|rss|cdn-cgi|_next|static|assets|api|graphql|admin|members-area|profile|amp|lightbox|_api|_partials|\.well-known)(?:\/|$)/i;
const FILE_EXT =
  /\.(?:jpe?g|png|gif|webp|avif|svg|ico|pdf|docx?|xlsx?|pptx?|zip|mp3|mp4|m4a|wav|ogg|mov|css|js|json|xml|txt|rss|atom|woff2?|ttf|eot)$/i;

export function isPagePath(p: string): boolean {
  return !NOT_PAGES.test(p) && !FILE_EXT.test(p) && !/\/(?:feed|amp|page\/\d+)$/.test(p);
}

export async function sitemapUrls(
  fetcher: SiteFetcher,
  base: string,
  notices: SqNotice[],
  limit = 2000,
): Promise<{ paths: string[]; lastmod: Map<string, string> }> {
  const queue: string[] = [];
  try {
    const robots = await fetcher.text(new URL("/robots.txt", base).toString());
    if (robots && robots.status < 400)
      for (const m of robots.text.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim))
        queue.push(m[1] as string);
  } catch {
    // no robots.txt
  }
  if (!queue.length)
    queue.push(
      new URL("/sitemap.xml", base).toString(),
      new URL("/sitemap_index.xml", base).toString(),
    );
  const seen = new Set<string>();
  const paths: string[] = [];
  const lastmod = new Map<string, string>();
  for (let i = 0; i < queue.length && seen.size < 30; i++) {
    const url = queue[i] as string;
    if (seen.has(url)) continue;
    seen.add(url);
    let xml: string | undefined;
    try {
      const r = await fetcher.text(url);
      if (r && r.status < 400 && /<(?:urlset|sitemapindex)\b/.test(r.text)) xml = r.text;
    } catch (e) {
      if (e instanceof RobotsDisallowed)
        notices.push({
          kind: "robots",
          where: url,
          message: "robots.txt asks tools not to read this sitemap; skipped.",
        });
      continue;
    }
    if (!xml) continue;
    if (/<sitemapindex\b/.test(xml)) {
      for (const m of xml.matchAll(
        /<sitemap>[\s\S]*?<loc>\s*([^<\s]+)\s*<\/loc>[\s\S]*?<\/sitemap>/g,
      )) {
        const loc = (m[1] as string).replace(/&amp;/g, "&");
        // Images/videos/products sitemaps aren't pages.
        if (/image|video|product|attachment|author|tag/i.test(loc)) continue;
        queue.push(loc);
      }
      continue;
    }
    for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = /<loc>\s*([^<\s]+)\s*<\/loc>/.exec(m[1] as string)?.[1];
      if (!loc) continue;
      const p = sitePath(loc.replace(/&amp;/g, "&"), base);
      if (!p || !isPagePath(p) || paths.includes(p)) continue;
      paths.push(p);
      const lm = /<lastmod>\s*([^<\s]+)\s*<\/lastmod>/.exec(m[1] as string)?.[1];
      if (lm) lastmod.set(p, lm);
      if (paths.length >= limit) break;
    }
  }
  return { paths, lastmod };
}
