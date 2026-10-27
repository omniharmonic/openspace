import { type ComponentDefinition, fromMarkdown } from "@omniharmonic/openspace-schema";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IDS, siteFixture } from "./__fixtures__/site";
import { componentPreview } from "./component";
import { renderPageHtml } from "./html";
import { PageView } from "./page";

const reveal: ComponentDefinition = {
  name: "split-reveal",
  label: "Split reveal",
  version: 1,
  fields: {
    eyebrow: { kind: "text", optional: true },
    headline: { kind: "text" },
    body: { kind: "richText", optional: true },
    photo: { kind: "image" },
    cta: { kind: "link", optional: true },
    ctaLabel: { kind: "text", optional: true },
    tint: { kind: "color", optional: true },
    items: { kind: "list", fields: { title: { kind: "text" }, link: { kind: "link" } } },
  },
  defaults: {
    headline: "Slow mornings",
    photo: { src: "media/2026/10/hero-k3f9.jpg", alt: "A window", width: 1600, height: 2000 },
    items: [{ title: "About", link: { type: "page", page: IDS.about } }],
  },
  template: `<section class="sr" style="--tint: {{color tint}}" aria-labelledby="{{@uid}}-h">
  {{#if eyebrow}}<p class="sr__eyebrow">{{eyebrow}}</p>{{/if}}
  <h2 id="{{@uid}}-h">{{headline}}</h2>
  {{rich body class="sr__body"}}
  {{image photo sizes="(max-width: 767px) 100vw, 50vw" aspect="4:5"}}
  {{#if cta}}{{button cta label=ctaLabel}}{{/if}}
  <ul>{{#each items}}<li><a href="{{href link}}" class="sr__link">{{title}}</a></li>{{/each}}</ul>
  <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M0 0L10 10" stroke-width="2" /></svg>
</section>`,
  css: `:scope { --tint: var(--os-color-accent); }
.sr h2 { animation: rise 600ms both; }
@keyframes rise { from { opacity: 0 } }
@media (prefers-reduced-motion: reduce) { .sr h2 { animation: none } }`,
  js: `if (ctx.reducedMotion) return;
root.classList.add("is-ready");`,
};

function docWith() {
  const base = siteFixture();
  const { doc, page } = componentPreview(
    { ...base, components: { [reveal.name]: reveal } },
    reveal.name,
    {
      fields: {
        ...reveal.defaults,
        eyebrow: "Since <2019>",
        body: fromMarkdown("Tea **after** class."),
        cta: { type: "url", url: "https://cal.com/maya" },
        ctaLabel: "Book",
        tint: "accent-600",
      },
    },
  );
  return { doc, page };
}

describe("custom components in the renderer", () => {
  it("renders an instance through the one renderer with escaping, images, links and buttons", () => {
    const { doc, page } = docWith();
    const html = renderPageHtml({ doc, pageId: page.id, basePath: "/maya-yoga" });
    expect(html).toContain('class="os-c os-c--split-reveal" data-os-component="split-reveal"');
    expect(html).toContain("Since &lt;2019&gt;");
    expect(html).toContain("<strong>after</strong>");
    expect(html).toMatch(/<img[^>]+width="\d+"[^>]+height="\d+"/);
    expect(html).toContain('href="/maya-yoga/about/"');
    expect(html).toContain("os-button os-button--primary");
    expect(html).toContain('href="https://cal.com/maya"');
    expect(html).toContain("--tint:var(--os-color-accent-600)");
    expect(html).toContain('viewBox="0 0 10 10"');
    expect(html).toContain('stroke-width="2"');
    const id = page.sections[0]?.blocks[0]?.id as string;
    expect(html).toContain(`id="${id}-h"`);
  });

  it("puts scoped CSS in the head once and behaviour JS after the content", () => {
    const { doc, page } = docWith();
    const html = renderPageHtml({ doc, pageId: page.id });
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain('<style data-os="components">');
    expect(head).toContain(".os-c--split-reveal{--tint:var(--os-color-accent)}");
    expect(head).toContain("@keyframes os-c-split-reveal-rise");
    const body = html.slice(html.indexOf("<body"));
    expect(body).toContain('<script type="module" data-os-component-js="split-reveal">');
    expect(body).toContain('root.classList.add("is-ready")');
    expect(body).toContain("reducedMotion");
  });

  it("pages without components are unchanged (no component CSS or JS)", () => {
    const html = renderPageHtml({ doc: siteFixture(), pageId: IDS.home });
    expect(html).not.toContain("data-os-component");
    expect(html).not.toContain('data-os="components"');
  });

  it("the Studio canvas gets the CSS inline and never the JS", () => {
    const { doc, page } = docWith();
    const html = renderToStaticMarkup(
      createElement(PageView, { doc, page: page.id, mode: "editor" }),
    );
    expect(html).toContain('<style data-os-component-css="split-reveal">');
    expect(html).not.toContain("<script");
  });

  it("explains a missing or broken component outside production and drops it in production", () => {
    const { doc, page } = docWith();
    const broken = {
      ...doc,
      components: { [reveal.name]: { ...reveal, template: "<div>{{nope}}</div>" } },
    };
    const preview = renderPageHtml({ doc: broken, pageId: page.id, mode: "preview" });
    expect(preview).toContain("has a problem in its code");
    const prod = renderPageHtml({ doc: broken, pageId: page.id });
    expect(prod).not.toContain("has a problem");
    expect(prod).not.toContain("data-os-component=");
    const none = renderPageHtml({
      doc: { ...doc, components: {} },
      pageId: page.id,
      mode: "preview",
    });
    expect(none).toContain("no designer section called");
  });
});
