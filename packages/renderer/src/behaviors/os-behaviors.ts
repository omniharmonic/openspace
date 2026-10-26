/**
 * Behavior loader. Finds `[data-os-behavior]` elements (names space-separated) and imports only
 * the behavior modules the page uses, from this file's directory, calling each module's default
 * export once per element. `window.OpenSpace.scan(root)` re-scans injected content.
 */
type Init = (el: HTMLElement) => void;

const dir = new URL(".", import.meta.url);
const modules = new Map<string, Promise<{ default?: Init }>>();
const started = new WeakMap<Element, Set<string>>();

function scan(root: ParentNode = document): void {
  const els = [...root.querySelectorAll<HTMLElement>("[data-os-behavior]")];
  if (root instanceof HTMLElement && root.matches("[data-os-behavior]")) els.unshift(root);
  for (const el of els) {
    for (const name of (el.dataset.osBehavior ?? "").split(/\s+/)) {
      if (!/^[a-z][a-z-]*$/.test(name)) continue;
      const seen = started.get(el) ?? new Set<string>();
      started.set(el, seen);
      if (seen.has(name)) continue;
      seen.add(name);
      const mod = modules.get(name) ?? import(new URL(`${name}.js`, dir).href);
      modules.set(name, mod);
      mod
        .then((m) => m.default?.(el))
        .catch((err) => console.warn(`[openspace] ${name} behavior failed`, err));
    }
  }
}

(window as unknown as { OpenSpace: { scan: typeof scan } }).OpenSpace = { scan };
scan();
