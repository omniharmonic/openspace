/**
 * Countdown to `data-os-target` (ISO date-time). Fills `[data-os-unit=days|hours|minutes|seconds]`
 * each second (each minute when there is no seconds unit) and, once the time has passed, hides
 * `.os-countdown__units` and shows `.os-countdown__done`. Without JavaScript the target date
 * printed in the markup is all visitors see.
 */
export default function countdown(root: HTMLElement): void {
  const target = Date.parse(root.dataset.osTarget ?? "");
  if (Number.isNaN(target)) return;
  const units = root.querySelector<HTMLElement>(".os-countdown__units");
  const done = root.querySelector<HTMLElement>(".os-countdown__done");
  const slot = (u: string) => root.querySelector<HTMLElement>(`[data-os-unit="${u}"]`);
  const parts: [HTMLElement | null, number, number][] = [
    [slot("days"), 86400, 1e9],
    [slot("hours"), 3600, 24],
    [slot("minutes"), 60, 60],
    [slot("seconds"), 1, 60],
  ];
  const everySecond = !!parts[3]?.[0];
  let timer = 0;
  const tick = () => {
    const left = Math.max(0, Math.floor((target - Date.now()) / 1000));
    for (const [el, size, mod] of parts) {
      if (el) el.textContent = String(Math.floor(left / size) % mod).padStart(2, "0");
    }
    if (left === 0) {
      clearInterval(timer);
      if (units) units.hidden = true;
      if (done) done.hidden = false;
      root.classList.add("is-done");
    }
  };
  tick();
  if (!root.classList.contains("is-done"))
    timer = window.setInterval(tick, everySecond ? 1000 : 15000);
  root.classList.add("is-ready");
}
