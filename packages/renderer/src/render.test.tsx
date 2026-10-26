import { SiteDocumentSchema } from "@openspace/schema";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtureBlocks } from "./__fixtures__/blocks";
import { IDS, must, siteFixture } from "./__fixtures__/site";
import { BlockView } from "./block";
import { EditorContext, ImageResolverContext, RenderContext, type RenderMode } from "./context";
import { Header } from "./header";
import { Img } from "./image";
import { resolveLink } from "./link";
import { PageView } from "./page";
import { registerBlocks, unregisterBlocks } from "./registry";
import { RichText } from "./richtext";
import { SectionView } from "./section";

beforeAll(() => registerBlocks(fixtureBlocks));
afterAll(() => unregisterBlocks());

const doc = siteFixture();
const home = must(doc.pages[IDS.home]);
const hero = must(home.sections[0]);
const grid = must(home.sections[1]);

function html(el: ReactElement, mode: RenderMode = "production", basePath = "") {
  return renderToStaticMarkup(
    <RenderContext.Provider value={{ doc, page: home, mode, basePath, hubUrl: undefined }}>
      {el}
    </RenderContext.Provider>,
  );
}

/** Pretty-print for readable snapshots. */
const pretty = (s: string) => s.replace(/></g, ">\n<");

describe("fixture", () => {
  it("is a valid site document", () => {
    expect(SiteDocumentSchema.safeParse(doc).success).toBe(true);
  });
});

describe("SectionView", () => {
  it("renders a stack section (SSR snapshot)", () => {
    expect(pretty(html(<SectionView section={hero} />))).toMatchSnapshot();
  });

  it("renders a grid section (SSR snapshot)", () => {
    expect(pretty(html(<SectionView section={grid} />))).toMatchSnapshot();
  });

  it("emits stack columns with m ← t ← d inheritance", () => {
    const out = html(<SectionView section={hero} />);
    // d = [7,5]; t inherits d; m = [12]
    expect(out).toContain("--cols:minmax(0, 7fr) minmax(0, 5fr)");
    expect(out).toContain("--tcols:minmax(0, 7fr) minmax(0, 5fr)");
    expect(out).toContain("--mcols:minmax(0, 12fr)");
    // padding d=xl, t inherits xl, m=lg; min height only on d but inherited
    expect(out).toContain(
      "--pad:var(--os-space-xl);--tpad:var(--os-space-xl);--mpad:var(--os-space-lg)",
    );
    expect(out).toContain("--minh:80vh;--tminh:80vh;--mminh:80vh");
    // mobile order puts column 1 first
    expect(out).toMatch(/data-os-col="0" style="--mo:1"/);
    expect(out).toMatch(/data-os-col="1" style="--mo:0"/);
  });

  it("emits grid placements as inline vars; tablet inherits desktop; bleed uses full lines", () => {
    const out = html(<SectionView section={grid} />);
    expect(out).toContain(
      'data-os-item="blk_c1c1c1c1c1" style="--x:1;--y:1;--w:10;--h:8;--cs:full-start;--tx:1;--ty:1;--tw:10;--th:8;--tcs:full-start;--mx:1;--my:1;--mw:8;--mh:9"',
    );
    expect(out).toContain("--x:9;--y:5;--w:14;--h:10;--z:2;--tx:7;--ty:5;--tw:18;--th:10");
    // c3 has no m rect: stacked full width below the stored mobile placements
    expect(out).toMatch(/data-os-item="blk_c3c3c3c3c3" style="[^"]*--mx:1;--my:18;--mw:8;--mh:3"/);
    expect(out).toContain("--rows:16;--trows:16;--mrows:22");
    // DOM order follows desktop reading order: c1 (1,1), c3 (1,12), c2 (5,9)
    const order = [...out.matchAll(/data-os-item="(blk_\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual([IDS.c1, IDS.c3, IDS.c2]);
  });

  it("wraps sections in their color theme with data-os-id, background and reveal", () => {
    const out = html(<SectionView section={grid} />);
    expect(out).toContain('class="os-section os-theme-dark os-section--grid has-bg-image"');
    expect(out).toContain(`data-os-id="${IDS.grid}"`);
    expect(out).toContain('class="os-section__bg is-parallax" aria-hidden="true"');
    expect(out).toContain('style="--overlay:var(--os-color-neutral-950);--overlay-opacity:0.4"');
    const heroOut = html(<SectionView section={hero} />);
    expect(heroOut).toContain('id="welcome"');
    expect(heroOut).toContain('data-os-behavior="reveal" data-os-reveal="rise" data-os-stagger=""');
    expect(html(<SectionView section={hero} />, "editor")).not.toContain("data-os-reveal");
  });

  it("skips hidden sections except in the editor", () => {
    const hidden = { ...hero, hidden: true };
    expect(html(<SectionView section={hidden} />)).toBe("");
    expect(html(<SectionView section={hidden} />, "editor")).toContain("data-os-hidden");
  });

  it("renders color and gradient backgrounds as --bg", () => {
    const s = {
      ...hero,
      style: {
        background: { type: "gradient" as const, from: "accent-100", to: "#ffffff", angle: 90 },
      },
    };
    expect(html(<SectionView section={s} />)).toContain(
      "--bg:linear-gradient(90deg, var(--os-color-accent-100), #ffffff)",
    );
  });
});

describe("BlockView", () => {
  it("migrates older blocks, applies style slots and data-os-id", () => {
    const out = html(<BlockView block={must(hero.blocks[2])} />);
    expect(out).toContain(
      'class="os-block os-block--image os-align-center os-talign-center os-malign-start has-radius"',
    );
    expect(out).toContain("--radius:var(--os-radius-lg)");
    expect(out).toContain(`data-os-id="${IDS.image}"`);
  });

  it("renders unknown blocks as nothing in production and a notice in preview", () => {
    const block = { id: "blk_zzzzzzzzzz" as const, type: "mystery", v: 1, fields: {} };
    expect(html(<BlockView block={block} />)).toBe("");
    expect(html(<BlockView block={block} />, "preview")).toContain("Unknown block type");
  });

  it("flags invalid content in preview but renders best-effort in production", () => {
    const block = { ...must(hero.blocks[1]), fields: { label: "Go", link: { type: "nope" } } };
    expect(html(<BlockView block={block} />, "preview")).toContain("invalid content");
  });

  it("lets Studio wrap blocks and sections via EditorContext", () => {
    const out = html(
      <EditorContext.Provider
        value={{
          wrapBlock: ({ block, children }) => <div data-studio-block={block.id}>{children}</div>,
          wrapSection: ({ section, children }) => (
            <div data-studio-section={section.id}>{children}</div>
          ),
        }}
      >
        <SectionView section={hero} />
      </EditorContext.Provider>,
      "editor",
    );
    expect(out).toContain(`data-studio-section="${IDS.hero}"`);
    expect(out).toContain(`data-studio-block="${IDS.heading}"`);
  });
});

describe("Img", () => {
  it("uses the image map: picture sources, srcset, intrinsic size, placeholder", () => {
    const map = {
      "media/2026/10/hero-k3f9.jpg": {
        src: "/_astro/hero.hash.jpg",
        srcset: "/_astro/hero-640.jpg 640w, /_astro/hero-1280.jpg 1280w",
        sources: [
          {
            type: "image/avif",
            srcset: "/_astro/hero-640.avif 640w, /_astro/hero-1280.avif 1280w",
          },
          { type: "image/webp", srcset: "/_astro/hero-640.webp 640w" },
        ],
        width: 2400,
        height: 3000,
        placeholder: "data:image/webp;base64,AAAA",
      },
    };
    const out = html(
      <ImageResolverContext.Provider value={map}>
        <Img
          src="media/2026/10/hero-k3f9.jpg"
          alt="Studio"
          sizes="50vw"
          focal={[0.25, 0.75]}
          aspect="4:5"
          treatment="circle"
        />
      </ImageResolverContext.Provider>,
    );
    expect(out).toContain(
      '<source type="image/avif" srcSet="/_astro/hero-640.avif 640w, /_astro/hero-1280.avif 1280w" sizes="50vw"/>',
    );
    expect(out).toContain('src="/_astro/hero.hash.jpg"');
    expect(out).toContain('width="2400" height="3000"');
    expect(out).toContain("background-image:url(&quot;data:image/webp;base64,AAAA&quot;)");
    expect(out).toContain('class="os-img os-image-circle has-aspect"');
    expect(out).toContain("--aspect:4 / 5;--focal:25% 75%");
    expect(out).toContain('loading="lazy"');
  });

  it("falls back to the raw src with base path and media-library dimensions", () => {
    const out = html(<Img src="media/2026/10/hero-k3f9.jpg" alt="" />, "production", "/maya-yoga");
    expect(out).toContain('src="/maya-yoga/media/2026/10/hero-k3f9.jpg"');
    expect(out).toContain('width="2400" height="3000"');
    expect(out).not.toContain("<source");
  });

  it("builds a srcset for Unsplash URLs", () => {
    const out = html(
      <Img src="https://images.unsplash.com/photo-1?w=2400&q=80" alt="x" priority />,
    );
    expect(out).toMatch(
      /srcSet="https:\/\/images\.unsplash\.com\/photo-1\?w=480&amp;q=80&amp;auto=format&amp;fit=max 480w/,
    );
    expect(out).toContain("2400w");
    expect(out).toContain('loading="eager"');
    expect(out).toContain('fetchPriority="high"');
  });
});

describe("links", () => {
  const opts = { doc, basePath: "/maya-yoga", currentPageId: IDS.home };
  it("resolves every link type", () => {
    expect(resolveLink({ type: "page", page: IDS.about }, opts).href).toBe("/maya-yoga/about/");
    expect(resolveLink({ type: "page", page: IDS.home }, opts).href).toBe("/maya-yoga/");
    expect(resolveLink({ type: "page", page: IDS.home, anchor: "welcome" }, opts).href).toBe(
      "#welcome",
    );
    expect(resolveLink({ type: "page", page: "pg_missingpag1" }, opts)).toMatchObject({
      broken: true,
      href: "#",
    });
    expect(
      resolveLink({ type: "item", collection: "journal", slug: "opening-day" }, opts),
    ).toMatchObject({
      href: "/maya-yoga/journal/opening-day/",
      broken: true,
    });
    expect(resolveLink({ type: "url", url: "/schedule" }, opts).href).toBe("/maya-yoga/schedule");
    expect(
      resolveLink({ type: "url", url: "https://cal.com/maya", newTab: true }, opts),
    ).toMatchObject({
      href: "https://cal.com/maya",
      newTab: true,
      external: true,
    });
    expect(
      resolveLink({ type: "email", email: "hi@maya.com", subject: "Class & times" }, opts).href,
    ).toBe("mailto:hi@maya.com?subject=Class%20%26%20times");
    expect(resolveLink({ type: "phone", phone: "+1 (303) 555-0100" }, opts).href).toBe(
      "tel:+13035550100",
    );
    expect(resolveLink({ type: "file", src: "media/2026/10/menu.pdf" }, opts).href).toBe(
      "/maya-yoga/media/2026/10/menu.pdf",
    );
    expect(resolveLink({ type: "anchor", section: IDS.hero }, opts).href).toBe("#welcome");
    expect(resolveLink({ type: "anchor", section: IDS.aboutSection }, opts).href).toBe(
      `/maya-yoga/about/#${IDS.aboutSection}`,
    );
  });
});

describe("RichText", () => {
  it("renders presets, marks and base-aware links", () => {
    const out = html(
      <RichText
        doc={{
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2, preset: "display" },
              content: [{ type: "text", text: "Hi" }],
            },
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "bold link",
                  marks: [{ type: "link", attrs: { href: "/x", newTab: true } }, { type: "bold" }],
                },
                { type: "hardBreak" },
                {
                  type: "text",
                  text: "hl",
                  marks: [{ type: "highlight", attrs: { color: "accent-200" } }],
                },
              ],
            },
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }],
                },
              ],
            },
            {
              type: "blockquote",
              content: [
                {
                  type: "paragraph",
                  attrs: { preset: "lead" },
                  content: [{ type: "text", text: "q" }],
                },
              ],
            },
          ],
        }}
      />,
      "production",
      "/b",
    );
    expect(out).toBe(
      '<div class="os-rich"><h2 class="os-type-display">Hi</h2><p><a href="/b/x" target="_blank" rel="noopener"><strong>bold link</strong></a><br/><mark class="os-highlight" style="--hl:var(--os-color-accent-200)">hl</mark></p><ul><li><p>one</p></li></ul><blockquote><p class="os-type-lead">q</p></blockquote></div>',
    );
  });
});

describe("Header", () => {
  const variants = [
    "classic-left",
    "classic-center",
    "split-nav",
    "logo-center-nav-below",
    "minimal-burger",
    "stacked",
    "sidebar-drawer",
    "transparent-overlay",
  ] as const;

  it.each(variants)("renders the %s layout", (variant) => {
    const site = { ...doc.site, header: { ...doc.site.header, variant } };
    const out = html(<Header site={site} page={home} heroTheme="light-accent" />);
    expect(out).toContain(`os-header--${variant}`);
    expect(out).toContain('aria-expanded="false" aria-controls="os-menu"');
    expect(out).toContain('data-os-behavior="menu"');
    const drawer = variant === "minimal-burger" || variant === "sidebar-drawer";
    expect(/<nav class="os-nav[ "]/.test(out)).toBe(!drawer);
    if (variant === "split-nav") {
      expect(out).toContain("os-nav__list--start");
      expect(out).toContain("os-header__brand--split");
    }
    if (variant === "transparent-overlay")
      expect(out).toContain("is-overlay os-theme-light-accent".split(" ")[0]);
  });

  it("resolves nav: folders, hidden items, aria-current, buttons", () => {
    const out = html(<Header site={doc.site} page={home} />, "production", "/maya-yoga");
    expect(out).toContain(
      '<a class="os-nav__link" href="/maya-yoga/" aria-current="page">Home</a>',
    );
    expect(out).toContain('<details class="os-nav__folder" data-os-folder="">');
    expect(out).toContain('href="/maya-yoga/about/">About</a>');
    expect(out).toContain('href="/maya-yoga/journal/">Journal</a>');
    expect(out).toContain('href="https://instagram.com/mayayoga" target="_blank" rel="noopener"');
    expect(out).not.toContain("Old about");
    expect(out).toContain('class="os-button os-button--primary os-header__button"');
    expect(out).toContain("is-sticky");
    expect(out).toContain("has-menu-slide");
  });

  it("honours page overrides (hidden, transparent on hero)", () => {
    expect(html(<Header site={doc.site} page={{ ...home, header: { hidden: true } }} />)).toBe("");
    const out = html(
      <Header
        site={doc.site}
        page={{ ...home, header: { transparentOnHero: true } }}
        heroTheme="dark"
      />,
    );
    expect(out).toContain("os-theme-dark is-sticky is-overlay");
  });
});

describe("PageView", () => {
  it("renders announcement, header, main sections and footer", () => {
    const out = renderToStaticMarkup(<PageView doc={doc} page={IDS.home} basePath="/maya-yoga" />);
    expect(out).toContain('<a class="os-skip-link" href="#main">Skip to content</a>');
    expect(out).toContain('class="os-announcement os-theme-dark-accent"');
    expect(out).toContain('<main id="main" class="os-main" tabindex="-1">');
    expect(out).toContain('<footer class="os-footer">');
    expect(out).toContain(`data-os-id="${IDS.footer}"`);
    expect(out.indexOf(IDS.hero)).toBeLessThan(out.indexOf(IDS.grid));
  });
});
