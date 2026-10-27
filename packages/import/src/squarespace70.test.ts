/** Squarespace 7.0 layouts and 7.1 block settings found in production imports (hand-written markup). */
import type { Section } from "@omniharmonic/openspace-schema";
import { describe, expect, it } from "vitest";
import { parseHtmlFragment } from "./dom";
import { ensureHeading1 } from "./map/site";
import { parseBlock } from "./squarespace/blocks";
import { parsePage } from "./squarespace/page";
import { parseTheme } from "./squarespace/theme";

const IMG = "https://images.squarespace-cdn.com/content/v1/abc";

const page70 = `<!doctype html><html><head><title>Home — Fernway</title></head>
<body class="button-corner-style-pill collection-type-page">
<header id="header"><nav><div class="collection"><a href="/about">About</a></div></nav></header>
<div class="banner-thumbnail-wrapper has-description" data-content-field="main-image">
  <figure id="thumbnail"><img data-src="${IMG}/lake.jpeg" data-image-dimensions="1280x853" alt="Lake"/></figure>
  <div class="desc-wrapper"><p>Sustainability</p><p><strong>Starts with you</strong></p><p><a href="/about">Learn More</a></p></div>
</div>
<main id="page" role="main"><div id="content" class="main-content" data-content-field="main-content">
 <div class="sqs-layout sqs-grid-12 columns-12"><div class="row sqs-row"><div class="col sqs-col-12 span-12">
  <div class="sqs-block html-block sqs-block-html"><div class="sqs-block-content"><div class="sqs-html-content"><h1>We conserve land.</h1></div></div></div>
  <div class="sqs-block image-block sqs-block-image" data-definition-name="website.components.imageLayout"><div class="sqs-block-content">
   <figure class="sqs-block-image-figure design-layout-card image-position-left"><img data-src="${IMG}/bridge.jpeg" data-image-dimensions="959x719" alt=""/>
   <figcaption class="image-card-wrapper"><div class="image-card"><div class="image-title-wrapper"><div class="image-title"><p>About</p></div></div>
   <div class="image-subtitle-wrapper"><div class="image-subtitle"><p>Find out about our organization.</p></div></div>
   <div class="image-button-wrapper"><div class="image-button"><div class="image-button-inner"><a href="/about">Learn More</a></div></div></div></div></figcaption></figure>
  </div></div>
 </div></div></div>
</div></main>
<div id="preFooter"><div class="sqs-layout sqs-grid-12 columns-12"><div class="row sqs-row"><div class="col sqs-col-12 span-12">
 <div class="sqs-block newsletter-block sqs-block-newsletter" data-definition-name="website.components.newsletter"><div class="sqs-block-content"><div class="newsletter-form-header-title">Subscribe</div><form><input type="email" name="email"><button>Sign Up</button></form></div></div>
</div></div></div></div>
<footer id="footer"><div class="sqs-layout sqs-grid-12 columns-12"><div class="row sqs-row"><div class="col sqs-col-12 span-12"><div class="sqs-block html-block sqs-block-html"><div class="sqs-block-content"><div class="sqs-html-content"><p>Fernway<br/><br/>Made with <a href="https://www.squarespace.com/">Squarespace</a></p></div></div></div></div></div></div><div id="siteInfo"><span class="site-address">459 Broadway, New York</span><span class="site-phone">(212) 555-0123</span><a href="mailto:hi@x.example" class="site-email"><span>hi@x.example</span></a></div>
<div class="sqs-layout sqs-grid-12 columns-12"><div class="row sqs-row"><div class="col sqs-col-12 span-12"><div class="sqs-block html-block sqs-block-html"><div class="sqs-block-content"><div class="sqs-html-content"><p>Powered by <a href="https://www.squarespace.com">Squarespace</a></p></div></div></div></div></div></div></footer>
</body></html>`;

describe("Squarespace 7.0 pages", () => {
  const p = parsePage(page70);

  it("turns the page banner into a hero section", () => {
    const hero = p.sections[0];
    expect(hero?.role).toBe("hero");
    expect(hero?.background?.image?.url).toBe(`${IMG}/lake.jpeg`);
    const blocks = hero?.layout.mode === "classic" ? hero.layout.rows[0]?.columns[0]?.blocks : [];
    expect(blocks).toEqual([
      {
        kind: "heading",
        text: "Starts with you",
        level: 2,
        eyebrow: "Sustainability",
        align: "center",
      },
      { kind: "button", label: "Learn More", href: "/about", style: "primary" },
    ]);
  });

  it("puts image-card text beside the image in its own two-column row", () => {
    const body = p.sections[1];
    const rows = body?.layout.mode === "classic" ? body.layout.rows : [];
    const card = rows.find((r) => r.columns.length === 2);
    expect(card?.columns.map((c) => c.span)).toEqual([6, 6]);
    expect(card?.columns[0]?.blocks[0]?.kind).toBe("image");
    expect(card?.columns[1]?.blocks).toEqual([
      { kind: "heading", text: "Find out about our organization.", level: 2, eyebrow: "About" },
      { kind: "button", label: "Learn More", href: "/about", style: "primary" },
    ]);
  });

  it("keeps the pre-footer newsletter and the site info, drops the Squarespace credit", () => {
    const blocks = p.footer.flatMap((s) =>
      s.layout.mode === "classic"
        ? s.layout.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks))
        : [],
    );
    expect(blocks.map((b) => b.kind)).toEqual(["newsletter", "text", "text"]);
    const info = blocks[1] as { html: string };
    expect(info.html).toContain("459 Broadway, New York");
    expect(info.html).toContain('href="mailto:hi@x.example"');
    expect(JSON.stringify(blocks)).not.toMatch(/Powered by|Made with/);
    expect((blocks[2] as { html: string }).html).toContain("Fernway");
  });

  it("reads 7.0 fonts, the button color and the button shape", () => {
    const css = `.title,h1,h2{font-family:proxima-nova,"Helvetica Neue",sans-serif}
      .nav a{font-family:proxima-nova}
      body,p,.body-text{font-family:adobe-garamond-pro,serif}
      p{font-family:adobe-garamond-pro} .x{font-family:adobe-garamond-pro} .y{font-family:adobe-garamond-pro}
      .sqs-block-button-element{background-color:#36b3a8;color:#fff}
      .sqs-block-button-element:hover{background-color:#000}`;
    const t = parseTheme(css, ["button-corner-style-pill"]);
    expect(t.fonts.heading?.family).toBe("proxima-nova");
    expect(t.fonts.body?.family).toBe("adobe-garamond-pro");
    expect(t.colors.accent).toBe("#36b3a8");
    expect(t.buttons.shape).toBe("pill");
  });
});

describe("Squarespace 7.1 block settings", () => {
  const block = (html: string) => parseBlock(parseHtmlFragment(html).childNodes[0] as never);

  it("keeps a centred button centred", () => {
    expect(
      block(
        `<div class="sqs-block button-block sqs-block-button"><div class="sqs-block-content"><div class="sqs-block-button-container sqs-block-button-container--center"><a href="/shop" class="sqs-block-button-element">Shop Now</a></div></div></div>`,
      ),
    ).toMatchObject({ kind: "button", label: "Shop Now", align: "center" });
  });

  it("reads image-only product blocks as linked images", () => {
    expect(
      block(
        `<div class="sqs-block" data-definition-name="website.components.product"><div class="sqs-block-content"><div class="product-block sqs-block-product"><div class="product-block-content"><div class="image-container"><a href="/shop/p/dill"><img data-src="${IMG}/dill.jpeg" data-image-dimensions="750x750" alt="Dill Pickles"/></a></div><div class="productDetails"><a href="/shop/p/dill" class="product-title">Dill Pickles</a><div class="product-excerpt"><p>Lorem ipsum</p></div></div></div><style>#b { --product-block-display-title: none; --product-block-display-price: none; --product-block-display-excerpt: none; }</style></div></div></div>`,
      ),
    ).toMatchObject({ kind: "image", href: "/shop/p/dill", image: { url: `${IMG}/dill.jpeg` } });
  });
});

describe("pages without a Heading 1", () => {
  it("promote their first heading and keep its look", () => {
    const sections = [
      {
        id: "sec_aaaaaaaaaa",
        layout: { mode: "stack", columns: { d: [12] } },
        style: {},
        blocks: [
          {
            id: "blk_aaaaaaaaaa",
            type: "text",
            v: 1,
            fields: {
              content: {
                type: "doc",
                content: [
                  {
                    type: "heading",
                    attrs: { level: 3 },
                    content: [{ type: "text", text: "Our Story" }],
                  },
                ],
              },
            },
          },
        ],
      },
    ] as unknown as Section[];
    expect(ensureHeading1(sections)).toBe(true);
    expect(JSON.stringify(sections)).toContain('"level":1,"preset":"h3"');
    expect(ensureHeading1(sections)).toBe(false);
  });
});
