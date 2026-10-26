// @vitest-environment happy-dom
import {
  BlockView,
  CollectionsContext,
  type CollectionsValue,
  feedKey,
  RenderContext,
  type RenderMode,
} from "@openspace/renderer";
import { type BehaviorFile, importBehavior } from "@openspace/renderer/node";
import type { AnyBlockDefinition, Block, CollectionItem, SiteDocument } from "@openspace/schema";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { demoCollections, HUB, page, SITE_ID, siteWith, stackSection } from "./__fixtures__/site";
import {
  audioBlock,
  audioMime,
  beforeAfterBlock,
  bookingBlock,
  calendarMonths,
  chartBlock,
  contactInfoBlock,
  countdownBlock,
  dividerBlock,
  donationBlock,
  eventsBlock,
  eventWhen,
  formatTime,
  formBlock,
  groupHours,
  headingBlock,
  hoursBlock,
  linkListBlock,
  marqueeBlock,
  memberLoginBlock,
  niceScale,
  parseBookingUrl,
  pricingBlock,
  productBlock,
  profileUrl,
  quoteCarouselBlock,
  registerAll,
  restaurantMenuBlock,
  searchBlock,
  siteSearchFallback,
  socialFeedBlock,
  statsBlock,
  summaryBlock,
  tabsBlock,
  teamBlock,
  timelineBlock,
} from "./index";

/** The renderer's real behaviors, run against this library's markup. */
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
    "tabs",
    "marquee",
    "carousel",
    "before-after",
    "countdown",
    "video-lite",
    "cart",
    "newsletter",
    "form",
  ] as const)
    behaviors[name] = await importBehavior(name);
  console.error = (...args: unknown[]) => {
    if (String(args[0]).includes("Iframe page loading is disabled")) return;
    consoleError(...args);
  };
});
afterAll(() => {
  console.error = consoleError;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

interface MountOptions {
  mode?: RenderMode;
  doc?: SiteDocument;
  collections?: CollectionsValue;
}

function render(blocks: Block[], opts: MountOptions = {}): string {
  const p = page("Page", "page", [stackSection(blocks)]);
  const doc = opts.doc ?? siteWith([p]);
  const tree = (
    <RenderContext.Provider
      value={{ doc, page: p, mode: opts.mode ?? "production", basePath: "", hubUrl: HUB }}
    >
      {blocks.map((b) => (
        <BlockView key={b.id} block={b} />
      ))}
    </RenderContext.Provider>
  );
  return renderToStaticMarkup(
    opts.collections ? (
      <CollectionsContext.Provider value={opts.collections}>{tree}</CollectionsContext.Provider>
    ) : (
      tree
    ),
  );
}

function mount(blocks: Block[], opts: MountOptions = {}): HTMLElement {
  document.body.innerHTML = render(blocks, opts);
  return document.body;
}

const create = (def: AnyBlockDefinition, init: Parameters<AnyBlockDefinition["create"]>[0] = {}) =>
  def.create(init);
const withFields = (def: AnyBlockDefinition, fields: Record<string, unknown>, variant?: string) => {
  const b = def.create(variant ? { variant } : {});
  return { ...b, fields: { ...b.fields, ...fields } } as Block;
};
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  return el;
};
const $$ = <T extends Element = HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)];
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  document.body.dataset.osSite = SITE_ID;
  document.body.dataset.osHub = HUB;
  vi.useRealTimers();
});

// --- text & layout ----------------------------------------------------------------------------------

describe("heading and divider", () => {
  it("renders the chosen level with eyebrow and subheading", () => {
    mount([withFields(headingBlock, { level: "h1", size: "display" })]);
    const h = $("h1.os-heading__text");
    expect(h.className).toContain("os-type-display");
    expect($(".os-heading__eyebrow").textContent).toBe("Classes & workshops");
    expect($(".os-heading__sub").textContent).toMatch(/capped at fourteen/);
  });

  it("ornament dividers are separators; label dividers are text", () => {
    mount([create(dividerBlock), create(dividerBlock, { variant: "label" })]);
    expect($$("[role=separator] svg[aria-hidden=true]")).toHaveLength(1);
    expect($(".os-divider__label").textContent).toBe("Est. 2019");
  });
});

describe("marquee", () => {
  it("uses the marquee contract and gets a pause button", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    mount([create(marqueeBlock)]);
    const root = $(".os-ticker");
    expect(root.dataset.osBehavior).toBe("marquee");
    expect(root.dataset.osSpeed).toBe("40");
    expect($(".os-marquee__track").getAttribute("aria-label")).toBe(
      "Slow yoga, Sound baths, Breathwork, Saturday foundations, Pearl Street, Boulder",
    );
    behavior("marquee")(root);
    expect(root.classList.contains("is-running")).toBe(true);
    expect($$("[data-os-clone]")).toHaveLength(5);
    expect($(".os-marquee__toggle").getAttribute("aria-label")).toBe("Pause animation");
    vi.unstubAllGlobals();
  });
});

describe("tabs", () => {
  it("follows the renderer tabs contract and switches with arrow keys", () => {
    const block = create(tabsBlock);
    mount([block]);
    const list = $("[role=tablist]");
    expect(list.getAttribute("aria-label")).toBe("Class styles");
    const tabs = $$<HTMLButtonElement>("[role=tab]");
    expect(tabs).toHaveLength(3);
    for (const t of tabs) {
      const panel = document.getElementById(t.getAttribute("aria-controls") ?? "");
      expect(panel?.getAttribute("aria-labelledby")).toBe(t.id);
    }
    behavior("tabs")($(".os-tabsblock"));
    const panels = $$(".os-tabs__panel");
    expect(panels.map((p) => p.hidden)).toEqual([false, true, true]);
    tabs[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    expect(panels.map((p) => p.hidden)).toEqual([true, false, true]);
  });
});

describe("quote carousel", () => {
  it("uses the carousel contract", () => {
    const block = create(quoteCarouselBlock);
    mount([block]);
    const root = $(".os-quotes");
    expect(root.getAttribute("role")).toBe("group");
    expect(root.getAttribute("aria-roledescription")).toBe("carousel");
    expect(root.getAttribute("aria-label")).toBe("What members say");
    expect($("[data-os-prev]").getAttribute("aria-controls")).toBe(`${block.id}-track`);
    expect($$(".os-quotes__slide")).toHaveLength(4);
    behavior("carousel")(root);
    expect($<HTMLButtonElement>("[data-os-prev]").disabled).toBe(true);
  });
});

describe("data blocks", () => {
  it("stats are a description list with the number first visually", () => {
    mount([create(statsBlock)]);
    const first = $(".os-stats__item");
    expect($("dt", first).textContent).toBe("people per class, at most");
    expect($("dd", first).textContent).toBe("14");
  });

  it("timeline is an ordered list of dated milestones", () => {
    mount([create(timelineBlock)]);
    expect($$("ol.os-timeline > li")).toHaveLength(5);
    expect($(".os-timeline__date").textContent).toBe("2019");
  });

  it("niceScale rounds the axis", () => {
    expect(niceScale(42)).toEqual({ max: 50, ticks: [0, 10, 20, 30, 40, 50] });
    expect(niceScale(268).max).toBe(300);
    expect(niceScale(0.7).max).toBeCloseTo(0.8);
    expect(niceScale(0)).toEqual({ max: 1, ticks: [0, 1] });
  });

  it("charts draw static SVG and always carry a data table", () => {
    for (const variant of ["bar", "column", "line", "pie"]) {
      mount([create(chartBlock, { variant })]);
      expect($$("script")).toHaveLength(0);
      const fig = $("figure.os-chart");
      expect(document.getElementById(fig.getAttribute("aria-labelledby") ?? "")?.textContent).toBe(
        "What members come for",
      );
      expect($$(".os-chart__table tbody tr").map((r) => r.textContent)).toEqual([
        "Flow42%",
        "Foundations23%",
        "Yin & restore21%",
        "Online14%",
      ]);
      expect($$("svg").length).toBeGreaterThan(0);
    }
    mount([create(chartBlock, { variant: "pie" })]);
    expect($$(".os-chart__slice")).toHaveLength(4);
    expect($$(".os-chart__slice")[1]?.getAttribute("stroke-dasharray")).toBe("23 77");
    mount([withFields(chartBlock, { showTable: true }, "column")]);
    expect($("details.os-chart__data summary").textContent).toBe("Show the numbers");
  });
});

describe("countdown", () => {
  it("prints the date for everyone and counts down with the behavior", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-27T09:00:00-07:00"));
    mount([withFields(countdownBlock, { showSeconds: true })]);
    const root = $(".os-countdown");
    expect(root.dataset.osTarget).toBe("2027-03-01T09:00:00-07:00");
    expect($("time").getAttribute("datetime")).toBe("2027-03-01T09:00:00-07:00");
    expect($("time").textContent).toMatch(/Monday, March 1, 2027.*9:00/);
    behavior("countdown")(root);
    expect($$("[data-os-unit]").map((e) => e.textContent)).toEqual(["02", "00", "00", "00"]);
    vi.advanceTimersByTime(1000);
    expect($('[data-os-unit="seconds"]').textContent).toBe("59");
  });

  it("an invalid time is an editor notice and renders nothing in production", () => {
    const block = withFields(countdownBlock, { target: "next spring" });
    expect(render([block])).not.toContain("os-countdown");
    expect(render([block], { mode: "editor" })).toContain('class="os-empty"');
  });
});

describe("commerce-adjacent content", () => {
  it("pricing marks the featured plan and links each button", () => {
    mount([create(pricingBlock)]);
    const plans = $$(".os-pricing__plan");
    expect(plans.map((p) => p.classList.contains("is-featured"))).toEqual([false, true, false]);
    expect($(".os-pricing__badge").textContent).toBe("Most popular");
    expect($(".is-featured .os-button").getAttribute("href")).toBe("/membership");
    expect($(".is-featured .os-button").className).toContain("os-button--primary");
  });

  it("team cards use real alt text and optional links", () => {
    mount([create(teamBlock)]);
    expect($$(".os-team__person")).toHaveLength(3);
    expect($("img").getAttribute("alt")).toMatch(/auburn hair/);
  });

  it("restaurant menu prints prices with the currency, dietary marks and a legend", () => {
    mount([create(restaurantMenuBlock)]);
    expect($$(".os-menu-card__price").map((p) => p.textContent)).toEqual([
      "$9",
      "$7",
      "$13",
      "$5",
      "$5.50",
      "$4.50",
    ]);
    expect($("abbr").getAttribute("title")).toBe("Vegan");
    expect($$(".os-menu-card__legend li").map((l) => l.textContent)).toEqual([
      "V Vegetarian",
      "VG Vegan",
      "GF Gluten-free",
      "S Spicy",
    ]);
  });
});

describe("hours and contact", () => {
  it("groups consecutive days and formats times in the site locale", () => {
    mount([create(hoursBlock)]);
    expect($$(".os-hours__table tr").map((r) => r.textContent)).toEqual([
      "Monday – Friday6:30 AM – 8:30 PM",
      "Saturday8 AM – 2 PM",
      "Sunday4 PM – 8 PM",
    ]);
    expect(formatTime("19:30", "en-GB")).toBe("19:30");
    expect(formatTime("by appointment", "en-US")).toBe("by appointment");
    expect(
      groupHours([
        { day: "mon", closed: true },
        { day: "tue", opens: "9:00", closes: "17:00", closed: false },
        { day: "wed", opens: "9:00", closes: "17:00", closed: false },
        { day: "fri", opens: "9:00", closes: "17:00", closed: false },
      ]).map((g) => `${g.from}-${g.to}`),
    ).toEqual(["mon-mon", "tue-wed", "fri-fri"]);
  });

  it("contact details link phone, email and directions", () => {
    mount([create(contactInfoBlock)]);
    expect($("address")).toBeTruthy();
    expect($('a[href^="tel:"]').getAttribute("href")).toBe("tel:+13035550142");
    expect($('a[href^="mailto:"]').textContent).toBe("hello@juniperyoga.com");
    expect($(".os-contact__directions").getAttribute("href")).toBe(
      "https://www.openstreetmap.org/search?query=1840%20Pearl%20Street%2C%20Suite%202%2C%20Boulder%2C%20CO%2080302",
    );
  });
});

// --- media & embeds ---------------------------------------------------------------------------------

describe("before / after", () => {
  it("drives the clip position from the range input", () => {
    mount([create(beforeAfterBlock)]);
    const root = $(".os-compare");
    expect(root.dataset.osBehavior).toBe("before-after");
    expect(root.style.getPropertyValue("--pos")).toBe("50%");
    const range = $<HTMLInputElement>("input[type=range]");
    expect($(`label[for="${range.id}"]`).textContent).toBe(
      "Compare Light & airy and Warm & layered",
    );
    expect($$("img").every((i) => i.getAttribute("width") && i.getAttribute("height"))).toBe(true);
    behavior("before-after")(root);
    range.value = "25";
    range.dispatchEvent(new Event("input"));
    expect(root.style.getPropertyValue("--pos")).toBe("25%");
    expect(range.getAttribute("aria-valuetext")).toBe("25% Light & airy, 75% Warm & layered");
  });
});

describe("audio", () => {
  it("is a native player with source type, notes and credit", () => {
    mount([create(audioBlock)]);
    const audio = $<HTMLAudioElement>("audio");
    expect(audio.hasAttribute("controls")).toBe(true);
    expect(audio.getAttribute("preload")).toBe("none");
    expect($("source").getAttribute("type")).toBe("audio/ogg");
    expect($(".os-audio__meta").textContent).toBe(
      "Juniper Practice Notes · Episode 12 · Oct 20, 2026",
    );
    expect($(".os-audio__credit").textContent).toMatch(/CC BY-SA 4\.0/);
    expect(audioMime("media/ep-12.MP3?x=1")).toBe("audio/mpeg");
  });

  it("without a file shows a notice only while editing", () => {
    const block = withFields(audioBlock, { audio: undefined });
    expect(render([block])).not.toContain("<audio");
    expect(render([block], { mode: "preview" })).toContain("os-empty");
  });
});

describe("booking", () => {
  it("parses Cal.com, self-hosted Cal and Calendly links (https only)", () => {
    expect(parseBookingUrl("https://cal.com/maya/30min")).toEqual({
      provider: "cal",
      page: "https://cal.com/maya/30min",
      embed: "https://cal.com/maya/30min/embed?embedType=inline&layout=month_view",
    });
    expect(parseBookingUrl("https://calendly.com/maya/intro/")?.embed).toBe(
      "https://calendly.com/maya/intro?embed_type=Inline&hide_gdpr_banner=1",
    );
    expect(parseBookingUrl("https://book.example.org/maya/30", "cal")?.provider).toBe("cal");
    expect(parseBookingUrl("https://book.example.org/maya/30")).toBeUndefined();
    expect(parseBookingUrl("http://cal.com/maya/30min")).toBeUndefined();
    expect(parseBookingUrl("https://evil.example/x", "calendly")).toBeUndefined();
    expect(parseBookingUrl("https://cal.com/")).toBeUndefined();
  });

  it("loads the scheduler only on click, with a no-JS link", () => {
    mount([create(bookingBlock)]);
    const frame = $(".os-booking__frame");
    expect(frame.dataset.osBehavior).toBe("video-lite");
    expect($$("iframe")).toHaveLength(0);
    expect($(".os-booking__fallback").getAttribute("href")).toBe(
      "https://cal.com/juniperyoga/private-session",
    );
    behavior("video-lite")(frame);
    $<HTMLButtonElement>("[data-os-load]").click();
    const iframe = $<HTMLIFrameElement>("iframe");
    expect(iframe.getAttribute("src")).toMatch(
      /^https:\/\/cal\.com\/juniperyoga\/private-session\/embed\?embedType=inline&layout=month_view/,
    );
    expect(iframe.title).toBe("Book a private session (Cal.com)");
  });

  it("button variant just links out in a new tab", () => {
    mount([create(bookingBlock, { variant: "button" })]);
    expect($$("[data-os-behavior]")).toHaveLength(0);
    const a = $("a.os-button");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("href")).toBe("https://cal.com/juniperyoga/private-session");
  });
});

describe("link list and social feed", () => {
  it("link list renders big links and the site's social profiles", () => {
    mount([create(linkListBlock)]);
    expect($$(".os-linklist__link").map((a) => a.getAttribute("href"))).toEqual([
      "/schedule",
      "/foundations",
      "/retreats",
      "/gift",
    ]);
    expect($(".os-linklist__link.is-highlight").textContent).toBe("Book a class");
    expect($$(".os-linklist__social a").length).toBeGreaterThan(0);
  });

  it("profile URLs per network", () => {
    expect(profileUrl("instagram", "@juniperyoga")).toBe("https://www.instagram.com/juniperyoga/");
    expect(profileUrl("mastodon", "@maya@social.coop")).toBe("https://social.coop/@maya");
    expect(profileUrl("bluesky", "maya.bsky.social")).toBe(
      "https://bsky.app/profile/maya.bsky.social",
    );
    expect(profileUrl("instagram", "bad/handle")).toBeUndefined();
  });

  it("shows a tasteful placeholder until build-time posts are provided", () => {
    mount([create(socialFeedBlock)]);
    expect($$(".os-feed__tile")).toHaveLength(6);
    expect($(".os-feed__placeholder ul").getAttribute("aria-hidden")).toBe("true");
    expect($(".os-feed__follow").getAttribute("href")).toBe(
      "https://www.instagram.com/juniperyoga/",
    );
    expect($$(".os-empty")).toHaveLength(0); // production: no editing notice

    const post = (n: number) => ({
      url: `https://www.instagram.com/p/${n}/`,
      image: { src: `https://images.example.com/${n}.jpg`, alt: "", width: 1080, height: 1080 },
      caption: `Post ${n}`,
    });
    mount([create(socialFeedBlock)], {
      collections: {
        feeds: { [feedKey("instagram", "juniperyoga")]: [1, 2, 3, 4, 5, 6, 7].map(post) },
      },
    });
    const links = $$(".os-feed__link");
    expect(links).toHaveLength(6);
    expect(links[0]?.getAttribute("href")).toBe("https://www.instagram.com/p/1/");
    expect($("img", links[0]).getAttribute("alt")).toBe("Post 1");
    expect($$(".os-feed__tile")).toHaveLength(0);
  });
});

// --- collections --------------------------------------------------------------------------------

describe("summary", () => {
  it("lists the newest published posts from the document's collections", () => {
    mount([create(summaryBlock)]);
    expect($$(".os-summary__link").map((a) => a.getAttribute("href"))).toEqual([
      "/journal/opening-day/",
      "/journal/slow-mornings/",
      "/journal/winter-schedule/",
    ]);
    expect($(".os-summary__excerpt").textContent).toBe(
      "We're in. Here's what the first week looks like.",
    );
    expect($("img").getAttribute("alt")).toBe("");
    expect($(".os-summary__foot a").getAttribute("href")).toBe("/journal/");
  });

  it("reads CollectionsContext: provided items, drafts hidden, filters and picks", () => {
    const items = demoCollections();
    const journal = items.journal as Record<string, CollectionItem>;
    const draft = {
      ...journal["opening-day"],
      slug: "secret",
      frontmatter: { ...journal["opening-day"]?.frontmatter, title: "Draft", status: "draft" },
    } as CollectionItem;
    const collections = { journal: { ...journal, secret: draft } };
    mount([withFields(summaryBlock, { source: { collection: "journal", limit: 10 } })], {
      collections: { collections },
    });
    expect($$(".os-summary__link").map((a) => a.textContent)).not.toContain("Draft");
    mount([withFields(summaryBlock, { source: { collection: "journal", limit: 10 } })], {
      collections: { collections, includeDrafts: true },
    });
    expect($$(".os-summary__link").map((a) => a.textContent)).toContain("Draft");
    mount([
      withFields(summaryBlock, {
        source: { collection: "journal", items: ["winter-schedule", "opening-day"] },
      }),
    ]);
    expect($$(".os-summary__link").map((a) => a.textContent)).toEqual([
      "Our winter schedule",
      "Opening day at the new studio",
    ]);
  });

  it("every layout renders; the carousel uses the carousel contract", () => {
    for (const variant of ["grid", "list", "carousel", "wall"]) {
      mount([create(summaryBlock, { variant })]);
      expect($$(".os-summary__item")).toHaveLength(3);
    }
    mount([create(summaryBlock, { variant: "carousel" })]);
    expect($(".os-carousel").dataset.osBehavior).toBe("carousel");
  });

  it("shows products with prices", () => {
    mount([withFields(summaryBlock, { source: { collection: "shop" } })]);
    expect($(".os-summary__price").textContent).toBe("Was $80 From $68");
  });

  it("empty: a visitor message, plus an editing notice in Studio", () => {
    const block = withFields(summaryBlock, { source: { collection: "nothing-here" } });
    expect(render([block])).toContain("Nothing here yet");
    expect(render([block])).not.toContain("os-empty");
    expect(render([block], { mode: "editor" })).toContain("os-empty");
  });
});

describe("events", () => {
  it("shows upcoming events soonest first, with Event JSON-LD", () => {
    mount([create(eventsBlock)]);
    expect($$(".os-events__link").map((a) => a.textContent)).toEqual([
      "Full-moon sound bath",
      "Foundations: a two-hour workshop",
    ]);
    expect($(".os-events__when time").textContent).toMatch(/· 7:00 PM – 8:30 PM$/);
    expect($(".os-events__register").getAttribute("href")).toBe("https://juniperyoga.com/register");
    const ld = JSON.parse($('script[type="application/ld+json"]').textContent ?? "[]");
    expect(ld[0]).toMatchObject({
      "@type": "Event",
      name: "Full-moon sound bath",
      location: { "@type": "Place", name: "The quiet room" },
      url: "https://juniper.github.io/juniper-yoga/events/sound-bath/",
    });
  });

  it("past events with the upcoming filter off", () => {
    mount([
      withFields(eventsBlock, { source: { collection: "events", filter: { upcoming: false } } }),
    ]);
    expect($$(".os-events__link").map((a) => a.textContent)).toEqual(["Autumn retreat"]);
  });

  it("calendar renders month grids with linked days and an agenda", () => {
    mount([create(eventsBlock, { variant: "calendar" })]);
    const grids = $$("table.os-events__month-grid");
    expect(grids.length).toBeGreaterThanOrEqual(1);
    expect($$("thead th").length % 7).toBe(0);
    expect($$(".os-events__chip").length).toBe(2);
    expect($$(".os-events__list li")).toHaveLength(2);
  });

  it("eventWhen formats in the event's zone; calendars start on the locale's first day", () => {
    const fm = {
      title: "x",
      status: "published" as const,
      start: "2026-11-14T09:00:00-07:00",
      end: "2026-11-14T12:00:00-07:00",
      timezone: "America/Denver",
    };
    expect(eventWhen(fm, "en-US")).toBe("Sat, Nov 14 · 9:00 AM – 12:00 PM");
    expect(eventWhen({ ...fm, start: "2026-11-14", end: "2026-11-16" }, "en-US")).toBe(
      "Sat, Nov 14 – Mon, Nov 16",
    );
    const event = (start: string) =>
      ({
        kind: "events",
        slug: "e",
        body: "",
        frontmatter: { ...fm, start, end: undefined },
      }) as never;
    const [us] = calendarMonths([event("2026-11-14T09:00:00-07:00")], "en-US");
    const [gb] = calendarMonths([event("2026-11-14T09:00:00-07:00")], "en-GB");
    expect(us?.weekdays[0]?.long).toBe("Sunday");
    expect(gb?.weekdays[0]?.long).toBe("Monday");
    expect(us?.weeks[0]).toEqual([1, 2, 3, 4, 5, 6, 7]); // Nov 2026 starts on a Sunday
    expect(us?.days.get(14)).toHaveLength(1);
  });
});

describe("search", () => {
  it("opens site search, falling back to a site-scoped web search without JS", () => {
    const docOn = siteWith([page("Home", "home", [])]);
    docOn.config.features.search = true;
    mount([create(searchBlock)], { doc: docOn });
    const a = $(".os-searchblock__trigger");
    expect(a.dataset.osBehavior).toBe("search");
    expect(a.getAttribute("href")).toBe(
      "https://duckduckgo.com/?q=site%3Ajuniper.github.io%2Fjuniper-yoga",
    );
    expect(siteSearchFallback("https://juniperyoga.com/")).toBe(
      "https://duckduckgo.com/?q=site%3Ajuniperyoga.com",
    );
  });

  it("with search off: no behavior, and an owner notice while editing", () => {
    expect(render([create(searchBlock)])).not.toContain('data-os-behavior="search"');
    expect(render([create(searchBlock)], { mode: "editor" })).toContain("Turn on Search");
  });
});

// --- commerce & members -----------------------------------------------------------------------------

describe("product", () => {
  // First in this file to open the cart: the cart module keeps one drawer per page load.
  it("checkout posts SKUs and quantities only", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ message: "nope" }), { status: 400 }));
    mount([create(productBlock)]);
    const add = $<HTMLButtonElement>("button[data-os-add]");
    behavior("cart")(add);
    add.click();
    const checkout = [...document.querySelectorAll<HTMLButtonElement>("dialog button")].find(
      (b) => b.textContent === "Check out",
    );
    checkout?.click();
    await flush();
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(`${HUB}/c/${SITE_ID}/checkout`);
    expect(JSON.parse(String((init as RequestInit).body)).items).toEqual([
      { sku: "MAT-CORK-STD", qty: 1 },
    ]);
    fetchSpy.mockRestore();
  });

  it("emits the cart contract (SKU + qty only) with a variant picker", () => {
    mount([create(productBlock)]);
    expect($(".os-product__title a").getAttribute("href")).toBe("/shop/cork-yoga-mat/");
    expect($(".os-product__price").textContent).toBe("Was $80Now From $68");
    const add = $<HTMLButtonElement>("button[data-os-add]");
    expect(add.dataset.osBehavior).toBe("cart");
    expect(add.dataset.osSku).toBe("MAT-CORK-STD");
    expect(add.dataset.osCurrency).toBe("USD");
    const select = $<HTMLSelectElement>(add.dataset.osSkuInput ?? "");
    expect([...select.options].map((o) => `${o.value}:${o.textContent}`)).toEqual([
      "MAT-CORK-STD:Standard",
      "MAT-CORK-LONG:Long — $76",
    ]);
    const qty = $<HTMLInputElement>(add.dataset.osQtyInput ?? "");

    behavior("cart")(add);
    select.value = "MAT-CORK-LONG";
    qty.value = "2";
    add.click();
    const saved = JSON.parse(localStorage.getItem(`os-cart:${SITE_ID}`) ?? "[]");
    expect(saved).toEqual([
      { sku: "MAT-CORK-LONG", name: "Cork yoga mat — Long", price: 7600, currency: "USD", qty: 2 },
    ]);
  });

  it("sold out, missing products and notices", () => {
    const doc = siteWith([page("Shop", "shop", [])]);
    const mat = doc.collections.shop?.["cork-yoga-mat"];
    if (mat?.kind !== "products") throw new Error("fixture");
    mat.frontmatter.available = false;
    mount([create(productBlock)], { doc });
    expect($(".os-product__soldout").textContent).toBe("Sold out");
    expect($$("[data-os-add]")).toHaveLength(0);

    const missing = withFields(productBlock, { product: { collection: "shop", items: ["nope"] } });
    expect(render([missing])).not.toContain("os-product");
    expect(render([missing], { mode: "preview" })).toContain("found in");
  });
});

describe("donation", () => {
  it("posts to Hub checkout with kind=donation and amounts in minor units", () => {
    mount([create(donationBlock)]);
    const form = $<HTMLFormElement>("form.os-donation__form");
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe(`${HUB}/c/${SITE_ID}/checkout`);
    expect($<HTMLInputElement>('input[name="kind"]').value).toBe("donation");
    expect($$<HTMLInputElement>('input[name="amount"]').map((i) => i.value)).toEqual([
      "1500",
      "3500",
      "7500",
      "15000",
      "custom",
    ]);
    expect($$(".os-donation__amounts .os-donation__pill span").map((s) => s.textContent)).toEqual([
      "$15",
      "$35",
      "$75",
      "$150",
      "Other",
    ]);
    expect($$<HTMLInputElement>('input[name="interval"]').map((i) => i.value)).toEqual([
      "once",
      "month",
    ]);
    expect($<HTMLInputElement>('input[name="_hp"]')).toBeTruthy();
  });

  it("zero-decimal currencies and link mode", () => {
    mount([
      withFields(donationBlock, {
        currency: "JPY",
        amounts: [{ amount: 1000 }],
        frequency: "monthly",
      }),
    ]);
    expect($<HTMLInputElement>('input[name="amount"]').value).toBe("1000");
    expect($<HTMLInputElement>('input[name="interval"]').type).toBe("hidden");
    mount([
      withFields(donationBlock, {
        mode: "link",
        link: { type: "url", url: "https://opencollective.com/juniper" },
      }),
    ]);
    expect($$("form")).toHaveLength(0);
    expect($("a.os-button").getAttribute("href")).toBe("https://opencollective.com/juniper");
  });
});

describe("member sign-in", () => {
  it("asks the Hub for a magic link (no password field) and confirms inline", async () => {
    mount([create(memberLoginBlock)]);
    const form = $<HTMLFormElement>("form");
    expect(form.getAttribute("action")).toBe(`${HUB}/m/${SITE_ID}/login`);
    expect(form.dataset.osBehavior).toBe("newsletter");
    expect($$('input[type="password"]')).toHaveLength(0);
    expect($<HTMLInputElement>('input[name="return_to"]').value).toBe("/page/");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    behavior("newsletter")(form);
    $<HTMLInputElement>('input[name="email"]').value = "ana@example.com";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    await flush();
    expect(fetchSpy).toHaveBeenCalledWith(`${HUB}/m/${SITE_ID}/login`, expect.anything());
    expect($(".os-form__status").textContent).toMatch(/sign-in link is on its way/);
    fetchSpy.mockRestore();
  });

  it("gated notice links to sign-in and membership", () => {
    mount([create(memberLoginBlock, { variant: "gated" })]);
    expect($$("form")).toHaveLength(0);
    expect($$("a.os-button").map((a) => a.getAttribute("href"))).toEqual([
      "/members/",
      "/membership",
    ]);
  });
});

describe("form: required checkbox groups (renderer follow-up)", () => {
  it("the form behavior enforces data-os-required-group on the form block's markup", async () => {
    const block = create(formBlock);
    const form = structuredClone(block.fields.form) as { fields: Record<string, unknown>[] };
    form.fields = [
      { type: "checkbox", name: "days", label: "Days", options: ["Mon", "Wed"], required: true },
    ];
    mount([{ ...block, fields: { ...block.fields, form } } as Block]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const el = $<HTMLFormElement>("form");
    behavior("form")(el);
    el.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect($("[data-os-required-group] .os-field__error").textContent).toBe(
      "Please choose at least one option.",
    );
    fetchSpy.mockRestore();
  });
});
