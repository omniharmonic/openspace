// @vitest-environment happy-dom
import type { CollectionItem, SiteDocument } from "@openspace/schema";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { siteFixture } from "./__fixtures__/site";
import beforeAfter from "./behaviors/before-after";
import cart from "./behaviors/cart";
import countdown from "./behaviors/countdown";
import form from "./behaviors/form";
import {
  CollectionsContext,
  feedKey,
  isUpcoming,
  queryCollection,
  useCollectionQuery,
  useCollections,
} from "./collections";
import { RenderContext } from "./context";
import { Header } from "./header";
import { importBehavior } from "./node";
import { BASE_CSS } from "./styles/base-css";

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  document.body.dataset.osSite = "st_01jb3q8w2n";
  document.body.dataset.osHub = "https://hub.test";
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("header landmarks", () => {
  it("labels the desktop and mobile navigation differently", () => {
    const doc = siteFixture();
    const html = renderToStaticMarkup(
      <RenderContext.Provider
        value={{ doc, page: undefined, mode: "production", basePath: "", hubUrl: undefined }}
      >
        <Header site={doc.site} />
      </RenderContext.Provider>,
    );
    const labels = [...html.matchAll(/<nav[^>]*aria-label="([^"]+)"/g)].map((m) => m[1]);
    expect(labels).toEqual(["Main", "Menu"]);
  });
});

describe("select height", () => {
  it("single-line selects get the text-input height in os.css", () => {
    expect(BASE_CSS).toContain(".os-select:not([multiple]){height:calc(2.8em + 2px)}");
  });
});

describe("form: required checkbox groups", () => {
  const markup = `<form action="https://hub.test/f/st_01jb3q8w2n/frm_c0ntact001">
    <fieldset class="os-field" data-os-required-group="days" data-os-message="Pick at least one day.">
      <legend>Days</legend>
      <label><input type="checkbox" name="days[]" value="Mon" aria-describedby="d-error"> Mon</label>
      <label><input type="checkbox" name="days[]" value="Wed" aria-describedby="d-error"> Wed</label>
      <p class="os-field__error" id="d-error"></p>
    </fieldset>
    <button type="submit">Send</button></form>`;

  it("blocks submit until one box is checked, with the group's message", async () => {
    document.body.innerHTML = markup;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const f = document.querySelector("form") as HTMLFormElement;
    form(f);
    f.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
    const boxes = [...f.querySelectorAll<HTMLInputElement>("input[type=checkbox]")];
    expect(boxes.map((b) => b.getAttribute("aria-invalid"))).toEqual(["true", "true"]);
    expect(f.querySelector(".os-field__error")?.textContent).toBe("Pick at least one day.");
    expect(f.querySelector(".os-form__status")?.textContent).toBe(
      "Please fix the highlighted field.",
    );

    // Checking a box clears the error; blurring another box doesn't re-raise it.
    const wed = boxes[1] as HTMLInputElement;
    wed.checked = true;
    wed.dispatchEvent(new Event("change"));
    expect(f.querySelector(".os-field__error")?.textContent).toBe("");
    boxes[0]?.dispatchEvent(new Event("blur"));
    expect(f.querySelector(".os-field__error")?.textContent).toBe("");

    f.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("before-after", () => {
  it("drives --pos and a spoken value from the range input", () => {
    document.body.innerHTML = `<div class="os-compare" data-os-before="Before" data-os-after="After">
      <input type="range" min="0" max="100" value="50"></div>`;
    const root = document.querySelector(".os-compare") as HTMLElement;
    beforeAfter(root);
    expect(root.style.getPropertyValue("--pos")).toBe("50%");
    const range = root.querySelector("input") as HTMLInputElement;
    range.value = "30";
    range.dispatchEvent(new Event("input"));
    expect(root.style.getPropertyValue("--pos")).toBe("30%");
    expect(range.getAttribute("aria-valuetext")).toBe("30% Before, 70% After");
    expect(root.classList.contains("is-ready")).toBe(true);
  });
});

describe("countdown", () => {
  const markup = (target: string) => `<div data-os-target="${target}">
    <div class="os-countdown__units"><span data-os-unit="days"></span><span data-os-unit="hours"></span>
    <span data-os-unit="minutes"></span><span data-os-unit="seconds"></span></div>
    <p class="os-countdown__done" hidden>We're open!</p></div>`;

  it("counts down each second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
    document.body.innerHTML = markup("2026-11-03T03:04:05Z");
    const root = document.body.firstElementChild as HTMLElement;
    countdown(root);
    const read = () =>
      [...root.querySelectorAll("[data-os-unit]")].map((e) => e.textContent).join(":");
    expect(read()).toBe("02:03:04:05");
    vi.advanceTimersByTime(1000);
    expect(read()).toBe("02:03:04:04");
  });

  it("shows the done message once the time has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
    document.body.innerHTML = markup("2026-11-01T00:00:02Z");
    const root = document.body.firstElementChild as HTMLElement;
    countdown(root);
    vi.advanceTimersByTime(3000);
    expect((root.querySelector(".os-countdown__units") as HTMLElement).hidden).toBe(true);
    expect((root.querySelector(".os-countdown__done") as HTMLElement).hidden).toBe(false);
  });
});

describe("cart: variant picker", () => {
  it("adds the selected variant's SKU, name and price", () => {
    document.body.innerHTML = `<select id="v"><option value="mat-s" data-os-name="Mat — S" data-os-price="6000">S</option>
      <option value="mat-l" data-os-name="Mat — L" data-os-price="7200">L</option></select>
      <button data-os-add data-os-stay data-os-sku="mat-s" data-os-name="Mat" data-os-price="6000" data-os-currency="USD" data-os-sku-input="#v">Add</button>`;
    (document.getElementById("v") as HTMLSelectElement).value = "mat-l";
    const add = document.querySelector("[data-os-add]") as HTMLElement;
    cart(add);
    add.click();
    const saved = JSON.parse(localStorage.getItem("os-cart:st_01jb3q8w2n") ?? "[]");
    expect(saved).toEqual([
      { sku: "mat-l", name: "Mat — L", price: 7200, currency: "USD", qty: 1 },
    ]);
  });
});

describe("behavior source entry", () => {
  it("importBehavior loads a behavior's init", async () => {
    expect(await importBehavior("before-after")).toBe(beforeAfter);
  });

  it("is importable by package specifier", async () => {
    const mod = (await import("@openspace/renderer/behavior-source/countdown")) as {
      default: unknown;
    };
    expect(typeof mod.default).toBe("function");
  });
});

// --- collections ---------------------------------------------------------------------------------

const post = (slug: string, date: string, extra: Record<string, unknown> = {}): CollectionItem => ({
  kind: "blog",
  slug,
  body: "",
  frontmatter: { title: slug, status: "published", date, ...extra },
});
const event = (slug: string, start: string, end?: string): CollectionItem => ({
  kind: "events",
  slug,
  body: "",
  frontmatter: { title: slug, status: "published", start, ...(end ? { end } : {}) },
});

const slugs = (items: CollectionItem[]) => items.map((i) => i.slug);

function Probe() {
  const items = useCollectionQuery({ collection: "journal" });
  const { feeds } = useCollections();
  return (
    <p>
      {slugs(items).join(",")}|{Object.keys(feeds).join(",")}
    </p>
  );
}

describe("collections", () => {
  const now = new Date("2026-10-26T12:00:00Z");
  const journal = {
    a: post("a", "2026-09-01", { categories: ["news"], tags: ["Studio"] }),
    b: post("b", "2026-10-01", { featured: true }),
    c: post("c", "2026-08-01", { status: "draft" }),
    d: post("d", "2026-10-20", { status: "scheduled", publishAt: "2026-10-27T09:00:00Z" }),
    e: post("e", "2026-07-01", { status: "scheduled", publishAt: "2026-10-01T09:00:00Z" }),
  };
  const events = {
    past: event("past", "2026-10-01T18:00:00-06:00"),
    today: event("today", "2026-10-26"),
    later: event("later", "2026-11-14T09:00:00-07:00"),
    running: event("running", "2026-10-20", "2026-10-30"),
  };
  const all = { journal, events };

  it("sorts newest first and hides drafts and not-yet-due scheduled items", () => {
    expect(slugs(queryCollection({ collection: "journal" }, all, { now }))).toEqual([
      "b",
      "a",
      "e",
    ]);
    expect(
      slugs(queryCollection({ collection: "journal" }, all, { now, includeDrafts: true })),
    ).toEqual(["d", "b", "a", "c", "e"]);
  });

  it("filters by category, tag (case-insensitive) and featured, then limits", () => {
    const q = (filter: object, limit?: number) =>
      slugs(
        queryCollection({ collection: "journal", filter, ...(limit ? { limit } : {}) }, all, {
          now,
        }),
      );
    expect(q({ categories: ["news"] })).toEqual(["a"]);
    expect(q({ tags: ["studio"] })).toEqual(["a"]);
    expect(q({ featured: true })).toEqual(["b"]);
    expect(q({ featured: false }, 1)).toEqual(["a"]);
  });

  it("keeps explicit picks in their order, skipping missing and draft items", () => {
    expect(
      slugs(queryCollection({ collection: "journal", items: ["e", "zz", "c", "a"] }, all, { now })),
    ).toEqual(["e", "a"]);
  });

  it("upcoming events sort soonest first; date-only events last all day", () => {
    expect(
      slugs(queryCollection({ collection: "events", filter: { upcoming: true } }, all, { now })),
    ).toEqual(["running", "today", "later"]);
    expect(
      slugs(queryCollection({ collection: "events", filter: { upcoming: false } }, all, { now })),
    ).toEqual(["past"]);
    expect(isUpcoming(events.today, new Date("2026-10-26T23:59:00Z"))).toBe(true);
    expect(isUpcoming(events.today, new Date("2026-10-27T00:00:01Z"))).toBe(false);
  });

  it("CollectionsContext overrides the document's collections, time and feeds", () => {
    const doc = { collections: { journal: { a: journal.a } } } as unknown as SiteDocument;
    const render = (value?: object) =>
      renderToStaticMarkup(
        <RenderContext.Provider
          value={{ doc, page: undefined, mode: "production", basePath: "", hubUrl: undefined }}
        >
          {value ? (
            <CollectionsContext.Provider value={value}>
              <Probe />
            </CollectionsContext.Provider>
          ) : (
            <Probe />
          )}
        </RenderContext.Provider>,
      );
    expect(render()).toBe("<p>a|</p>");
    expect(
      render({
        collections: all,
        now: "2026-10-28T00:00:00Z",
        feeds: { [feedKey("instagram", "@JuniperYoga")]: [] },
      }),
    ).toBe("<p>d,b,a,e|instagram:juniperyoga</p>");
  });
});
