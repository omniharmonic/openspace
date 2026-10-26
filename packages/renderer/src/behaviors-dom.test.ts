// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import accordion from "./behaviors/accordion";
import announcement from "./behaviors/announcement";
import beacon from "./behaviors/beacon";
import cart from "./behaviors/cart";
import form from "./behaviors/form";
import menu from "./behaviors/menu";
import popup from "./behaviors/popup";
import reveal from "./behaviors/reveal";
import search from "./behaviors/search";
import tabs from "./behaviors/tabs";
import videoLite from "./behaviors/video-lite";

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  document.body.dataset.osSite = "st_01jb3q8w2n";
  document.body.dataset.osHub = "https://hub.test";
});
afterEach(() => vi.restoreAllMocks());

describe("accordion", () => {
  it("closes siblings in exclusive mode", () => {
    document.body.innerHTML = `<div data-os-exclusive>
      <details id="a" open><summary>A</summary><div>a</div></details>
      <details id="b"><summary>B</summary><div>b</div></details></div>`;
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    accordion(document.body.firstElementChild as HTMLElement);
    (document.querySelector("#b summary") as HTMLElement).click();
    expect((document.getElementById("a") as HTMLDetailsElement).open).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("tabs", () => {
  it("selects with arrow keys and hides other panels", () => {
    document.body.innerHTML = `<div class="os-tabs"><div role="tablist">
      <button role="tab" aria-controls="p1">One</button><button role="tab" aria-controls="p2">Two</button></div>
      <div id="p1">1</div><div id="p2">2</div></div>`;
    tabs(document.body.firstElementChild as HTMLElement);
    const [t1, t2] = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(t1?.getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById("p2")?.hidden).toBe(true);
    t1?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(t2?.getAttribute("aria-selected")).toBe("true");
    expect(t2?.tabIndex).toBe(0);
    expect(document.getElementById("p1")?.hidden).toBe(true);
    expect(document.getElementById("p2")?.getAttribute("role")).toBe("tabpanel");
  });
});

describe("menu", () => {
  it("opens as a modal, closes on Escape and returns focus", () => {
    document.body.innerHTML = `<header class="os-header">
      <button data-os-menu-toggle aria-expanded="false" aria-controls="os-menu">Menu</button>
      <div id="os-menu" class="os-menu os-menu--slide" data-os-menu><button data-os-menu-close>Close</button><a href="/about/">About</a></div>
    </header>`;
    const header = document.querySelector("header") as HTMLElement;
    menu(header);
    const toggle = document.querySelector("[data-os-menu-toggle]") as HTMLButtonElement;
    toggle.click();
    const panel = document.getElementById("os-menu") as HTMLElement;
    expect(panel.classList.contains("is-open")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(document.documentElement.style.overflow).toBe("hidden");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(panel.classList.contains("is-open")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });
});

describe("announcement", () => {
  it("remembers dismissal per message", () => {
    const html = `<aside data-os-key="k1"><button data-os-dismiss>x</button></aside>`;
    document.body.innerHTML = html;
    const el = document.querySelector("aside") as HTMLElement;
    announcement(el);
    (el.querySelector("button") as HTMLElement).click();
    expect(el.hidden).toBe(true);
    document.body.innerHTML = html;
    const again = document.querySelector("aside") as HTMLElement;
    announcement(again);
    expect(again.hidden).toBe(true);
  });
});

describe("popup", () => {
  it("opens after the delay once, then respects the frequency cap", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<dialog id="welcome" data-os-trigger="time" data-os-delay="2" data-os-frequency="7"><button data-os-close>x</button></dialog>`;
    const d = document.querySelector("dialog") as HTMLDialogElement;
    d.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    });
    popup(d);
    vi.advanceTimersByTime(1900);
    expect(d.showModal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(d.showModal).toHaveBeenCalledTimes(1);
    const second = vi.fn();
    d.showModal = second;
    popup(d);
    vi.advanceTimersByTime(5000);
    expect(second).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("reveal", () => {
  it("reveals on-screen elements immediately", () => {
    document.body.innerHTML = `<section class="os-section" data-os-reveal="rise" data-os-stagger><div class="os-block"></div><div class="os-block"></div></section>`;
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const s = document.querySelector("section") as HTMLElement;
    s.getBoundingClientRect = () => ({ top: 10, bottom: 400 }) as DOMRect;
    reveal(s);
    expect(s.classList.contains("is-revealed")).toBe(true);
    expect(document.documentElement.classList.contains("os-reveal-ready")).toBe(true);
    expect((s.children[1] as HTMLElement).style.getPropertyValue("--i")).toBe("1");
    vi.unstubAllGlobals();
  });
});

describe("form", () => {
  const markup = `<form action="https://hub.test/f/st_01jb3q8w2n/frm_c0ntact001" data-os-owner-email="maya@mayayoga.com">
    <div class="os-field"><input name="email" type="email" required aria-describedby="e1"><p id="e1" class="os-field__error"></p></div>
    <button type="submit">Send</button></form>`;

  it("validates inline before submitting", async () => {
    document.body.innerHTML = markup;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const f = document.querySelector("form") as HTMLFormElement;
    form(f);
    f.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(f.querySelector("input")?.getAttribute("aria-invalid")).toBe("true");
    expect(f.querySelector(".os-field__error")?.textContent).not.toBe("");
  });

  it("submits async and shows success", async () => {
    document.body.innerHTML = markup;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Thanks!" }), { status: 200 }),
    );
    const f = document.querySelector("form") as HTMLFormElement;
    form(f);
    (f.querySelector("input") as HTMLInputElement).value = "a@b.co";
    f.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    await flush();
    const status = f.querySelector(".os-form__status") as HTMLElement;
    expect(status.dataset.state).toBe("success");
    expect(status.textContent).toBe("Thanks!");
  });

  it("queues the entry and shows the owner's email when the Hub is down", async () => {
    document.body.innerHTML = markup;
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    const f = document.querySelector("form") as HTMLFormElement;
    form(f);
    (f.querySelector("input") as HTMLInputElement).value = "a@b.co";
    f.dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    await flush();
    const status = f.querySelector(".os-form__status") as HTMLElement;
    expect(status.dataset.state).toBe("error");
    expect(status.querySelector("a")?.getAttribute("href")).toBe("mailto:maya@mayayoga.com");
    const queue = JSON.parse(localStorage.getItem("os-form-queue") ?? "[]");
    expect(queue).toHaveLength(1);
    expect(queue[0].fields).toEqual([["email", "a@b.co"]]);
  });
});

describe("cart", () => {
  it("adds items, persists them and updates the count", () => {
    document.body.innerHTML = `<button data-os-cart-toggle><span data-os-cart-count></span></button>
      <button data-os-add data-os-stay data-os-sku="mat-1" data-os-name="Cork mat" data-os-price="6800" data-os-currency="USD">Add</button>`;
    const add = document.querySelector("[data-os-add]") as HTMLElement;
    cart(document.querySelector("[data-os-cart-toggle]") as HTMLElement);
    cart(add);
    add.click();
    add.click();
    expect(document.querySelector("[data-os-cart-count]")?.textContent).toBe("2");
    const saved = JSON.parse(localStorage.getItem("os-cart:st_01jb3q8w2n") ?? "[]");
    expect(saved).toEqual([
      { sku: "mat-1", name: "Cork mat", price: 6800, currency: "USD", qty: 2 },
    ]);
  });
});

describe("cart without storage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the cart in the page when storage is blocked (sandboxed previews)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    // A fresh module: the storage probe runs once per page.
    vi.resetModules();
    const { default: freshCart } = await import("./behaviors/cart");
    document.body.innerHTML = `<button data-os-cart-toggle><span data-os-cart-count></span></button>
      <button data-os-add data-os-stay data-os-sku="block-1" data-os-name="Cork block" data-os-price="1800" data-os-currency="USD">Add</button>`;
    const add = document.querySelector("[data-os-add]") as HTMLElement;
    freshCart(document.querySelector("[data-os-cart-toggle]") as HTMLElement);
    freshCart(add);
    const count = () => Number(document.querySelector("[data-os-cart-count]")?.textContent || 0);
    add.click();
    add.click();
    expect(count()).toBe(2);
  });
});

describe("beacon", () => {
  it("posts path, screen class and UTM tags to the Hub", () => {
    const send = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: send, configurable: true });
    Object.defineProperty(navigator, "webdriver", { value: false, configurable: true });
    history.replaceState(null, "", "/about/?utm_source=newsletter");
    beacon(document.body);
    expect(send).toHaveBeenCalledTimes(1);
    const [url, payload] = send.mock.calls[0] as unknown as [string, string];
    expect(url).toBe("https://hub.test/a/st_01jb3q8w2n");
    expect(JSON.parse(payload)).toMatchObject({ p: "/about/", u: { source: "newsletter" } });
  });
});

describe("fix round 1 behaviors", () => {
  it("video-lite only loads https embeds", () => {
    document.body.innerHTML = `<div class="os-video" data-os-embed="javascript:alert(1)"><button class="os-video__play">Play</button></div>
      <div class="os-video" data-os-embed="https://www.youtube-nocookie.com/embed/abc"><button class="os-video__play">Play</button></div>`;
    const [bad, good] = [...document.querySelectorAll<HTMLElement>(".os-video")];
    videoLite(bad as HTMLElement);
    videoLite(good as HTMLElement);
    bad?.querySelector("button")?.click();
    good?.querySelector("button")?.click();
    expect(bad?.querySelector("iframe")).toBeNull();
    expect(good?.querySelector("iframe")?.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/abc?autoplay=1",
    );
  });

  it("tells the visitor when a queued entry is later rejected", async () => {
    const action = "https://hub.test/f/st_01jb3q8w2n/frm_c0ntact001";
    localStorage.setItem(
      "os-form-queue",
      JSON.stringify([{ action, fields: [["email", "a@b.co"]], at: Date.now() }]),
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Form closed" }), { status: 422 }),
    );
    document.body.innerHTML = `<form action="${action}"><input name="email"><button>Send</button></form>`;
    const f = document.querySelector("form") as HTMLFormElement;
    form(f);
    for (let i = 0; i < 5; i++) await flush();
    const status = f.querySelector(".os-form__status") as HTMLElement;
    expect(status?.dataset.state).toBe("error");
    expect(status.textContent).toContain("couldn't be delivered (Form closed)");
    expect(JSON.parse(localStorage.getItem("os-form-queue") ?? "[]")).toEqual([]);
  });

  it("search registers a single global / shortcut", () => {
    const spy = vi.spyOn(document, "addEventListener");
    document.body.innerHTML = `<button id="s1"></button><button id="s2"></button>`;
    search(document.getElementById("s1") as HTMLElement);
    search(document.getElementById("s2") as HTMLElement);
    expect(spy.mock.calls.filter(([t]) => t === "keydown")).toHaveLength(1);
  });

  it("keeps a rejected entry until its form is on the page, then reports it once", async () => {
    const action = "https://hub.test/f/st_01jb3q8w2n/frm_c0ntact002";
    localStorage.setItem(
      "os-form-queue",
      JSON.stringify([{ action, fields: [["email", "a@b.co"]], at: Date.now() }]),
    );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 400 }));
    document.body.innerHTML = `<form action="https://hub.test/f/st_01jb3q8w2n/other"><input name="x"></form>`;
    form(document.querySelector("form") as HTMLFormElement);
    for (let i = 0; i < 5; i++) await flush();
    const kept = JSON.parse(localStorage.getItem("os-form-queue") ?? "[]");
    expect(kept).toHaveLength(1);
    expect(kept[0].rejected).toBe("");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    document.body.innerHTML = `<form action="${action}"><input name="email"></form>`;
    const f = document.querySelector("form") as HTMLFormElement;
    form(f);
    for (let i = 0; i < 5; i++) await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1); // not resubmitted
    expect(f.querySelector(".os-form__status")?.textContent).toContain("couldn't be delivered");
    expect(JSON.parse(localStorage.getItem("os-form-queue") ?? "[]")).toEqual([]);
  });
});
