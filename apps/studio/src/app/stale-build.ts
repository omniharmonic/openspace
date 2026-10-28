/**
 * A tab opened before a deploy still asks for the previous build's lazily loaded code, which is
 * gone (the address now returns Studio's page, not a script). Reloading picks up the new build;
 * work is already saved (to OpenSpace, or on this device while offline), so that's safe.
 */

const MESSAGES = [
  "Failed to fetch dynamically imported module", // Chromium
  "error loading dynamically imported module", // Firefox
  "Importing a module script failed", // Safari
  "Unable to preload CSS", // Vite's CSS preload
];

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return MESSAGES.some((m) => message.includes(m));
}

const KEY = "os-stale-reload";
/** Reload at most once per this window, so a real outage can't loop. */
export const RELOAD_WINDOW_MS = 30_000;

/** Whether to reload now (and remember that we did), or show the "Reload" screen instead. */
export function claimStaleReload(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  now = Date.now(),
): boolean {
  try {
    const last = storage?.getItem(KEY);
    if (last && now - Number(last) < RELOAD_WINDOW_MS) return false;
    storage?.setItem(KEY, String(now));
    return true;
  } catch {
    return false;
  }
}
