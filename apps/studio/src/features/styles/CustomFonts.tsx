import type { OpBody } from "@omniharmonic/openspace-ops";
import { type CustomFont, FONT_CATEGORIES, type Styles } from "@omniharmonic/openspace-schema";
import { FileType2, Trash2, Upload, X } from "lucide-react";
import { type DragEvent, useEffect, useId, useRef, useState } from "react";
import { useHub } from "../../api";
import { Button, Dialog, IconButton, Input, Segmented, Select, toast } from "../../ui";
import { useDocStoreApi } from "../editor/model/context";
import { stylesOp } from "../inspector/model/edits";
import { PropRow } from "../inspector/ui";
import { useMediaSources } from "../media/sources";
import { useCurrentSite } from "../site-mgmt/manage-ui";
import {
  FONT_ACCEPT,
  fontMediaMeta,
  guessFace,
  guessFamily,
  prepareFontFile,
  useCustomFontCss,
  withFont,
} from "./fonts";
import { ROLE_LABEL, roleFont } from "./roleFonts";

const CATEGORY_LABEL: Record<CustomFont["category"], string> = {
  serif: "Serif",
  "sans-serif": "Sans serif",
  display: "Display",
  monospace: "Monospace",
  handwriting: "Handwriting",
};
const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const WEIGHT_NAME: Record<number, string> = {
  100: "Thin",
  200: "Extra light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semibold",
  700: "Bold",
  800: "Extra bold",
  900: "Black",
};

/** Keep the uploaded fonts loaded in Studio itself, so their names draw in their own face. */
export function useStudioFontFaces(styles: Styles) {
  const css = useCustomFontCss(styles);
  useEffect(() => {
    let el = document.getElementById("st-custom-fonts") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "st-custom-fonts";
      document.head.appendChild(el);
    }
    if (css && el.textContent !== css) el.textContent = css;
  }, [css]);
}

function facesLabel(f: CustomFont): string {
  return f.files
    .map((x) => `${WEIGHT_NAME[x.weight] ?? x.weight}${x.style === "italic" ? " italic" : ""}`)
    .join(", ");
}

/**
 * Site Styles → Fonts → "Uploaded fonts": the licensed fonts this site carries, where each is
 * used, and removing one. Choosing where a font is used happens in the font fields.
 */
export function UploadedFonts({ styles, disabled }: { styles: Styles; disabled: boolean }) {
  useStudioFontFaces(styles);
  const api = useDocStoreApi();
  const fonts = styles.fonts ?? [];
  if (!fonts.length) return null;
  const c = styles.choices;
  const remove = (f: CustomFont) => {
    const key = f.family.toLowerCase();
    const set: Record<string, unknown> = {
      fonts: fonts.length > 1 ? fonts.filter((x) => x !== f) : undefined,
    };
    if (c.headingFont?.toLowerCase() === key) set["choices.headingFont"] = undefined;
    if (c.bodyFont?.toLowerCase() === key) set["choices.bodyFont"] = undefined;
    const r = api.getState().commit([stylesOp(set)], { label: `Remove ${f.family}` });
    if (!r.ok)
      toast({
        tone: "danger",
        title: "Couldn’t remove the font",
        description: r.errors[0]?.message,
      });
  };
  return (
    <ul className="st-ss-fonts__list" aria-label="Uploaded fonts">
      {fonts.map((f) => {
        const uses = (["heading", "body"] as const)
          .filter((r) => {
            const rf = roleFont(styles, r);
            return rf.source === "uploaded" && rf.family.toLowerCase() === f.family.toLowerCase();
          })
          .map((r) => ROLE_LABEL[r]);
        return (
          <li key={f.family} className="st-ss-font">
            <span className="st-ss-font__name" style={{ fontFamily: `"${f.family}"` }}>
              {f.family}
            </span>
            <span className="st-ss-font__meta" title={facesLabel(f)}>
              {uses.length ? `Used for ${uses.join(" and ").toLowerCase()}` : "Not used yet"}
            </span>
            <IconButton
              label={`Remove ${f.family}`}
              icon={<Trash2 />}
              size="sm"
              disabled={disabled}
              onClick={() => remove(f)}
            />
          </li>
        );
      })}
    </ul>
  );
}

interface Face {
  file: File;
  weight: number;
  style: "normal" | "italic";
}

/**
 * Upload a licensed font (WOFF2, TTF or OTF; PRD §5.1) in a dialog: drop the files, check the
 * name and weights we guessed, confirm the license, choose where to use it. Owners and designers.
 */
export function FontUploadDialog({
  styles,
  role,
  onClose,
  onUploaded,
}: {
  styles: Styles;
  /** Where the person came from; preselected under "Use it for". */
  role?: "heading" | "body";
  onClose: () => void;
  /** Called with the new family once it's in Site Styles and the person chose to use it. */
  onUploaded?: (family: string, role: "heading" | "body") => void;
}) {
  const id = useId();
  const hub = useHub();
  const site = useCurrentSite();
  const api = useDocStoreApi();
  const input = useRef<HTMLInputElement>(null);
  const [faces, setFaces] = useState<Face[]>([]);
  const [family, setFamily] = useState("");
  const [category, setCategory] = useState<CustomFont["category"]>("sans-serif");
  const [useFor, setUseFor] = useState<"heading" | "body" | "none">(role ?? "none");
  const [licensed, setLicensed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taken = (styles.fonts ?? []).some(
    (f) => f.family.toLowerCase() === family.trim().toLowerCase(),
  );
  const ready = faces.length > 0 && family.trim() !== "" && licensed && !busy && Boolean(site);

  const addFiles = (files: File[]) => {
    const list = files.slice(0, 18);
    if (!list.length) return;
    setError(null);
    setFaces(list.map((file) => ({ file, ...guessFace(file.name) })));
    if (list[0] && !family) setFamily(guessFamily(list[0].name));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles([...e.dataTransfer.files]);
  };

  const upload = async () => {
    if (!ready || !site) return;
    setBusy(true);
    setError(null);
    try {
      const name =
        family
          .trim()
          .replace(/[^A-Za-z0-9 _-]/g, "")
          .slice(0, 60) || "My font";
      const prepared = [];
      for (const f of faces) prepared.push(await prepareFontFile(f.file, name, f));
      for (const p of prepared) {
        const blob = new Blob([p.bytes as Uint8Array<ArrayBuffer>], { type: p.mime });
        await hub.uploadMedia(site.id, blob, {
          path: p.path,
          mime: p.mime,
          bytes: p.bytes.length,
          sha256: p.sha256,
        });
        useMediaSources.getState().addLocal(p.path, blob);
      }
      const now = new Date();
      const font: CustomFont = {
        family: name,
        category,
        files: prepared.map((p) => ({ src: p.path, weight: p.weight, style: p.style })),
        license: { webUse: true, confirmedAt: now.toISOString() },
      };
      const ops: OpBody[] = [
        ...prepared.map(
          (p) => ({ op: "media.add", path: p.path, meta: fontMediaMeta(p, now) }) as OpBody,
        ),
        stylesOp({ fonts: withFont(styles.fonts, font) }),
      ];
      const r = api.getState().commit(ops, { label: `Add the ${name} font` });
      if (!r.ok) throw new Error(r.errors?.[0]?.message || "Couldn’t add the font.");
      if (useFor !== "none") onUploaded?.(name, useFor);
      toast({
        tone: "success",
        title: `${name} added`,
        description:
          useFor === "none"
            ? "Pick it in any font field."
            : `Now used for ${ROLE_LABEL[useFor].toLowerCase()}.`,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t upload the font.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && !busy && onClose()}
      title="Upload a font"
      description="Use a font you own or have a web license for. It publishes with your site."
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={`${id}-form`}
            disabled={!ready}
            loading={busy}
          >
            Upload font
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        className="st-fu"
        aria-label="Upload a font"
        onSubmit={(e) => {
          e.preventDefault();
          void upload();
        }}
      >
        {faces.length === 0 ? (
          <label
            className="st-fu__drop"
            data-dragging={dragging ? "" : undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <Upload aria-hidden="true" />
            <strong>Drop font files here</strong>
            <span>or click to choose · WOFF2, TTF or OTF, up to 5 MB each</span>
            <input
              ref={input}
              className="st-visually-hidden"
              type="file"
              multiple
              accept={FONT_ACCEPT}
              aria-label="Files"
              onChange={(e) => addFiles([...(e.target.files ?? [])])}
            />
          </label>
        ) : (
          <div className="st-fu__files">
            <div className="st-fu__fileshead">
              <span>
                {faces.length} {faces.length === 1 ? "file" : "files"}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setFaces([])} disabled={busy}>
                Choose others
              </Button>
            </div>
            {faces.map((f, i) => (
              <div
                key={`${f.file.name}-${f.file.size}-${f.file.lastModified}`}
                className="st-fu__face"
              >
                <FileType2 aria-hidden="true" />
                <span className="st-fu__file" title={f.file.name}>
                  {f.file.name}
                </span>
                <Select<string>
                  aria-label={`Weight of ${f.file.name}`}
                  size="sm"
                  value={String(f.weight)}
                  onValueChange={(v) =>
                    setFaces((all) =>
                      all.map((x, j) => (j === i ? { ...x, weight: Number(v) } : x)),
                    )
                  }
                  options={WEIGHTS.map((w) => ({
                    value: String(w),
                    label: WEIGHT_NAME[w] ?? String(w),
                  }))}
                />
                <Select<"normal" | "italic">
                  aria-label={`Style of ${f.file.name}`}
                  size="sm"
                  value={f.style}
                  onValueChange={(v) =>
                    setFaces((all) => all.map((x, j) => (j === i ? { ...x, style: v } : x)))
                  }
                  options={[
                    { value: "normal", label: "Upright" },
                    { value: "italic", label: "Italic" },
                  ]}
                />
                <IconButton
                  size="sm"
                  label={`Remove ${f.file.name}`}
                  icon={<X />}
                  onClick={() => setFaces((all) => all.filter((_, j) => j !== i))}
                />
              </div>
            ))}
          </div>
        )}
        <PropRow
          label="Name"
          htmlFor={`${id}-family`}
          error={
            taken ? "A font with this name is already here; uploading replaces it." : undefined
          }
        >
          <Input
            id={`${id}-family`}
            size="sm"
            value={family}
            maxLength={60}
            placeholder="e.g. Studio Grotesk"
            onChange={(e) => setFamily(e.target.value)}
          />
        </PropRow>
        <PropRow label="Kind">
          <Select<CustomFont["category"]>
            aria-label="Kind of font"
            size="sm"
            value={category}
            onValueChange={setCategory}
            options={FONT_CATEGORIES.map((k) => ({ value: k, label: CATEGORY_LABEL[k] }))}
          />
        </PropRow>
        <PropRow label="Use it for">
          <Segmented<"heading" | "body" | "none">
            aria-label="Use it for"
            size="sm"
            block
            value={useFor}
            onValueChange={setUseFor}
            options={[
              { value: "heading", label: "Headings" },
              { value: "body", label: "Text" },
              { value: "none", label: "Later" },
            ]}
          />
        </PropRow>
        <label className="st-fu__license">
          <input
            type="checkbox"
            checked={licensed}
            onChange={(e) => setLicensed(e.target.checked)}
          />
          <span>
            I own this font or its license allows using it on a website (web embedding or
            self-hosting).
          </span>
        </label>
        {error && (
          <p className="st-ip-row__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
