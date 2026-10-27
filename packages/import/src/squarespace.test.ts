import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRobots, robotsAllows, SiteFetcher } from "./fetch";
import { htmlToRichText } from "./map/richtext";
import { colorThemeFor } from "./map/sections";
import { fontCategory, nearestPairing } from "./map/theme";
import { slugify } from "./map/urls";
import { cleanImageUrl, videoUrl } from "./squarespace/blocks";
import { normalizeIso } from "./squarespace/crawl";
import { parseFluidCss, parsePage, sectionsFromLayoutHtml } from "./squarespace/page";
import { hslTripletToHex, parseTheme } from "./squarespace/theme";
import type { SqBlock } from "./squarespace/types";
import { parseWxr } from "./squarespace/wxr";
import { composePage, FIXTURE_DIR, JUNIPER_URL, juniperFetch } from "./testing";

const fixture = (f: string) => readFileSync(join(FIXTURE_DIR, f), "utf8");
const kinds = (blocks: SqBlock[]) => blocks.map((b) => b.kind);

describe("page HTML (Squarespace 7.1)", () => {
  const home = parsePage(composePage("home.html"));

  it("reads metadata, header, navigation and footer", () => {
    expect(home.version).toBe("7.1");
    expect(home.title).toBe("Juniper Ceramics");
    expect(home.seo.description).toMatch(/Small-batch stoneware/);
    expect(home.seo.image?.url).toBe(
      "https://images.squarespace-cdn.com/content/v1/64jun1per/hero-kiln.jpg",
    );
    expect(home.header.logo).toMatchObject({ alt: "Juniper Ceramics" });
    expect(home.header.layout).toBe("navRight");
    expect(home.header.action).toEqual({ label: "Book a class", href: "/workshops" });
    expect(home.header.nav).toEqual([
      { type: "link", label: "About", href: "/about-us" },
      {
        type: "folder",
        label: "Classes",
        items: [
          { label: "Workshops", href: "/workshops" },
          { label: "Events", href: "/events" },
        ],
      },
      { type: "link", label: "Journal", href: "/journal" },
      { type: "link", label: "Shop", href: "/shop" },
      { type: "link", label: "Contact", href: "/contact" },
      {
        type: "link",
        label: "Etsy",
        href: "https://www.etsy.com/shop/juniperceramics",
        newTab: true,
      },
    ]);
    expect(home.footer).toHaveLength(1);
    expect(home.social).toContain("https://www.youtube.com/@juniperceramics.example");
    expect(home.customHeadCode).toMatch(/studioAnalytics/);
    expect(home.stylesheets.some((s) => s.includes("site.css"))).toBe(true);
  });

  it("reads Fluid Engine sections with desktop and mobile placements", () => {
    const hero = home.sections[0];
    expect(hero?.theme).toBe("black");
    expect(hero?.height).toBe("large");
    expect(hero?.background?.image?.url).toMatch(/hero-kiln\.jpg$/);
    expect(hero?.background?.image?.focal).toEqual([0.5, 0.4]);
    expect(hero?.background?.overlay).toBe(0.2);
    expect(hero?.layout.mode).toBe("fluid");
    if (hero?.layout.mode !== "fluid") return;
    expect(hero.layout.rows).toBe(14);
    expect(hero.layout.items.map((i) => [i.block.kind, i.d, i.m])).toEqual([
      ["text", { x: 1, y: 3, w: 14, h: 7, z: 1 }, { x: 1, y: 2, w: 8, h: 6, z: 1 }],
      ["button", { x: 1, y: 11, w: 6, h: 2, z: 2 }, { x: 1, y: 9, w: 5, h: 2, z: 2 }],
    ]);
  });

  it("reads classic rows, gallery and list sections and every block kind", () => {
    const [, split, gallery, list, misc] = home.sections;
    expect(
      split?.layout.mode === "classic" &&
        split.layout.rows[0]?.columns.map((c) => [c.span, kinds(c.blocks)]),
    ).toEqual([
      [7, ["image"]],
      [5, ["text", "button"]],
    ]);
    const g =
      gallery?.layout.mode === "classic"
        ? gallery.layout.rows[0]?.columns[0]?.blocks[0]
        : undefined;
    expect(g).toMatchObject({ kind: "gallery", layout: "grid" });
    if (g?.kind === "gallery") {
      expect(g.images).toHaveLength(4);
      expect(g.images[0]).toMatchObject({
        alt: "A row of speckled mugs",
        caption: "Speckled mugs",
      });
      expect(g.images[2]?.alt).toBe(""); // file-name alt text is dropped
    }
    const cards = list?.layout.mode === "classic" ? list.layout.rows[0]?.columns[0]?.blocks : [];
    expect(kinds(cards ?? [])).toEqual(["text", "cards"]);
    const all =
      misc?.layout.mode === "classic"
        ? misc.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))
        : [];
    expect(kinds(all)).toEqual([
      "summary",
      "newsletter",
      "video",
      "quote",
      "code",
      "spacer",
      "line",
      "unknown",
    ]);
    expect(all[0]).toMatchObject({
      kind: "summary",
      collectionPath: "/journal",
      heading: "From the journal",
    });
    expect(all[1]).toMatchObject({
      heading: "Kiln notes, monthly",
      buttonLabel: "Sign Up",
      placeholder: "Email address",
    });
    expect(all[2]).toEqual({
      kind: "video",
      url: "https://www.youtube.com/watch?v=Jun1perTour",
      title: "A tour of the studio",
    });
    expect(all[3]).toEqual({
      kind: "quote",
      text: "The best class I have taken in years — patient, funny and very muddy.",
      source: "Priya, spring course",
    });
    expect(all[4]).toMatchObject({ kind: "code" });
    expect(all[7]).toMatchObject({ kind: "unknown", type: "menu" });
  });

  it("reads forms from the form context JSON and maps from data-block-json", () => {
    const contact = parsePage(composePage("contact.html"));
    const blocks = contact.sections.flatMap((s) =>
      s.layout.mode === "classic"
        ? s.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))
        : [],
    );
    const form = blocks.find((b) => b.kind === "form");
    expect(form?.kind === "form" && form.form).toMatchObject({
      name: "Studio enquiry",
      submitLabel: "Send enquiry",
      successMessage: "Thanks — we'll be in touch.",
    });
    if (form?.kind === "form") {
      expect(form.form.fields.map((f) => f.type)).toEqual([
        "name",
        "email",
        "phone",
        "select",
        "textarea",
        "checkbox",
        "hidden",
        "likert",
        "other",
      ]);
      expect(form.form.fields[3]?.options).toEqual(["Classes", "Commissions", "Wholesale"]);
    }
    expect(blocks.find((b) => b.kind === "map")).toEqual({
      kind: "map",
      lat: 45.5231,
      lng: -122.6765,
      zoom: 15,
      name: "Juniper Ceramics",
      address: "210 Alder Street, Portland, OR 97204, United States",
    });
  });

  it("reads item pages: article metadata and body layout", () => {
    const post = parsePage(composePage("first-firing-of-spring.html"));
    expect(post.item).toMatchObject({
      title: "First firing of spring",
      author: "Ana Ruiz",
      date: "2025-03-14T09:30:00-0700",
    });
    const product = parsePage(composePage("speckled-mug.html"));
    expect(product.item?.jsonLd.find((j) => j["@type"] === "Product")).toMatchObject({
      offers: { price: 38, sku: "JC-MUG-12" },
    });
    expect(parsePage(composePage("members-corner.html")).locked).toBe("password");
  });

  it("splits plain HTML bodies around images and embeds", () => {
    const [section] = sectionsFromLayoutHtml(
      '<p>One</p><p><img src="https://images.squarespace-cdn.com/a/b.jpg" alt="B"></p><p>Two <a href="/x">x</a></p><iframe src="https://www.youtube.com/embed/abc"></iframe>Tail text',
    );
    const blocks =
      section?.layout.mode === "classic" ? (section.layout.rows[0]?.columns[0]?.blocks ?? []) : [];
    expect(kinds(blocks)).toEqual(["text", "image", "text", "video", "text"]);
    expect(blocks[3]).toEqual({ kind: "video", url: "https://www.youtube.com/watch?v=abc" });
  });
});

describe("Fluid Engine CSS", () => {
  it("separates mobile and desktop placements and strips the gutter track", () => {
    const { placements, rows } = parseFluidCss(`
      .fe-x { grid-template-rows: repeat(8,minmax(24px,auto)); }
      .fe-block-a { grid-area: 1/2/3/10; z-index: 1; }
      @media (min-width: 768px) {
        .fe-x { grid-template-rows: repeat(20,minmax(1px,auto)); }
        .fe-block-a { grid-area: 4/14/9/26; z-index: 3; }
      }`);
    expect(rows).toEqual({ m: 8, d: 20 });
    expect(placements.get("a")).toEqual({
      m: { x: 1, y: 1, w: 8, h: 2, z: 1 },
      d: { x: 13, y: 4, w: 12, h: 5, z: 3 },
    });
  });
});

describe("theme", () => {
  it("reads the 7.1 palette, fonts, sizes and button shape", () => {
    const t = parseTheme(fixture("site.css"), [
      "primary-button-shape-pill",
      "primary-button-style-outline",
      "tweak-fixed-header",
    ]);
    expect(t.colors).toMatchObject({ accent: "#af5737", white: "#faf8f5" });
    expect(t.siteBackground).toBe("#faf8f5");
    expect(t.fonts).toEqual({
      heading: { family: "Fraunces", weight: 500 },
      body: { family: "Hanken Grotesk", weight: 400 },
    });
    expect(t.sizes.h1).toBe(3.6);
    expect(t.buttons).toEqual({ shape: "pill", style: "outline" });
    expect(t.headerFixed).toBe(true);
  });

  it("reads 7.0-style rules when there are no variables", () => {
    const t = parseTheme(
      "body{font-family:'Lora',serif;background-color:#1a1a1a} h1{font-family:\"Montserrat\"} a{color:rgb(200, 60, 40)}",
    );
    expect(t.fonts).toEqual({ body: { family: "Lora" }, heading: { family: "Montserrat" } });
    expect(t.siteBackground).toBe("#1a1a1a");
    expect(t.colors.accent).toBe("#c83c28");
  });

  it("converts HSL triplets and picks the nearest pairing", () => {
    expect(hslTripletToHex("0,0%,100%")).toBe("#ffffff");
    expect(hslTripletToHex("16,52.17%,45.1%")).toBe("#af5737");
    expect(
      nearestPairing({ heading: { family: "Fraunces" }, body: { family: "Hanken Grotesk" } })
        .pairing.id,
    ).toBe("fraunces-hanken");
    expect(
      nearestPairing({ heading: { family: "Playfair Display" }, body: { family: "Source Sans 3" } })
        .pairing.id,
    ).toBe("playfair-source-sans");
    // Unknown (Adobe) fonts: category match.
    expect(
      nearestPairing({ heading: { family: "freight-big-pro" }, body: { family: "proxima-nova" } })
        .pairing.heading.category,
    ).toBe("serif");
    expect(fontCategory("acumin-pro")).toBe("sans-serif");
    expect(fontCategory("Canela")).toBe("serif");
  });

  it("maps section themes to color themes", () => {
    expect(
      ["white", "light-bold", "dark", "black-bold", "bright", ""].map((t) => colorThemeFor(t)),
    ).toEqual(["light", "light-accent", "dark-accent", "dark", "brand", "light"]);
    expect(colorThemeFor("", true)).toBe("dark");
  });
});

describe("robots.txt", () => {
  const rules = parseRobots(fixture("robots.txt"));

  it("applies the * group, not named crawlers' rules", () => {
    expect(robotsAllows(rules, "/about-us")).toBe(true);
    expect(robotsAllows(rules, "/config/pages")).toBe(false);
    expect(robotsAllows(rules, "/journal?format=json")).toBe(false);
    expect(robotsAllows(rules, "/account")).toBe(false);
    expect(robotsAllows(rules, "/accounts")).toBe(true);
  });

  it("refuses disallowed URLs unless the owner explicitly allowed them", async () => {
    const plain = new SiteFetcher({ fetch: juniperFetch(), delayMs: 0 });
    await expect(plain.text(`${JUNIPER_URL}/journal?format=json`)).rejects.toThrow(/robots\.txt/);
    expect(plain.skippedByRobots).toHaveLength(1);
    const owner = new SiteFetcher({
      fetch: juniperFetch(),
      delayMs: 0,
      ownerAllows: (u) => u.searchParams.get("format") === "json",
    });
    expect(
      (await owner.json<{ items: unknown[] }>(`${JUNIPER_URL}/journal?format=json`))?.items,
    ).toHaveLength(2);
  });

  it("paces requests per host and retries on 429", async () => {
    const waits: number[] = [];
    let calls = 0;
    const f = new SiteFetcher({
      delayMs: 300,
      robots: false,
      sleep: async (ms) => {
        waits.push(ms);
      },
      fetch: async () => {
        calls++;
        return calls === 1
          ? new Response("", { status: 429, headers: { "retry-after": "2" } })
          : new Response("ok");
      },
    });
    expect((await f.text("https://a.example/x"))?.text).toBe("ok");
    expect(calls).toBe(2);
    expect(waits).toContain(2000);
  });
});

describe("WordPress export", () => {
  const wxr = parseWxr(fixture("export.xml"));
  it("reads posts with dates, authors, taxonomies, drafts and featured images", () => {
    const posts = wxr.items.filter((i) => i.postType === "post");
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      title: "First firing of spring",
      path: "/journal/2025/3/14/first-firing-of-spring",
      date: "2025-03-14T16:30:00Z",
      author: "Ana Ruiz",
      categories: ["Studio news"],
      tags: ["kiln"],
      image: "https://images.squarespace-cdn.com/content/v1/64jun1per/hero-kiln.jpg",
      status: "publish",
    });
    expect(posts[0]?.contentHtml).toMatch(/<h2>What we changed<\/h2>/);
    expect(posts[1]).toMatchObject({ status: "draft", slug: "notes-on-wedging" });
    expect(posts[1]?.date).toBeUndefined();
  });
  it("refuses files that are not WXR", () => {
    expect(() => parseWxr("<html></html>")).toThrow(/not a WordPress/);
  });
});

describe("rich text", () => {
  it("keeps structure and marks, maps paragraph styles and rewrites links", () => {
    const r = htmlToRichText(
      '<h1 style="text-align:center">Title</h1><p class="sqsrte-large" style="text-align:center">Big <strong>bold</strong> <a href="/old">link</a></p><ul><li><p>One</p></li><li><p>Two&nbsp;<em>it</em></p></li></ul><blockquote><p>Quote</p></blockquote><h6>Deep</h6><p><span style="font-weight:700">heavy</span><br>next</p>',
      (h) => (h === "/old" ? "/new" : undefined),
    );
    expect(r?.align).toBe("center");
    expect(r?.doc.content.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "bulletList",
      "blockquote",
      "heading",
      "paragraph",
    ]);
    expect(r?.doc.content[1]).toMatchObject({ attrs: { preset: "lead" } });
    expect(JSON.stringify(r?.doc)).toContain('"href":"/new"');
    expect(r?.doc.content[4]).toMatchObject({ attrs: { level: 4 } });
    expect(JSON.stringify(r?.doc.content[5])).toContain('"hardBreak"');
    expect(JSON.stringify(r?.doc.content[5])).toContain('"bold"');
  });
  it("drops links the rewriter refuses and returns undefined for empty HTML", () => {
    expect(
      JSON.stringify(htmlToRichText('<p><a href="/gone">text</a></p>', () => undefined)),
    ).not.toContain("link");
    expect(htmlToRichText("<p> </p><style>x{}</style>")).toBeUndefined();
  });
});

describe("helpers", () => {
  it("cleans CDN URLs, normalizes video URLs, dates and slugs", () => {
    expect(cleanImageUrl("//images.squarespace-cdn.com/content/v1/a/b.jpg?format=750w")).toBe(
      "https://images.squarespace-cdn.com/content/v1/a/b.jpg",
    );
    expect(videoUrl('src="https://www.youtube.com/embed/AbC_1?feature=oembed"')).toBe(
      "https://www.youtube.com/watch?v=AbC_1",
    );
    expect(videoUrl("https://player.vimeo.com/video/42")).toBe("https://vimeo.com/42");
    expect(normalizeIso("2025-03-14T09:30:00-0700")).toBe("2025-03-14T09:30:00-07:00");
    expect(normalizeIso("2025-03-14")).toBe("2025-03-14");
    expect(slugify("Über Café & Bar!")).toBe("uber-cafe-and-bar");
  });
});
