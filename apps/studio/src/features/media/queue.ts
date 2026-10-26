import type { MediaMeta } from "@openspace/schema";

/**
 * Upload queue persisted in IndexedDB (arch §5.6 step 5): processed files wait here until the
 * Hub has them, so closing the tab or losing the connection never loses an upload. Falls back to
 * memory when IndexedDB isn't available (private modes, tests).
 */

export interface QueuedUpload {
  id: string;
  siteId: string;
  path: string;
  blob: Blob;
  meta: MediaMeta;
  sha256: string;
  name: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

export interface UploadQueue {
  put(item: QueuedUpload): Promise<void>;
  delete(id: string): Promise<void>;
  list(siteId: string): Promise<QueuedUpload[]>;
}

const DB_NAME = "openspace-studio";
const STORE = "uploads";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("siteId", "siteId");
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

export function memoryQueue(): UploadQueue {
  const items = new Map<string, QueuedUpload>();
  return {
    async put(item) {
      items.set(item.id, item);
    },
    async delete(id) {
      items.delete(id);
    },
    async list(siteId) {
      return [...items.values()]
        .filter((i) => i.siteId === siteId)
        .sort((a, b) => a.createdAt - b.createdAt);
    },
  };
}

/** Stored form: bytes rather than a Blob (some browsers can't keep Blobs in IndexedDB). */
type StoredUpload = Omit<QueuedUpload, "blob"> & { bytes: ArrayBuffer; type: string };

export function idbQueue(factory: IDBFactory): UploadQueue {
  let db: Promise<IDBDatabase> | null = null;
  const store = async (mode: IDBTransactionMode) => {
    db ??= openDb(factory);
    return (await db).transaction(STORE, mode).objectStore(STORE);
  };
  return {
    async put(item) {
      const { blob, ...rest } = item;
      const stored: StoredUpload = { ...rest, bytes: await blob.arrayBuffer(), type: blob.type };
      await req((await store("readwrite")).put(stored));
    },
    async delete(id) {
      await req((await store("readwrite")).delete(id));
    },
    async list(siteId) {
      const all = (await req(
        (await store("readonly")).index("siteId").getAll(siteId),
      )) as StoredUpload[];
      return all
        .map(({ bytes, type, ...rest }) => ({ ...rest, blob: new Blob([bytes], { type }) }))
        .sort((a, b) => a.createdAt - b.createdAt);
    },
  };
}

let shared: UploadQueue | null = null;

/** The browser's upload queue (IndexedDB when available). */
export function uploadQueue(): UploadQueue {
  if (shared) return shared;
  const factory = typeof indexedDB !== "undefined" ? indexedDB : null;
  if (!factory) {
    shared = memoryQueue();
    return shared;
  }
  const idb = idbQueue(factory);
  const memory = memoryQueue();
  let broken = false;
  // If IndexedDB fails (blocked storage), keep working in memory.
  const guard =
    <A extends unknown[], R>(fn: (q: UploadQueue) => (...a: A) => Promise<R>) =>
    async (...a: A): Promise<R> => {
      if (!broken) {
        try {
          return await fn(idb)(...a);
        } catch {
          broken = true;
        }
      }
      return fn(memory)(...a);
    };
  shared = {
    put: guard((q) => q.put),
    delete: guard((q) => q.delete),
    list: guard((q) => q.list),
  };
  return shared;
}
