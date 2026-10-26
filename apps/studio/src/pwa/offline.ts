import { create } from "zustand";
import { type HubApi, HubError, type Session, type Site, type TemplateSummary } from "../api/types";

/**
 * Opening Studio offline (PRD §5.1 "offline drafts"): the app shell comes from the service
 * worker and drafts from IndexedDB (Task 23); this wrapper remembers the last session, site
 * list and template gallery so the dashboard and editor can open without the Hub. Everything
 * else passes straight through. Edits made offline queue on the device and sync later.
 */

/**
 * True only when the Hub couldn't be reached (the HTTP client's `status 0`, or a raw fetch
 * failure) — never for a bug that happens to throw a TypeError, and never for a refusal.
 */
export const isNetworkError = (err: unknown): boolean =>
  (err instanceof HubError && err.status === 0) ||
  (err instanceof TypeError &&
    /failed to fetch|networkerror|load failed|network request failed/i.test(err.message));

/** Set while something on screen came from this device's copy. */
export const useOfflineState = create<{ fromDevice: boolean; savedAt: number | null }>(() => ({
  fromDevice: false,
  savedAt: null,
}));

interface Saved<T> {
  value: T;
  savedAt: number;
}

export interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
  /** Remove every key starting with `prefix`. */
  clear(prefix: string): void;
}

const browserStore = (): KeyValue => ({
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // Storage full or blocked: offline copies are a convenience.
    }
  },
  clear: (prefix) => {
    try {
      for (const k of Object.keys(localStorage))
        if (k.startsWith(prefix)) localStorage.removeItem(k);
    } catch {
      // Blocked storage holds nothing to clear.
    }
  },
});

const PREFIX = "openspace.offline.";

export function withOfflineCache(
  hub: HubApi,
  options: { store?: KeyValue; now?: () => number } = {},
): HubApi {
  const kv = options.store ?? browserStore();
  const now = options.now ?? Date.now;
  const save = <T>(key: string, value: T) =>
    kv.set(PREFIX + key, JSON.stringify({ value, savedAt: now() } satisfies Saved<T>));
  const load = <T>(key: string): Saved<T> | null => {
    const raw = kv.get(PREFIX + key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Saved<T>;
    } catch {
      return null;
    }
  };
  const online = () => useOfflineState.setState({ fromDevice: false, savedAt: null });
  const offline = (savedAt: number) => useOfflineState.setState({ fromDevice: true, savedAt });
  const userId = () => load<Session>("session")?.value.user?.id ?? "anon";

  /** Call through; on a network failure fall back to the saved copy (if any). */
  const cached = async <T>(key: () => string, call: () => Promise<T>): Promise<T> => {
    try {
      const value = await call();
      save(key(), value);
      online();
      return value;
    } catch (err) {
      const saved = isNetworkError(err) ? load<T>(key()) : null;
      if (!saved) throw err;
      offline(saved.savedAt);
      return saved.value;
    }
  };

  const wrapped: HubApi = Object.create(hub);
  Object.assign(wrapped, {
    getSession: () =>
      cached<Session>(
        () => "session",
        () => hub.getSession(),
      ),
    listSites: () =>
      cached<Site[]>(
        () => `sites.${userId()}`,
        () => hub.listSites(),
      ),
    getSite: async (id: string) => {
      try {
        const site = await hub.getSite(id);
        online();
        return site;
      } catch (err) {
        const saved = isNetworkError(err) ? load<Site[]>(`sites.${userId()}`) : null;
        const site = saved?.value.find((s) => s.id === id);
        if (!saved || !site) throw err;
        offline(saved.savedAt);
        return site;
      }
    },
    // Signing out forgets this device's copies of the account's session and sites.
    // Even when the sign-out request fails (offline), this device forgets the account.
    logout: async () => {
      try {
        await hub.logout();
        online();
      } finally {
        kv.clear(PREFIX);
      }
    },
    listTemplates: () =>
      cached<TemplateSummary[]>(
        () => "templates",
        () => hub.listTemplates(),
      ),
  } satisfies Partial<HubApi>);
  return wrapped;
}
