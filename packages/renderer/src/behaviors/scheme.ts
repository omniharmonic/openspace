import { save } from "./shared";

/**
 * Light/dark toggle for `auto` appearance sites. The page follows the visitor's device until
 * they choose; the choice is remembered (`os-scheme`) and applied before first paint by the
 * inline head script, so a returning visitor never sees the other scheme flash.
 */
const KEY = "os-scheme";
const ATTR = "data-os-scheme";

export default function scheme(el: HTMLElement): void {
  const root = document.documentElement;
  const media =
    typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const current = () => root.getAttribute(ATTR) ?? (media?.matches ? "dark" : "light");
  const sync = () => el.setAttribute("aria-pressed", String(current() === "dark"));
  sync();
  media?.addEventListener?.("change", sync);
  el.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    root.setAttribute(ATTR, next);
    save(KEY, next);
    sync();
  });
}
