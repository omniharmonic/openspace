import { reducedMotion } from "./shared";

/**
 * Entrance reveals (IntersectionObserver). Elements with `data-os-reveal` start hidden only
 * once this runs (never without JavaScript); anything already on screen is revealed
 * immediately so above-the-fold content never flashes. `data-os-stagger` staggers a section's
 * blocks. Disabled under reduced motion.
 */
let io: IntersectionObserver | undefined;

export default function reveal(el: HTMLElement): void {
  if (reducedMotion() || typeof IntersectionObserver !== "function") {
    el.classList.add("is-revealed");
    return;
  }
  if (el.hasAttribute("data-os-stagger") || el.classList.contains("os-section")) {
    el.querySelectorAll<HTMLElement>(".os-block").forEach((b, i) => {
      b.style.setProperty("--i", el.hasAttribute("data-os-stagger") ? String(i) : "0");
    });
  }
  const rect = el.getBoundingClientRect();
  if (rect.top < innerHeight && rect.bottom > 0) el.classList.add("is-revealed");
  document.documentElement.classList.add("os-reveal-ready");
  if (el.classList.contains("is-revealed")) return;
  io ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-revealed");
        io?.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  io.observe(el);
}
