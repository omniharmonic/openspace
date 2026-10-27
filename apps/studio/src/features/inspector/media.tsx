import {
  HttpsUrlSchema,
  isMediaPath,
  type MediaMeta,
  type SiteDocument,
} from "@omniharmonic/openspace-schema";
import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { Button, Dialog, Field, Input } from "../../ui";
import { isViewable, previewUrl, useMediaPreviewUrl, useMediaSources } from "../media/sources";
import { type MediaPickRequest as ManageMediaPick, useManageUi } from "../site-mgmt/manage-ui";

/**
 * The media picker seam. The full media library (upload, crop, alt text, usage) is Task 24's;
 * it registers itself with {@link registerMediaPicker}. Until then — and whenever nothing is
 * registered — {@link useOpenMediaPicker} opens a small fallback: files already in the site's
 * media plus "use an image address".
 */

export type MediaAccept = "image" | "video" | "audio" | "file";

export interface MediaPickRequest {
  accept: MediaAccept;
  /** Dialog title, e.g. "Choose a photo". */
  title?: string;
  /** The current value's src, to highlight it. */
  current?: string;
}

export interface MediaPick {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  mediaId?: string;
  focal?: [number, number];
  poster?: string;
}

export type OpenMediaPicker = (request: MediaPickRequest) => Promise<MediaPick | null>;

interface PickerState {
  impl: OpenMediaPicker | null;
  /** The fallback dialog's open request. */
  pending: { request: MediaPickRequest; resolve: (pick: MediaPick | null) => void } | null;
}

const usePicker = create<PickerState>(() => ({ impl: null, pending: null }));

/** Install the media library as the picker; returns an unregister function. */
export function registerMediaPicker(impl: OpenMediaPicker): () => void {
  usePicker.setState({ impl });
  return () => {
    if (usePicker.getState().impl === impl) usePicker.setState({ impl: null });
  };
}

const fallbackOpen: OpenMediaPicker = (request) =>
  new Promise((resolve) => {
    usePicker.getState().pending?.resolve(null);
    usePicker.setState({ pending: { request, resolve } });
  });

/** Open the media picker (the registered library, or the fallback dialog). */
export function useOpenMediaPicker(): OpenMediaPicker {
  const impl = usePicker((s) => s.impl);
  return impl ?? fallbackOpen;
}

/** Display URL for a media src in Studio: this session's uploads, else the site's draft files. */
export function previewSrc(src: string | undefined): string | undefined {
  if (!src) return undefined;
  const url = previewUrl(src, useMediaSources.getState());
  return isViewable(url) ? url : undefined;
}

/** {@link previewSrc} that follows uploads and the site's file location as they change. */
export function usePreviewSrc(src: string | undefined): string | undefined {
  return useMediaPreviewUrl(src) ?? undefined;
}

/** A pick enriched with what the site's media metadata knows (size, alt, focal, id). */
export function enrichPick(doc: SiteDocument, src: string): MediaPick {
  const meta = doc.media[src as keyof SiteDocument["media"]];
  if (!meta) return { src };
  return {
    src,
    mediaId: meta.id,
    ...(meta.alt !== undefined ? { alt: meta.alt } : {}),
    ...(meta.width ? { width: meta.width } : {}),
    ...(meta.height ? { height: meta.height } : {}),
    ...(meta.focal ? { focal: meta.focal } : {}),
  };
}

/**
 * Adapter from the inspector's promise-based picker to the media library's dialog
 * (`useManageUi.pickMedia`). Resolves with the chosen file (enriched from `doc.media`), or null
 * when the dialog closes or another pick replaces it.
 */
export function libraryPicker(getDoc: () => SiteDocument): OpenMediaPicker {
  return (request) =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (pick: MediaPick | null) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        resolve(pick);
      };
      const req: ManageMediaPick = {
        title: request.title ?? (request.accept === "image" ? "Choose an image" : "Choose a file"),
        accept: request.accept === "image" ? "image" : "any",
        onPick: (path) => finish(enrichPick(getDoc(), path)),
      };
      const unsubscribe = useManageUi.subscribe((s) => {
        if (s.mediaPick !== req) finish(null);
      });
      useManageUi.getState().pickMedia(req);
    });
}

/** Use the media library as the inspector's picker while mounted. */
export function useMediaLibraryPicker(getDoc: () => SiteDocument) {
  useEffect(() => registerMediaPicker(libraryPicker(getDoc)), [getDoc]);
}

function mediaOfKind(doc: SiteDocument, accept: MediaAccept): MediaMeta[] {
  return Object.values(doc.media).filter((m) => accept === "file" || m.kind === accept);
}

/** True for values a media field accepts: an https URL or a `media/…` path. */
export function isMediaSrc(value: string): boolean {
  return isMediaPath(value) || HttpsUrlSchema.safeParse(value).success;
}

/** The fallback picker dialog; mounted once by the inspector. */
export function FallbackMediaPicker({ doc }: { doc: SiteDocument }) {
  const pending = usePicker((s) => s.pending);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const close = (pick: MediaPick | null) => {
    pending?.resolve(pick);
    usePicker.setState({ pending: null });
    setUrl("");
    setError(null);
  };
  const accept = pending?.request.accept ?? "image";
  const files = pending ? mediaOfKind(doc, accept) : [];
  const noun = accept === "file" ? "file" : accept === "image" ? "image" : accept;
  return (
    <Dialog
      open={pending !== null}
      onOpenChange={(open) => !open && close(null)}
      title={pending?.request.title ?? `Choose ${noun === "image" ? "an image" : `a ${noun}`}`}
      description="Pick something already on your site, or paste the address of one online."
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!url.trim()}
            onClick={() => {
              const v = url.trim();
              if (!isMediaSrc(v)) {
                setError("Use an address starting with https://");
                return;
              }
              close({ src: v });
            }}
          >
            Use this address
          </Button>
        </>
      }
    >
      {files.length > 0 && (
        <ul className="st-ip-mediagrid" aria-label="On your site">
          {files.map((m) => (
            <li key={m.path}>
              <button
                type="button"
                className="st-ip-mediagrid__item"
                aria-pressed={pending?.request.current === m.path}
                onClick={() =>
                  close({
                    src: m.path,
                    mediaId: m.id,
                    ...(m.alt !== undefined ? { alt: m.alt } : {}),
                    ...(m.width ? { width: m.width } : {}),
                    ...(m.height ? { height: m.height } : {}),
                    ...(m.focal ? { focal: m.focal } : {}),
                  })
                }
              >
                {m.kind === "image" ? (
                  <img src={previewSrc(m.path)} alt="" loading="lazy" />
                ) : (
                  <ImageIcon aria-hidden="true" />
                )}
                <span>{m.originalName ?? m.path.split("/").at(-1)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Field label="Address" error={error ?? undefined}>
        <Input
          data-autofocus
          value={url}
          placeholder="https://…"
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url.trim()) {
              e.preventDefault();
              if (isMediaSrc(url.trim())) close({ src: url.trim() });
              else setError("Use an address starting with https://");
            }
          }}
        />
      </Field>
    </Dialog>
  );
}
