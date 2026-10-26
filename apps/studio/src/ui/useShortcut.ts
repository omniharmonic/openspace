import { useEffect, useRef } from "react";
import { matchesShortcut } from "./shortcuts";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Binds platform-neutral shortcuts ("mod+\\", "shift+1") on window.
 * Ignores keystrokes while typing in a field unless `allowInInputs`.
 */
export function useShortcuts(
  map: Record<string, (e: KeyboardEvent) => void>,
  options: { enabled?: boolean; allowInInputs?: boolean } = {},
) {
  const latest = useRef(map);
  latest.current = map;
  const { enabled = true, allowInInputs = false } = options;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (!allowInInputs && isTyping(e.target)) return;
      for (const [shortcut, handler] of Object.entries(latest.current)) {
        if (matchesShortcut(e, shortcut)) {
          e.preventDefault();
          handler(e);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, allowInInputs]);
}
