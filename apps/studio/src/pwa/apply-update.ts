/**
 * "Reload" to the new version of Studio, so that it always ends on the new version within a few
 * seconds, whatever the browser does:
 *
 * 1. Ask the waiting version to take over, and reload as soon as it has (the page's controller
 *    changes, or the waiting worker reports "activated").
 * 2. If neither is reported within {@link SWITCH_TIMEOUT_MS} (iPhones sometimes never fire
 *    `controllerchange`), look again: if the new version has taken over, just reload.
 * 3. If the waiting version is stuck (still waiting), or a reload a moment ago didn't get the new
 *    version, take the old one out of the way: unregister the service worker, drop the cached
 *    app shell, and reload from the network. The next load installs the new version again.
 *
 * Nothing here touches drafts: they live in IndexedDB (and the room), not in the caches.
 */

export const SWITCH_TIMEOUT_MS = 3000;
/** A second "Reload" within this window means the first one didn't take: go straight to step 3. */
export const RETRY_WINDOW_MS = 60_000;
const ATTEMPT_KEY = "os-sw-update-attempt";
/** Workbox's precache (the app shell); runtime caches (fonts, photos) are kept. */
const SHELL_CACHE = /^workbox-precache/;

type Listener = (e: Event) => void;

export interface UpdateEnv {
  serviceWorker: {
    getRegistration(): Promise<ServiceWorkerRegistration | undefined>;
    addEventListener(type: "controllerchange", listener: Listener): void;
    removeEventListener(type: "controllerchange", listener: Listener): void;
  } | null;
  caches: Pick<CacheStorage, "keys" | "delete"> | null;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  reload: () => void;
  online: () => boolean;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
}

export function browserUpdateEnv(): UpdateEnv {
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  return {
    serviceWorker: "serviceWorker" in navigator ? navigator.serviceWorker : null,
    caches: typeof caches === "undefined" ? null : caches,
    storage,
    reload: () => window.location.reload(),
    online: () => navigator.onLine !== false,
    now: Date.now,
    setTimer: (fn, ms) => setTimeout(fn, ms),
  };
}

function recentAttempt(env: UpdateEnv): boolean {
  try {
    const last = Number(env.storage?.getItem(ATTEMPT_KEY));
    return Number.isFinite(last) && last > 0 && env.now() - last < RETRY_WINDOW_MS;
  } catch {
    return false;
  }
}

function markAttempt(env: UpdateEnv) {
  try {
    env.storage?.setItem(ATTEMPT_KEY, String(env.now()));
  } catch {
    // Private mode: a repeat tap just takes the normal route again.
  }
}

/** Step 3: unregister the old version and reload from the network (never while offline). */
async function reloadFresh(env: UpdateEnv, reg: ServiceWorkerRegistration | undefined) {
  if (env.online()) {
    try {
      await reg?.unregister();
      if (env.caches) {
        const names = await env.caches.keys();
        await Promise.all(
          names.filter((n) => SHELL_CACHE.test(n)).map((n) => env.caches?.delete(n)),
        );
      }
    } catch {
      // Best effort: reload regardless.
    }
  }
  env.reload();
}

/**
 * Switch to the waiting version and reload. Resolves once a reload has been asked for (the page
 * is then going away). `force` skips straight to the fresh reload.
 */
export async function applyUpdate(
  env: UpdateEnv = browserUpdateEnv(),
  { force = false }: { force?: boolean } = {},
): Promise<void> {
  const retry = force || recentAttempt(env);
  markAttempt(env);
  const sw = env.serviceWorker;
  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = await sw?.getRegistration();
  } catch {
    reg = undefined;
  }
  if (retry) return reloadFresh(env, reg);
  const waiting = reg?.waiting;
  // Nothing waiting (another tab already switched, or the new version is active): a reload
  // picks up whatever is current.
  if (!sw || !reg || !waiting) {
    env.reload();
    return;
  }
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      sw.removeEventListener("controllerchange", finish);
      env.reload();
      resolve();
    };
    sw.addEventListener("controllerchange", finish);
    waiting.addEventListener("statechange", () => {
      if (waiting.state === "activated") finish();
    });
    try {
      waiting.postMessage({ type: "SKIP_WAITING" });
    } catch {
      // A worker that went away: the timeout below sorts it out.
    }
    env.setTimer(() => {
      if (done) return;
      // Still waiting: it's stuck. Otherwise it took over without telling us.
      if (reg.waiting === waiting && waiting.state === "installed") {
        done = true;
        sw.removeEventListener("controllerchange", finish);
        void reloadFresh(env, reg).then(resolve);
      } else finish();
    }, SWITCH_TIMEOUT_MS);
  });
}
