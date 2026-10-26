/** Tiny helpers shared by behaviors (each behavior bundle inlines only what it imports). */

export const reducedMotion = (): boolean =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** localStorage JSON read; `fallback` when storage is unavailable or the value is corrupt. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: degrade silently */
  }
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Visible focusable descendants, in DOM order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/** Keep Tab / Shift+Tab inside `root`. Returns the keydown handler to remove later. */
export function trapFocus(root: HTMLElement): (e: KeyboardEvent) => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = focusables(root);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  root.addEventListener("keydown", handler);
  return handler;
}

/** Site metadata the renderer puts on `<body>`. */
export function siteInfo(): { site: string; hub: string; base: string } {
  const d = document.body.dataset;
  return { site: d.osSite ?? "", hub: d.osHub ?? "", base: d.osBase ?? "" };
}

/** Create an element with attributes and children in one call. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

/** Inline SVG icon from a path `d` (24px viewBox, currentColor stroke). */
export function icon(d: string): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.6");
  path.setAttribute("stroke-linecap", "round");
  svg.append(path);
  return svg;
}

export const ICON_CLOSE = "M6 6l12 12M18 6L6 18";
export const ICON_PREV = "M15 5l-7 7 7 7";
export const ICON_NEXT = "M9 5l7 7-7 7";
