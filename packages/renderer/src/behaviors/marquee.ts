import { h, reducedMotion } from "./shared";

/**
 * Continuous marquee. Duplicates the track content (hidden from assistive tech) for a seamless
 * loop, sets the duration from the content width (`data-os-speed`, px/s, default 40), pauses
 * on hover and focus, and adds a pause button (WCAG 2.2.2). Static under reduced motion.
 */
export default function marquee(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>(".os-marquee__track");
  if (!track || reducedMotion()) return;
  for (const child of [...track.children]) {
    const clone = child.cloneNode(true) as HTMLElement;
    clone.setAttribute("aria-hidden", "true");
    clone.setAttribute("data-os-clone", "");
    for (const f of clone.querySelectorAll("a,button,input")) f.setAttribute("tabindex", "-1");
    track.append(clone);
  }
  const speed = Number(root.dataset.osSpeed) || 40;
  root.style.setProperty("--marquee-duration", `${Math.max(8, track.scrollWidth / 2 / speed)}s`);
  root.classList.add("is-running");
  let held = false;
  const toggle = h(
    "button",
    { type: "button", class: "os-marquee__toggle", "aria-pressed": "false" },
    "Ⅱ",
  );
  toggle.setAttribute("aria-label", "Pause animation");
  const sync = (paused: boolean) => root.classList.toggle("is-paused", paused);
  toggle.addEventListener("click", () => {
    held = !held;
    toggle.setAttribute("aria-pressed", String(held));
    toggle.textContent = held ? "▶" : "Ⅱ";
    sync(held);
  });
  root.addEventListener("mouseenter", () => sync(true));
  root.addEventListener("mouseleave", () => sync(held));
  root.addEventListener("focusin", () => sync(true));
  root.addEventListener("focusout", () => sync(held));
  root.append(toggle);
}
