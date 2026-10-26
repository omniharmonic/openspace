import { h, ICON_CLOSE, icon, load, save, siteInfo } from "./shared";

/**
 * Cart (Phase 5 commerce). One shared cart per site in localStorage. Elements:
 * - `[data-os-add]` buttons with `data-os-sku`, `data-os-name`, `data-os-price` (minor units,
 *   display only), `data-os-currency`, optional `data-os-qty-input` (selector of a qty input)
 *   and optional `data-os-sku-input` (selector of a variant `<select>` whose option values are
 *   SKUs; the selected option's `data-os-name` / `data-os-price` override the button's) and
 *   optional `data-os-image-target` (selector of the product photo: choosing an option with a
 *   `data-os-image` URL shows that photo);
 * - `[data-os-cart-toggle]` opens the drawer; `[data-os-cart-count]` shows the item count.
 * Checkout POSTs only SKUs and quantities to the Hub; prices are re-read server-side from the
 * published catalog, never trusted from the browser.
 */
interface Line {
  sku: string;
  name: string;
  price: number;
  currency: string;
  qty: number;
}

const info = () => siteInfo();
const key = () => `os-cart:${info().site}`;
const read = (): Line[] => load<Line[]>(key(), []).filter((l) => l?.sku && l.qty > 0);
const write = (lines: Line[]) => {
  save(key(), lines);
  render();
};

let dialog: HTMLDialogElement | undefined;
let list: HTMLElement;
let total: HTMLElement;
let message: HTMLElement;
let checkout: HTMLButtonElement;
let live: HTMLElement | undefined;
let bound = false;

const money = (minor: number, currency: string) => {
  try {
    return new Intl.NumberFormat(document.documentElement.lang || undefined, {
      style: "currency",
      currency,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
};

function announce(text: string): void {
  if (!live) {
    live = h("div", { class: "os-visually-hidden", role: "status", "aria-live": "polite" });
    document.body.append(live);
  }
  live.textContent = text;
}

function setQty(sku: string, qty: number): void {
  const lines = read();
  const line = lines.find((l) => l.sku === sku);
  if (line) line.qty = Math.max(0, Math.min(99, qty));
  write(lines.filter((l) => l.qty > 0));
}

function render(): void {
  const lines = read();
  const count = lines.reduce((n, l) => n + l.qty, 0);
  for (const el of document.querySelectorAll<HTMLElement>("[data-os-cart-count]"))
    el.textContent = count ? String(count) : "";
  for (const el of document.querySelectorAll<HTMLElement>("[data-os-cart-toggle]"))
    el.setAttribute("aria-label", count ? `Cart, ${count} item${count === 1 ? "" : "s"}` : "Cart");
  if (!dialog) return;
  list.replaceChildren(
    ...(lines.length
      ? lines.map((l) => {
          const minus = h("button", { type: "button", "aria-label": `Remove one ${l.name}` }, "−");
          const plus = h("button", { type: "button", "aria-label": `Add one ${l.name}` }, "+");
          minus.addEventListener("click", () => setQty(l.sku, l.qty - 1));
          plus.addEventListener("click", () => setQty(l.sku, l.qty + 1));
          return h(
            "div",
            { class: "os-cart__item" },
            h("span", { class: "os-cart__name" }, l.name),
            h("span", { class: "os-cart__price" }, money(l.price * l.qty, l.currency)),
            h(
              "span",
              { class: "os-cart__qty" },
              minus,
              h("span", { "aria-label": "Quantity" }, String(l.qty)),
              plus,
            ),
          );
        })
      : [h("p", { class: "os-muted" }, "Your cart is empty.")]),
  );
  const currency = lines[0]?.currency ?? "USD";
  total.replaceChildren(
    h("span", {}, "Subtotal"),
    h(
      "span",
      {},
      money(
        lines.reduce((s, l) => s + l.price * l.qty, 0),
        currency,
      ),
    ),
  );
  checkout.disabled = lines.length === 0;
}

function build(): HTMLDialogElement {
  list = h("div", { class: "os-cart__items" });
  total = h("div", { class: "os-cart__total" });
  message = h("p", { class: "os-form__status", role: "alert" });
  checkout = h("button", { type: "button", class: "os-button os-button--primary" }, "Check out");
  const close = h(
    "button",
    { type: "button", class: "os-menu__close", "aria-label": "Close cart" },
    icon(ICON_CLOSE),
  );
  const d = h(
    "dialog",
    { class: "os-cart", "aria-labelledby": "os-cart-title" },
    h(
      "div",
      { class: "os-cart__inner" },
      h(
        "div",
        { class: "os-cart__head" },
        h("h2", { id: "os-cart-title", class: "os-type-h4" }, "Your cart"),
        close,
      ),
      list,
      h(
        "div",
        { class: "os-cart__foot" },
        total,
        h(
          "p",
          { class: "os-muted os-type-small" },
          "Shipping and taxes are calculated at checkout.",
        ),
        message,
        checkout,
      ),
    ),
  );
  close.addEventListener("click", () => d.close());
  d.addEventListener("click", (e) => {
    if (e.target === d) d.close();
  });
  checkout.addEventListener("click", async () => {
    const { hub, site } = info();
    checkout.disabled = true;
    message.textContent = "";
    message.dataset.state = "";
    try {
      const res = await fetch(`${hub}/c/${site}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          items: read().map((l) => ({ sku: l.sku, qty: l.qty })),
          successUrl: `${location.origin}${location.pathname}?os_checkout=success`,
          cancelUrl: location.href,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
      if (res.ok && body.url) {
        location.assign(body.url);
        return;
      }
      throw new Error(body.message ?? "Checkout is unavailable right now.");
    } catch (err) {
      message.dataset.state = "error";
      message.textContent =
        err instanceof Error && err.message ? err.message : "Checkout is unavailable right now.";
      checkout.disabled = false;
    }
  });
  document.body.append(d);
  return d;
}

function openCart(): void {
  dialog ??= build();
  render();
  dialog.showModal();
}

export default function cart(el: HTMLElement): void {
  if (!bound) {
    bound = true;
    if (new URLSearchParams(location.search).get("os_checkout") === "success") save(key(), []);
    addEventListener("storage", (e) => {
      if (e.key === key()) render();
    });
  }
  if (el.hasAttribute("data-os-cart-toggle")) el.addEventListener("click", openCart);
  if (el.hasAttribute("data-os-add")) {
    const pickSel = el.dataset.osSkuInput;
    const photoSel = el.dataset.osImageTarget;
    const pick = pickSel ? document.querySelector<HTMLSelectElement>(pickSel) : null;
    if (pick && photoSel)
      pick.addEventListener("change", () => {
        const url = pick.selectedOptions[0]?.dataset.osImage;
        const box = document.querySelector(photoSel);
        if (!url || !box) return;
        // The variant photo replaces every candidate (sources and the img), so it shows everywhere.
        for (const s of box.querySelectorAll("source")) s.srcset = url;
        const img = box.querySelector("img");
        if (img) {
          img.removeAttribute("srcset");
          img.src = url;
        }
      });
    el.addEventListener("click", () => {
      const d = { ...el.dataset };
      const pick = d.osSkuInput ? document.querySelector<HTMLSelectElement>(d.osSkuInput) : null;
      const opt = pick?.selectedOptions[0];
      if (opt?.value) {
        d.osSku = opt.value;
        d.osName = opt.dataset.osName ?? d.osName;
        d.osPrice = opt.dataset.osPrice ?? d.osPrice;
      }
      if (!d.osSku) return;
      const qtyInput = d.osQtyInput ? document.querySelector<HTMLInputElement>(d.osQtyInput) : null;
      const qty = Math.max(1, Number(qtyInput?.value ?? 1) || 1);
      const lines = read();
      const line = lines.find((l) => l.sku === d.osSku);
      if (line) line.qty = Math.min(99, line.qty + qty);
      else
        lines.push({
          sku: d.osSku,
          name: d.osName ?? d.osSku,
          price: Number(d.osPrice ?? 0),
          currency: d.osCurrency ?? "USD",
          qty,
        });
      write(lines);
      announce(`${d.osName ?? "Item"} added to cart`);
      if (!el.hasAttribute("data-os-stay")) openCart();
    });
  }
  render();
}
