import { reducedMotion } from "./shared";

/**
 * Lightweight video. Two forms:
 * - `.os-video[data-os-embed]`: a poster + play button; the provider iframe (YouTube nocookie,
 *   Vimeo, PeerTube…) loads only on click.
 * - `<video data-os-autoplay>`: background video; plays muted when visible, never under
 *   reduced motion (the poster stays).
 */
export default function videoLite(el: HTMLElement): void {
  if (el instanceof HTMLVideoElement) {
    if (reducedMotion()) return;
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    const play = () => {
      el.play().catch(() => {});
    };
    if (typeof IntersectionObserver === "function") {
      new IntersectionObserver(([e]) => (e?.isIntersecting ? play() : el.pause())).observe(el);
    } else play();
    return;
  }
  const button = el.querySelector<HTMLButtonElement>(".os-video__play");
  const src = el.dataset.osEmbed;
  if (!button || !src) return;
  button.addEventListener(
    "click",
    () => {
      const url = new URL(src);
      url.searchParams.set("autoplay", "1");
      const iframe = document.createElement("iframe");
      iframe.src = url.toString();
      iframe.title = el.dataset.osTitle ?? "Video";
      iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
      iframe.allowFullscreen = true;
      iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      el.replaceChildren(iframe);
      iframe.focus();
    },
    { once: true },
  );
}
