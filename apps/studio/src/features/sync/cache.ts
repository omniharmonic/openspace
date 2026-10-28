import type { Op } from "@omniharmonic/openspace-ops";
import type { SiteDocument } from "@omniharmonic/openspace-schema";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { Site } from "../../api/types";

/**
 * Local copy of a site's draft, kept on this device so edits are saved instantly and survive
 * going offline or closing the tab (PRD §4.3 "Autosave, always"; arch §5.3 offline mode).
 *
 * `doc` is the room's document at `seq` (what the Hub has confirmed); `pending` are this
 * tab's edits the Hub hasn't confirmed yet, in order. The editor shows `doc` + `pending`.
 *
 * Every editor tab writes its own record (`userId:siteId:tabId`), so two tabs editing offline
 * never overwrite each other's queue. The next tab that opens the site adopts every record of
 * the same person (merging their pending edits; the room dedupes ops by id), writes the merged
 * record under its own key, then removes the adopted ones. Records are scoped to the signed-in
 * person, so another account's queued edits are never resubmitted.
 */
export interface DraftRecord {
  /** `userId:siteId:tabId`. */
  key: string;
  siteId: string;
  userId: string;
  tabId: string;
  doc: SiteDocument;
  seq: number;
  head: string | null;
  pending: Op[];
  /** Recovered edits made on an older seq than `seq` (op id → seq); others were made on `seq`. */
  pendingBase?: Record<string, number>;
  /** The site as last seen, so the editor can open while the Hub is unreachable. */
  site?: Site;
  savedAt: number;
}

export const draftKey = (userId: string, siteId: string, tabId: string) =>
  `${userId}:${siteId}:${tabId}`;

export interface DraftCache {
  /** Every record this person has for the site (one per tab that edited it). */
  list(userId: string, siteId: string): Promise<DraftRecord[]>;
  put(record: DraftRecord): Promise<void>;
  delete(key: string): Promise<void>;
  /**
   * Delete a record only if it is still the version that was read (same `savedAt`), in one
   * transaction, so a tab that saved new edits in the meantime keeps them.
   */
  deleteIfUnchanged(key: string, savedAt: number): Promise<boolean>;
}

interface DraftDB extends DBSchema {
  drafts: { key: string; value: DraftRecord };
}

const DB_NAME = "openspace-studio";
const DB_VERSION = 2;

/** How long one device-storage call may take before it counts as failed. */
export const DRAFT_CACHE_TIMEOUT_MS = 4000;

/**
 * Bound a device-storage call. Safari's IndexedDB can stop answering (e.g. after the page was
 * in the background: "Connection to Indexed Database server lost"); a call that never settles
 * would leave the editor on its loading spinner. Failing instead lets the editor carry on from
 * OpenSpace, and the next call opens a fresh connection.
 */
export function withDeadline<T>(work: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      onTimeout?.();
      reject(new Error("This device’s storage didn’t answer"));
    }, ms);
    work.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

/** IndexedDB-backed cache (the default in browsers). */
export function createIdbDraftCache(
  name = DB_NAME,
  options: { timeoutMs?: number; openDb?: typeof openDB } = {},
): DraftCache {
  const timeoutMs = options.timeoutMs ?? DRAFT_CACHE_TIMEOUT_MS;
  const open_ = options.openDb ?? openDB;
  let db: Promise<IDBPDatabase<DraftDB>> | null = null;
  const reset = () => {
    const old = db;
    db = null;
    void old?.then((d) => d.close()).catch(() => undefined);
  };
  const open = () => {
    db ??= open_<DraftDB>(name, DB_VERSION, {
      upgrade(d, oldVersion) {
        // v1 records were keyed by site only (one writer per device); start over.
        if (oldVersion < 2 && d.objectStoreNames.contains("drafts")) d.deleteObjectStore("drafts");
        d.createObjectStore("drafts", { keyPath: "key" });
      },
      // Another tab (a newer Studio) wants to upgrade: let it, and reopen next time.
      blocking: () => reset(),
      // The browser dropped the connection: reopen next time.
      terminated: () => {
        db = null;
      },
    });
    return db;
  };
  /** One call with a deadline; a failure or timeout drops the connection so the next reopens. */
  const run = async <T>(fn: (d: IDBPDatabase<DraftDB>) => Promise<T>): Promise<T> => {
    try {
      return await withDeadline(open().then(fn), timeoutMs);
    } catch (err) {
      reset();
      throw err;
    }
  };
  return {
    list(userId, siteId) {
      const prefix = `${userId}:${siteId}:`;
      const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
      return run((d) => d.getAll("drafts", range));
    },
    async put(record) {
      await run((d) => d.put("drafts", record));
    },
    async delete(key) {
      await run((d) => d.delete("drafts", key));
    },
    deleteIfUnchanged(key, savedAt) {
      return run(async (d) => {
        const tx = d.transaction("drafts", "readwrite");
        const current = await tx.store.get(key);
        let deleted = false;
        if (current && current.savedAt === savedAt) {
          await tx.store.delete(key);
          deleted = true;
        }
        await tx.done;
        return deleted;
      });
    },
  };
}

/** In-memory cache (tests, and browsers without IndexedDB). */
export function createMemoryDraftCache(): DraftCache & { records: Map<string, DraftRecord> } {
  const records = new Map<string, DraftRecord>();
  return {
    records,
    async list(userId, siteId) {
      return [...records.values()]
        .filter((r) => r.userId === userId && r.siteId === siteId)
        .map((r) => structuredClone(r));
    },
    async put(record) {
      records.set(record.key, structuredClone(record));
    },
    async delete(key) {
      records.delete(key);
    },
    async deleteIfUnchanged(key, savedAt) {
      if (records.get(key)?.savedAt !== savedAt) return false;
      records.delete(key);
      return true;
    },
  };
}

let shared: DraftCache | null = null;

/** The device's draft cache: IndexedDB when available, else memory. */
export function defaultDraftCache(): DraftCache {
  shared ??= typeof indexedDB !== "undefined" ? createIdbDraftCache() : createMemoryDraftCache();
  return shared;
}

/** This page load's tab id (a reload is a new tab: its old record is adopted, then removed). */
export const TAB_ID = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
