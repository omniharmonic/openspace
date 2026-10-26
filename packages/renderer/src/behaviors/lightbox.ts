import { h, ICON_CLOSE, ICON_NEXT, ICON_PREV, icon } from "./shared";

/**
 * Lightbox for galleries: links `a[data-os-lightbox]` (href = full-size image) open a native
 * modal `<dialog>` with caption, previous/next buttons and arrow keys; Esc closes and focus
 * returns to the thumbnail.
 */
let dialog: HTMLDialogElement | undefined;
let items: HTMLAnchorElement[] = [];
let index = 0;
let opener: HTMLElement | null = null;
let img: HTMLImageElement;
let caption: HTMLElement;

function build(): HTMLDialogElement {
  img = h("img", { class: "os-lightbox__img", alt: "" });
  caption = h("figcaption", { class: "os-lightbox__caption" });
  const btn = (cls: string, label: string, d: string, fn: () => void) => {
    const b = h("button", { type: "button", class: `os-lightbox__btn ${cls}`, "aria-label": label }, icon(d));
    b.addEventListener("click", fn);
    return b;
  };
  const d = h(
    "dialog",
    { class: "os-lightbox os-theme-dark", "aria-label": "Image viewer" },
    h("figure", { class: "os-lightbox__figure" }, h("div", {}, img, caption)),
    btn("os-lightbox__prev", "Previous image", ICON_PREV, () => show(index - 1)),
    btn("os-lightbox__next", "Next image", ICON_NEXT, () => show(index + 1)),
    btn("os-lightbox__close", "Close", ICON_CLOSE, () => d.close()),
  );
  d.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") show(index + 1);
    if (e.key === "ArrowLeft") show(index - 1);
  });
  d.addEventListener("click", (e) => {
    if (e.target === d) d.close();
  });
  d.addEventListener("close", () => opener?.focus());
  document.body.append(d);
  return d;
}

function show(i: number): void {
  const n = items.length;
  index = ((i % n) + n) % n;
  const a = items[index];
  if (!a) return;
  const thumb = a.querySelector("img");
  img.src = a.href;
  img.alt = thumb?.alt ?? "";
  caption.textContent = a.dataset.osCaption ?? "";
  for (const b of dialog?.querySelectorAll<HTMLElement>(".os-lightbox__prev,.os-lightbox__next") ?? [])
    b.hidden = n < 2;
}

export default function lightbox(root: HTMLElement): void {
  const links = [...root.querySelectorAll<HTMLAnchorElement>("a[data-os-lightbox]")];
  for (const a of links) {
    a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      dialog ??= build();
      items = links;
      opener = a;
      show(links.indexOf(a));
      dialog.showModal();
    });
  }
}
