import {
  type BrokenLink,
  findBrokenLinks,
  type Page,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";

/**
 * What a site on GitHub Pages (plain files, no server) can't do: members-only and password pages
 * aren't published there, and blocks that need the Hub at visit time — donations, products,
 * member sign-in — don't work. The Design check and the publish gate warn; Cloudflare hosting
 * runs all of them.
 */

/** Members-only, password-protected, or under `/members/` (members-only by definition). */
export function isGatedPage(page: Pick<Page, "slug" | "access">): boolean {
  const slug = typeof page.slug === "string" ? page.slug : "";
  return Boolean(
    page.access?.members ||
      page.access?.password ||
      slug === "members" ||
      slug.startsWith("members/"),
  );
}

/** The site publishes to GitHub Pages (the default target). */
export function onGitHubPages(doc: Pick<SiteDocument, "config">): boolean {
  return doc.config?.deploy?.target !== "cloudflare";
}

/** Block types that need Cloudflare hosting (and the Hub) to work for visitors. */
export const CLOUDFLARE_BLOCKS: Readonly<Record<string, string>> = {
  donation: "Donations",
  product: "Buying products",
  "member-login": "Member sign-in",
};

const linkKey = (l: BrokenLink) =>
  `${l.scope.kind}:${"page" in l.scope ? l.scope.page : ""}:${"collection" in l.scope ? `${l.scope.collection}/${l.scope.slug}` : ""}:${l.container ?? ""}:${l.path.join(".")}`;

/**
 * Links that lead to a members-only or password page on a site hosted on GitHub Pages, where
 * those pages aren't published (visitors get "page not found"). Empty on Cloudflare hosting.
 */
export function gatedPageLinks(doc: SiteDocument): BrokenLink[] {
  if (!onGitHubPages(doc)) return [];
  const pages = Object.entries(doc.pages);
  if (!pages.some(([, p]) => isGatedPage(p))) return [];
  const before = new Set(findBrokenLinks(doc).map(linkKey));
  const published = {
    ...doc,
    pages: Object.fromEntries(pages.filter(([, p]) => !isGatedPage(p))),
  } as SiteDocument;
  return findBrokenLinks(published)
    .filter((l) => !before.has(linkKey(l)))
    .map((l) => ({ ...l, severity: "warning" as const }));
}

export interface HostingWarning {
  rule: "needs-cloudflare" | "gated-page";
  message: string;
  where: { page?: string; section?: string; block?: string };
}

/**
 * On GitHub Pages: each page that won't be published (members-only / password) and each block
 * that needs Cloudflare hosting to work for visitors (donations, products, member sign-in).
 */
export function hostingWarnings(doc: SiteDocument, pageId?: string): HostingWarning[] {
  if (!onGitHubPages(doc)) return [];
  const out: HostingWarning[] = [];
  const title = (p: Page) => p.title || (p.slug === "" ? "Home" : p.slug);
  for (const page of Object.values(doc.pages)) {
    if (pageId && page.id !== pageId) continue;
    if (isGatedPage(page)) {
      out.push({
        rule: "gated-page",
        message: `${title(page)} is members-only, so it isn't published while the site is on GitHub Pages.`,
        where: { page: page.id },
      });
      continue;
    }
    for (const section of page.sections) {
      if (section.hidden) continue;
      for (const block of section.blocks) {
        const what = CLOUDFLARE_BLOCKS[block.type];
        if (!what) continue;
        out.push({
          rule: "needs-cloudflare",
          message: `${what} on ${title(page)} won't work on your live site: it needs Cloudflare hosting, and this site is on GitHub Pages.`,
          where: { page: page.id, section: section.id, block: block.id },
        });
      }
    }
  }
  return out;
}
