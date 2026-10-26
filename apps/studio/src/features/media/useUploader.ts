import type { MediaMeta } from "@openspace/schema";
import { useHub } from "../../api";
import type { Site } from "../../api/types";
import { toast } from "../../ui";
import { useDocStoreApi } from "../editor/model/context";
import type { EditorStore } from "../editor/model/store";
import type { ImageCodec } from "./codec";
import { uploadQueue } from "./queue";
import { createUploader, type Uploader } from "./uploader";

/** Test seam: a fake codec for jsdom (which has no canvas). */
export const mediaTestHooks: { codec?: ImageCodec } = {};

const uploaders = new WeakMap<EditorStore, Uploader>();

/**
 * The upload pipeline for this editing session (one per document store). Uploads finish with a
 * `media.add` op on the session's store, so they sync, undo and publish like any other edit.
 */
export function useUploader(site: Pick<Site, "id" | "deployTarget"> | undefined): Uploader | null {
  const store = useDocStoreApi();
  const hub = useHub();
  if (!site) return null;
  let uploader = uploaders.get(store);
  if (!uploader) {
    uploader = createUploader({
      siteId: site.id,
      hub,
      queue: uploadQueue(),
      codec: mediaTestHooks.codec,
      getDoc: () => store.getState().doc,
      allowVideo: () => site.deployTarget === "cloudflare",
      addMedia: (path, meta: MediaMeta) => {
        const res = store.getState().commit([{ op: "media.add", path, meta }], {
          label: `Add ${meta.originalName ?? "file"}`,
        });
        return res.ok;
      },
      onEvent: ({ type, item }) => {
        if (type === "duplicate")
          toast({ title: "Already in your library", description: item.name });
        else if (type === "failed")
          toast({ tone: "danger", title: `Couldn’t add ${item.name}`, description: item.message });
      },
    });
    uploaders.set(store, uploader);
  }
  return uploader;
}
