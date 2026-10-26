/**
 * Keyboard shortcut helpers. Shortcuts are written platform-neutrally,
 * e.g. "mod+k", "shift+mod+z", "alt+arrowup", "?" — `mod` is ⌘ on Apple
 * platforms and Ctrl elsewhere.
 */
export type Platform = "mac" | "other";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const p = nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent ?? "";
  return /mac|iphone|ipad|ipod/i.test(p) ? "mac" : "other";
}

const MAC_SYMBOLS: Record<string, string> = {
  mod: "⌘",
  meta: "⌘",
  cmd: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
};

const OTHER_NAMES: Record<string, string> = {
  mod: "Ctrl",
  meta: "Win",
  cmd: "Ctrl",
  ctrl: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
};

const KEY_NAMES: Record<string, string> = {
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  enter: "↵",
  escape: "Esc",
  esc: "Esc",
  backspace: "⌫",
  delete: "Del",
  space: "Space",
  tab: "Tab",
  backslash: "\\",
};

/** Splits a shortcut into display keys, e.g. "shift+mod+z" → ["⇧", "⌘", "Z"] on mac. */
export function shortcutKeys(shortcut: string, platform: Platform = detectPlatform()): string[] {
  const parts = shortcut === "+" ? ["+"] : shortcut.split("+").filter(Boolean);
  const order = ["ctrl", "alt", "option", "shift", "mod", "meta", "cmd"];
  const mods = parts.slice(0, -1).map((p) => p.toLowerCase());
  const key = parts[parts.length - 1] ?? "";
  // Apple's canonical modifier order is ⌃⌥⇧⌘.
  if (platform === "mac") mods.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const table = platform === "mac" ? MAC_SYMBOLS : OTHER_NAMES;
  const modLabels = mods.map((m) => table[m] ?? m);
  const lower = key.toLowerCase();
  const keyLabel = KEY_NAMES[lower] ?? (key.length === 1 ? key.toUpperCase() : key);
  return [...modLabels, keyLabel];
}

/** Human-readable label for a shortcut, e.g. "⇧⌘Z" or "Shift+Ctrl+Z". */
export function formatShortcut(shortcut: string, platform: Platform = detectPlatform()): string {
  return shortcutKeys(shortcut, platform).join(platform === "mac" ? "" : "+");
}

interface KeyLike {
  key: string;
  /** Physical key; lets ⌥1 match on macOS where `key` becomes "¡". */
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** True when a keyboard event matches a shortcut string. */
export function matchesShortcut(
  event: KeyLike,
  shortcut: string,
  platform: Platform = detectPlatform(),
): boolean {
  const parts = shortcut.toLowerCase().split("+").filter(Boolean);
  const key = parts[parts.length - 1];
  const mods = new Set(parts.slice(0, -1));
  const wantMod = mods.has("mod") || mods.has("cmd");
  const wantMeta = (wantMod && platform === "mac") || mods.has("meta");
  const wantCtrl = (wantMod && platform !== "mac") || mods.has("ctrl");
  if (event.metaKey !== wantMeta || event.ctrlKey !== wantCtrl) return false;
  if (event.altKey !== (mods.has("alt") || mods.has("option"))) return false;
  // Shift is implied for symbols like "?"; only enforce it when stated.
  if (mods.has("shift") && !event.shiftKey) return false;
  if (!mods.has("shift") && event.shiftKey && key && /^[a-z0-9]$/.test(key)) return false;
  const pressed = event.key.toLowerCase();
  if (key === "backslash") return pressed === "\\" || event.code === "Backslash";
  if (key === "space") return pressed === " ";
  if (pressed === key) return true;
  if (key && event.code) {
    if (/^[a-z]$/.test(key)) return event.code === `Key${key.toUpperCase()}`;
    if (/^[0-9]$/.test(key)) return event.code === `Digit${key}`;
  }
  return false;
}
