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

/** The message a lazily loaded screen fails with when its code never arrives. */
export const CHUNK_TIMEOUT_MESSAGE = "Importing a module script failed (no answer in time)";

/** How long a screen's code may take to arrive (it normally comes from this device's copy). */
export const CHUNK_TIMEOUT_MS = 45_000;

/**
 * A dynamic import that gives up after `ms`: a request for code that never answers (a stalled
 * connection, a service worker that doesn't respond) would otherwise leave a spinner up forever.
 * The failure reads as a stale build, so the screen's error handling reloads once.
 */
export function importWithTimeout<T>(
  load: () => Promise<T>,
  ms = CHUNK_TIMEOUT_MS,
  setTimer: (fn: () => void, ms: number) => unknown = (fn, t) => setTimeout(fn, t),
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimer(() => reject(new Error(CHUNK_TIMEOUT_MESSAGE)), ms);
    load().then(
      (v) => {
        clearTimeout(timer as number);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer as number);
        reject(err);
      },
    );
  });
}
