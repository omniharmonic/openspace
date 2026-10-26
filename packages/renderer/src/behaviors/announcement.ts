import { load, save } from "./shared";

/** Dismissible announcement bar; remembers dismissal per message (`data-os-key`). */
export default function announcement(el: HTMLElement): void {
  const key = `os-announcement:${el.dataset.osKey ?? ""}`;
  if (load(key, false)) {
    el.hidden = true;
    return;
  }
  el.querySelector("[data-os-dismiss]")?.addEventListener("click", () => {
    el.hidden = true;
    save(key, true);
  });
}
