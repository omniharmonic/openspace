import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureBlocks } from "./__fixtures__/blocks";
import { IDS, must, siteFixture } from "./__fixtures__/site";
import { behaviorsInHtml } from "./behaviors-manifest";
import { behaviorsForPage, jsonForScript, pageTitle, renderPageHtml } from "./html";
import { AboveFoldContext, Img } from "./image";
import { registerBlocks, unregisterBlocks } from "./registry";
import { BASE_CSS } from "./styles/base-css";

beforeAll(() => registerBlocks(fixtureBlocks));
afterAll(() => unregisterBlocks());

describe("renderPageHtml", () => {
  const doc = siteFixture();
  const out = renderPageHtml({ doc, pageId: IDS.home, basePath: "/maya-yoga" });

  it("produces a complete document with SEO head", () => {
    expect(out.startsWith('<!doctype html>\n<html lang="en-US">')).toBe(true);
    expect(out).toContain("<title>Maya Yoga — Slow, grounded yoga in Boulder.</title>");
    expect(out).toContain('<meta name="description" content="Slow, grounded yoga in Boulder.">');
    expect(out).toContain('<link rel="canonical" href="https://maya.github.io/maya-yoga/">');
    expect(out).toContain(
      '<meta property="og:image" content="https://maya.github.io/maya-yoga/media/2026/10/hero-k3f9.jpg">',
    );
    expect(out).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(out).toContain('<link rel="icon" href="/maya-yoga/media/2026/10/favicon.png">');
    expect(out).not.toContain("noindex");
  });

  it("inlines token CSS, base CSS and custom CSS and loads the pairing's fonts", () => {
    expect(out).toContain('<style data-os="tokens">/* OpenSpace design tokens.');
    expect(out).toContain(`<style data-os="base">${BASE_CSS}</style>`);
    expect(out).toContain(
      '<style data-os="custom">.os-header__title { letter-spacing: 0.01em; }</style>',
    );
    expect(out).toContain("https://fonts.googleapis.com/css2?family=Fraunces");
    const linked = renderPageHtml({
      doc,
      pageId: IDS.home,
      fontStylesheets: ["/_os/fonts.css"],
      stylesheets: { base: "/_os/os.css", tokens: "/_os/tokens.css" },
    });
    expect(linked).toContain('<link rel="stylesheet" href="/_os/os.css">');
    expect(linked).not.toContain("fonts.googleapis.com");
    expect(linked).not.toContain('<style data-os="base">');
  });

  it("emits behavior scripts only for behaviors on the page, plus the beacon in production", () => {
    const used = behaviorsInHtml(out);
    expect(used).toEqual(["reveal", "menu", "announcement", "beacon"]);
    expect(out).toContain('<link rel="modulepreload" href="/maya-yoga/_os/behaviors/reveal.js">');
    expect(out).toContain(
      '<script type="module" src="/maya-yoga/_os/behaviors/os-behaviors.js"></script>',
    );
    expect(out).not.toContain("carousel.js");
    expect(out).toContain('data-os-hub="https://hub.openspace.host"');
    expect(out).toContain(`data-os-site="${IDS.site}"`);
  });

  it("ships no React runtime", () => {
    expect(out).not.toMatch(/\breact(-dom)?\b|data-reactroot|hydrateRoot|__NEXT_DATA__/i);
    const scripts = [...out.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
    expect(scripts.map((s) => s[1]?.trim()).filter(Boolean)).toEqual([
      "document.documentElement.classList.add('os-js')",
    ]);
  });

  it("preview mode is noindex and has no analytics", () => {
    const preview = renderPageHtml({ doc, pageId: IDS.home, mode: "preview" });
    expect(preview).toContain('<meta name="robots" content="noindex">');
    expect(preview).not.toContain("beacon");
  });

  it("uses the title template, custom domain, JSON-LD and head/footer injection safely", () => {
    const d = siteFixture();
    d.config.deploy.customDomain = "mayayoga.com";
    d.site.headInjection = '<meta name="x-owner" content="1">';
    d.site.footerInjection = "<!-- footer -->";
    const html = renderPageHtml({
      doc: d,
      pageId: IDS.about,
      jsonLd: { "@type": "Organization", name: "</script><script>alert(1)</script>" },
    });
    expect(html).toContain("<title>About — Maya Yoga</title>");
    expect(html).toContain('<link rel="canonical" href="https://mayayoga.com/about/">');
    expect(html).toContain(
      '<script type="application/ld+json">{"@type":"Organization","name":"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"}</script>',
    );
    expect(html).toContain('<meta name="x-owner" content="1">');
    expect(html).toContain("<!-- footer -->\n</body>");
  });

  it("adds a page's own head/footer code after the site's, only on that page", () => {
    const d = siteFixture();
    d.site.headInjection = '<meta name="x-site" content="1">';
    d.site.footerInjection = "<!-- site footer -->";
    const about = must(d.pages[IDS.about]);
    about.headInjection = '<link rel="preconnect" href="https://cal.example">';
    about.footerInjection = "<!-- about footer -->";
    const html = renderPageHtml({ doc: d, pageId: IDS.about });
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head.indexOf('<meta name="x-site"')).toBeLessThan(
      head.indexOf('<link rel="preconnect" href="https://cal.example">'),
    );
    expect(html).toContain("<!-- site footer --><!-- about footer -->\n</body>");
    const home = renderPageHtml({ doc: d, pageId: IDS.home });
    expect(home).not.toContain("cal.example");
    expect(home).not.toContain("about footer");
  });

  it("self-hosts uploaded fonts with @font-face and a preload, dropping unused web fonts", () => {
    const d = siteFixture();
    d.styles = {
      ...d.styles,
      choices: { ...d.styles.choices, headingFont: "Studio Grotesk", bodyFont: "Studio Grotesk" },
      fonts: [
        {
          family: "Studio Grotesk",
          category: "sans-serif",
          files: [
            { src: "media/fonts/studio-grotesk-400-1a2b3c4d.woff2", weight: 400, style: "normal" },
            { src: "media/fonts/studio-grotesk-700-5e6f7a8b.woff2", weight: 700, style: "normal" },
          ],
          license: { webUse: true },
        },
      ],
    };
    const html = renderPageHtml({ doc: d, pageId: IDS.home, basePath: "/maya" });
    expect(html).toContain('<style data-os="fonts">@font-face{font-family:"Studio Grotesk";');
    expect(html).toContain('url("/maya/media/fonts/studio-grotesk-700-5e6f7a8b.woff2")');
    expect(html).toMatch(
      /<link rel="preload" as="font" type="font\/woff2" href="\/maya\/media\/fonts\/studio-grotesk-[0-9a-z-]+\.woff2" crossorigin>/,
    );
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).toContain('--os-font-heading: "Studio Grotesk"');
  });

  it("detects behaviors from a document or from HTML", () => {
    const d = siteFixture();
    const home = must(d.pages[IDS.home]);
    must(home.sections[0]).blocks.push({
      id: "blk_ga11ery001",
      type: "gallery",
      v: 1,
      column: 1,
      variant: "carousel",
      fields: { images: [{ image: { src: "media/2026/10/hero-k3f9.jpg", alt: "Studio" } }] },
    });
    expect(behaviorsForPage({ doc: d, pageId: IDS.home, mode: "preview" })).toEqual([
      "carousel",
      "lightbox",
      "reveal",
      "menu",
      "announcement",
    ]);
    expect(behaviorsForPage('<div data-os-behavior="tabs  accordion bogus"></div>')).toEqual([
      "accordion",
      "tabs",
    ]);
  });

  it("escapes script-breaking JSON", () => {
    expect(jsonForScript({ a: "<" })).toBe('{"a":"\\u003c"}');
  });

  it("titles pages via SEO title first", () => {
    const d = siteFixture();
    const about = must(d.pages[IDS.about]);
    about.seo = { title: "Meet Maya" };
    expect(pageTitle(d, about)).toBe("Meet Maya");
  });

  it("resolves og:image from the image map against the origin (no doubled base path)", () => {
    const d = siteFixture();
    const mapped = renderPageHtml({
      doc: d,
      pageId: IDS.home,
      basePath: "/maya-yoga",
      imageMap: {
        "media/2026/10/hero-k3f9.jpg": {
          src: "/maya-yoga/_astro/hero.hash.jpg",
          width: 1200,
          height: 630,
        },
      },
    });
    expect(mapped).toContain(
      '<meta property="og:image" content="https://maya.github.io/maya-yoga/_astro/hero.hash.jpg">',
    );
    const raw = renderPageHtml({ doc: d, pageId: IDS.home, basePath: "/maya-yoga" });
    expect(raw).toContain(
      '<meta property="og:image" content="https://maya.github.io/maya-yoga/media/2026/10/hero-k3f9.jpg">',
    );
    const remote = renderPageHtml({
      doc: d,
      pageId: IDS.home,
      imageMap: {
        "media/2026/10/hero-k3f9.jpg": {
          src: "https://cdn.example.com/h.jpg",
          width: 1,
          height: 1,
        },
      },
    });
    expect(remote).toContain('content="https://cdn.example.com/h.jpg"');
  });
});

describe("published page details", () => {
  it("picks the first two images of a section in reading order, background first", async () => {
    const { leadImages } = await import("./section");
    const section = {
      style: { background: { type: "image", src: "media/bg.jpg" } },
      layout: { mode: "stack", columns: { d: [6, 6] } },
      blocks: [
        {
          id: "b1",
          type: "image",
          column: 1,
          fields: { image: { src: "media/right.jpg", alt: "" } },
        },
        {
          id: "b2",
          type: "image",
          column: 0,
          fields: { image: { src: "media/left.jpg", alt: "" } },
        },
      ],
    } as never;
    expect([...leadImages(section)]).toEqual(["media/bg.jpg", "media/left.jpg"]);
    const grid = {
      style: {},
      layout: {
        mode: "grid",
        items: { b2: { d: { x: 0, y: 0, w: 12, h: 4 } }, b3: { d: { x: 12, y: 0, w: 12, h: 4 } } },
      },
      blocks: [
        { id: "b1", type: "image", fields: { image: { src: "media/unplaced.jpg", alt: "" } } },
        { id: "b3", type: "image", fields: { image: { src: "media/right.jpg", alt: "" } } },
        { id: "b2", type: "image", fields: { image: { src: "media/left.jpg", alt: "" } } },
      ],
    } as never;
    // Placed blocks in reading order first; one without a layout item comes after them.
    expect([...leadImages(grid)]).toEqual(["media/left.jpg", "media/right.jpg"]);
    // Phones may stack the grid differently: their first image leads (mobile LCP), then the
    // desktop one.
    const phoneFirst = {
      ...(grid as object),
      layout: {
        mode: "grid",
        items: {
          b2: { d: { x: 0, y: 0, w: 12, h: 4 }, m: { x: 0, y: 5, w: 8, h: 4 } },
          b3: { d: { x: 12, y: 0, w: 12, h: 4 }, m: { x: 0, y: 0, w: 8, h: 4 } },
          b4: { d: { x: 0, y: 5, w: 12, h: 4 }, m: { x: 0, y: 9, w: 8, h: 4 } },
        },
      },
      blocks: [
        { id: "b4", type: "image", fields: { image: { src: "media/third.jpg", alt: "" } } },
        { id: "b3", type: "image", fields: { image: { src: "media/right.jpg", alt: "" } } },
        { id: "b2", type: "image", fields: { image: { src: "media/left.jpg", alt: "" } } },
      ],
    } as never;
    expect([...leadImages(phoneFirst)]).toEqual(["media/right.jpg", "media/left.jpg"]);
  });

  it("gives sites without a tab icon an inline monogram (no /favicon.ico 404)", () => {
    const doc = siteFixture();
    const bare = { ...doc, site: { ...doc.site, favicon: null } } as typeof doc;
    const html = renderPageHtml({ doc: bare, pageId: IDS.home });
    const icon = /<link rel="icon" href="(data:image\/svg\+xml,[^"]+)">/.exec(html)?.[1];
    expect(icon).toBeDefined();
    expect(decodeURIComponent(icon ?? "")).toContain(">M</text>");
  });

  it("loads the images the first section picked eagerly at high priority; the rest lazily", () => {
    const img = (src: string) =>
      createElement(Img, { src: `https://example.com/${src}.jpg`, alt: "" });
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(
          AboveFoldContext.Provider,
          { value: new Set(["https://example.com/a.jpg", "https://example.com/b.jpg"]) },
          img("a"),
          img("b"),
          img("c"),
        ),
        img("d"),
      ),
    );
    const tags = [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
    expect(tags.map((t) => /loading="(\w+)"/.exec(t)?.[1])).toEqual([
      "eager",
      "eager",
      "lazy",
      "lazy",
    ]);
    expect(
      tags.map((t) => t.includes('fetchPriority="high"') || t.includes('fetchpriority="high"')),
    ).toEqual([true, true, false, false]);
  });
});
