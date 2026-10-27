import type {
  FocalPoint,
  ImageFieldMeta,
  ImageValue,
  MediaFieldMeta,
  MediaValue,
} from "@omniharmonic/openspace-schema";
import { Film, ImageIcon, Music } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import { Button, Input, Segmented, Toggle } from "../../../ui";
import { useOpenMediaPicker, usePreviewSrc } from "../media";
import { PropRow } from "../ui";
import { useDraft } from "./basic";
import type { ControlProps } from "./types";

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Focal point picker: click or drag on the image to set what stays in frame when it is cropped;
 * arrow keys nudge by 5% (⇧ for 1%).
 */
export function FocalPointPicker({
  src,
  value,
  onChange,
  label = "Focal point",
  disabled,
}: {
  src: string | undefined;
  value: FocalPoint | undefined;
  onChange: (focal: FocalPoint, final: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  const shown = usePreviewSrc(src);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [x, y] = value ?? [0.5, 0.5];
  const at = (e: PointerEvent<HTMLDivElement>): FocalPoint => {
    const r = ref.current?.getBoundingClientRect();
    if (!r?.width || !r.height) return [x, y];
    return [
      round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))),
      round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))),
    ];
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = e.shiftKey ? 0.01 : 0.05;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = d[e.key];
    if (!delta) return;
    e.preventDefault();
    onChange(
      [
        round(Math.min(1, Math.max(0, x + delta[0]))),
        round(Math.min(1, Math.max(0, y + delta[1]))),
      ],
      true,
    );
  };
  return (
    <div
      ref={ref}
      className="st-ip-focal"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuetext={`${Math.round(x * 100)}% across, ${Math.round(y * 100)}% down`}
      aria-valuenow={Math.round(x * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      onKeyDown={onKey}
      aria-disabled={disabled ? true : undefined}
      data-disabled={disabled ? "" : undefined}
      onPointerDown={(e) => {
        if (disabled) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        onChange(at(e), false);
      }}
      onPointerMove={(e) => dragging.current && onChange(at(e), false)}
      onPointerUp={(e) => {
        if (!dragging.current) return;
        dragging.current = false;
        onChange(at(e), true);
      }}
    >
      {shown && <img src={shown} alt="" draggable={false} />}
      <span className="st-ip-focal__pin" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
    </div>
  );
}

function fileName(src: string | undefined): string {
  if (!src) return "";
  return decodeURIComponent((src.split(/[?#]/)[0] ?? src).split("/").filter(Boolean).at(-1) ?? src);
}

export function ImageControl({
  id,
  meta,
  label,
  value,
  onChange,
  disabled,
}: ControlProps<ImageFieldMeta, ImageValue>) {
  const open = useOpenMediaPicker();
  const thumb = usePreviewSrc(value?.src);
  const [error, setError] = useState<string | null>(null);
  const alt = useDraft<string>(value?.alt, (a) =>
    value ? onChange({ ...value, alt: a ?? "" }, { merge: true, label: "Edit alt text" }) : null,
  );
  // After a replace the old alt text no longer describes the picture: it's cleared and the
  // field asks for a new one (offering the old text back) instead of reading as "decorative".
  const [askAlt, setAskAlt] = useState<{ previous: string } | null>(null);
  const altInput = useRef<HTMLInputElement>(null);
  const asking = askAlt !== null && value !== undefined && value.alt === "";
  const decorative = value !== undefined && value.alt === "" && !asking;

  const choose = async () => {
    const pick = await open({
      accept: "image",
      title: `Choose ${label.toLowerCase()}`,
      current: value?.src,
    });
    if (!pick) return;
    const previous = value?.alt.trim() ?? "";
    const own = pick.alt?.trim() ?? "";
    const next: ImageValue = {
      src: pick.src,
      alt: own,
      ...(pick.width && pick.height ? { width: pick.width, height: pick.height } : {}),
      ...(pick.mediaId ? { mediaId: pick.mediaId as ImageValue["mediaId"] & string } : {}),
      ...(pick.focal ? { focal: pick.focal } : {}),
    };
    const err = onChange(next, { label: "Replace image" });
    setError(err);
    if (!err && value && !own && pick.src !== value.src) {
      setAskAlt({ previous });
      setTimeout(() => altInput.current?.focus(), 0);
    } else setAskAlt(null);
  };

  return (
    <div className="st-ip-imgfield">
      <div className="st-ip-media">
        <button
          type="button"
          className="st-ip-media__thumb"
          aria-label={value ? `Replace ${label.toLowerCase()}` : `Choose ${label.toLowerCase()}`}
          disabled={disabled}
          onClick={choose}
        >
          {thumb ? <img src={thumb} alt="" /> : <ImageIcon aria-hidden="true" />}
        </button>
        <div className="st-ip-media__meta">
          <span className="st-ip-media__name" title={value?.src}>
            {value ? fileName(value.src) : "No image yet"}
          </span>
          <div className="st-ip-btnrow">
            <Button size="sm" variant="secondary" onClick={choose} disabled={disabled}>
              {value ? "Replace" : "Choose image"}
            </Button>
            {value && meta.optional && (
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => setError(onChange(undefined))}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <p className="st-ip-row__error" role="alert">
          {error}
        </p>
      )}
      {value && (
        <>
          <PropRow
            label="Alt text"
            htmlFor={`${id}-alt`}
            stacked
            hint={
              asking
                ? "New image: describe it for people using screen readers."
                : decorative
                  ? "Marked decorative: screen readers skip it."
                  : "Describe what the image is for, not just what’s in it."
            }
            error={alt.error}
          >
            <Input
              ref={altInput}
              id={`${id}-alt`}
              size="sm"
              value={decorative ? "" : (alt.draft ?? "")}
              disabled={disabled || decorative}
              placeholder={decorative ? "Decorative" : "e.g. Students resting after class"}
              onChange={(e) => alt.change(e.target.value)}
              onBlur={alt.blur}
            />
            {asking && askAlt.previous && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAskAlt(null);
                  setError(
                    onChange({ ...value, alt: askAlt.previous }, { label: "Edit alt text" }),
                  );
                }}
              >
                Keep the old description
              </Button>
            )}
          </PropRow>
          <PropRow label="Decorative" htmlFor={`${id}-deco`}>
            <div className="st-ip-fixed">
              <Toggle
                id={`${id}-deco`}
                size="sm"
                checked={decorative}
                disabled={disabled}
                onCheckedChange={(c) => {
                  setAskAlt(null);
                  setError(
                    onChange({ ...value, alt: c ? "" : "Image" }, { label: "Edit alt text" }),
                  );
                }}
              />
            </div>
          </PropRow>
          <PropRow
            label="Focal point"
            stacked
            hint={meta.aspect ? `Cropped to ${meta.aspect}` : undefined}
          >
            <FocalPointPicker
              disabled={disabled}
              src={value.src}
              value={value.focal}
              label={`${label} focal point`}
              onChange={(focal, final) =>
                setError(
                  onChange({ ...value, focal }, { merge: !final, label: "Move focal point" }),
                )
              }
            />
          </PropRow>
        </>
      )}
    </div>
  );
}

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;
const VIDEO_EXT = /\.(mp4|m4v|webm|mov|ogv)$/i;
/** What a picked file is, from its name (null when the name doesn't say). */
export function mediaKindOf(src: string): "audio" | "video" | null {
  const path = src.split(/[?#]/)[0] ?? "";
  if (AUDIO_EXT.test(path)) return "audio";
  if (VIDEO_EXT.test(path)) return "video";
  return null;
}

export function MediaControl({
  id,
  meta,
  label,
  value,
  onChange,
  disabled,
}: ControlProps<MediaFieldMeta, MediaValue>) {
  const open = useOpenMediaPicker();
  const poster = usePreviewSrc(value?.poster);
  const [error, setError] = useState<string | null>(null);
  const kind = value?.kind ?? meta.kinds[0] ?? "video";
  const title = useDraft<string>(value?.title, (t) => {
    if (!value) return null;
    const next = { ...value };
    if (t) next.title = t;
    else delete next.title;
    return onChange(next, { merge: true });
  });
  const choose = async (k: "video" | "audio" = kind) => {
    const pick = await open({
      accept: k,
      title: `Choose ${k === "video" ? "a video" : "audio"}`,
      current: value?.src,
    });
    if (!pick) return;
    const picked = mediaKindOf(pick.src);
    if (picked && picked !== k) {
      setError(
        picked === "audio"
          ? "That file is audio. Choose a video file (MP4, WebM or MOV)."
          : "That file is a video. Choose an audio file (MP3, M4A, OGG or WAV).",
      );
      return;
    }
    const next: MediaValue = {
      ...(value ?? {}),
      kind: k,
      src: pick.src,
      ...(pick.mediaId ? { mediaId: pick.mediaId as never } : {}),
      ...(pick.poster ? { poster: pick.poster } : {}),
    };
    setError(onChange(next, { label: "Replace media" }));
  };
  const choosePoster = async () => {
    if (!value) return;
    const pick = await open({
      accept: "image",
      title: "Choose a cover image",
      current: value.poster,
    });
    if (pick) setError(onChange({ ...value, poster: pick.src }, { label: "Change cover" }));
  };
  const Icon = kind === "audio" ? Music : Film;
  return (
    <div className="st-ip-imgfield">
      {meta.kinds.length > 1 && (
        <Segmented<"video" | "audio">
          disabled={disabled}
          aria-label={`${label} type`}
          size="sm"
          block
          value={kind}
          onValueChange={(k) => (value ? setError(onChange({ ...value, kind: k })) : choose(k))}
          options={[
            { value: "video", label: "Video" },
            { value: "audio", label: "Audio" },
          ]}
        />
      )}
      <div className="st-ip-media">
        <button
          type="button"
          className="st-ip-media__thumb"
          aria-label={value ? `Replace ${label.toLowerCase()}` : `Choose ${label.toLowerCase()}`}
          disabled={disabled}
          onClick={() => choose()}
        >
          {poster ? <img src={poster} alt="" /> : <Icon aria-hidden="true" />}
        </button>
        <div className="st-ip-media__meta">
          <span className="st-ip-media__name" title={value?.src}>
            {value ? fileName(value.src) : `No ${kind} yet`}
          </span>
          <div className="st-ip-btnrow">
            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => choose()}>
              {value ? "Replace" : `Choose ${kind}`}
            </Button>
            {value && meta.optional && (
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => setError(onChange(undefined))}
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      {error && (
        <p className="st-ip-row__error" role="alert">
          {error}
        </p>
      )}
      {value && (
        <>
          <PropRow label="Title" htmlFor={`${id}-title`} error={title.error}>
            <Input
              id={`${id}-title`}
              size="sm"
              value={title.draft ?? ""}
              disabled={disabled}
              onChange={(e) => title.change(e.target.value)}
              onBlur={title.blur}
            />
          </PropRow>
          {kind === "video" && (
            <PropRow label="Cover">
              <Button size="sm" variant="secondary" disabled={disabled} onClick={choosePoster}>
                {value.poster ? "Replace cover" : "Choose cover"}
              </Button>
            </PropRow>
          )}
          {(["autoplay", "loop"] as const).map((k) => (
            <PropRow key={k} label={k === "autoplay" ? "Autoplay" : "Loop"} htmlFor={`${id}-${k}`}>
              <div className="st-ip-fixed">
                <Toggle
                  id={`${id}-${k}`}
                  size="sm"
                  checked={value[k] === true}
                  disabled={disabled}
                  onCheckedChange={(c) => {
                    const next = { ...value } as MediaValue;
                    if (c) next[k] = true;
                    else delete next[k];
                    setError(onChange(next));
                  }}
                />
              </div>
            </PropRow>
          ))}
        </>
      )}
    </div>
  );
}
