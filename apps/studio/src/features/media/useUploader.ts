import type { MediaMeta } from "@openspace/schema";
import { useEffect, useState } from "react";
import { useHub } from "../../api";
import type { Site } from "../../api/types";
import { toast } from "../../ui";
import { useDocStoreApi } from "../editor/model/context";
import type { EditorStore } from "../editor/model/store";
import type { ImageCodec } from "./codec";
import { uploadQueue } from "./queue";
import { readMediaBytes } from "./sources";
import { createUploader, type Uploader } from "./uploader";

/** Test seam: a fake codec for jsdom (which has no canvas). */
export const mediaTestHooks: { codec?: ImageCodec } = {};

const uploaders = new WeakMap<EditorStore, Uploader>();
/** Live hosting target per session, read at upload time (it can change while editing). */
const targets = new WeakMap<EditorStore, string | undefined>();

/**
 * The upload pipeline for this editing session (one per document store), created in an effect
 * (no side effects during render). Uploads finish with a `media.add` op on the session's store,
 * so they sync, undo and publish like any other edit.
 */
export function useUploader(site: Pick<Site, "id" | "deployTarget"> | undefined): Uploader | null {
  const store = useDocStoreApi();
  const hub = useHub();
  const [uploader, setUploader] = useState<Uploader | null>(() => uploaders.get(store) ?? null);
  const siteId = site?.id;
  const target = site?.deployTarget;

  useEffect(() => {
    targets.set(store, target);
  }, [store, target]);

  useEffect(() => {
    if (!siteId) return;
    let u = uploaders.get(store);
    if (!u) {
      u = createUploader({
        siteId,
        hub,
        queue: uploadQueue(),
        codec: mediaTestHooks.codec,
        getDoc: () => store.getState().doc,
        existingBytes: readMediaBytes,
        allowVideo: () => targets.get(store) === "cloudflare",
        addMedia: (path, meta: MediaMeta) =>
          store.getState().commit([{ op: "media.add", path, meta }], {
            label: `Add ${meta.originalName ?? "file"}`,
          }).ok,
        onEvent: ({ type, item }) => {
          if (type === "duplicate")
            toast({ title: "Already in your library", description: item.name });
          else if (type === "failed")
            toast({
              tone: "danger",
              title: `Couldn’t add ${item.name}`,
              description: item.message,
            });
        },
      });
      uploaders.set(store, u);
    }
    setUploader(u);
  }, [store, hub, siteId]);

  return uploader;
}
