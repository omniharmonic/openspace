import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FormSecurityContext, registerAll } from "@omniharmonic/openspace-blocks";
import { PageView, renderPageHtml } from "@omniharmonic/openspace-renderer";
import type { CollectionItem, Page, SiteDocument } from "@omniharmonic/openspace-schema";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { loadSiteDocument } from "./content/index";
import { deployLocation } from "./deploy";
import { atomFeed, buildFeeds, icalFeed, podcastFeed, rssFeed } from "./feeds";
import { catalogManifest, formsManifest } from "./manifests";
import {
  addTurnstileLoader,
  ogSpec,
  renderRoute,
  routePage,
  siteStylesheets,
  unlinkMembersArea,
} from "./render";
import { planSite, type SitePlan } from "./routes";
import {
  cloudflareRedirects,
  jsonLdFor,
  redirectFile,
  redirectHtml,
  robotsTxt,
  sitemapXml,
} from "./seo";

const MEADOW = join(dirname(fileURLToPath(import.meta.url)), "../../../tools/fixtures/meadow-site");
const NOW = new Date("2026-10-27T12:00:00Z");

let doc: SiteDocument;
let plan: SitePlan;
beforeAll(async () => {
  doc = await loadSiteDocument(MEADOW);
  plan = planSite(doc, { now: NOW });
});

const loc = () => deployLocation(doc.config);

describe("deployLocation", () => {
  it("uses / with a custom domain and the repo path on a project site", () => {
    expect(
      deployLocation({
        deploy: {
          target: "github-pages",
          url: "https://maya.github.io/maya-yoga",
          customDomain: "mayayoga.com",
        },
      }),
    ).toEqual({
      site: "https://mayayoga.com",
      base: "/",
      basePath: "",
      siteUrl: "https://mayayoga.com/",
    });
    expect(
      deployLocation({
        deploy: {
          target: "github-pages",
          url: "https://maya.github.io/maya-yoga/",
          customDomain: null,
        },
      }),
    ).toEqual({
      site: "https://maya.github.io",
      base: "/maya-yoga",
      basePath: "/maya-yoga",
      siteUrl: "https://maya.github.io/maya-yoga/",
    });
    expect(
      deployLocation({
        deploy: { target: "github-pages", url: "https://maya.github.io", customDomain: null },
      }).base,
    ).toBe("/");
  });
});

describe("planSite", () => {
  it("plans pages, items, lists, taxonomies and the 404 page", () => {
    const paths = plan.routes.map((r) => r.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/journal/2026-10-26-opening-day/");
    expect(paths).toContain("/journal/");
    expect(paths).toContain("/journal/category/teaching/");
    expect(paths).toContain("/journal/tag/boulder/"); // tag "Boulder" slugged
    expect(paths.at(-1)).toBe("/404.html");
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("publishes scheduled items once due, never drafts", () => {
    expect(plan.routes.some((r) => r.path.includes("winter-schedule"))).toBe(false);
    const later = planSite(doc, { now: new Date("2026-12-01T00:00:00Z") });
    expect(later.routes.some((r) => r.path.includes("winter-schedule"))).toBe(true);
    expect(later.routes.some((r) => r.path.includes("draft-retreat-notes"))).toBe(false);
    expect(Object.keys(later.doc.collections.journal ?? {})).not.toContain("draft-retreat-notes");
  });

  it("never prerenders gated pages and lets owner pages replace generated lists", () => {
    const gated: Page = {
      id: "pg_gatedpage1",
      title: "Members",
      slug: "members",
      access: { members: true },
      sections: [],
    };
    const owner: Page = { id: "pg_journalpg1", title: "Journal", slug: "journal", sections: [] };
    const p = planSite(
      { ...doc, pages: { ...doc.pages, [gated.id]: gated, [owner.id]: owner } },
      { now: NOW },
    );
    expect(p.routes.find((r) => r.path === "/members/")).toBeUndefined();
    expect(p.doc.pages[gated.id]).toBeUndefined();
    expect(p.routes.find((r) => r.path === "/journal/")).toMatchObject({
      kind: "page",
      pageId: owner.id,
    });
  });

  it("paginates long lists", () => {
    const items: Record<string, CollectionItem> = {};
    for (let i = 1; i <= 30; i++) {
      const slug = `post-${i}`;
      items[slug] = {
        kind: "blog",
        slug,
        frontmatter: {
          title: `Post ${i}`,
          status: "published",
          date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
        },
        body: "Hi.\n",
      };
    }
    const cfg = {
      kind: "blog" as const,
      label: "Notes",
      list: { layout: "list" as const, pageSize: 12, sort: "date-desc" as const },
    };
    const p = planSite(
      { ...doc, collections: { notes: items }, collectionConfigs: { notes: cfg } },
      { now: NOW },
    );
    const lists = p.routes.filter((r) => r.kind === "collection").map((r) => r.path);
    expect(lists).toEqual(["/notes/", "/notes/page/2/", "/notes/page/3/"]);
    const second =
      p.doc.pages[p.routes.find((r) => r.path === "/notes/page/2/")?.pageId as Page["id"]];
    expect(JSON.stringify(second)).toContain('"url":"/notes/page/3/"');
  });

  it("shortens long titles and excerpts to fit related-item cards", () => {
    const long = `${"A long imported excerpt that keeps going. ".repeat(11)}End.`;
    expect(long.length).toBeGreaterThan(400);
    const items: Record<string, CollectionItem> = {};
    for (const slug of ["one", "two"])
      items[slug] = {
        kind: "blog",
        slug,
        frontmatter: {
          title: `${slug} ${"with a very long imported headline ".repeat(4)}`,
          status: "published",
          date: "2026-01-02",
          excerpt: long,
        },
        body: "Hi.\n",
      };
    const cfg = {
      kind: "blog" as const,
      label: "Notes",
      list: { layout: "list" as const, pageSize: 12, sort: "date-desc" as const },
      itemPage: { layout: "article" as const, showRelated: true },
    };
    const p = planSite(
      { ...doc, collections: { notes: items }, collectionConfigs: { notes: cfg } },
      { now: NOW },
    );
    const route = p.routes.find((r) => r.path.startsWith("/notes/one"));
    const page = p.doc.pages[route?.pageId as Page["id"]];
    const card = page?.sections.flatMap((s) => s.blocks).find((b) => b.type === "card");
    expect(JSON.stringify(card?.fields.body)).toContain("…");
    expect(String(card?.fields.heading).length).toBeLessThanOrEqual(90);
  });

  it("builds item pages from library blocks only", () => {
    const route = plan.routes.find((r) => r.path === "/events/autumn-retreat/");
    const page = plan.doc.pages[route?.pageId as Page["id"]];
    const types = page?.sections.flatMap((s) => s.blocks.map((b) => b.type));
    expect(types).toEqual(expect.arrayContaining(["text", "button", "image", "share-buttons"]));
    const when = JSON.stringify(page);
    expect(when).toMatch(/Saturday, November 14, 2026 · 9:00\sAM – 4:00\sPM MST/);
    expect(when).toContain("https://tickets.example.org/meadow-retreat");
  });
});

describe("rendering", () => {
  it("renders every route through renderPageHtml without React runtime", () => {
    for (const route of plan.routes) {
      const html = renderRoute({ plan, route, location: loc() });
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain('<style data-os="blocks">');
      expect(html).not.toMatch(/react-dom|data-reactroot/);
    }
  });

  it("equals renderPageHtml with the composed page", () => {
    const route = plan.routes.find((r) => r.path === "/about/");
    if (!route) throw new Error("no route");
    const { page } = routePage(plan, route, false);
    const html = renderRoute({ plan, route, location: loc(), ogImages: false });
    expect(html).toBe(
      renderPageHtml({
        doc: plan.doc,
        pageId: page,
        basePath: "",
        imageMap: {},
        siteUrl: loc().siteUrl,
        jsonLd: [],
        extraHead: html.match(/<style data-os="blocks">[\s\S]*?<\/style>/)?.[0] ?? "",
      }),
    );
  });

  it("adds the same Turnstile slot the blocks render with a site key", () => {
    registerAll();
    const route = plan.routes.find((r) => r.path === "/contact/");
    if (!route) throw new Error("no route");
    const html = renderRoute({
      plan,
      route,
      location: loc(),
      turnstileSiteKey: "0x4AAAAAAAtestkey",
    });
    expect(html).toContain('<script type="module" src="/_os/turnstile.js"></script>');
    const { page } = routePage(plan, route);
    const withContext = renderToStaticMarkup(
      createElement(
        FormSecurityContext.Provider,
        { value: { turnstileSiteKey: "0x4AAAAAAAtestkey" } },
        createElement(PageView, { doc: plan.doc, page }),
      ),
    );
    const formOf = (s: string) => /<form[\s\S]*?<\/form>/.exec(s)?.[0];
    expect(formOf(html)).toBe(formOf(withContext));
    expect(
      addTurnstileLoader("<html><head></head><body>no forms</body></html>", "/t.js"),
    ).not.toContain("t.js");
  });

  it("gives pages without a share image a generated one, keyed by content", () => {
    const home = plan.routes.find((r) => r.path === "/");
    const about = plan.routes.find((r) => r.path === "/about/");
    if (!home || !about) throw new Error("no route");
    const { og } = routePage(plan, home);
    expect(og?.hash).toMatch(/^[a-f0-9]{12}$/);
    expect(renderRoute({ plan, route: home, location: loc() })).toContain(
      `og:image" content="https://meadowyoga.example/_os/og/${og?.hash}.png"`,
    );
    expect(routePage(plan, about).og).toBeUndefined();
    const page = plan.doc.pages[home.pageId as Page["id"]] as Page;
    expect(ogSpec(plan.doc, page).hash).toBe(og?.hash);
    expect(ogSpec(plan.doc, { ...page, seo: { title: "Different" } }).hash).not.toBe(og?.hash);
  });

  it("uses the site's default sharing image before a generated card", () => {
    const home = plan.routes.find((r) => r.path === "/");
    if (!home) throw new Error("no route");
    const withDefault: SitePlan = {
      ...plan,
      doc: {
        ...plan.doc,
        site: { ...plan.doc.site, seo: { ...plan.doc.site.seo, image: "media/social.jpg" } },
      },
    };
    expect(routePage(withDefault, home).og).toBeUndefined();
    const html = renderRoute({
      plan: withDefault,
      route: home,
      location: deployLocation({
        deploy: { target: "github-pages", url: "https://maya.github.io/maya-yoga/" },
      } as SiteDocument["config"]),
    });
    expect(html).toContain('og:image" content="https://maya.github.io/maya-yoga/media/social.jpg"');
    expect(html).not.toContain("/_os/og/");
  });

  it("turns links into the members area into text off Cloudflare (they would 404)", () => {
    const html =
      '<head><a href="/r/members/">x</a></head><body><p><a href="/r/members/">Members</a> · <a class="b" href="/r/members/faq/"><strong>FAQ</strong></a> · <a href="/r/membership/">Join</a> · <a href="/r/about/">About</a></p></body>';
    expect(unlinkMembersArea(html, "/r")).toBe(
      '<head><a href="/r/members/">x</a></head><body><p>Members · <strong>FAQ</strong> · <a href="/r/membership/">Join</a> · <a href="/r/about/">About</a></p></body>',
    );
    expect(unlinkMembersArea('<body><a href="/members">M</a></body>', "")).toBe("<body>M</body>");
  });

  it("publishes one stylesheet named by content hash (tokens, base, blocks)", () => {
    const a = siteStylesheets(doc, "/repo");
    expect(a.hrefs.site).toMatch(/^\/repo\/_os\/site\.[a-f0-9]{10}\.css$/);
    expect(Object.keys(a.files)).toEqual([a.hrefs.site.slice("/repo/".length)]);
    const css = Object.values(a.files)[0] as string;
    // Cascade order as before: tokens, then the base layers, then the block layer.
    expect(css.indexOf("--os-")).toBeLessThan(css.indexOf("@layer os.reset, os.base"));
    expect(css.indexOf("@layer os.reset, os.base")).toBeLessThan(css.indexOf("@layer os.blocks {"));
    const b = siteStylesheets(
      { ...doc, styles: { ...doc.styles, choices: { ...doc.styles.choices, density: "compact" } } },
      "/repo",
    );
    expect(b.hrefs.site).not.toBe(a.hrefs.site);
  });

  it("has one render-blocking stylesheet: fonts inline, font files preloaded early", () => {
    const route = plan.routes.find((r) => r.path === "/");
    if (!route) throw new Error("no route");
    const location = deployLocation({
      deploy: { target: "github-pages", url: "https://maya.github.io/maya-yoga/" },
    } as SiteDocument["config"]);
    const assets = siteStylesheets(plan.doc, location.basePath).hrefs;
    const html = renderRoute({
      plan,
      route,
      location,
      assets,
      fontStylesheets: ["/maya-yoga/_os/fonts/fonts.abc.css"],
      fontCss: "@font-face{font-family:X;src:url(/maya-yoga/_os/fonts/x.woff2)}",
      fontPreloads: ["/maya-yoga/_os/fonts/x.woff2"],
    });
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head.match(/<link rel="stylesheet"[^>]*>/g)).toEqual([
      `<link rel="stylesheet" href="${assets.site}">`,
    ]);
    expect(head).toContain(
      '<style data-os="fonts">@font-face{font-family:X;src:url(/maya-yoga/_os/fonts/x.woff2)}</style>',
    );
    expect(head).not.toContain('data-os="blocks"');
    expect(head).not.toContain('data-os="tokens"');
    const preload = head.indexOf(
      '<link rel="preload" href="/maya-yoga/_os/fonts/x.woff2" as="font"',
    );
    expect(preload).toBeGreaterThan(-1);
    expect(preload).toBeLessThan(head.indexOf('<link rel="stylesheet"'));
    expect(head.split('_os/fonts/x.woff2" as="font"').length).toBe(2);
  });
});

describe("feeds", () => {
  const ctx = () => ({
    doc: plan.doc,
    siteUrl: loc().siteUrl,
    now: plan.now,
    mediaUrl: (s: string) => `https://meadowyoga.example/${s}`,
  });

  it("builds one feed per format the collection publishes", () => {
    const files = buildFeeds(plan, { siteUrl: loc().siteUrl, mediaUrl: (s) => s });
    expect(files.map((f) => f.path).sort()).toEqual([
      "/events/calendar.ics",
      "/journal/atom.xml",
      "/journal/rss.xml",
      "/podcast/podcast.xml",
    ]);
  });

  it("escapes XML and RSS/Atom carry the right items", () => {
    const items = plan.items.journal ?? [];
    const tricky = {
      ...items[0],
      frontmatter: { ...items[0]?.frontmatter, title: "Tea & <biscuits>" },
    } as CollectionItem;
    const rss = rssFeed(ctx(), "journal", [tricky], "/journal/rss.xml");
    expect(rss).toContain("<title>Tea &amp; &lt;biscuits&gt;</title>");
    expect(rss).toContain("<dc:creator>Maya</dc:creator>");
    const atom = atomFeed(ctx(), "journal", items, "/journal/atom.xml");
    expect(atom).toContain("<updated>2026-10-26T00:00:00.000Z</updated>");
  });

  it("folds and escapes iCalendar lines", () => {
    const events = plan.items.events ?? [];
    const long = {
      ...events[0],
      frontmatter: {
        ...events[0]?.frontmatter,
        title: `${"Very long title, with; separators ".repeat(4)}end`,
      },
    } as CollectionItem;
    const ics = icalFeed(ctx(), "events", [long]);
    for (const line of ics.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics).toContain("SUMMARY:Very long title\\, with\\; separators");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("writes the repeat rule of recurring events", () => {
    const events = plan.items.events ?? [];
    const weekly = {
      ...events[0],
      frontmatter: { ...events[0]?.frontmatter, recurrence: "FREQ=WEEKLY;BYDAY=TU;COUNT=8" },
    } as CollectionItem;
    expect(icalFeed(ctx(), "events", [weekly])).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=8\r\n");
  });

  it("escapes enclosure types and writes whole-second durations", () => {
    const ep = structuredClone(plan.items.podcast?.[0]) as CollectionItem & { kind: "podcast" };
    (ep.frontmatter.audio as { duration: number }).duration = 1519.6;
    (ep.frontmatter.audio as { mime: string }).mime = 'audio/mpeg"><x' as never;
    const xml = podcastFeed(ctx(), "podcast", [ep], "/podcast/podcast.xml");
    expect(xml).toContain("<itunes:duration>00:25:20</itunes:duration>");
    expect(xml).toContain('type="audio/mpeg&quot;&gt;&lt;x"');
  });

  it("adds Apple podcast tags", () => {
    const xml = podcastFeed(ctx(), "podcast", plan.items.podcast ?? [], "/podcast/podcast.xml");
    expect(xml).toContain('<itunes:category text="Society &amp; Culture"/>');
    expect(xml).toContain("<itunes:email>hello@meadowyoga.example</itunes:email>");
    expect(xml).toContain('type="audio/mpeg"');
    expect(xml).toMatch(/length="\d{4,}"/);
    expect(xml).toContain("<itunes:image href=");
  });
});

describe("SEO outputs", () => {
  it("sitemap lists indexable routes only; robots points to it", () => {
    const xml = sitemapXml(plan, loc().siteUrl);
    expect(xml).toContain("<loc>https://meadowyoga.example/about/</loc>");
    expect(xml).not.toContain("thanks");
    expect(xml).not.toContain("/journal/page/");
    expect(robotsTxt(doc, loc().siteUrl)).toBe(
      "User-agent: *\nAllow: /\n\nSitemap: https://meadowyoga.example/sitemap.xml\n",
    );
    expect(
      robotsTxt({ ...doc, site: { ...doc.site, seo: { noindex: true } } }, loc().siteUrl),
    ).toBe("User-agent: *\nDisallow: /\n");
  });

  it("refuses redirect paths with dot segments", () => {
    expect(() => redirectFile("/../../etc/passwd")).toThrow(/segments/);
    expect(() => redirectFile("/a/./b")).toThrow(/segments/);
  });

  it("redirects as static HTML and Cloudflare _redirects", () => {
    const r = { from: "/old", to: "/new/", status: 301 as const };
    expect(redirectFile("/old")).toBe("old/index.html");
    expect(redirectFile("/old.html")).toBe("old.html");
    const html = redirectHtml(r, "/repo", "https://x.github.io/repo/");
    expect(html).toContain('content="0; url=/repo/new/"');
    expect(html).toContain('href="https://x.github.io/repo/new/"');
    expect(
      cloudflareRedirects([r, { from: "/ext", to: "https://example.org/", status: 302 }], ""),
    ).toBe("/old /new/ 301\n/ext https://example.org/ 302\n");
  });

  it("JSON-LD per route kind", () => {
    const ctx = { siteUrl: loc().siteUrl, mediaUrl: (s: string) => `https://cdn/${s}` };
    const byPath = (p: string) =>
      jsonLdFor(plan, plan.routes.find((r) => r.path === p) as never, ctx);
    expect(byPath("/").map((x) => x["@type"])).toEqual(["WebSite", "LocalBusiness"]);
    expect(byPath("/journal/2026-10-26-opening-day/")[0]).toMatchObject({
      "@type": "BlogPosting",
      datePublished: "2026-10-26",
      author: { name: "Maya" },
    });
    expect(byPath("/events/autumn-retreat/")[0]).toMatchObject({
      "@type": "Event",
      startDate: "2026-11-14T16:00:00.000Z",
      location: { "@type": "Place" },
    });
    expect(byPath("/shop/class-card/")[0]).toMatchObject({
      "@type": "Product",
      sku: "MDW-CARD-10",
      offers: { price: "150.00" },
    });
    expect(byPath("/about/")).toEqual([]);
  });
});

describe("Hub manifests", () => {
  it("fail the build on a form id shared by two different forms", () => {
    const contact = Object.values(plan.doc.pages).find((pg) => pg.slug === "contact") as Page;
    const clone = structuredClone(contact);
    clone.id = "pg_c0ntactc0py";
    clone.slug = "contact-copy";
    const formBlock = clone.sections.flatMap((x) => x.blocks).find((b) => b.type === "form");
    (formBlock?.fields.form as { name: string }).name = "Something else";
    const p = { ...plan, doc: { ...plan.doc, pages: { ...plan.doc.pages, [clone.id]: clone } } };
    expect(() => formsManifest(p as SitePlan)).toThrow(/share the id frm_c0ntactmdw/);
  });

  it("fail the build on a SKU used twice", () => {
    const shop = plan.items.shop ?? [];
    const dupe = structuredClone(shop[0]) as CollectionItem;
    dupe.slug = "dupe";
    expect(() => catalogManifest({ ...plan, items: { ...plan.items, extra: [dupe] } })).toThrow(
      /SKU .* is used by both/,
    );
  });

  it("forms.json: the Hub's shape — forms by id, each a Form plus redirectHref", () => {
    const m = formsManifest(plan);
    expect(Object.keys(m.forms)).toEqual(["frm_c0ntactmdw"]);
    expect(m.forms.frm_c0ntactmdw).toMatchObject({
      id: "frm_c0ntactmdw",
      name: "Contact",
      redirectHref: "/contact/thanks/",
    });
    expect(m.pages.frm_c0ntactmdw).toEqual(["/contact/"]);
    expect(formsManifest(plan).hash).toBe(m.hash);
  });

  it("catalog.json: every SKU resolves to a server-side price", () => {
    const c = catalogManifest(plan);
    expect(Object.keys(c.skus).sort()).toEqual([
      "MDW-BOL-01-OAT",
      "MDW-BOL-01-SAGE",
      "MDW-CARD-10",
    ]);
    expect(c.skus["MDW-BOL-01-OAT"]).toMatchObject({
      price: { amount: 6800, currency: "USD" },
      slug: "linen-bolster",
    });
    expect(c.products.find((p) => p.slug === "linen-bolster")?.variants).toHaveLength(2);
  });

  it("catalog.json carries shipping weights and subscription intervals for the Hub", () => {
    const items = structuredClone(plan.items);
    const bolster = Object.values(items)
      .flat()
      .find((i) => i.slug === "linen-bolster");
    if (bolster?.kind !== "products") throw new Error("fixture");
    bolster.frontmatter.weight = 900;
    bolster.frontmatter.subscription = { interval: "month" };
    const first = bolster.frontmatter.variants?.[0];
    if (first) first.weight = 1100;
    const c = catalogManifest({ ...plan, items });
    const p = c.products.find((x) => x.slug === "linen-bolster");
    expect(p).toMatchObject({ weight: 900, interval: "month" });
    expect(p?.variants?.[0]?.weight).toBe(1100);
    expect(p?.variants?.[1]?.weight).toBeUndefined();
  });
});
