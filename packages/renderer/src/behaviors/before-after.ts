/**
 * Before/after image comparison. The "before" image is clipped with CSS
 * (`clip-path: inset(0 calc(100% - var(--pos)) 0 0)`); a native range input
 * (`input[type=range]`, keyboard and touch accessible) drives `--pos`. Without JavaScript the
 * range is hidden and both images are shown side by side.
 */
export default function beforeAfter(root: HTMLElement): void {
  const range = root.querySelector<HTMLInputElement>("input[type=range]");
  if (!range) return;
  const before = root.dataset.osBefore || "Before";
  const after = root.dataset.osAfter || "After";
  const set = () => {
    const v = Math.max(0, Math.min(100, Number(range.value) || 0));
    root.style.setProperty("--pos", `${v}%`);
    range.setAttribute("aria-valuetext", `${v}% ${before}, ${100 - v}% ${after}`);
  };
  range.addEventListener("input", set);
  set();
  root.classList.add("is-ready");
}
