import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blocksRegistry } from "@omniharmonic/openspace-blocks";
import {
  type Block,
  findBrokenLinks,
  type Page,
  type SiteConfig,
  SiteDocumentSchema,
} from "@omniharmonic/openspace-schema";
import { loadSiteDocument } from "@omniharmonic/openspace-site-kit/content";
import { markdocToBlocks } from "@omniharmonic/openspace-site-kit/markdoc";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ImportResult, importSquarespace, REPORT_FILE, writeImport } from "./index";
import { JUNIPER_EXPORT, JUNIPER_URL, juniperFetch } from "./testing";

const CONFIG: SiteConfig = {
  siteId: "st_jvn1per000",
  schemaVersion: 1,
  template: { id: "starter", version: "1.0.0" },
  hub: "https://hub.openspace.host",
  deploy: { target: "github-pages", url: "https://example.github.io/juniper", customDomain: null },
  features: { forms: true, newsletter: false, analytics: false, search: true },
};
const NOW = new Date("2026-10-27T12:00:00Z");
const registry = blocksRegistry();

const pageBySlug = (r: ImportResult, slug: string) =>
  Object.values(r.doc.pages).find((p) => p.slug === slug) as Page;
const blocksOf = (p: Page): Block[] => p.sections.flatMap((s) => s.blocks);

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
  // Every media reference has its file and metadata.
  for (const path of Object.keys(r.doc.media)) expect(r.files.has(path), path).toBe(true);
  const refs = JSON.stringify(r.doc).match(/media\/[A-Za-z0-9_\-./]+\.[a-z0-9]+/g) ?? [];
  for (const ref of refs) expect(r.doc.media[ref as keyof typeof r.doc.media], ref).toBeDefined();
}

describe("importing the Juniper fixture (HTML and sitemap only)", () => {
  let r: ImportResult;
  const urls: string[] = [];
  beforeAll(async () => {
    r = await importSquarespace({
      url: JUNIPER_URL,
      config: CONFIG,
      fetch: juniperFetch({ urls }),
      delayMs: 0,
      now: NOW,
    });
  });

  it("produces a valid document with no dangling links", () => expectValid(r));

  it("honours robots.txt: never requests ?format=json without owner mode", () => {
    expect(urls.some((u) => u.includes("format=json"))).toBe(false);
    expect(urls[0]).toBe(`${JUNIPER_URL}/robots.txt`);
  });

  it("creates pages with their URLs, SEO and sections; /home folds into the home page", () => {
    expect(
      Object.values(r.doc.pages)
        .map((p) => p.slug)
        .sort(),
    ).toEqual(["", "about-us", "contact", "workshops"]);
    const about = pageBySlug(r, "about-us");
    expect(about.title).toBe("About");
    expect(about.seo?.description).toBe(
      "Meet Ana and Theo, the two potters behind Juniper Ceramics.",
    );
    expect(r.doc.site.redirects).toContainEqual({ from: "/home", to: "/", status: 301 });
    const home = pageBySlug(r, "");
    expect(home.seo?.image).toMatch(/^media\/2026\/10\/hero-kiln-/);
  });

  it("maps a Fluid Engine hero to a grid section with a legible photo background", () => {
    const hero = pageBySlug(r, "").sections[0];
    expect(hero?.layout.mode).toBe("grid");
    expect(hero?.style.colorTheme).toBe("dark");
    expect(hero?.style.background).toMatchObject({
      type: "image",
      focal: [0.5, 0.4],
      overlay: { color: "#000000" },
    });
    const bg = hero?.style.background;
    if (bg?.type === "image") expect(bg.overlay?.opacity).toBeGreaterThanOrEqual(0.5);
    expect(hero?.style.minHeight).toEqual({ d: "90vh", m: "70vh" });
    if (hero?.layout.mode === "grid") {
      const [text, button] = hero.blocks;
      expect(hero.layout.items[text?.id as Block["id"]]).toMatchObject({
        d: { x: 1, y: 3, w: 14, h: 7 },
        m: { x: 1, w: 8 },
      });
      expect(button).toMatchObject({
        type: "button",
        fields: { label: "Book a class", role: "primary" },
      });
      expect((button?.fields.link as { type: string } | undefined)?.type).toBe("page");
    }
    expect(r.build.notices.some((n) => /overlay was darkened from 20%/.test(n.message))).toBe(true);
  });

  it("maps classic columns, galleries, lists, summaries, newsletter, video, quote, code and unknown blocks", () => {
    const home = pageBySlug(r, "");
    const split = home.sections[1];
    expect(split?.layout).toMatchObject({
      mode: "stack",
      columns: { d: [7, 5], m: [12] },
      width: "wide",
    });
    expect(split?.blocks.map((b) => [b.type, b.column])).toEqual([
      ["image", 0],
      ["text", 1],
      ["button", 1],
    ]);
    const types = blocksOf(home).map((b) => b.type);
    expect(types).toEqual([
      "text",
      "button",
      "image",
      "text",
      "button",
      "gallery",
      "text",
      "columns",
      "summary",
      "newsletter",
      "video",
      "quote",
      "embed",
      "spacer",
      "line",
      "text",
    ]);
    const blocks = blocksOf(home);
    const text = blocks.find(
      (b) => b.type === "text" && JSON.stringify(b.fields).includes("curious"),
    );
    // Rich text: links rewritten to the new addresses (absolute same-site URLs too).
    expect(JSON.stringify(text?.fields)).toContain('"href":"/about-us/"');
    expect(JSON.stringify(text?.fields)).toContain('"href":"/shop/"');
    expect(blocks.find((b) => b.type === "summary")?.fields).toMatchObject({
      source: { collection: "journal" },
      heading: "From the journal",
    });
    expect(blocks.find((b) => b.type === "embed")?.fields).toMatchObject({
      embed: { type: "code" },
    });
    expect(blocks.find((b) => b.type === "gallery")).toMatchObject({
      variant: "grid",
      fields: { lightbox: true, showCaptions: true },
    });
    expect(r.doc.config.features.newsletter).toBe(true);
    // Portrait images are requested small enough to stay within 2400px.
    const vase = Object.values(r.doc.media).find((m) => m.path.includes("tall-vase"));
    expect(Math.max(vase?.width ?? 0, vase?.height ?? 0)).toBeLessThanOrEqual(2400);
  });

  it("recreates forms with matching fields and reports what it can't map", () => {
    const form = blocksOf(pageBySlug(r, "contact")).find((b) => b.type === "form");
    const f = form?.fields.form as {
      name: string;
      fields: { type: string; name: string; options?: string[] }[];
      submitLabel: string;
    };
    expect(f.name).toBe("Studio enquiry");
    expect(f.submitLabel).toBe("Send enquiry");
    expect(f.fields.map((x) => [x.type, x.name])).toEqual([
      ["text", "name"],
      ["email", "email"],
      ["phone", "phone"],
      ["select", "what_is_this_about"],
      ["textarea", "message"],
      ["checkbox", "newsletter"],
    ]);
    const messages = r.build.notices.map((n) => n.message).join("\n");
    expect(messages).toMatch(/hidden field \("Source"\)/);
    expect(messages).toMatch(/likert field/);
    expect(messages).not.toMatch(/section field/);
    expect(blocksOf(pageBySlug(r, "contact")).find((b) => b.type === "map")?.fields).toMatchObject({
      latitude: 45.5231,
      name: "Juniper Ceramics",
    });
  });

  it("downloads linked Squarespace files and points text links at them", () => {
    const about = JSON.stringify(pageBySlug(r, "about-us"));
    expect(about).toMatch(/"href":"\/media\/files\/juniper-price-list-[a-z0-9]{4}\.pdf"/);
    expect(about).toContain('"href":"tel:+1 503 555 0142"');
    expect(about).not.toContain("past-commissions");
    expect(
      r.build.notices.some((n) => n.kind === "link" && n.message.includes("/past-commissions")),
    ).toBe(true);
    const pdf = Object.values(r.doc.media).find((m) => m.kind === "file");
    expect(pdf).toMatchObject({ mime: "application/pdf", originalName: "juniper-price-list.pdf" });
  });

  it("builds navigation, header, footer, social profiles and the logo", () => {
    const nav = r.doc.site.nav;
    expect(nav.map((n) => n.type)).toEqual([
      "page",
      "folder",
      "collection",
      "collection",
      "page",
      "link",
      "button",
    ]);
    expect(nav[1]).toMatchObject({
      label: "Classes",
      items: [
        { type: "page", label: "Workshops" },
        { type: "collection", collection: "events" },
      ],
    });
    expect(r.doc.site.header).toMatchObject({ variant: "classic-left", sticky: true });
    expect(r.doc.site.footer.layout).toMatchObject({ mode: "stack", columns: { d: [5, 4, 3] } });
    expect(r.doc.site.footer.style.colorTheme).toBe("dark-accent");
    expect(r.doc.site.social?.map((s) => s.network)).toEqual(["instagram", "youtube"]);
    expect(r.doc.site.logo).toMatchObject({ alt: "Juniper Ceramics", width: 600, height: 180 });
    expect(r.doc.site.seo?.titleTemplate).toBe("%s — Juniper Ceramics");
  });

  it("imports blog, events and products from item pages, with redirects for changed URLs", () => {
    expect(Object.keys(r.doc.collections).sort()).toEqual(["events", "journal", "shop"]);
    const post = r.doc.collections.journal?.["first-firing-of-spring"];
    expect(post?.kind).toBe("blog");
    if (post?.kind === "blog") {
      expect(post.frontmatter).toMatchObject({
        title: "First firing of spring",
        date: "2025-03-14",
        author: "Ana Ruiz",
        status: "published",
      });
      expect(post.frontmatter.image).toMatch(/^media\//);
      expect(post.body).toContain("## What we changed");
      expect(post.body).toContain("[glaze notes](/journal/glaze-notes/)");
      expect(post.body).toContain('{% video source="embed"');
    }
    const ev = r.doc.collections.events?.["open-studio-day"];
    expect(ev?.kind === "events" && ev.frontmatter).toMatchObject({
      start: "2026-11-14T10:00:00-08:00",
      end: "2026-11-14T16:00:00-08:00",
      location: { name: "Juniper Ceramics" },
    });
    const mug = r.doc.collections.shop?.["speckled-mug"];
    expect(mug?.kind === "products" && mug.frontmatter).toMatchObject({
      price: { amount: 3800, currency: "USD" },
      sku: "JC-MUG-12",
    });
    expect(r.doc.collectionConfigs?.journal).toMatchObject({
      kind: "blog",
      list: { layout: "cards", sort: "date-desc" },
      feed: { enabled: true },
    });
    expect(r.doc.site.redirects).toEqual(
      expect.arrayContaining([
        {
          from: "/journal/2025/3/14/first-firing-of-spring",
          to: "/journal/first-firing-of-spring/",
          status: 301,
        },
        { from: "/shop/p/speckled-mug", to: "/shop/speckled-mug/", status: 301 },
      ]),
    );
  });

  it("approximates the look with Site Styles tokens", () => {
    expect(r.doc.styles.choices).toMatchObject({
      palette: { brand: "#af5737", neutral: "warm", source: "brand" },
      pairing: "fraunces-hanken",
      shape: "soft",
      buttons: "solid",
    });
  });

  it("reports what needs attention", () => {
    expect(r.report).toMatch(/^# Import report: Juniper Ceramics/);
    for (const heading of [
      "## Pages",
      "## Collections",
      "## Design",
      "## Needs attention",
      "## Redirects",
      "## Next steps",
    ])
      expect(r.report).toContain(heading);
    expect(r.report).toMatch(/Password-protected/);
    expect(r.report).toMatch(/Code Injection was found/);
    expect(r.report).toMatch(/Selling needs the Cloudflare target and Stripe/);
    expect(r.report).toMatch(/"menu" block has no direct OpenSpace equivalent/);
    expect(r.report).toMatch(/keep the Squarespace subscription until/);
  });
});

describe("owner mode and the WordPress export", () => {
  let r: ImportResult;
  const urls: string[] = [];
  beforeAll(async () => {
    r = await importSquarespace({
      url: JUNIPER_URL,
      config: CONFIG,
      fetch: juniperFetch({ urls }),
      delayMs: 0,
      now: NOW,
      owner: true,
      wxr: readFileSync(JUNIPER_EXPORT, "utf8"),
    });
  });

  it("produces a valid document", () => expectValid(r));

  it("reads ?format=json for collections, following pagination", () => {
    expect(urls).toContain(`${JUNIPER_URL}/journal?format=json&offset=1741969800000`);
    expect(Object.keys(r.doc.collections.journal ?? {}).sort()).toEqual([
      "first-firing-of-spring",
      "glaze-notes",
      "notes-on-wedging",
      "studio-opening",
    ]);
    const glaze = r.doc.collections.journal?.["glaze-notes"];
    expect(glaze?.frontmatter).toMatchObject({
      tags: ["glazes", "studio notes"],
      categories: ["process"],
      author: "Theo Marsh",
      date: "2025-05-02",
    });
    expect(r.doc.collectionConfigs?.journal?.taxonomies?.categories).toEqual(
      expect.arrayContaining([
        { slug: "process", label: "Process" },
        { slug: "studio-news", label: "Studio news" },
      ]),
    );
  });

  it("uses the WordPress export for full bodies and drafts", () => {
    const first = r.doc.collections.journal?.["first-firing-of-spring"];
    expect(first?.body).toContain("## What we changed");
    expect(first?.body).toContain("{% image");
    expect(first?.body).toContain("https://vimeo.com/123456789");
    const draft = r.doc.collections.journal?.["notes-on-wedging"];
    expect(draft?.frontmatter.status).toBe("draft");
  });

  it("reads product variants, sale prices and options, events with past items, and SEO titles", () => {
    const mug = r.doc.collections.shop?.["speckled-mug"];
    expect(mug?.kind).toBe("products");
    if (mug?.kind === "products") {
      expect(mug.frontmatter.price).toEqual({ amount: 3200, currency: "USD" });
      expect(mug.frontmatter.compareAtPrice).toEqual({ amount: 3800, currency: "USD" });
      expect(mug.frontmatter.options).toEqual([{ name: "Glaze", values: ["Oat", "Juniper"] }]);
      expect(mug.frontmatter.variants).toEqual([
        { sku: "JC-MUG-OAT", options: { Glaze: "Oat" } },
        {
          sku: "JC-MUG-JUN",
          options: { Glaze: "Juniper" },
          price: { amount: 4200, currency: "USD" },
          available: false,
        },
      ]);
      expect(mug.frontmatter.images).toHaveLength(2);
    }
    expect(Object.keys(r.doc.collections.events ?? {}).sort()).toEqual([
      "open-studio-day",
      "winter-market",
    ]);
    const ev = r.doc.collections.events?.["open-studio-day"];
    expect(ev?.kind === "events" && ev.frontmatter).toMatchObject({
      timezone: "America/Los_Angeles",
      location: { address: "210 Alder Street, Portland, OR 97204, United States" },
    });
    expect(pageBySlug(r, "about-us").seo?.title).toBe("Our story — two potters in Portland");
    expect(r.doc.site.social?.map((s) => s.network)).toEqual(["instagram", "pinterest", "youtube"]);
  });
});

describe("writing the import", () => {
  let dir = "";
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });
  it("writes content through the site-kit writer, media files and the report", async () => {
    dir = await mkdtemp(join(tmpdir(), "os-import-"));
    const r = await importSquarespace({
      url: JUNIPER_URL,
      config: CONFIG,
      fetch: juniperFetch(),
      delayMs: 0,
      now: NOW,
    });
    await writeImport(dir, r);
    const doc = await loadSiteDocument(dir);
    expect(Object.keys(doc.pages)).toHaveLength(4);
    expect(Object.keys(doc.collections.journal ?? {})).toHaveLength(2);
    for (const path of Object.keys(doc.media))
      expect((await stat(join(dir, path))).size).toBeGreaterThan(0);
    expect(await readFile(join(dir, REPORT_FILE), "utf8")).toBe(r.report);
  });
});
