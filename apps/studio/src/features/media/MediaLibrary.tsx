import type { MediaMeta, SiteDocument } from "@omniharmonic/openspace-schema";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  ImagePlus,
  Music,
  RotateCw,
  Search,
  Upload,
  Video,
} from "lucide-react";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, cx, EmptyState, IconButton, Input, Spinner, Tooltip } from "../../ui";
import { useDocStore } from "../editor/model/context";
import { useCurrentSite, useManageUi } from "../site-mgmt/manage-ui";
import "./media.css";
import { useMediaPreviewUrl } from "./sources";
import { type UploadItem, useUploads } from "./uploader";
import {
  formatBytes,
  mediaBytes,
  REPO_BLOCK_BYTES,
  REPO_WARN_BYTES,
  sizeLevel,
  usageCounts,
} from "./usage";
import { useUploader } from "./useUploader";

/** Files from a drop or paste event (images, documents, audio). */
export function filesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== "file") continue;
    const f = item.getAsFile();
    if (f) out.push(f);
  }
  if (!out.length) out.push(...Array.from(data.files ?? []));
  return out;
}

export function SizeMeter({ doc }: { doc: SiteDocument }) {
  const bytes = mediaBytes(doc);
  const level = sizeLevel(bytes);
  const pct = Math.min(100, (bytes / (1024 * 1024 * 1024)) * 100);
  return (
    <div className={cx("st-media-meter", `is-${level}`)}>
      <div className="st-media-meter__row">
        <span>Storage</span>
        <span className="st-num">
          {formatBytes(bytes)} <span className="st-media-meter__of">of 1 GB</span>
        </span>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a styled meter with threshold marks; <meter> can't draw them */}
      <div
        className="st-media-meter__bar"
        role="meter"
        aria-label="Storage used"
        aria-valuemin={0}
        aria-valuemax={1024}
        aria-valuenow={Math.round(bytes / 1024 / 1024)}
        aria-valuetext={`${formatBytes(bytes)} of 1 GB`}
      >
        <span style={{ width: `${pct}%` }} />
        <i style={{ left: `${(REPO_WARN_BYTES / 1024 ** 3) * 100}%` }} aria-hidden="true" />
        <i style={{ left: `${(REPO_BLOCK_BYTES / 1024 ** 3) * 100}%` }} aria-hidden="true" />
      </div>
      {level !== "ok" && (
        <p className="st-media-meter__note">
          {level === "warn"
            ? "Your site is getting full. Remove files you don't use, and link videos from YouTube or Vimeo."
            : "Uploads are paused: your site is nearly full. Remove unused files, or switch to Cloudflare hosting for videos and large files."}
        </p>
      )}
    </div>
  );
}

function KindIcon({ meta }: { meta: MediaMeta }) {
  if (meta.kind === "video") return <Video aria-hidden="true" />;
  if (meta.kind === "audio") return <Music aria-hidden="true" />;
  return <FileText aria-hidden="true" />;
}

export function MediaThumb({ meta, className }: { meta: MediaMeta; className?: string }) {
  const url = useMediaPreviewUrl(meta.kind === "image" ? meta.path : null);
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cx("st-media-thumb", className)}
      style={meta.placeholder ? { backgroundImage: `url("${meta.placeholder}")` } : undefined}
    >
      {meta.kind === "image" && url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          width={meta.width}
          height={meta.height}
          onError={() => setFailed(true)}
          style={
            meta.focal
              ? { objectPosition: `${meta.focal[0] * 100}% ${meta.focal[1] * 100}%` }
              : undefined
          }
        />
      ) : meta.kind !== "image" ? (
        <span className="st-media-thumb__icon">
          <KindIcon meta={meta} />
        </span>
      ) : null}
    </span>
  );
}

function fileName(meta: MediaMeta): string {
  return meta.originalName ?? meta.path.split("/").pop() ?? meta.path;
}

function UploadRow({ item, onRetry }: { item: UploadItem; onRetry: () => void }) {
  const busy = item.status === "processing" || item.status === "uploading";
  return (
    <li className={cx("st-upload", `is-${item.status}`)}>
      <span className="st-upload__icon" aria-hidden="true">
        {busy ? (
          <Spinner size={12} />
        ) : item.status === "failed" ? (
          <AlertTriangle />
        ) : item.status === "queued" ? (
          <Upload />
        ) : (
          <CheckCircle2 />
        )}
      </span>
      <span className="st-upload__name">{item.name}</span>
      <span className="st-upload__status">
        {item.status === "processing"
          ? "Preparing…"
          : item.status === "uploading"
            ? "Uploading…"
            : item.status === "queued"
              ? item.attempts
                ? "Waiting"
                : "Queued"
              : item.status === "duplicate"
                ? "Already added"
                : item.status === "failed"
                  ? "Couldn’t add"
                  : "Added"}
      </span>
      {item.status === "queued" && item.attempts > 0 && (
        <IconButton label="Try now" icon={<RotateCw />} size="sm" onClick={onRetry} />
      )}
      {item.message && item.status !== "duplicate" && (
        <span className="st-upload__msg">{item.message}</span>
      )}
    </li>
  );
}

export interface MediaGridProps {
  /** Picking mode (media picker): selecting calls this instead of opening details. */
  onPick?: (path: string) => void;
  accept?: "image" | "any";
}

/**
 * The media library: drop, paste, pick or photograph files; each goes through the in-browser
 * pipeline and appears at once. Used as the Media panel and inside the media picker.
 */
export function MediaLibrary({ onPick, accept = "any" }: MediaGridProps) {
  const site = useCurrentSite();
  const doc = useDocStore((s) => s.doc);
  const uploader = useUploader(site);
  const allUploads = useUploads((s) => s.items);
  const uploads = allUploads.filter((i) => i.siteId === site?.id);
  const clearFinished = useUploads((s) => s.clearFinished);
  const openDetails = useManageUi((s) => s.openMediaDetails);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const counts = useMemo(() => usageCounts(doc), [doc]);
  const blocked = sizeLevel(mediaBytes(doc)) === "block";

  const add = async (files: File[]) => {
    if (!uploader || !files.length) return;
    const results = await uploader.add(files);
    const first = results.find((r) => r);
    if (onPick && first && results.length === 1) onPick(first.path);
  };

  // Paste files anywhere while the library is open (before the editor's block paste).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = filesFrom(e.clipboardData);
      if (!files.length) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void add(files);
    };
    window.addEventListener("paste", onPaste, true);
    return () => window.removeEventListener("paste", onPaste, true);
  });

  const items = Object.values(doc.media)
    .filter((m) => accept === "any" || m.kind === "image")
    .filter((m) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return `${fileName(m)} ${m.alt ?? ""} ${m.path}`.toLowerCase().includes(q);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void add(filesFrom(e.dataTransfer));
  };

  const active = uploads.filter((u) => u.status !== "done" && u.status !== "duplicate");
  const finished = uploads.length - active.length;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target for files; every action also has a button
    <div
      ref={rootRef}
      className={cx("st-media", dragging && "is-dragging")}
      onDragEnter={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) setDragging(true);
      }}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDragLeave={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className="st-media__bar">
        <Input
          size="sm"
          prefix={<Search aria-hidden="true" />}
          placeholder="Search files"
          aria-label="Search files"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Tooltip content="Take a photo">
          <IconButton
            label="Take a photo"
            icon={<Camera />}
            className="st-media__camera"
            disabled={blocked}
            onClick={() => cameraInput.current?.click()}
          />
        </Tooltip>
        <Button
          size="sm"
          variant="primary"
          icon={<Upload />}
          disabled={blocked}
          onClick={() => fileInput.current?.click()}
        >
          Upload
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          data-testid="media-file-input"
          accept={accept === "image" ? "image/*" : "image/*,application/pdf,audio/*,video/*"}
          onChange={(e) => {
            void add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          hidden
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            void add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {uploads.length > 0 && (
        <div className="st-media__uploads">
          <ul aria-label="Uploads" aria-live="polite">
            {uploads.map((u) => (
              <UploadRow key={u.id} item={u} onRetry={() => uploader?.retry(u.id)} />
            ))}
          </ul>
          {finished > 0 && active.length === 0 && (
            <button
              type="button"
              className="st-media__clear"
              onClick={() => site && clearFinished(site.id)}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<ImagePlus />}
          title={query ? "No files match" : "Add your photos"}
          description={
            query
              ? "Try another word."
              : "Drop images here, paste them, or upload from your device. Photos are resized and location data is removed before upload."
          }
        />
      ) : (
        <ul className="st-media__grid" aria-label="Library">
          {items.map((m) => {
            const unused = (counts[m.path] ?? 0) === 0;
            return (
              <li key={m.path}>
                <button
                  type="button"
                  className="st-media__tile"
                  onClick={() => (onPick ? onPick(m.path) : openDetails(m.path))}
                  aria-label={`${fileName(m)}${m.alt ? `, ${m.alt}` : ""}`}
                >
                  <MediaThumb meta={m} />
                  <span className="st-media__tile-name">{fileName(m)}</span>
                  <span className="st-media__tile-badges">
                    {m.kind === "image" && !m.alt && (
                      <Badge
                        tone="pending"
                        title="Add a description for people using screen readers"
                      >
                        No alt
                      </Badge>
                    )}
                    {unused && !onPick && <Badge title="Not used on any page">Unused</Badge>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="st-media__foot">
        <SizeMeter doc={doc} />
      </div>
      {dragging && (
        <div className="st-media__drop" aria-hidden="true">
          <Upload />
          <span>Drop to add to your library</span>
        </div>
      )}
    </div>
  );
}
