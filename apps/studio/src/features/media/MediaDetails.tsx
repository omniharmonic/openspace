import type { MediaMeta, SiteDocument } from "@openspace/schema";
import { Copy, Crop, Crosshair, ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { Button, Dialog, Field, Segmented, Slider, TextArea, Toggle, toast } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { useCurrentSite, useManageUi } from "../site-mgmt/manage-ui";
import type { ImageEdit, Rect } from "./codec";
import { MediaLibrary, MediaThumb } from "./MediaLibrary";
import { mediaFetchInit, previewUrl, useMediaPreviewUrl, useMediaSources } from "./sources";
import { formatBytes, mediaUsage } from "./usage";
import { useUploader } from "./useUploader";

type Aspect = "free" | "original" | "1:1" | "4:5" | "3:2" | "16:9";
const ASPECTS: Aspect[] = ["original", "1:1", "4:5", "3:2", "16:9", "free"];

export interface Filters {
  brightness: number;
  contrast: number;
  saturate: number;
  warmth: number;
  mono: boolean;
}
export const NO_FILTERS: Filters = {
  brightness: 1,
  contrast: 1,
  saturate: 1,
  warmth: 0,
  mono: false,
};

/** CSS filter string for the editor's adjustments (also what the canvas encoder applies). */
export function filterCss(f: Filters): string {
  const parts: string[] = [];
  if (f.brightness !== 1) parts.push(`brightness(${f.brightness.toFixed(2)})`);
  if (f.contrast !== 1) parts.push(`contrast(${f.contrast.toFixed(2)})`);
  if (f.mono) parts.push("grayscale(1)");
  else if (f.saturate !== 1) parts.push(`saturate(${f.saturate.toFixed(2)})`);
  if (f.warmth > 0) parts.push(`sepia(${f.warmth.toFixed(2)})`);
  return parts.join(" ");
}

/** The largest crop of `aspect` centered in a `w × h` image, scaled by `zoom` (≥1). */
export function cropFor(
  w: number,
  h: number,
  aspect: Aspect,
  zoom: number,
  center: [number, number],
): Rect {
  let cw = w;
  let ch = h;
  if (aspect !== "original" && aspect !== "free") {
    const [a, b] = aspect.split(":").map(Number) as [number, number];
    const ratio = a / b;
    if (w / h > ratio) cw = h * ratio;
    else ch = w / ratio;
  }
  cw /= zoom;
  ch /= zoom;
  const x = Math.min(Math.max(0, center[0] * w - cw / 2), w - cw);
  const y = Math.min(Math.max(0, center[1] * h - ch / 2), h - ch);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(cw), height: Math.round(ch) };
}

function FocalEditor({
  meta,
  focal,
  onChange,
}: {
  meta: MediaMeta;
  focal: [number, number];
  onChange: (f: [number, number]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const url = useMediaPreviewUrl(meta.path);
  const dragging = useRef(false);
  const point = (e: ReactPointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    onChange([Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  };
  return (
    <div
      ref={ref}
      className="st-focal"
      style={{ aspectRatio: `${meta.width ?? 4} / ${meta.height ?? 3}` }}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        point(e);
      }}
      onPointerMove={(e) => dragging.current && point(e)}
      onPointerUp={() => {
        dragging.current = false;
      }}
    >
      {url && <img src={url} alt="" draggable={false} />}
      <button
        type="button"
        className="st-focal__point"
        style={{ left: `${focal[0] * 100}%`, top: `${focal[1] * 100}%` }}
        aria-label={`Focal point ${Math.round(focal[0] * 100)}% across, ${Math.round(focal[1] * 100)}% down. Use arrow keys to move.`}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.02;
          const d: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          const delta = d[e.key];
          if (!delta) return;
          e.preventDefault();
          const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
          onChange([clamp(focal[0] + delta[0]), clamp(focal[1] + delta[1])]);
        }}
      />
    </div>
  );
}

function ImageEditor({ meta, onDone }: { meta: MediaMeta; onDone: (path: string | null) => void }) {
  const site = useCurrentSite();
  const uploader = useUploader(site);
  const url = useMediaPreviewUrl(meta.path);
  const [aspect, setAspect] = useState<Aspect>("original");
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>(meta.focal ?? [0.5, 0.5]);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [saving, setSaving] = useState(false);
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const crop = cropFor(w, h, aspect, zoom, center);
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; c: [number, number] } | null>(null);
  const cropped = aspect !== "original" || zoom > 1;

  const save = async () => {
    if (!uploader) return;
    setSaving(true);
    try {
      const sources = useMediaSources.getState();
      const url = previewUrl(meta.path, sources);
      const res = await fetch(url, mediaFetchInit(url));
      if (!res.ok) throw new Error("Couldn't load the original image.");
      const blob = await res.blob();
      const edit: ImageEdit = {
        ...(cropped ? { crop } : {}),
        ...(filterCss(filters) ? { filter: filterCss(filters) } : {}),
      };
      const base = (meta.originalName ?? "image").replace(/\.[a-z0-9]+$/i, "");
      const file = new File([blob], `${base}-edited`, { type: blob.type });
      const [out] = await uploader.add([file], { edit, name: `${base}-edited` });
      onDone(out?.path ?? null);
    } catch (err) {
      toast({
        tone: "danger",
        title: "Couldn’t save the edit",
        description: (err as Error).message,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="st-imgedit">
      <div
        ref={frameRef}
        className="st-imgedit__frame"
        style={{ aspectRatio: `${w} / ${h}` }}
        onPointerDown={(e) => {
          if (!cropped) return;
          drag.current = { x: e.clientX, y: e.clientY, c: center };
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const r = frameRef.current?.getBoundingClientRect();
          if (!d || !r?.width) return;
          setCenter([
            Math.min(1, Math.max(0, d.c[0] + (e.clientX - d.x) / r.width)),
            Math.min(1, Math.max(0, d.c[1] + (e.clientY - d.y) / r.height)),
          ]);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        {url && (
          <img
            src={url}
            alt=""
            draggable={false}
            style={{ filter: filterCss(filters) || undefined }}
          />
        )}
        {cropped && (
          <div
            className="st-imgedit__crop"
            style={{
              left: `${(crop.x / w) * 100}%`,
              top: `${(crop.y / h) * 100}%`,
              width: `${(crop.width / w) * 100}%`,
              height: `${(crop.height / h) * 100}%`,
            }}
          />
        )}
      </div>
      <div className="st-imgedit__controls">
        <Field label="Crop">
          <Segmented<Aspect>
            aria-label="Crop shape"
            size="sm"
            value={aspect}
            onValueChange={(a) => {
              setAspect(a);
              if (a === "original") setZoom(1);
            }}
            options={ASPECTS.map((a) => ({
              value: a,
              label: a === "original" ? "Full" : a === "free" ? "Free" : a,
            }))}
          />
        </Field>
        <Field label="Zoom">
          <Slider
            aria-label="Zoom"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onValueChange={setZoom}
          />
        </Field>
        <Field label="Brightness">
          <Slider
            aria-label="Brightness"
            min={0.5}
            max={1.5}
            step={0.01}
            value={filters.brightness}
            onValueChange={(v) => setFilters((f) => ({ ...f, brightness: v }))}
          />
        </Field>
        <Field label="Contrast">
          <Slider
            aria-label="Contrast"
            min={0.5}
            max={1.5}
            step={0.01}
            value={filters.contrast}
            onValueChange={(v) => setFilters((f) => ({ ...f, contrast: v }))}
          />
        </Field>
        <Field label="Saturation">
          <Slider
            aria-label="Saturation"
            min={0}
            max={2}
            step={0.01}
            value={filters.saturate}
            disabled={filters.mono}
            onValueChange={(v) => setFilters((f) => ({ ...f, saturate: v }))}
          />
        </Field>
        <Field label="Warmth">
          <Slider
            aria-label="Warmth"
            min={0}
            max={0.6}
            step={0.01}
            value={filters.warmth}
            onValueChange={(v) => setFilters((f) => ({ ...f, warmth: v }))}
          />
        </Field>
        <div className="st-media-row">
          <span id="st-imgedit-mono">Black and white</span>
          <Toggle
            size="sm"
            checked={filters.mono}
            onCheckedChange={(mono) => setFilters((f) => ({ ...f, mono }))}
            aria-describedby="st-imgedit-mono"
            aria-label="Black and white"
          />
        </div>
        <p className="st-media-hint">
          Edits are saved as a new image; the original stays in your library.
        </p>
        <div className="st-media-actions">
          <Button variant="ghost" onClick={() => onDone(null)}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            icon={<RotateCcw />}
            onClick={() => {
              setAspect("original");
              setZoom(1);
              setFilters(NO_FILTERS);
            }}
          >
            Reset
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save as new image
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Details for one library file: alt text, focal point, crop/filters, usage, delete. */
export function MediaDetailsDialog() {
  const path = useManageUi((s) => s.mediaDetails);
  const close = () => useManageUi.getState().openMediaDetails(null);
  const meta = useDocStore((s) =>
    path ? s.doc.media[path as keyof SiteDocument["media"]] : undefined,
  );
  return (
    <Dialog
      open={Boolean(path && meta)}
      onOpenChange={(o) => !o && close()}
      title={meta ? (meta.originalName ?? "File") : "File"}
      width={820}
      className="st-media-dialog"
    >
      {meta && <MediaDetailsBody key={meta.path} meta={meta} onClose={close} />}
    </Dialog>
  );
}

function MediaDetailsBody({ meta, onClose }: { meta: MediaMeta; onClose: () => void }) {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const [alt, setAlt] = useState(meta.alt ?? "");
  const [focal, setFocal] = useState<[number, number]>(meta.focal ?? [0.5, 0.5]);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const uses = mediaUsage(doc, meta.path);
  const url = useMediaPreviewUrl(meta.path);
  const saved: [number, number] = meta.focal ?? [0.5, 0.5];

  useEffect(() => {
    setAlt(meta.alt ?? "");
    setFocal(meta.focal ?? [0.5, 0.5]);
  }, [meta]);

  const dirty =
    alt.trim() !== (meta.alt ?? "") ||
    focal[0] !== (meta.focal?.[0] ?? 0.5) ||
    focal[1] !== (meta.focal?.[1] ?? 0.5);

  const save = () => {
    const next: MediaMeta = { ...meta, alt: alt.trim().slice(0, 500), focal };
    const res = api.getState().commit([{ op: "media.add", path: meta.path, meta: next }], {
      label: "Edit image details",
    });
    if (res.ok) toast({ tone: "success", title: "Saved" });
    else toast({ tone: "danger", title: "Couldn’t save", description: res.errors[0]?.message });
  };

  const remove = () => {
    const res = api
      .getState()
      .commit([{ op: "media.remove", path: meta.path }], { label: "Delete file" });
    if (res.ok) {
      toast({ title: "File deleted", description: "Undo with ⌘Z." });
      onClose();
    } else {
      toast({
        tone: "danger",
        title: "Couldn’t delete the file",
        description: res.errors[0]?.message ?? "Try again in a moment.",
      });
    }
  };

  if (editing && meta.kind === "image" && meta.mime !== "image/svg+xml") {
    return (
      <ImageEditor
        meta={meta}
        onDone={(path) => {
          setEditing(false);
          if (path) {
            toast({ tone: "success", title: "Saved as a new image" });
            useManageUi.getState().openMediaDetails(path);
          }
        }}
      />
    );
  }

  const isImage = meta.kind === "image";
  return (
    <div className="st-media-details">
      <div className="st-media-details__preview">
        {isImage && meta.mime !== "image/svg+xml" ? (
          <FocalEditor meta={meta} focal={focal} onChange={setFocal} />
        ) : (
          <MediaThumb meta={meta} className="st-media-details__thumb" />
        )}
        {isImage && meta.mime !== "image/svg+xml" && (
          <p className="st-media-hint">
            <Crosshair aria-hidden="true" /> Click the photo to choose what stays in view when it's
            cropped on phones and in tight layouts.
          </p>
        )}
      </div>
      <div className="st-media-details__side">
        {isImage && (
          <Field
            label="Alt text"
            hint="Describe the image for people who can't see it. Leave it empty if it's only decoration."
            aside={`${alt.length}/500`}
          >
            <TextArea
              rows={3}
              maxLength={500}
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="e.g. A woman stretching on a wooden deck at sunrise"
              data-autofocus
            />
          </Field>
        )}
        {isImage && meta.mime !== "image/svg+xml" && (
          <div className="st-media-row">
            <span>
              Focal point{" "}
              <span className="st-num st-media-muted">
                {Math.round(focal[0] * 100)}%, {Math.round(focal[1] * 100)}%
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw />}
              disabled={focal[0] === saved[0] && focal[1] === saved[1]}
              onClick={() => setFocal(saved)}
            >
              Reset
            </Button>
          </div>
        )}
        <dl className="st-media-facts">
          {meta.width && meta.height ? (
            <>
              <dt>Size</dt>
              <dd className="st-num">
                {meta.width} × {meta.height}
              </dd>
            </>
          ) : null}
          <dt>File</dt>
          <dd className="st-num">
            {formatBytes(meta.bytes)} · {meta.mime.split("/")[1]?.toUpperCase()}
          </dd>
          <dt>Added</dt>
          <dd>{new Date(meta.createdAt).toLocaleDateString()}</dd>
        </dl>
        <div className="st-media-usage">
          <h3>Used on</h3>
          {uses.length === 0 ? (
            <p className="st-media-muted">Not used anywhere yet.</p>
          ) : (
            <ul>
              {uses.map((u) => (
                <li key={u.label}>
                  {u.pageId ? (
                    <button
                      type="button"
                      className="st-linklike"
                      onClick={() => {
                        api.getState().setPage(u.pageId as string);
                        onClose();
                      }}
                    >
                      {u.label}
                    </button>
                  ) : (
                    u.label
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="st-media-actions st-media-actions--wrap">
          {isImage && meta.mime !== "image/svg+xml" && (
            <Button size="sm" icon={<Crop />} onClick={() => setEditing(true)}>
              Crop & adjust
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={<Copy />}
            onClick={() => {
              void navigator.clipboard?.writeText(meta.path);
              toast({ title: "File address copied", description: meta.path });
            }}
          >
            Copy address
          </Button>
          {url && (
            <Button
              size="sm"
              variant="ghost"
              icon={<ExternalLink />}
              onClick={() => window.open(url, "_blank", "noopener")}
            >
              Open
            </Button>
          )}
        </div>
        <div className="st-media-actions st-media-actions--end">
          {confirmDelete ? (
            <>
              <span className="st-media-warn">
                {uses.length
                  ? `Used in ${uses.length} place${uses.length > 1 ? "s" : ""}; they'll show an empty spot.`
                  : "Delete this file?"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
              <Button size="sm" variant="danger" onClick={remove}>
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
              <Button size="sm" variant="primary" disabled={!dirty} onClick={save}>
                Save
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Media picker dialog (logos, sharing images, pop-up images…). */
export function MediaPickerDialog() {
  const req = useManageUi((s) => s.mediaPick);
  const close = () => useManageUi.getState().pickMedia(null);
  return (
    <Dialog
      open={Boolean(req)}
      onOpenChange={(o) => !o && close()}
      title={req?.title ?? "Choose a file"}
      width={720}
      className="st-media-dialog"
    >
      {req && (
        <div className="st-media-picker">
          <MediaLibrary
            accept={req.accept ?? "image"}
            onPick={(path) => {
              req.onPick(path);
              close();
            }}
          />
        </div>
      )}
    </Dialog>
  );
}
