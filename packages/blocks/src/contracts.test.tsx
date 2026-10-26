// @vitest-environment happy-dom
import { BlockView, RenderContext, type RenderMode } from "@openspace/renderer";
import { type BehaviorFile, behaviorSourcePath } from "@openspace/renderer/node";
import type { AnyBlockDefinition, Block, SiteDocument } from "@openspace/schema";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HUB, page, SITE_ID, siteWith, stackSection } from "./__fixtures__/site";
import {
  accordionBlock,
  CODE_SANDBOX,
  embedBlock,
  FormSecurityContext,
  formBlock,
  galleryBlock,
  logoStripBlock,
  mapBlock,
  newsletterBlock,
  parseVideoUrl,
  planTiles,
  registerAll,
  SAME_ORIGIN_URL_SANDBOX,
  shapeBlock,
  shareButtonsBlock,
  snippetColors,
  snippetDocument,
  socialLinksBlock,
  tileCoords,
  tileUrlTemplate,
  URL_SANDBOX,
  videoBlock,
} from "./index";

/**
 * The renderer's real behavior modules, run against this library's markup. Loaded through the
 * renderer's public `./node` export (`behaviorSourcePath`) — the package has no browser-side
 * export for behavior *source* modules (`./behaviors/*` points at built `dist/` files).
 */
type Behavior = (el: HTMLElement) => void;
const behaviors: Partial<Record<BehaviorFile, Behavior>> = {};
const behavior = (name: BehaviorFile): Behavior => {
  const fn = behaviors[name];
  if (!fn) throw new Error(`behavior ${name} not loaded`);
  return fn;
};

const consoleError = console.error;
beforeAll(async () => {
  registerAll();
  for (const name of [
    "accordion",
    "carousel",
    "form",
    "lightbox",
    "newsletter",
    "video-lite",
  ] as const)
    behaviors[name] = ((await import(behaviorSourcePath(name))) as { default: Behavior }).default;
  // happy-dom reports every (deliberately disabled) iframe navigation; keep test output clean.
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes("Iframe page loading is disabled")) return;
    consoleError(...args);
  };
});
afterAll(() => {
  console.error = consoleError;
  vi.unstubAllGlobals();
});

function setup(blocks: Block[]) {
  const p = page("Contact", "contact", [stackSection(blocks)]);
  return { doc: siteWith([p]), page: p };
}

/** Render blocks into `document.body` the way the published page would contain them. */
function mount(
  blocks: Block[],
  opts: { mode?: RenderMode; turnstile?: string; doc?: SiteDocument } = {},
): HTMLElement {
  const { doc, page: p } = setup(blocks);
  const html = renderToStaticMarkup(
    <RenderContext.Provider
      value={{
        doc: opts.doc ?? doc,
        page: p,
        mode: opts.mode ?? "production",
        basePath: "",
        hubUrl: HUB,
      }}
    >
      <FormSecurityContext.Provider
        value={opts.turnstile ? { turnstileSiteKey: opts.turnstile } : {}}
      >
        {blocks.map((b) => (
          <BlockView key={b.id} block={b} />
        ))}
      </FormSecurityContext.Provider>
    </RenderContext.Provider>,
  );
  document.body.innerHTML = html;
  return document.body;
}

const create = (def: AnyBlockDefinition, init: Parameters<AnyBlockDefinition["create"]>[0] = {}) =>
  def.create(init);

const $ = <T extends Element = HTMLElement>(sel: string) => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el as unknown as T;
};
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  document.body.dataset.osSite = SITE_ID;
  document.body.dataset.osHub = HUB;
});

describe("form block", () => {
  it("compiles to a real HTML form posting to the Hub", () => {
    const block = create(formBlock);
    mount([block]);
    const form = $<HTMLFormElement>("form");
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe(`${HUB}/f/${SITE_ID}/frm_c0ntact0ne`);
    expect(form.dataset.osBehavior).toBe("form");
    expect(form.dataset.osSuccess).toMatch(/Thank you/);
    expect(form.dataset.osOwnerEmail).toBe("hello@juniperyoga.com");
    // Labels, required markers, error slots linked by aria-describedby
    const email = $<HTMLInputElement>('input[name="email"]');
    expect(email.type).toBe("email");
    expect(email.required).toBe(true);
    expect(email.autocomplete).toBe("email");
    expect($(`label[for="${email.id}"]`).textContent).toContain("Email");
    const errId = (email.getAttribute("aria-describedby") ?? "").split(" ").pop() ?? "";
    expect(document.getElementById(errId)?.classList.contains("os-field__error")).toBe(true);
    expect($('input[name="phone"]').getAttribute("type")).toBe("tel");
    expect($("textarea[name=message]").getAttribute("maxlength")).toBe("2000");
    expect($("select[name=topic]").querySelectorAll("option")).toHaveLength(5);
    // Spam protection and no-JS return path
    expect($('input[name="_hp"]').closest(".os-hp")?.getAttribute("aria-hidden")).toBe("true");
    expect($<HTMLInputElement>('input[name="_source"]').value).toBe("/contact/");
    expect($<HTMLInputElement>('input[name="_anchor"]').value).toBe(`${block.id}-sent`);
    expect(document.getElementById(`${block.id}-sent`)?.textContent).toMatch(/Thank you/);
    expect(document.querySelector("[data-os-turnstile]")).toBeNull();
    expect($('button[type="submit"]').textContent).toBe("Send message");
  });

  it("renders a Turnstile slot when a site key is configured", () => {
    mount([create(formBlock)], { turnstile: "0x4AAAAAAA-test" });
    expect($("[data-os-turnstile]").dataset.osTurnstile).toBe("0x4AAAAAAA-test");
  });

  it("renders radio, checkbox groups, multi-selects and dates; redirect success", () => {
    const block = create(formBlock, {
      fields: {
        form: {
          id: "frm_rsvp000000",
          name: "RSVP",
          fields: [
            {
              type: "radio",
              name: "attending",
              label: "Will you join us?",
              required: true,
              options: ["Yes", "No"],
            },
            {
              type: "checkbox",
              name: "meals",
              label: "Meals",
              required: true,
              options: ["Lunch", "Dinner"],
            },
            {
              type: "checkbox",
              name: "terms",
              label: "Agreements",
              required: true,
              options: ["I agree to the studio policy"],
            },
            {
              type: "select",
              name: "workshops",
              label: "Workshops",
              multiple: true,
              options: ["Breath", "Balance"],
            },
            { type: "date", name: "arrival", label: "Arrival", help: "Any day in May" },
          ],
          submitLabel: "RSVP",
          success: { type: "redirect", link: { type: "url", url: "/thanks" } },
        },
      },
    });
    mount([block]);
    expect(
      document.querySelectorAll('input[type="radio"][name="attending"][required]'),
    ).toHaveLength(2);
    expect($("fieldset legend").textContent).toContain("Will you join us?");
    expect(document.querySelectorAll('input[type="checkbox"][name="meals[]"]')).toHaveLength(2);
    // Required checkbox group: marked for the behavior/Hub; no native `required` (it would
    // demand every box) unless the group has a single option.
    expect($('fieldset[data-os-required-group="meals"]').dataset.osMessage).toMatch(/at least one/);
    expect(document.querySelectorAll('input[name="meals[]"][required]')).toHaveLength(0);
    expect(document.querySelectorAll('input[name="terms[]"][required]')).toHaveLength(1);
    expect($("select[multiple]").getAttribute("name")).toBe("workshops[]");
    const date = $<HTMLInputElement>('input[type="date"]');
    expect(date.getAttribute("aria-describedby")).toBe(`${date.id}-help ${date.id}-error`);
    expect($("form").dataset.osRedirect).toBe("/thanks");
    expect(document.querySelector('input[name="_anchor"]')).toBeNull();
  });

  it("works with the renderer's form behavior: inline errors, then async submit", async () => {
    mount([create(formBlock)]);
    const form = $<HTMLFormElement>("form");
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    behavior("form")(form);
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    const email = $<HTMLInputElement>('input[name="email"]');
    expect(email.getAttribute("aria-invalid")).toBe("true");
    const errId = (email.getAttribute("aria-describedby") ?? "").split(" ").pop() ?? "";
    expect(document.getElementById(errId)?.textContent).not.toBe("");
    expect(fetch).not.toHaveBeenCalled();

    $<HTMLInputElement>('input[name="name"]').value = "Ana";
    email.value = "ana@example.com";
    $<HTMLTextAreaElement>("textarea[name=message]").value = "Do you run classes for beginners?";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    await flush();
    expect(fetch).toHaveBeenCalledOnce();
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toBe(
      `${HUB}/f/${SITE_ID}/frm_c0ntact0ne`,
    );
    expect($(".os-form__status").dataset.state).toBe("success");
    expect($(".os-form__status").textContent).toMatch(/Thank you/);
  });
});

describe("newsletter block", () => {
  it("posts to the Hub's subscribe endpoint and confirms inline", async () => {
    mount([create(newsletterBlock)]);
    const form = $<HTMLFormElement>("form");
    expect(form.getAttribute("action")).toBe(`${HUB}/n/${SITE_ID}/subscribe`);
    expect($<HTMLInputElement>('input[name="_source"]').value).toBe("/contact/");
    const anchor = $<HTMLInputElement>('input[name="_anchor"]').value;
    expect(document.getElementById(anchor)?.textContent).toMatch(/check your inbox/);
    expect(document.querySelector('input[name="source"]')).toBeNull();
    expect(form.dataset.osBehavior).toBe("newsletter");
    const email = $<HTMLInputElement>('input[type="email"]');
    expect(email.required).toBe(true);
    expect($(`label[for="${email.id}"]`).textContent).toBe("Email address");
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    behavior("newsletter")(form);
    email.value = "sam@example.com";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    await flush();
    expect(fetch).toHaveBeenCalledOnce();
    expect($(".os-form__status").textContent).toMatch(/check your inbox/);
  });
});

describe("accordion block", () => {
  it("uses native details, exclusive groups and FAQPage JSON-LD", () => {
    const block = create(accordionBlock, {
      fields: { ...accordionBlock.create().fields, exclusive: true, openFirst: true },
    });
    mount([block]);
    const items = document.querySelectorAll<HTMLDetailsElement>("details.os-accordion__item");
    expect(items).toHaveLength(4);
    expect(items[0]?.open).toBe(true);
    expect(items[0]?.getAttribute("name")).toBe(`${block.id}-group`);
    expect(items[1]?.id).toBe(`${block.id}-q2`);
    const root = $(".os-accordion");
    expect(root.dataset.osBehavior).toBe("accordion");
    expect(root.hasAttribute("data-os-exclusive")).toBe(true);
    const ld = JSON.parse($('script[type="application/ld+json"]').textContent ?? "{}");
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity[1]).toEqual({
      "@type": "Question",
      name: "What should I bring?",
      acceptedAnswer: { "@type": "Answer", text: expect.stringContaining("Mats, blocks") },
    });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    behavior("accordion")(root);
    ($("#" + `${block.id}-q2` + " summary") as HTMLElement).click();
    expect(items[0]?.open).toBe(false);
  });

  it("can omit structured data", () => {
    mount([
      create(accordionBlock, { fields: { ...accordionBlock.create().fields, faqSchema: false } }),
    ]);
    expect(document.querySelector("script")).toBeNull();
  });
});

describe("gallery block", () => {
  it("carousel and slideshow emit the carousel + lightbox contract", () => {
    for (const variant of ["carousel", "slideshow"]) {
      const block = create(galleryBlock, { variant });
      mount([block]);
      const root = $(".os-carousel");
      expect(root.dataset.osBehavior).toBe("carousel lightbox");
      expect(root.querySelectorAll(".os-carousel__track > li")).toHaveLength(6);
      expect($("[data-os-prev]").getAttribute("type")).toBe("button");
      expect($("[data-os-next]").getAttribute("aria-controls")).toBe(`${block.id}-track`);
      const link = $<HTMLAnchorElement>("a[data-os-lightbox]");
      expect(link.getAttribute("href")).toMatch(/^https:\/\/images\.unsplash\.com\//);
      expect(link.dataset.osCaption).toBeTruthy();
      behavior("carousel")(root);
      behavior("lightbox")(root);
    }
  });

  it("grid, masonry and strips are lightbox galleries with width/height on every image", () => {
    for (const variant of ["grid", "masonry", "strips"]) {
      mount([create(galleryBlock, { variant })]);
      expect($(".os-gallery").dataset.osBehavior).toBe("lightbox");
      for (const img of document.querySelectorAll("img")) {
        expect(img.getAttribute("width")).toBeTruthy();
        expect(img.getAttribute("height")).toBeTruthy();
      }
    }
    expect($<HTMLElement>(".os-gallery__item").style.getPropertyValue("--ar")).toBeTruthy();
  });

  it("drops the lightbox when disabled", () => {
    mount([create(galleryBlock, { fields: { ...galleryBlock.create().fields, lightbox: false } })]);
    expect(document.querySelector("[data-os-behavior]")).toBeNull();
    expect(document.querySelector("a")).toBeNull();
  });
});

describe("video block", () => {
  it("parses YouTube, Vimeo and PeerTube links", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=42")).toMatchObject({
      provider: "youtube",
      embed: "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ?rel=0&start=42",
    });
    expect(parseVideoUrl("https://youtu.be/aqz-KE-bpKQ")?.embed).toContain("/embed/aqz-KE-bpKQ");
    expect(parseVideoUrl("https://www.youtube.com/shorts/aqz-KE-bpKQ")?.provider).toBe("youtube");
    expect(parseVideoUrl("https://vimeo.com/76979871")).toMatchObject({
      provider: "vimeo",
      embed: "https://player.vimeo.com/video/76979871?dnt=1",
    });
    expect(
      parseVideoUrl("https://framatube.org/w/9c9de5e8-0a1e-484a-b099-e80766180a6d"),
    ).toMatchObject({
      provider: "peertube",
      embed:
        "https://framatube.org/videos/embed/9c9de5e8-0a1e-484a-b099-e80766180a6d?peertubeLink=0&warningTitle=0",
    });
    expect(parseVideoUrl("https://example.com/video.mp4")).toBeUndefined();
    expect(parseVideoUrl("http://youtu.be/aqz-KE-bpKQ")).toBeUndefined();
    expect(parseVideoUrl("not a url")).toBeUndefined();
  });

  it("loads no third-party player until the visitor presses play", () => {
    mount([create(videoBlock)]);
    expect(document.querySelector("iframe")).toBeNull();
    const root = $(".os-video");
    expect(root.dataset.osBehavior).toBe("video-lite");
    expect(root.dataset.osEmbed).toContain("youtube-nocookie.com");
    expect($(".os-video__fallback").getAttribute("href")).toBe(
      "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    );
    behavior("video-lite")(root);
    $<HTMLButtonElement>(".os-video__play").click();
    const iframe = $<HTMLIFrameElement>("iframe");
    expect(iframe.getAttribute("src")).toContain("autoplay=1");
    expect(iframe.title).toContain("Big Buck Bunny");
  });

  it("renders self-hosted files with controls, poster and captions", () => {
    mount([
      create(videoBlock, {
        fields: {
          ...videoBlock.create().fields,
          source: "file",
          file: {
            kind: "video",
            src: "media/2026/10/studio-tour.mp4",
            poster: "media/2026/10/studio-tour.jpg",
            captions: "media/2026/10/studio-tour.vtt",
          },
          background: true,
        },
      }),
    ]);
    const video = $<HTMLVideoElement>("video");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.getAttribute("poster")).toBe("/media/2026/10/studio-tour.jpg");
    expect(video.dataset.osBehavior).toBe("video-lite");
    expect(video.hasAttribute("data-os-autoplay")).toBe(true);
    expect($("source").getAttribute("src")).toBe("/media/2026/10/studio-tour.mp4");
    expect($("track").getAttribute("kind")).toBe("captions");
  });

  it("renders nothing at all in production without a video", () => {
    const fields = videoBlock.create().fields;
    for (const f of [
      { ...fields, url: undefined },
      { ...fields, source: "file" },
    ]) {
      mount([create(videoBlock, { fields: f })]);
      expect(document.querySelector("figure, figcaption, .os-video")).toBeNull();
      mount([create(videoBlock, { fields: f })], { mode: "preview" });
      expect($(".os-video--empty").textContent).toBeTruthy();
    }
  });

  it("shows an editing notice for unsupported links, nothing in production", () => {
    const block = create(videoBlock, {
      fields: { ...videoBlock.create().fields, url: "https://example.com/x" },
    });
    mount([block], { mode: "preview" });
    expect($(".os-video--empty").textContent).toMatch(/isn't supported/);
    mount([block]);
    expect(document.querySelector(".os-video")).toBeNull();
  });
});

describe("map block", () => {
  it("computes OSM tile coordinates", () => {
    const c = tileCoords(0, 0, 1);
    expect(c).toEqual({ x: 1, y: 1 });
    // The OSM wiki's classic example: central London at zoom 10 is tile 511/340.
    const london = tileCoords(51.5074, -0.1278, 10);
    expect([Math.floor(london.x), Math.floor(london.y)]).toEqual([511, 340]);
  });

  it("covers the viewport with tiles centred on the point", () => {
    const plan = planTiles(40.0186, -105.2797, 15);
    expect(plan.tiles.length).toBeGreaterThanOrEqual(12);
    expect(plan.tiles.length).toBeLessThanOrEqual(20);
    for (const t of plan.tiles) {
      expect(t.left).toBeLessThan(100);
      expect(t.left + plan.tileW).toBeGreaterThan(0);
      expect(t.src).toBe(`https://tile.openstreetmap.org/15/${t.x}/${t.y}.png`);
    }
  });

  it("uses a configurable tile host, falling back to OpenStreetMap", () => {
    expect(tileUrlTemplate(undefined)).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(tileUrlTemplate("http://tiles.example.com/{z}/{x}/{y}.png")).toContain("openstreetmap");
    expect(tileUrlTemplate("https://tiles.example.com/{z}/{x}.png")).toContain("openstreetmap");
    const custom = "https://tiles.example.com/osm/{z}/{x}/{y}@2x.png";
    expect(tileUrlTemplate(custom)).toBe(custom);
    mount([create(mapBlock, { fields: { ...mapBlock.create().fields, tileServer: custom } })]);
    for (const img of document.querySelectorAll(".os-map__tiles img"))
      expect(img.getAttribute("src")).toMatch(
        /^https:\/\/tiles\.example\.com\/osm\/15\/\d+\/\d+@2x\.png$/,
      );
  });

  it("renders static tiles, attribution and an Open in Maps link (no API key, no JS)", () => {
    mount([create(mapBlock)]);
    expect(document.querySelectorAll(".os-map__tiles img").length).toBeGreaterThanOrEqual(12);
    expect($(".os-map__tiles").getAttribute("aria-label")).toContain("Juniper Yoga Studio");
    expect($(".os-map__attribution a").getAttribute("href")).toBe(
      "https://www.openstreetmap.org/copyright",
    );
    expect($(".os-map__link").getAttribute("href")).toBe(
      "https://www.openstreetmap.org/?mlat=40.01860&mlon=-105.27970#map=15/40.01860/-105.27970",
    );
    expect($("address").textContent).toContain("1420 Pearl Street");
    expect(document.querySelector("[data-os-behavior]")).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/key=|apikey|access_token/i);
  });
});

describe("embed block", () => {
  it("sandboxes code snippets in a srcdoc iframe without allow-same-origin", () => {
    for (const mode of ["editor", "preview"] as const) {
      mount([create(embedBlock)], { mode });
      const iframe = $<HTMLIFrameElement>("iframe");
      expect(iframe.getAttribute("srcdoc")).toContain("Paste an embed code");
      expect(iframe.getAttribute("sandbox")).toContain("allow-scripts");
      expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
      expect(iframe.title).toBe("Embedded content");
    }
  });

  it("never inlines snippet HTML into the page, in any mode", () => {
    const block = create(embedBlock, {
      fields: {
        ...embedBlock.create().fields,
        embed: { type: "code", code: "<p id=raw>Hi</p><script>window.pwned=1</script>" },
      },
    });
    for (const mode of ["editor", "preview", "production"] as const) {
      mount([block], { mode });
      expect(document.querySelector("#raw")).toBeNull();
      expect(document.querySelector("script")).toBeNull();
      const iframe = $<HTMLIFrameElement>("iframe");
      expect(iframe.getAttribute("srcdoc")).toContain("<p id=raw>Hi</p>");
      expect(iframe.getAttribute("sandbox")).toBe(CODE_SANDBOX);
      expect(iframe.getAttribute("sandbox")).not.toContain("allow-same-origin");
    }
    expect("isolate" in embedBlock.fields).toBe(false);
  });

  it("hides the placeholder instruction on the published site", () => {
    mount([create(embedBlock)], { mode: "production" });
    expect(document.querySelector(".os-embed")).toBeNull();
    mount([create(embedBlock)], { mode: "preview" });
    expect($("iframe").getAttribute("srcdoc")).toContain("Paste an embed code");
  });

  it("gives snippets the section theme's text color", () => {
    const { doc } = setup([]);
    const light = snippetColors(doc, "light");
    const dark = snippetColors(doc, "dark");
    expect(light?.text).toMatch(/^#[0-9a-f]{6}$/i);
    expect(dark?.dark).toBe(true);
    expect(light?.dark).toBe(false);
    expect(dark?.text).not.toBe(light?.text);
    expect(snippetDocument("<p>x</p>", "t", dark)).toContain(
      `color-scheme:dark;color:${dark?.text}`,
    );
    expect(snippetDocument("<p>x</p>", "t")).toContain("color:CanvasText");
  });

  it("never grants allow-same-origin to the site's own origin", () => {
    const same = create(embedBlock, {
      fields: {
        ...embedBlock.create().fields,
        embed: { type: "url", url: "https://juniper.github.io/juniper-yoga/widget/" },
      },
    });
    mount([same]);
    expect($("iframe").getAttribute("sandbox")).toBe(SAME_ORIGIN_URL_SANDBOX);
    expect($("iframe").getAttribute("sandbox")).not.toContain("allow-same-origin");
    // Non-https URLs are refused by the schema and never rendered.
    const http = {
      ...same,
      fields: { ...same.fields, embed: { type: "url", url: "http://example.com/" } },
    };
    expect(embedBlock.validate(http).success).toBe(false);
    mount([http], { mode: "production" });
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("embeds https URLs lazily", () => {
    mount([
      create(embedBlock, {
        fields: {
          ...embedBlock.create().fields,
          embed: { type: "url", url: "https://cal.com/juniper" },
          aspect: "4:3",
        },
      }),
    ]);
    const iframe = $<HTMLIFrameElement>("iframe");
    expect(iframe.getAttribute("src")).toBe("https://cal.com/juniper");
    expect(iframe.getAttribute("sandbox")).toBe(URL_SANDBOX);
    expect(iframe.getAttribute("loading")).toBe("lazy");
    expect($(".os-embed").classList.contains("has-aspect")).toBe(true);
  });
});

describe("social, share and logos", () => {
  it("social links default to the site's profiles", () => {
    mount([create(socialLinksBlock)]);
    const links = [...document.querySelectorAll<HTMLAnchorElement>(".os-socialblock__link")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://instagram.com/juniperyoga",
      "mailto:hello@juniperyoga.com",
    ]);
    expect(links[0]?.getAttribute("rel")).toBe("me noopener");
    expect(links[0]?.textContent).toBe("Instagram");
  });

  it("share buttons link to the current page's absolute URL", () => {
    mount([create(shareButtonsBlock)]);
    const hrefs = [...document.querySelectorAll<HTMLAnchorElement>(".os-socialblock__link")].map(
      (a) => a.getAttribute("href") ?? "",
    );
    const url = encodeURIComponent("https://juniper.github.io/juniper-yoga/contact/");
    expect(hrefs[0]).toBe(`https://www.facebook.com/sharer/sharer.php?u=${url}`);
    expect(hrefs[1]).toContain("https://x.com/intent/post?url=");
    expect(hrefs[3]).toMatch(/^mailto:\?subject=Contact%20%E2%80%94%20Juniper%20Yoga&body=/);
  });

  it("logo strip marquee uses the marquee behavior markup", () => {
    mount([create(logoStripBlock, { variant: "marquee" })]);
    expect($(".os-marquee").dataset.osBehavior).toBe("marquee");
    expect($(".os-marquee__track").children).toHaveLength(5);
  });

  it("shapes are decorative SVG in token colors", () => {
    mount([create(shapeBlock)]);
    const shape = $(".os-shape");
    expect(shape.getAttribute("aria-hidden")).toBe("true");
    expect(shape.style.getPropertyValue("--shape-c")).toBe("var(--os-color-accent-200)");
    expect(shape.querySelector("svg path")).not.toBeNull();
  });
});
