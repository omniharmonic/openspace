import type { MediaMeta, SiteDocument } from "@openspace/schema";
import { create } from "zustand";
import { type HubApi, HubError } from "../../api/types";
import type { ImageCodec, ImageEdit } from "./codec";
import { MediaError, type ProcessedMedia, processMedia } from "./pipeline";
import type { QueuedUpload, UploadQueue } from "./queue";
import { useMediaSources } from "./sources";
import { formatBytes, mediaBytes, REPO_BLOCK_BYTES } from "./usage";

/**
 * Upload orchestration: pipeline → IndexedDB queue → Hub → `media.add` op. Files appear in the
 * library (and the canvas) immediately from a local copy; the op is emitted only once the Hub
 * has stored the file, so the document never points at a file that doesn't exist.
 */

export type UploadStatus = "processing" | "queued" | "uploading" | "done" | "failed" | "duplicate";

export interface UploadItem {
  id: string;
  siteId: string;
  name: string;
  status: UploadStatus;
  path?: string;
  /** Plain-language problem or note. */
  message?: string;
  attempts: number;
  bytes?: number;
}

interface UploadsState {
  items: UploadItem[];
  upsert: (item: UploadItem) => void;
  patch: (id: string, patch: Partial<UploadItem>) => void;
  clearFinished: (siteId: string) => void;
}

export const useUploads = create<UploadsState>((set) => ({
  items: [],
  upsert: (item) =>
    set((s) => ({
      items: s.items.some((i) => i.id === item.id)
        ? s.items.map((i) => (i.id === item.id ? item : i))
        : [...s.items, item],
    })),
  patch: (id, patch) =>
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
  clearFinished: (siteId) =>
    set((s) => ({
      items: s.items.filter(
        (i) => i.siteId !== siteId || (i.status !== "done" && i.status !== "duplicate"),
      ),
    })),
}));

export interface UploaderDeps {
  siteId: string;
  hub: Pick<HubApi, "uploadMedia">;
  queue: UploadQueue;
  /** Current library (dedupe + size meter). */
  getDoc: () => SiteDocument;
  /** Emit the `media.add` op through the editor's document store. */
  addMedia: (path: string, meta: MediaMeta) => boolean;
  codec?: ImageCodec;
  /** Site is hosted on Cloudflare (videos allowed). */
  allowVideo?: () => boolean;
  now?: () => Date;
  /** Retry delay for attempt n (ms). */
  backoff?: (attempt: number) => number;
  /** Called once per finished file (toasts). */
  onEvent?: (e: { type: "added" | "duplicate" | "failed"; item: UploadItem }) => void;
}

let seq = 0;
const newUploadId = () => `up_${Date.now().toString(36)}_${(seq++).toString(36)}`;

const RETRYABLE = (err: unknown) =>
  !(err instanceof HubError) || err.status === 0 || err.status === 429 || err.status >= 500;

export interface Uploader {
  /** Process and queue files (drag/drop, paste, picker, camera). Resolves with the results. */
  add(
    files: File[],
    options?: { edit?: ImageEdit; name?: string },
  ): Promise<Array<{ path: string; duplicate: boolean } | null>>;
  /** Pick up uploads left in the queue by an earlier session. */
  resume(): Promise<void>;
  retry(id: string): void;
  /** Wait until nothing is uploading (tests). */
  idle(): Promise<void>;
  dispose(): void;
}

export function createUploader(deps: UploaderDeps): Uploader {
  const store = useUploads.getState;
  const backoff = deps.backoff ?? ((n) => Math.min(60_000, 1000 * 2 ** Math.max(0, n - 1)));
  let draining: Promise<void> | null = null;
  let disposed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const waiting = new Map<string, QueuedUpload>();

  const finish = (item: QueuedUpload) => {
    const ok = deps.getDoc().media[item.path]
      ? true
      : deps.addMedia(item.path, { ...item.meta, path: item.path });
    return ok;
  };

  const uploadOne = async (item: QueuedUpload): Promise<void> => {
    store().patch(item.id, { status: "uploading", message: undefined });
    try {
      await deps.hub.uploadMedia(deps.siteId, item.blob, {
        path: item.path,
        mime: item.meta.mime,
        bytes: item.blob.size,
        sha256: item.sha256,
      });
    } catch (err) {
      const attempts = item.attempts + 1;
      const updated = { ...item, attempts, lastError: (err as Error).message };
      if (disposed) {
        // The session ended mid-upload: leave it queued for the next one.
        await deps.queue.put(updated);
        return;
      }
      if (RETRYABLE(err)) {
        await deps.queue.put(updated);
        store().patch(item.id, {
          status: "queued",
          attempts,
          message: "Waiting for a connection — it will upload automatically.",
        });
        const t = setTimeout(() => {
          timers.delete(t);
          waiting.delete(item.id);
          void drain();
        }, backoff(attempts));
        timers.add(t);
        waiting.set(item.id, updated);
        return;
      }
      await deps.queue.delete(item.id);
      store().patch(item.id, { status: "failed", attempts, message: (err as Error).message });
      const failed = store().items.find((i) => i.id === item.id);
      if (failed) deps.onEvent?.({ type: "failed", item: failed });
      return;
    }
    const ok = finish(item);
    await deps.queue.delete(item.id);
    store().patch(item.id, {
      status: ok ? "done" : "failed",
      message: ok ? undefined : "The file uploaded, but it couldn't be added to your library.",
    });
    const done = store().items.find((i) => i.id === item.id);
    if (done) deps.onEvent?.({ type: ok ? "added" : "failed", item: done });
  };

  const drain = (): Promise<void> => {
    if (draining) return draining;
    draining = (async () => {
      try {
        for (;;) {
          if (disposed) return;
          const pending = (await deps.queue.list(deps.siteId)).filter((i) => !waiting.has(i.id));
          const next = pending[0];
          if (!next) return;
          await uploadOne(next);
        }
      } finally {
        draining = null;
      }
    })();
    return draining;
  };

  const onOnline = () => {
    waiting.clear();
    for (const t of timers) clearTimeout(t);
    timers.clear();
    void drain();
  };
  if (typeof window !== "undefined") window.addEventListener("online", onOnline);

  const processOne = async (
    file: File,
    options: { edit?: ImageEdit; name?: string } = {},
  ): Promise<{ path: string; duplicate: boolean } | null> => {
    const id = newUploadId();
    const base: UploadItem = {
      id,
      siteId: deps.siteId,
      name: options.name ?? (file.name || "Pasted image"),
      status: "processing",
      attempts: 0,
    };
    store().upsert(base);
    const doc = deps.getDoc();
    if (mediaBytes(doc) >= REPO_BLOCK_BYTES) {
      store().patch(id, {
        status: "failed",
        message: `Your site is storing ${formatBytes(mediaBytes(doc))} of files. Remove unused files, or move videos and large files to Cloudflare hosting.`,
      });
      return null;
    }
    let processed: ProcessedMedia;
    try {
      processed = await processMedia(file, {
        codec: deps.codec,
        now: deps.now,
        existing: doc.media,
        allowVideo: deps.allowVideo?.() ?? false,
        edit: options.edit,
        name: options.name ?? (file.name || "pasted-image"),
      });
    } catch (err) {
      const message =
        err instanceof MediaError
          ? err.message
          : "This file couldn't be prepared. Try another one.";
      store().patch(id, { status: "failed", message });
      const failed = store().items.find((i) => i.id === id);
      if (failed) deps.onEvent?.({ type: "failed", item: failed });
      return null;
    }
    if (processed.duplicateOf) {
      store().patch(id, {
        status: "duplicate",
        path: processed.duplicateOf,
        message: "Already in your library",
      });
      const dup = store().items.find((i) => i.id === id);
      if (dup) deps.onEvent?.({ type: "duplicate", item: dup });
      return { path: processed.duplicateOf, duplicate: true };
    }
    useMediaSources.getState().addLocal(processed.path, processed.blob);
    const queued: QueuedUpload = {
      id,
      siteId: deps.siteId,
      path: processed.path,
      blob: processed.blob,
      meta: processed.meta,
      sha256: processed.sha256,
      name: base.name,
      createdAt: Date.now(),
      attempts: 0,
    };
    await deps.queue.put(queued);
    store().patch(id, { status: "queued", path: processed.path, bytes: processed.blob.size });
    return { path: processed.path, duplicate: false };
  };

  return {
    async add(files, options) {
      const results: Array<{ path: string; duplicate: boolean } | null> = [];
      for (const f of files) results.push(await processOne(f, options));
      void drain();
      return results;
    },
    async resume() {
      const pending = await deps.queue.list(deps.siteId);
      for (const item of pending) {
        useMediaSources.getState().addLocal(item.path, item.blob);
        if (!store().items.some((i) => i.id === item.id))
          store().upsert({
            id: item.id,
            siteId: item.siteId,
            name: item.name,
            status: "queued",
            path: item.path,
            attempts: item.attempts,
            bytes: item.blob.size,
          });
      }
      await drain();
    },
    retry(id) {
      waiting.delete(id);
      void drain();
    },
    async idle() {
      while (draining) await draining;
    },
    dispose() {
      disposed = true;
      for (const t of timers) clearTimeout(t);
      if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
    },
  };
}
