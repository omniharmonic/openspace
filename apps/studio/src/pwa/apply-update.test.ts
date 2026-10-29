import { describe, expect, it, vi } from "vitest";
import { applyUpdate, RETRY_WINDOW_MS, SWITCH_TIMEOUT_MS, type UpdateEnv } from "./apply-update";

/** A fake waiting worker + registration + container, and a fake clock. */
function setup({
  waiting = true,
  activates = true,
  announces = true,
  online = true,
}: {
  waiting?: boolean;
  activates?: boolean;
  announces?: boolean;
  online?: boolean;
} = {}) {
  const timers: Array<() => void> = [];
  const controllerListeners = new Set<(e: Event) => void>();
  const stateListeners: Array<() => void> = [];
  const worker = {
    state: "installed" as ServiceWorkerState,
    postMessage: vi.fn((msg: { type?: string }) => {
      if (msg.type !== "SKIP_WAITING" || !activates) return;
      worker.state = "activated";
      reg.waiting = null;
      if (announces) {
        for (const l of stateListeners) l();
        for (const l of controllerListeners) l(new Event("controllerchange"));
      }
    }),
    addEventListener: (_t: string, l: () => void) => void stateListeners.push(l),
  };
  const reg = {
    waiting: waiting ? (worker as unknown as ServiceWorker) : null,
    unregister: vi.fn(async () => true),
  } as { waiting: ServiceWorker | null; unregister: ReturnType<typeof vi.fn> };
  const store = new Map<string, string>();
  const cacheNames = ["workbox-precache-v2-http://x/", "os-fonts"];
  const env: UpdateEnv = {
    serviceWorker: {
      getRegistration: async () => reg as unknown as ServiceWorkerRegistration,
      addEventListener: (_t, l) => void controllerListeners.add(l),
      removeEventListener: (_t, l) => void controllerListeners.delete(l),
    },
    caches: {
      keys: async () => [...cacheNames],
      delete: vi.fn(async (n: string) => {
        cacheNames.splice(cacheNames.indexOf(n), 1);
        return true;
      }),
    },
    storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) },
    reload: vi.fn(),
    online: () => online,
    now: () => 1_000_000,
    setTimer: (fn) => void timers.push(fn),
  };
  return { env, reg, worker, timers, cacheNames, store };
}

describe("Reload to the new version", () => {
  it("asks the waiting version to take over, then reloads", async () => {
    const { env, worker, reg } = setup();
    await applyUpdate(env);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(env.reload).toHaveBeenCalledOnce();
    expect(reg.unregister).not.toHaveBeenCalled();
  });

  it("reloads anyway when the browser never says the new version took over (iPhone)", async () => {
    const { env, timers, reg } = setup({ announces: false });
    const done = applyUpdate(env);
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    expect(env.reload).not.toHaveBeenCalled();
    timers[0]?.();
    await done;
    expect(env.reload).toHaveBeenCalledOnce();
    // It did take over: no need for the heavy route.
    expect(reg.unregister).not.toHaveBeenCalled();
  });

  it("gets past a waiting version that's stuck: unregister, drop the app shell, reload", async () => {
    const { env, timers, reg, cacheNames } = setup({ activates: false });
    const done = applyUpdate(env);
    await vi.waitFor(() => expect(timers).toHaveLength(1));
    timers[0]?.();
    await done;
    expect(reg.unregister).toHaveBeenCalledOnce();
    // Only the app shell; photos and fonts stay cached. Drafts aren't in caches at all.
    expect(cacheNames).toEqual(["os-fonts"]);
    expect(env.reload).toHaveBeenCalledOnce();
    expect(SWITCH_TIMEOUT_MS).toBeLessThanOrEqual(5000);
  });

  it("goes straight to the sure route when a Reload a moment ago didn't take", async () => {
    const { env, reg, worker, store } = setup();
    store.set("os-sw-update-attempt", String(1_000_000 - RETRY_WINDOW_MS / 2));
    await applyUpdate(env);
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(reg.unregister).toHaveBeenCalledOnce();
    expect(env.reload).toHaveBeenCalledOnce();
  });

  it("just reloads when nothing is waiting any more", async () => {
    const { env, reg } = setup({ waiting: false });
    await applyUpdate(env);
    expect(env.reload).toHaveBeenCalledOnce();
    expect(reg.unregister).not.toHaveBeenCalled();
  });

  it("never unregisters while offline (the reload would have nothing to load)", async () => {
    const { env, reg } = setup({ online: false });
    await applyUpdate(env, { force: true });
    expect(reg.unregister).not.toHaveBeenCalled();
    expect(env.reload).toHaveBeenCalledOnce();
  });
});
