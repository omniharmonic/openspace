import { reducedMotion } from "./shared";

/**
 * Enhances native `<details>` items: optional exclusive mode (`data-os-exclusive`), smooth
 * open/close (skipped under reduced motion) and opening the item named by the URL hash.
 */
export default function accordion(root: HTMLElement): void {
  const items = [...root.querySelectorAll<HTMLDetailsElement>("details")];
  const exclusive = root.hasAttribute("data-os-exclusive");
  const closeOthers = (current: HTMLDetailsElement) => {
    if (exclusive) for (const d of items) if (d !== current && d.open) d.open = false;
  };
  for (const d of items) {
    const summary = d.querySelector("summary");
    const body = summary?.nextElementSibling as HTMLElement | null;
    summary?.addEventListener("click", (e) => {
      if (reducedMotion() || !body || typeof body.animate !== "function") {
        if (!d.open) closeOthers(d);
        return;
      }
      e.preventDefault();
      const opts = { duration: 260, easing: "cubic-bezier(0.2, 0, 0, 1)" };
      if (d.open) {
        body.animate(
          { height: [`${body.offsetHeight}px`, "0px"], opacity: [1, 0] },
          opts,
        ).onfinish = () => {
          d.open = false;
        };
      } else {
        closeOthers(d);
        d.open = true;
        body.animate({ height: ["0px", `${body.offsetHeight}px`], opacity: [0, 1] }, opts);
      }
    });
  }
  const hash = location.hash.slice(1);
  if (hash) {
    const target = items.find((d) => d.id === hash);
    if (target) target.open = true;
  }
}
