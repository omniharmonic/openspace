import { load, save } from "./shared";

/**
 * Popup `<dialog>`: opens on a time (`data-os-delay` s), scroll (`data-os-scroll` %) or exit
 * intent trigger, at most once per `data-os-frequency` days per visitor (localStorage).
 */
export default function popup(dialog: HTMLElement): void {
  const d = dialog as HTMLDialogElement;
  const key = `os-popup:${d.id}`;
  const days = Number(d.dataset.osFrequency ?? 7);
  const last = load<number>(key, 0);
  if (last && Date.now() - last < days * 864e5) return;
  let shown = false;
  const show = () => {
    if (shown || typeof d.showModal !== "function") return;
    shown = true;
    d.showModal();
    save(key, Date.now());
    cleanup();
  };
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (max > 0 && (scrollY / max) * 100 >= Number(d.dataset.osScroll ?? 50)) show();
  };
  const onLeave = (e: MouseEvent) => {
    if (e.clientY <= 0 && !e.relatedTarget) show();
  };
  let timer = 0;
  const cleanup = () => {
    clearTimeout(timer);
    removeEventListener("scroll", onScroll);
    document.removeEventListener("mouseout", onLeave);
  };
  const trigger = d.dataset.osTrigger;
  if (trigger === "time") timer = window.setTimeout(show, Number(d.dataset.osDelay ?? 8) * 1000);
  else if (trigger === "scroll") addEventListener("scroll", onScroll, { passive: true });
  else if (trigger === "exit") document.addEventListener("mouseout", onLeave);
  d.querySelector("[data-os-close]")?.addEventListener("click", () => d.close());
  d.addEventListener("click", (e) => {
    if (e.target === d) d.close();
  });
}
