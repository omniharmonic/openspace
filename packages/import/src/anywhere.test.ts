import { readFileSync } from "node:fs";
import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import { phoneCheck } from "@omniharmonic/openspace-lint";
import {
  type Block,
  findBrokenLinks,
  type Page,
  type SiteConfig,
  SiteDocumentSchema,
} from "@omniharmonic/openspace-schema";
import { markdocToBlocks } from "@omniharmonic/openspace-site-kit/markdoc";
import { beforeAll, describe, expect, it } from "vitest";
import { parseDocument } from "./dom";
import { hiddenClassesFromCss, parseHtmlPage, unspace } from "./html/extract";
import { bestRendition, focalFromObjectPosition, parseSrcset, wpOriginal } from "./html/image";
import { googleFontFamilies, themeFromCss } from "./html/theme";
import { detectPlatform, type ImportResult, importSite, parsePlatform } from "./index";
import { phoneReady } from "./phone";
import {
  FERNHILL_EXPORT,
  FERNHILL_URL,
  fernhillFetch,
  JUNIPER_URL,
  juniperFetch,
  TIDEWATER_URL,
  tidewaterFetch,
} from "./testing";
import { autop, decodeEntities, wpRawToHtml } from "./wordpress/content";

const CONFIG: SiteConfig = {
  siteId: "st_jvn1per000",
  schemaVersion: 1,
  template: { id: "starter", version: "1.0.0" },
  hub: "https://hub.openspace.dev",
  deploy: { target: "github-pages", url: "https://example.github.io/site", customDomain: null },
  features: { forms: true, newsletter: false, analytics: false, search: true },
};
const NOW = new Date("2026-10-27T12:00:00Z");
const registry = blocksRegistry();

const pageBySlug = (r: ImportResult, slug: string) =>
  Object.values(r.doc.pages).find((p) => p.slug === slug) as Page;
const blocksOf = (p: Page): Block[] => p.sections.flatMap((s) => s.blocks);
const types = (p: Page) => blocksOf(p).map((b) => b.type);

function expectValid(r: ImportResult) {
  const parsed = SiteDocumentSchema.safeParse(r.doc);
  expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 3))).toBe(true);
  expect(registry.validateDocument(r.doc)).toEqual([]);
  expect(findBrokenLinks(r.doc).filter((l) => l.severity === "error")).toEqual([]);
  for (const [name, items] of Object.entries(r.doc.collections))
    for (const item of Object.values(items))
      expect(
        markdocToBlocks(item.body, { registry, idSeed: `${name}/${item.slug}`, media: r.doc.media })
          .issues,
        `${name}/${item.slug}`,
      ).toEqual([]);
  for (const path of Object.keys(r.doc.media)) expect(r.files.has(path), path).toBe(true);
  const refs = JSON.stringify(r.doc).match(/media\/[A-Za-z0-9_\-./]+\.[a-z0-9]+/g) ?? [];
  for (const ref of refs) expect(r.doc.media[ref as keyof typeof r.doc.media], ref).toBeDefined();
}

describe("platform detection", () => {
  const page = (head: string, body = "") =>
    `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
  it.each([
    [page('<meta name="generator" content="WordPress 6.6.2">'), "wordpress"],
    [page('<link rel="https://api.w.org/" href="https://x.example/wp-json/">'), "wordpress"],
    [page('<link href="/wp-content/themes/t/style.css" rel="stylesheet">'), "wordpress"],
    [page('<meta name="generator" content="Wix.com Website Builder">'), "wix"],
    [
      page(
        "",
        '<div id="SITE_CONTAINER"><img src="https://static.wixstatic.com/media/a~mv2.jpg"></div>',
      ),
      "wix",
    ],
    [page('<meta content="Webflow" name="generator">', '<html data-wf-page="1">'), "webflow"],
    [page("", '<img src="https://framerusercontent.com/images/x.jpg">'), "framer"],
    [page('<meta name="generator" content="Carrd">'), "carrd"],
    [page("<!-- This is Squarespace. -->"), "squarespace"],
    [page("<title>Hand-made</title>", "<h1>Hello</h1>"), "generic"],
  ])("%#: detects %s", (html, platform) => {
    expect(detectPlatform(html).platform).toBe(platform);
  });

  it("reads the REST API root and the generator", () => {
    const d = detectPlatform(
      page(
        '<meta name="generator" content="WordPress 6.6.2"><link rel="https://api.w.org/" href="https://x.example/?rest_route=/">',
      ),
    );
    expect(d.generator).toBe("WordPress 6.6.2");
    expect(d.wpApi).toBe("https://x.example/?rest_route=/");
    expect(d.evidence.length).toBeGreaterThan(1);
  });

  it("parses --platform spellings", () => {
    expect(parsePlatform("WordPress")).toBe("wordpress");
    expect(parsePlatform("url")).toBe("generic");
    expect(parsePlatform("myspace")).toBeUndefined();
  });
});

describe("HTML helpers", () => {
  it("picks the smallest rendition as large as the stored size, else the original upload", () => {
    const set = parseSrcset(
      "https://x.example/wp-content/uploads/a-300x200.jpg 300w, https://x.example/wp-content/uploads/a-2048x1365.jpg 2048w, https://x.example/wp-content/uploads/a-2560x1707.jpg 2560w, https://x.example/wp-content/uploads/a-4000x2667.jpg 4000w",
    );
    const best = bestRendition(undefined, set, "https://x.example");
    expect(best?.url).toMatch(/a-2560x1707\.jpg$/);
    expect(best?.alternates[0]).toMatch(/a-2048x1365\.jpg$/);
    // Renditions that stop short of the stored size: the original upload first.
    const small = bestRendition(
      undefined,
      parseSrcset(
        "https://x.example/wp-content/uploads/b-300x200.jpg 300w, https://x.example/wp-content/uploads/b-1024x683.jpg 1024w",
      ),
      "https://x.example",
    );
    expect(small?.url).toBe("https://x.example/wp-content/uploads/b.jpg");
    expect(small?.alternates[0]).toMatch(/b-1024x683\.jpg$/);
    expect(focalFromObjectPosition("object-position: 30% 20%")).toEqual([0.3, 0.2]);
    expect(focalFromObjectPosition("object-position: top right")).toEqual([1, 0]);
    expect(focalFromObjectPosition("object-position: center")).toBeUndefined();
    expect(wpOriginal("https://x.example/wp-content/uploads/2024/01/a-1024x683.jpg")).toBe(
      "https://x.example/wp-content/uploads/2024/01/a.jpg",
    );
  });

  it("asks Wix's CDN for a 2400px rendition of the original", () => {
    const best = bestRendition(
      "https://static.wixstatic.com/media/8776bf_abc~mv2.jpg/v1/fill/w_980,h_600,al_c,q_85/8776bf_abc~mv2.jpg",
      [],
      "https://site.example",
    );
    expect(best?.url).toBe(
      "https://static.wixstatic.com/media/8776bf_abc~mv2.jpg/v1/fit/w_2400,h_2400,q_90/8776bf_abc~mv2.jpg",
    );
    expect(best?.alternates).toHaveLength(2);
  });

  it("reads colors and fonts from CSS (custom properties, Google Fonts, buttons)", () => {
    const css = `:root{--wp--preset--color--base:#fbf7f0;--brand:#b5532a}
      body{background:var(--wp--preset--color--base);color:#2b2118;font-family:"Source Sans 3",sans-serif}
      h1{font-family:'Playfair Display',serif;font-weight:600;font-size:3.5rem}
      .wp-element-button{background-color:var(--brand);border-radius:999px}
      /* google-fonts: https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Source+Sans+3 */`;
    const t = themeFromCss(css);
    expect(t.siteBackground).toBe("#fbf7f0");
    expect(t.colors.accent).toBe("#b5532a");
    expect(t.fonts.heading).toEqual({ family: "Playfair Display", weight: 600 });
    expect(t.fonts.body?.family).toBe("Source Sans 3");
    expect(t.buttons.shape).toBe("pill");
    expect(googleFontFamilies(css)).toEqual(["Playfair Display", "Source Sans 3"]);
  });

  it("knows which classes the CSS hides on desktop", () => {
    const hidden = hiddenClassesFromCss(
      ".mobile-only{display:none} @media (max-width:767px){.mobile-only{display:block}} @media (min-width:992px){.hide-desktop{display:none}} .nav-open{display:none}",
    );
    expect([...hidden].sort()).toEqual(["hide-desktop", "mobile-only"]);
  });

  it("un-spaces letter-spaced menu labels", () => {
    expect(unspace("H O M E")).toBe("HOME");
    expect(unspace("Our story")).toBe("Our story");
  });

  it("drops boilerplate and keeps the header menu, footer and main content apart", () => {
    const p = parseHtmlPage(
      `<html lang="fr"><head><title>Atelier — Maison Lune</title><meta property="og:site_name" content="Maison Lune"></head><body>
      <div class="cookie-banner"><p>We use cookies</p></div>
      <header><a href="/"><img src="/logo.png" alt="Maison Lune" width="200" height="60"></a>
        <nav><ul><li><a href="/">Accueil</a></li><li><a href="/atelier">Atelier</a></li><li><a href="/contact" class="btn">Réserver</a></li></ul></nav></header>
      <main><h1>Atelier</h1><p>Céramiques faites main à Lyon.</p><aside><p>Sidebar</p></aside></main>
      <footer><p>© Maison Lune</p><a href="https://instagram.com/maisonlune">Instagram</a></footer></body></html>`,
      "https://maisonlune.example/atelier",
    );
    expect(p.title).toBe("Atelier");
    expect(p.siteName).toBe("Maison Lune");
    expect(p.lang).toBe("fr");
    expect(p.header.nav.map((n) => (n.type === "link" ? n.label : n.label))).toEqual([
      "Accueil",
      "Atelier",
    ]);
    expect(p.header.action).toEqual({ label: "Réserver", href: "/contact" });
    expect(p.header.logo?.url).toBe("https://maisonlune.example/logo.png");
    const all = JSON.stringify(p.sections);
    expect(all).toContain("Céramiques faites main");
    expect(all).not.toContain("cookies");
    expect(all).not.toContain("Sidebar");
    expect(p.social).toEqual(["https://instagram.com/maisonlune"]);
    expect(JSON.stringify(p.footer)).toContain("© Maison Lune");
  });
});

describe("WordPress content", () => {
  const ctx = () => ({ attachments: new Map(), notices: [] as never[], where: "/x" });

  it("drops block comments, keeps static markup, marks latest-posts", () => {
    const html = wpRawToHtml(
      `<!-- wp:heading --><h2 class="wp-block-heading">Hi</h2><!-- /wp:heading -->\n<!-- wp:latest-posts {"postsToShow":3} /-->\n<!-- wp:site-title /-->`,
      ctx(),
    );
    expect(html).not.toContain("<!--");
    expect(html).toContain('<h2 class="wp-block-heading">Hi</h2>');
    expect(html).toContain("wp-block-latest-posts");
  });

  it("paragraphs classic text and expands [caption], [gallery] and bare video URLs", () => {
    const c = {
      attachments: new Map([
        ["1", { url: "https://x.example/a.jpg", alt: "A" }],
        ["2", { url: "https://x.example/b.jpg" }],
      ]),
      notices: [] as { message: string }[],
      where: "/x",
    };
    const html = wpRawToHtml(
      `First line\nsecond line\n\n[caption id="c" width="300"]<img src="https://x.example/a.jpg" alt="A"> A caption[/caption]\n\n[gallery ids="1,2"]\n\nhttps://youtu.be/aBcDeFgHiJk\n\n[contact-form-7 id="9"]`,
      c as never,
    );
    expect(html).toContain("<p>First line<br />\nsecond line</p>");
    expect(html).toMatch(/<figcaption>[\s\S]*A caption[\s\S]*<\/figcaption>/);
    expect(html).toContain('class="wp-block-gallery"');
    expect(html).toContain("wp-block-embed");
    expect(html).not.toContain("contact-form-7");
    expect(c.notices[0]?.message).toContain("[contact-form-7]");
  });

  it("decodes WordPress entities", () => {
    expect(decodeEntities("Rosa&#8217;s &amp; Gus &hellip;")).toBe("Rosa’s & Gus …");
    expect(autop("")).toBe("");
  });
});

describe("importing the Fernhill WordPress fixture (REST API + WXR export)", () => {
  let r: ImportResult;
  const urls: string[] = [];
  beforeAll(async () => {
    r = await importSite({
      url: FERNHILL_URL,
      config: CONFIG,
      fetch: fernhillFetch({ log: { urls } }),
      wxr: readFileSync(FERNHILL_EXPORT, "utf8"),
      delayMs: 0,
      now: NOW,
    });
  });

  it("ends phone-ready: nothing left for the Phone check to fix automatically", () => {
    expect(phoneCheck(r.doc).filter((i) => i.autofix)).toEqual([]);
    // What phoneReady does when there is something to fix: phone-only, and reported.
    const doc = structuredClone(r.doc);
    const s = Object.values(doc.pages).flatMap((p) => p.sections)[0];
    if (!s) throw new Error("section");
    s.style.padding = { d: "3xl", m: "3xl" };
    doc.styles.choices.density = "airy";
    expect(phoneCheck(doc).some((i) => i.rule === "phone-padding")).toBe(true);
    const fixed = phoneReady({ doc, report: "# Import report\n" });
    expect(phoneCheck(fixed.doc).some((i) => i.rule === "phone-padding")).toBe(false);
    expect(fixed.doc.pages).not.toBe(doc.pages);
    expect(fixed.report).toMatch(/## Phones[\s\S]*desktop design is unchanged/);
    expect(phoneReady({ doc: r.doc, report: "x" }).doc).toBe(r.doc);
  });

  it("detects WordPress and produces a valid document", () => {
    expect(r.site.platform).toBe("wordpress");
    expect(r.detection?.evidence).toContain("WordPress REST API link");
    expectValid(r);
  });

  it("reads pages from the REST API (cart skipped, posts page becomes the collection)", () => {
    expect(
      Object.values(r.doc.pages)
        .map((p) => p.slug)
        .sort(),
    ).toEqual(["", "about", "about/team", "classes", "contact"]);
    expect(pageBySlug(r, "about").title).toBe("About & story");
    expect(urls.some((u) => u.includes("/wp-json/wp/v2/pages"))).toBe(true);
    expect(r.build.notices.some((n) => n.kind === "commerce" && n.where === "/cart")).toBe(true);
  });

  it("maps Gutenberg blocks: cover → hero preset, columns → cards, gallery, pullquote, latest posts", () => {
    const home = pageBySlug(r, "");
    const hero = home.sections[0];
    expect(hero?.preset).toBe("hero/full-bleed-photo@1");
    expect(hero?.style.background?.type).toBe("image");
    const heading = hero?.blocks.find((b) => b.type === "heading");
    expect(heading?.fields).toMatchObject({
      text: "Slow bread from a small oven",
      level: "h1",
      eyebrow: "Since 2019",
      subheading: "Naturally leavened loaves, baked every morning in Fernhill.",
    });
    expect(hero?.blocks.filter((b) => b.type === "button").map((b) => b.fields.label)).toEqual([
      "Book a class",
      "Our story",
    ]);
    expect(types(home)).toEqual(
      expect.arrayContaining(["columns", "gallery", "testimonial", "summary"]),
    );
    const summary = blocksOf(home).find((b) => b.type === "summary");
    expect(summary?.fields.source).toMatchObject({ collection: "news" });
    expect(home.seo).toMatchObject({
      title: "Fernhill Bakery – Sourdough in Fernhill",
      description: "Naturally leavened bread and pastries, baked every morning.",
    });
  });

  it("maps images, lists, embeds, separators, tables, media-text and details", () => {
    const about = pageBySlug(r, "about");
    expect(types(about)).toEqual(["text", "image", "text", "video", "line", "table"]);
    const img = blocksOf(about).find((b) => b.type === "image");
    expect(img?.fields.caption).toBe("The team on a Saturday morning");
    expect((img?.fields.image as { src: string } | undefined)?.src).toMatch(
      /\/team-[a-z0-9]{4}\.png$/,
    ); // the original upload, not a rendition
    const table = blocksOf(about).find((b) => b.type === "table");
    expect(table?.fields).toMatchObject({ caption: "Daily loaves", corner: "Loaf" });
    const team = pageBySlug(r, "about/team");
    expect(team.sections[0]?.layout).toMatchObject({ mode: "stack", columns: { d: [6, 6] } });
    expect(types(pageBySlug(r, "classes"))).toEqual(["text", "accordion", "button"]);
    const contact = pageBySlug(r, "contact");
    expect(types(contact)).toEqual(["text", "form", "map"]);
    const form = blocksOf(contact).find((b) => b.type === "form")?.fields.form as {
      fields: { type: string; label: string }[];
      submitLabel: string;
    };
    expect(form.fields.map((f) => f.type)).toEqual(["text", "email", "select", "textarea"]);
    expect(form.submitLabel).toBe("Send message");
    expect(contact.seo?.noindex).toBe(true);
  });

  it("turns posts into the journal with authors, terms, featured images, Yoast SEO and drafts from the export", () => {
    const news = r.doc.collections.news as Record<string, { frontmatter: Record<string, unknown> }>;
    expect(Object.keys(news).sort()).toEqual(["our-first-loaf", "rye-season", "winter-menu"]);
    const first = news["our-first-loaf"]?.frontmatter;
    expect(first).toMatchObject({
      date: "2025-03-14",
      author: "Rosa Lind",
      categories: ["baking"],
      tags: ["sourdough"],
      excerpt: "How a stubborn starter became a bakery.",
      imageAlt: "Flour-dusted loaf",
    });
    expect(String(first?.image)).toMatch(/first-loaf-hero-1536x1024/);
    expect(news["winter-menu"]?.frontmatter).toMatchObject({ status: "draft", date: "2025-11-20" });
    expect(r.doc.collectionConfigs?.news?.kind).toBe("blog");
  });

  it("keeps old permalinks and archives working with redirects", () => {
    expect(r.build.redirects).toEqual(
      expect.arrayContaining([
        { from: "/2025/03/our-first-loaf", to: "/news/our-first-loaf/" },
        { from: "/category/baking", to: "/news/category/baking/" },
        { from: "/tag/sourdough", to: "/news/tag/sourdough/" },
      ]),
    );
  });

  it("reads navigation, logo, footer and look from the home page", () => {
    const nav = r.doc.site.nav;
    expect(nav.map((n) => n.label)).toEqual([
      "Home",
      "About",
      "Classes",
      "News",
      "Contact",
      "Book a class",
    ]);
    const about = nav[1] as { type: string; items: { label: string }[] };
    expect(about.type).toBe("folder");
    expect(about.items.map((i) => i.label)).toEqual(["Our story", "The team"]);
    expect(r.doc.site.logo?.alt).toBe("Fernhill Bakery");
    expect(r.doc.site.title).toBe("Fernhill Bakery");
    expect(r.doc.site.locale).toBe("en-GB");
    expect(r.doc.styles.choices.pairing).toBe("playfair-source-sans");
    expect(r.doc.styles.choices.palette.brand).toBe("#b5532a");
    expect(r.doc.styles.choices.buttons).toBe("pill-solid");
    expect(JSON.stringify(r.doc.site.footer)).toContain("14 Mill Lane");
    expect(JSON.stringify(r.doc.site.footer)).not.toContain("Menu copy");
  });

  it("writes a WordPress report", () => {
    expect(r.report).toContain("(WordPress, WordPress 6.6.2)");
    expect(r.report).toContain("`openspace import wordpress`");
    expect(r.report).toContain("Sources: the WordPress REST API, the WordPress export (WXR)");
    expect(r.report).toMatch(
      /Shortcodes without an OpenSpace equivalent were removed: \[newsletter_signup\]/,
    );
    expect(r.report).toContain("Plugins and what they do");
    expect(r.report).toContain("/openspace:migrate https://fernhill.example");
  });
});

describe("WordPress without a public REST API", () => {
  it("falls back to reading HTML and says so", async () => {
    const r = await importSite({
      url: FERNHILL_URL,
      config: CONFIG,
      fetch: fernhillFetch({ restApi: false }),
      platform: "wordpress",
      delayMs: 0,
      now: NOW,
      offline: true,
    });
    expect(r.site.platform).toBe("wordpress");
    expect(r.report).toContain("REST API isn't public");
    expect(SiteDocumentSchema.safeParse(r.doc).success).toBe(true);
  });
});

describe("importing the Tidewater fixture (any site: Webflow-style HTML)", () => {
  let r: ImportResult;
  const urls: string[] = [];
  beforeAll(async () => {
    r = await importSite({
      url: TIDEWATER_URL,
      config: CONFIG,
      fetch: tidewaterFetch({ log: { urls } }),
      delayMs: 0,
      now: NOW,
    });
  });

  it("detects Webflow, uses the generic importer and produces a valid document", () => {
    expect(r.site.platform).toBe("webflow");
    expect(r.report).toContain("`openspace import url`");
    expectValid(r);
  });

  it("crawls the sitemap and honours robots.txt", () => {
    expect(urls).toContain(`${TIDEWATER_URL}/sitemap.xml`);
    expect(urls.some((u) => u.endsWith("/private-draft"))).toBe(false);
    expect(
      Object.values(r.doc.pages)
        .map((p) => p.slug)
        .sort(),
    ).toEqual(["", "about", "contact", "services", "services/brand-identity"]);
  });

  it("recreates landing-page sections with the closest presets", () => {
    const home = pageBySlug(r, "");
    expect(home.sections.map((s) => s.preset)).toEqual([
      "hero/full-bleed-photo@1",
      "services/image-cards@1",
      "gallery/grid@1",
      "testimonials/large-single@1",
      "cta/banner@1",
    ]);
    const hero = home.sections[0];
    expect(hero?.blocks[0]?.fields).toMatchObject({
      eyebrow: "Falmouth, Cornwall",
      text: "Design for businesses by the sea",
      level: "h1",
    });
    expect(hero?.blocks.slice(1).map((b) => b.fields.role)).toEqual(["primary", "secondary"]);
    const cards = blocksOf(home).find((b) => b.type === "columns");
    expect((cards?.fields.items as unknown[] | undefined)?.length).toBe(3);
    const gallery = blocksOf(home).find((b) => b.type === "gallery");
    expect((gallery?.fields.images as unknown[] | undefined)?.length).toBe(4);
    const people = blocksOf(home)
      .filter((b) => b.type === "testimonial")
      .map((b) => [b.fields.name, b.fields.role]);
    expect(people).toEqual([
      ["Morwenna Pascoe", "Quay Café"],
      ["Jago Hicks", "Fal Charters"],
    ]);
  });

  it("keeps columns, drops desktop-hidden copies, reads FAQs, tables, video, forms and maps", () => {
    const about = pageBySlug(r, "about");
    expect(about.sections[1]?.layout).toMatchObject({ columns: { d: [7, 5] } });
    expect(JSON.stringify(about)).not.toContain("mobile copy");
    expect(types(about)).toContain("accordion");
    expect(types(pageBySlug(r, "services"))).toEqual(["text", "table", "video"]);
    const contact = pageBySlug(r, "contact");
    const form = blocksOf(contact).find((b) => b.type === "form")?.fields.form as {
      name: string;
      fields: { type: string; label: string; options?: string[] }[];
    };
    expect(form.name).toBe("Project enquiry");
    expect(form.fields.map((f) => f.type)).toEqual([
      "text",
      "email",
      "select",
      "textarea",
      "checkbox",
    ]);
    expect(form.fields[2]?.options).toEqual(["Under £3k", "£3k and up"]);
    expect(JSON.stringify(contact)).not.toContain("Oops");
    expect(types(contact)).toContain("map");
  });

  it("groups blog posts into a collection with dates and authors", () => {
    const journal = r.doc.collections.journal as Record<
      string,
      { frontmatter: Record<string, unknown>; body: string }
    >;
    expect(Object.keys(journal).sort()).toEqual(["new-sign-for-quay-cafe", "tide-tables"]);
    expect(journal["new-sign-for-quay-cafe"]?.frontmatter).toMatchObject({
      date: "2025-06-02",
      author: "Ellie Tregear",
      tags: ["signage"],
    });
    expect(journal["tide-tables"]?.frontmatter).toMatchObject({
      date: "2025-08-15",
      author: "Sam Rowe",
    });
    expect(journal["tide-tables"]?.body).not.toContain("# Designing tide tables");
  });

  it("reads navigation (folders, call to action), footer, scripts and the look", () => {
    const labels = r.doc.site.nav.map((n) => n.label);
    expect(labels).toEqual(
      expect.arrayContaining(["About", "Services", "Journal", "Start a project"]),
    );
    expect(r.doc.site.nav.find((n) => n.label === "Start a project")?.type).toBe("button");
    expect(r.doc.site.title).toBe("Tidewater Studio");
    expect(r.doc.site.social?.map((s) => s.network)).toEqual(["instagram", "linkedin"]);
    expect(r.doc.styles.choices.pairing).toBe("dm-serif-dm-sans");
    expect(r.doc.styles.choices.palette.brand).toBe("#0f6e7a");
    expect(r.site.customCode).toEqual(["plausible.io"]);
    expect(r.report).toContain("Webflow interactions and animations were not copied");
  });

  it("finds pages by following links when there is no sitemap", async () => {
    const r2 = await importSite({
      url: TIDEWATER_URL,
      config: CONFIG,
      fetch: tidewaterFetch({ sitemap: false }),
      platform: "generic",
      delayMs: 0,
      now: NOW,
      offline: true,
    });
    expect(Object.values(r2.doc.pages).map((p) => p.slug)).toEqual(
      expect.arrayContaining(["", "about", "contact", "services"]),
    );
    expect(r2.report).toContain("No sitemap");
  });
});

describe("importSite dispatch", () => {
  it("sends Squarespace sites to the Squarespace importer", async () => {
    const r = await importSite({
      url: JUNIPER_URL,
      config: CONFIG,
      fetch: juniperFetch(),
      delayMs: 0,
      now: NOW,
      offline: true,
    });
    expect(r.site.platform).toBe("squarespace");
    expect(r.detection?.platform).toBe("squarespace");
    expect(r.report).toContain("`openspace import squarespace`");
  });

  it("parses whole documents without a browser", () => {
    expect(parseDocument("<p>hi</p>").tagName).toBe("html");
  });
});
