import type { Op } from "@openspace/ops";
import type { SiteDocument } from "@openspace/schema";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { Site } from "../../api/types";

/**
 * Local copy of a site's draft, kept on this device so edits are saved instantly and survive
 * going offline or closing the tab (PRD §4.3 "Autosave, always"; arch §5.3 offline mode).
 *
 * `doc` is the room's document at `seq` (what the Hub has confirmed); `pending` are this
 * device's edits the Hub hasn't confirmed yet, in order. The editor shows `doc` + `pending`.
 */
export interface DraftRecord {
  siteId: string;
  doc: SiteDocument;
  seq: number;
  head: string | null;
  pending: Op[];
  /** The site as last seen, so the editor can open while the Hub is unreachable. */
  site?: Site;
  savedAt: number;
}

export interface DraftCache {
  get(siteId: string): Promise<DraftRecord | undefined>;
  put(record: DraftRecord): Promise<void>;
  delete(siteId: string): Promise<void>;
}

interface DraftDB extends DBSchema {
  drafts: { key: string; value: DraftRecord };
}

const DB_NAME = "openspace-studio";
const DB_VERSION = 1;

/** IndexedDB-backed cache (the default in browsers). */
export function createIdbDraftCache(name = DB_NAME): DraftCache {
  let db: Promise<IDBPDatabase<DraftDB>> | null = null;
  const open = () => {
    db ??= openDB<DraftDB>(name, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains("drafts"))
          d.createObjectStore("drafts", { keyPath: "siteId" });
      },
    });
    return db;
  };
  return {
    async get(siteId) {
      return (await open()).get("drafts", siteId);
    },
    async put(record) {
      await (await open()).put("drafts", record);
    },
    async delete(siteId) {
      await (await open()).delete("drafts", siteId);
    },
  };
}

/** In-memory cache (tests, and browsers without IndexedDB). */
export function createMemoryDraftCache(): DraftCache & { records: Map<string, DraftRecord> } {
  const records = new Map<string, DraftRecord>();
  return {
    records,
    async get(siteId) {
      const r = records.get(siteId);
      return r ? structuredClone(r) : undefined;
    },
    async put(record) {
      records.set(record.siteId, structuredClone(record));
    },
    async delete(siteId) {
      records.delete(siteId);
    },
  };
}

let shared: DraftCache | null = null;

/** The device's draft cache: IndexedDB when available, else memory. */
export function defaultDraftCache(): DraftCache {
  shared ??= typeof indexedDB !== "undefined" ? createIdbDraftCache() : createMemoryDraftCache();
  return shared;
}
