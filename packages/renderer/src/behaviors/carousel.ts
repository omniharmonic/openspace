/**
 * Scroll-snap carousel: `.os-carousel__track` scrolls natively (touch, trackpad); prev/next
 * buttons (`[data-os-prev]`, `[data-os-next]`) page through slides and disable at the ends;
 * arrow keys work when the track has focus.
 */
export default function carousel(root: HTMLElement): void {
  const track = root.querySelector<HTMLElement>(".os-carousel__track");
  if (!track) return;
  const prev = root.querySelector<HTMLButtonElement>("[data-os-prev]");
  const next = root.querySelector<HTMLButtonElement>("[data-os-next]");
  if (!track.hasAttribute("tabindex")) track.tabIndex = 0;
  const step = () => {
    const slide = track.firstElementChild as HTMLElement | null;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    const w = slide ? slide.offsetWidth + gap : track.clientWidth;
    return Math.max(w, Math.floor(track.clientWidth / w) * w);
  };
  const go = (dir: number) => track.scrollBy({ left: dir * step(), behavior: "smooth" });
  let frame = 0;
  const update = () => {
    frame = 0;
    const max = track.scrollWidth - track.clientWidth - 2;
    if (prev) prev.disabled = track.scrollLeft <= 2;
    if (next) next.disabled = track.scrollLeft >= max;
  };
  prev?.addEventListener("click", () => go(-1));
  next?.addEventListener("click", () => go(1));
  track.addEventListener(
    "scroll",
    () => {
      if (!frame) frame = requestAnimationFrame(update);
    },
    { passive: true },
  );
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      go(e.key === "ArrowRight" ? 1 : -1);
    }
  });
  update();
}
