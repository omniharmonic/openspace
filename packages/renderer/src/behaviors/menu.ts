import { focusables, trapFocus } from "./shared";

/**
 * Site header: mobile menu (slide, drawer, fullscreen or dropdown) with focus trap, Esc, scroll
 * lock and focus return; nav folder dropdowns that close on outside click / Esc; and the
 * `is-scrolled` state for sticky and transparent headers.
 */
export default function menu(header: HTMLElement): void {
  const toggle = header.querySelector<HTMLButtonElement>("[data-os-menu-toggle]");
  const panel = header.querySelector<HTMLElement>("[data-os-menu]");
  const folders = [...header.querySelectorAll<HTMLDetailsElement>("details[data-os-folder]")];
  const root = document.documentElement;
  const modal = panel && !panel.classList.contains("os-menu--dropdown");
  let trap: ((e: KeyboardEvent) => void) | undefined;

  const isOpen = () => panel?.classList.contains("is-open") ?? false;
  const open = () => {
    if (!panel || !toggle) return;
    panel.classList.add("is-open");
    header.classList.add("is-menu-open");
    toggle.setAttribute("aria-expanded", "true");
    if (modal) {
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("aria-label", "Menu");
      root.style.overflow = "hidden";
      trap = trapFocus(panel);
    }
    (focusables(panel)[0] ?? panel).focus();
  };
  const close = (restore = true) => {
    if (!panel || !toggle || !isOpen()) return;
    panel.classList.remove("is-open");
    header.classList.remove("is-menu-open");
    toggle.setAttribute("aria-expanded", "false");
    root.style.overflow = "";
    if (trap) panel.removeEventListener("keydown", trap);
    trap = undefined;
    if (restore) toggle.focus();
  };

  toggle?.addEventListener("click", () => (isOpen() ? close() : open()));
  header.querySelector("[data-os-menu-close]")?.addEventListener("click", () => close());
  panel?.addEventListener("click", (e) => {
    if ((e.target as Element).closest("a[href]")) close(false);
  });
  // A click on the scrim (the header's ::before) targets the header itself.
  header.addEventListener("click", (e) => {
    if (e.target === header) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (isOpen()) close();
    for (const f of folders) {
      if (f.open) {
        f.open = false;
        f.querySelector("summary")?.focus();
      }
    }
  });
  document.addEventListener("click", (e) => {
    for (const f of folders) if (f.open && !f.contains(e.target as Node)) f.open = false;
  });
  for (const f of folders) {
    f.addEventListener("toggle", () => {
      if (f.open && !panel?.contains(f)) for (const o of folders) if (o !== f) o.open = false;
    });
  }
  // A long menu (`--nav-wide`) only goes inline from 1440px.
  const desktop = matchMedia(
    `(min-width: ${header.classList.contains("os-header--nav-wide") ? 1440 : 1024}px)`,
  );
  desktop.addEventListener?.("change", () => {
    if (desktop.matches && !header.classList.contains("is-drawer")) close(false);
  });

  if (header.classList.contains("is-sticky") || header.classList.contains("is-overlay")) {
    let frame = 0;
    const update = () => {
      frame = 0;
      header.classList.toggle("is-scrolled", scrollY > 8);
    };
    addEventListener(
      "scroll",
      () => {
        if (!frame) frame = requestAnimationFrame(update);
      },
      { passive: true },
    );
    update();
  }
}
