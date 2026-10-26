/**
 * Behavior manifest (browser-safe). Each behavior is a vanilla ES module with a default export
 * `init(el: HTMLElement)`, attached by `data-os-behavior="<name>"` (several names may be
 * space-separated). The loader `os-behaviors.js` finds those elements and imports only the
 * modules the page uses, from its own directory.
 */
export const BEHAVIORS = [
  "carousel",
  "lightbox",
  "accordion",
  "tabs",
  "marquee",
  "reveal",
  "menu",
  "popup",
  "announcement",
  "form",
  "newsletter",
  "video-lite",
  "search",
  "cart",
  "beacon",
  "before-after",
  "countdown",
] as const;
export type BehaviorName = (typeof BEHAVIORS)[number];

/** File name (without `.js`) of the loader that auto-initialises behaviors. */
export const BEHAVIOR_LOADER = "os-behaviors";

/** Gzipped size budgets in bytes (Global Constraint 4; arch §4.2, §9.3). */
export const BEHAVIOR_BUDGETS: Record<BehaviorName | typeof BEHAVIOR_LOADER, number> = {
  ...(Object.fromEntries(BEHAVIORS.map((b) => [b, 3 * 1024])) as Record<BehaviorName, number>),
  cart: 12 * 1024,
  beacon: 1024,
  [BEHAVIOR_LOADER]: 1024,
};

const KNOWN = new Set<string>(BEHAVIORS);
const ATTR_RE = /data-os-behavior="([^"]*)"/g;

export function isBehaviorName(name: string): name is BehaviorName {
  return KNOWN.has(name);
}

/** Behaviors referenced in rendered HTML, in manifest order (unknown names ignored). */
export function behaviorsInHtml(html: string): BehaviorName[] {
  const found = new Set<string>();
  for (const m of html.matchAll(ATTR_RE)) {
    for (const name of (m[1] ?? "").split(/\s+/)) if (name) found.add(name);
  }
  return BEHAVIORS.filter((b) => found.has(b));
}
