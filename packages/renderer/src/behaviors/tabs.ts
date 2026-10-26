/**
 * ARIA tabs: `[role=tab]` buttons (with `aria-controls`) inside `[role=tablist]`. Without
 * JavaScript every panel is visible; with it, one panel shows at a time and arrow keys,
 * Home and End move between tabs (automatic activation, roving tabindex).
 */
export default function tabs(root: HTMLElement): void {
  const list = [...root.querySelectorAll<HTMLElement>('[role="tab"]')];
  if (list.length === 0) return;
  const panel = (tab: HTMLElement) => {
    const id = tab.getAttribute("aria-controls");
    return id ? document.getElementById(id) : null;
  };
  const select = (tab: HTMLElement, focus = false) => {
    for (const t of list) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const p = panel(t);
      if (p) p.hidden = !on;
    }
    if (focus) tab.focus();
  };
  const initial = list.find((t) => t.getAttribute("aria-selected") === "true") ?? list[0];
  if (initial) select(initial);
  for (const [i, tab] of list.entries()) {
    const p = panel(tab);
    if (p) {
      p.setAttribute("role", "tabpanel");
      p.tabIndex = 0;
    }
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      const n = list.length;
      const next: Record<string, number> = {
        ArrowRight: (i + 1) % n,
        ArrowDown: (i + 1) % n,
        ArrowLeft: (i - 1 + n) % n,
        ArrowUp: (i - 1 + n) % n,
        Home: 0,
        End: n - 1,
      };
      const to = next[e.key];
      if (to === undefined) return;
      e.preventDefault();
      const t = list[to];
      if (t) select(t, true);
    });
  }
}
