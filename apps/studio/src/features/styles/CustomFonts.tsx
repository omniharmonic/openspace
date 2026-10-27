import type { OpBody } from "@omniharmonic/openspace-ops";
import { type CustomFont, FONT_CATEGORIES, type Styles } from "@omniharmonic/openspace-schema";
import { Trash2, Upload } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useHub } from "../../api";
import { Button, IconButton, Input, Select, toast } from "../../ui";
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

/** Keep the uploaded fonts loaded in Studio itself, for the specimens in this panel. */
function useStudioFontFaces(styles: Styles) {
  const css = useCustomFontCss(styles);
  useEffect(() => {
    let el = document.getElementById("st-custom-fonts") as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = "st-custom-fonts";
      document.head.appendChild(el);
    }
    el.textContent = css;
  }, [css]);
}

/**
 * Site Styles → Fonts → "Your fonts": upload a licensed font (WOFF2, TTF or OTF) and use it for
 * headings and/or body text (PRD §5.1). Owners and designers only.
 */
export function CustomFonts({ styles, disabled }: { styles: Styles; disabled: boolean }) {
  useStudioFontFaces(styles);
  const api = useDocStoreApi();
  const [adding, setAdding] = useState(false);
  const fonts = styles.fonts ?? [];
  const c = styles.choices;
  const commit = (set: Record<string, unknown>, label: string) => {
    const r = api.getState().commit([stylesOp(set)], { label });
    if (!r.ok)
      toast({
        tone: "danger",
        title: "That font couldn’t be used",
        description: r.errors[0]?.message,
      });
    return r.ok;
  };
  const use = (role: "headingFont" | "bodyFont", family: string, on: boolean) =>
    commit(
      { [`choices.${role}`]: on ? family : undefined },
      on
        ? `Use ${family} for ${role === "headingFont" ? "headings" : "text"}`
        : "Use the pairing’s font",
    );
  const remove = (f: CustomFont) => {
    const set: Record<string, unknown> = {
      fonts: fonts.length > 1 ? fonts.filter((x) => x !== f) : undefined,
    };
    if (c.headingFont?.toLowerCase() === f.family.toLowerCase())
      set["choices.headingFont"] = undefined;
    if (c.bodyFont?.toLowerCase() === f.family.toLowerCase()) set["choices.bodyFont"] = undefined;
    commit(set, `Remove ${f.family}`);
  };
  return (
    <div className="st-ss-fonts">
      {fonts.length > 0 && (
        <ul className="st-ss-fonts__list" aria-label="Your fonts">
          {fonts.map((f) => {
            const heading = c.headingFont?.toLowerCase() === f.family.toLowerCase();
            const body = c.bodyFont?.toLowerCase() === f.family.toLowerCase();
            return (
              <li key={f.family} className="st-ss-font">
                <div className="st-ss-font__head">
                  <span className="st-ss-font__name" style={{ fontFamily: `"${f.family}"` }}>
                    {f.family}
                  </span>
                  <IconButton
                    label={`Remove ${f.family}`}
                    icon={<Trash2 />}
                    size="sm"
                    disabled={disabled}
                    onClick={() => remove(f)}
                  />
                </div>
                <span className="st-ss-font__meta">
                  {CATEGORY_LABEL[f.category]} ·{" "}
                  {f.files
                    .map(
                      (x) =>
                        `${WEIGHT_NAME[x.weight] ?? x.weight}${x.style === "italic" ? " italic" : ""}`,
                    )
                    .join(", ")}
                </span>
                <fieldset className="st-ip-chips" aria-label={`Use ${f.family} for`}>
                  <button
                    type="button"
                    className="st-ip-chip"
                    aria-pressed={heading}
                    disabled={disabled}
                    onClick={() => use("headingFont", f.family, !heading)}
                  >
                    Headings
                  </button>
                  <button
                    type="button"
                    className="st-ip-chip"
                    aria-pressed={body}
                    disabled={disabled}
                    onClick={() => use("bodyFont", f.family, !body)}
                  >
                    Text
                  </button>
                </fieldset>
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <FontUploadForm
          styles={styles}
          onDone={() => setAdding(false)}
          commit={(ops, label) => {
            const r = api.getState().commit(ops, { label });
            return r.ok ? { ok: true } : { ok: false, errors: r.errors };
          }}
        />
      ) : (
        <Button size="sm" icon={<Upload />} disabled={disabled} onClick={() => setAdding(true)}>
          Upload a font
        </Button>
      )}
    </div>
  );
}

interface Face {
  file: File;
  weight: number;
  style: "normal" | "italic";
}

function FontUploadForm({
  styles,
  onDone,
  commit,
}: {
  styles: Styles;
  onDone: () => void;
  commit: (ops: OpBody[], label: string) => { ok: boolean; errors?: Array<{ message: string }> };
}) {
  const id = useId();
  const hub = useHub();
  const site = useCurrentSite();
  const [faces, setFaces] = useState<Face[]>([]);
  const [family, setFamily] = useState("");
  const [category, setCategory] = useState<CustomFont["category"]>("sans-serif");
  const [licensed, setLicensed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taken = (styles.fonts ?? []).some(
    (f) => f.family.toLowerCase() === family.trim().toLowerCase(),
  );
  const ready = faces.length > 0 && family.trim() !== "" && licensed && !busy && Boolean(site);

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
        await hub.uploadMedia(
          site.id,
          new Blob([p.bytes as Uint8Array<ArrayBuffer>], { type: p.mime }),
          {
            path: p.path,
            mime: p.mime,
            bytes: p.bytes.length,
            sha256: p.sha256,
          },
        );
        useMediaSources
          .getState()
          .addLocal(p.path, new Blob([p.bytes as Uint8Array<ArrayBuffer>], { type: p.mime }));
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
      const r = commit(ops, `Add the ${name} font`);
      if (!r.ok) throw new Error(r.errors?.[0]?.message || "Couldn’t add the font.");
      toast({ tone: "success", title: `${name} added`, description: "Choose where to use it." });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t upload the font.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="st-ss-fontform"
      aria-label="Upload a font"
      onSubmit={(e) => {
        e.preventDefault();
        void upload();
      }}
    >
      <PropRow
        label="Files"
        htmlFor={`${id}-files`}
        stacked
        hint="WOFF2, TTF or OTF, up to 5 MB each."
      >
        <input
          id={`${id}-files`}
          className="st-ss-fontform__files"
          type="file"
          multiple
          accept={FONT_ACCEPT}
          onChange={(e) => {
            const list = [...(e.target.files ?? [])].slice(0, 18);
            setFaces(list.map((file) => ({ file, ...guessFace(file.name) })));
            if (list[0] && !family) setFamily(guessFamily(list[0].name));
          }}
        />
      </PropRow>
      {faces.map((f, i) => (
        <div
          key={`${f.file.name}-${f.file.size}-${f.file.lastModified}`}
          className="st-ss-fontform__face"
        >
          <span className="st-ss-fontform__file" title={f.file.name}>
            {f.file.name}
          </span>
          <Select<string>
            aria-label={`Weight of ${f.file.name}`}
            size="sm"
            value={String(f.weight)}
            onValueChange={(v) =>
              setFaces((all) => all.map((x, j) => (j === i ? { ...x, weight: Number(v) } : x)))
            }
            options={WEIGHTS.map((w) => ({ value: String(w), label: `${w} ${WEIGHT_NAME[w]}` }))}
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
        </div>
      ))}
      <PropRow
        label="Name"
        htmlFor={`${id}-family`}
        error={taken ? "A font with this name is already here; uploading replaces it." : undefined}
      >
        <Input
          id={`${id}-family`}
          size="sm"
          value={family}
          maxLength={60}
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
      <label className="st-ss-fontform__license">
        <input type="checkbox" checked={licensed} onChange={(e) => setLicensed(e.target.checked)} />
        <span>
          I own this font or its license allows using it on a website (web embedding /
          self-hosting).
        </span>
      </label>
      {error && (
        <p className="st-ip-row__error" role="alert">
          {error}
        </p>
      )}
      <div className="st-ss-fontform__actions">
        <Button size="sm" variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" type="submit" disabled={!ready} loading={busy}>
          Upload font
        </Button>
      </div>
    </form>
  );
}
