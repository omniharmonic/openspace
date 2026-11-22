/**
 * The font field and picker (Figma's font picker, for site fonts): a field that shows the role's
 * font in that font; clicking it opens a searchable list — fonts on this site, uploaded fonts,
 * then the catalog by kind — each drawn in its own face. Hovering or arrowing through the list
 * previews the font on the canvas; picking commits one undoable change. Uploading starts here
 * too, and the uploaded font is put straight to use for the role.
 */
import type { FontRole, Styles } from "@omniharmonic/openspace-schema";
import { Command } from "cmdk";
import { Check, ChevronDown, Search, Upload } from "lucide-react";
import { Popover as RPopover } from "radix-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { cx, toast } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { stylesOp } from "../inspector/model/edits";
import { FontUploadDialog, useStudioFontFaces } from "./CustomFonts";
import {
  catalogFont,
  FONT_CATALOG,
  type FontKind,
  KIND_LABEL,
  previewCssUrl,
} from "./font-catalog";
import { useFontPreview } from "./fontPreview";
import {
  FAMILY_RE,
  type FontPick,
  fontsInUse,
  pairingFont,
  ROLE_LABEL,
  roleFont,
  roleFontLabel,
  roleFontPatch,
  tidyFamily,
} from "./roleFonts";
import "./font-picker.css";

const loaded = new Set<string>();

/**
 * Load just enough of each Google family to draw its name, once per family. Catalog families go
 * in batches; any other name gets its own request, because Google rejects a whole batch when one
 * family in it doesn't exist (a typo, or an uploaded font's name).
 */
export function useFontSamples(families: readonly string[], active = true) {
  useEffect(() => {
    if (!active) return;
    const todo = [...new Set(families)].filter((f) => f && !loaded.has(f.toLowerCase()));
    if (!todo.length) return;
    const known = todo.filter((f) => catalogFont(f));
    const batches = [
      ...Array.from({ length: Math.ceil(known.length / 40) }, (_, i) =>
        known.slice(i * 40, i * 40 + 40),
      ),
      ...todo.filter((f) => !catalogFont(f)).map((f) => [f]),
    ];
    for (const batch of batches) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = previewCssUrl(batch);
      link.dataset.stFontSamples = "";
      document.head.appendChild(link);
    }
    for (const f of todo) loaded.add(f.toLowerCase());
  }, [families, active]);
}

type Lookup = { state: "idle" | "checking" | "found" | "missing"; family?: string };
const lookups = new Map<string, Lookup>();

/**
 * Whether Google Fonts has a family (its CSS API answers 400 for unknown names), and its exact
 * spelling when the name was typed in another case. Debounced; answers are remembered.
 */
function useGoogleFamily(name: string | null): Lookup {
  const [result, setResult] = useState<Lookup>({ state: "idle" });
  useEffect(() => {
    if (!name) {
      setResult({ state: "idle" });
      return;
    }
    const known = lookups.get(name.toLowerCase());
    if (known) {
      setResult(known);
      return;
    }
    setResult({ state: "checking" });
    let live = true;
    const t = setTimeout(async () => {
      let out: Lookup = { state: "missing" };
      try {
        const res = await fetch(previewCssUrl([name]));
        if (res.ok) {
          const css = await res.text();
          const spelled = /font-family:\s*'([^']+)'/.exec(css)?.[1];
          out = { state: "found", family: spelled ?? name };
        }
      } catch {
        out = { state: "missing" };
      }
      lookups.set(name.toLowerCase(), out);
      if (live) setResult(out);
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [name]);
  return result;
}

const KINDS: Array<FontKind | "all"> = [
  "all",
  "serif",
  "sans-serif",
  "display",
  "handwriting",
  "monospace",
];
const KIND_CHIP: Record<FontKind | "all", string> = {
  all: "All",
  serif: "Serif",
  "sans-serif": "Sans",
  display: "Display",
  handwriting: "Script",
  monospace: "Mono",
};

/** A stable cmdk value per row (cmdk lowercases values; keep the kind of row in it). */
const val = (kind: string, family: string) => `${kind}:${family.toLowerCase()}`;

function useCommitFont() {
  const api = useDocStoreApi();
  return (role: FontRole, pick: FontPick) => {
    useFontPreview.getState().clear();
    const r = api
      .getState()
      .commit([stylesOp(roleFontPatch(role, pick))], { label: roleFontLabel(role, pick) });
    if (!r.ok)
      toast({
        tone: "danger",
        title: "That font couldn’t be used",
        description: r.errors[0]?.message,
      });
    return r.ok;
  };
}

function FontList({
  role,
  styles,
  onPick,
  onUpload,
}: {
  role: FontRole;
  styles: Styles;
  onPick: (pick: FontPick) => void;
  onUpload?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<FontKind | "all">("all");
  const current = roleFont(styles, role);
  const currentKey = current.followsText ? null : current.family.toLowerCase();
  const uploaded = role === "label" ? [] : (styles.fonts ?? []);
  const uploadedKeys = new Set(uploaded.map((f) => f.family.toLowerCase()));
  const inUse = fontsInUse(styles).filter((f) => !uploadedKeys.has(f.toLowerCase()));
  const catalog = FONT_CATALOG.filter((f) => kind === "all" || f.kind === kind);
  const families = useMemo(() => {
    const up = new Set((styles.fonts ?? []).map((f) => f.family.toLowerCase()));
    return [
      ...fontsInUse(styles),
      ...FONT_CATALOG.map((f) => f.family),
      pairingFont(styles, role),
    ].filter((f) => !up.has(f.toLowerCase()) && f !== "Same as text");
  }, [styles, role]);
  useFontSamples(families);

  // Live preview: whatever row is highlighted (mouse or arrows) draws on the canvas.
  const picks = new Map<string, FontPick>();
  // cmdk reports the highlighted row only when it's controlled.
  const [highlighted, setHighlighted] = useState("");
  // Only after the person points or arrows: opening the list must not restyle the canvas.
  const touched = useRef(false);
  const preview = (value: string) => {
    setHighlighted(value);
    if (!touched.current) return;
    const pick = picks.get(value);
    if (pick) useFontPreview.getState().show(styles, roleFontPatch(role, pick));
  };
  useEffect(() => () => useFontPreview.getState().clear(), []);

  // "Use any Google font by name": only when nothing listed matches, and only once Google
  // confirms the family exists (so a typo can't quietly drop the site to a system font).
  const typed = tidyFamily(query);
  const q = query.trim().toLowerCase();
  const listed = [...FONT_CATALOG.map((f) => f.family), ...inUse, ...uploaded.map((f) => f.family)];
  const anyMatch = q.length > 0 && listed.some((f) => f.toLowerCase().includes(q));
  const offerTyped = q.length > 1 && !anyMatch && FAMILY_RE.test(typed);
  const lookup = useGoogleFamily(offerTyped ? typed : null);

  const row = (key: string, family: string, pick: FontPick, meta?: string) => {
    const value = val(key, family);
    picks.set(value, pick);
    const on = pick.kind !== "pairing" && family.toLowerCase() === currentKey;
    return (
      <Command.Item
        key={value}
        value={value}
        keywords={[family]}
        className="st-fp__item"
        onSelect={() => onPick(pick)}
        data-current={on ? "" : undefined}
      >
        <span className="st-fp__check">{on && <Check aria-hidden="true" />}</span>
        <span className="st-fp__name" style={{ fontFamily: `"${family}", var(--st-font)` }}>
          {family}
        </span>
        {meta && <span className="st-fp__meta">{meta}</span>}
      </Command.Item>
    );
  };

  const pairingFamily = pairingFont(styles, role);
  const pairingOn = current.source === "pairing";
  const pairingValue = val("pairing", "default");
  picks.set(pairingValue, { kind: "pairing" });

  return (
    <Command
      className="st-fp"
      label={`${ROLE_LABEL[role]} font`}
      loop
      // Our own filter: match the family name anywhere, ignoring case.
      filter={(_value, search, keywords) =>
        (keywords ?? []).some((k) => k.toLowerCase().includes(search.trim().toLowerCase())) ? 1 : 0
      }
      value={highlighted}
      onValueChange={preview}
      onPointerMoveCapture={() => {
        touched.current = true;
      }}
      onKeyDownCapture={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") touched.current = true;
      }}
    >
      <div className="st-fp__search">
        <Search aria-hidden="true" />
        <Command.Input
          autoFocus
          className="st-fp__input"
          placeholder="Search fonts"
          value={query}
          onValueChange={setQuery}
        />
      </div>
      <fieldset className="st-fp__kinds st-ip-fieldset" aria-label="Kind of font">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            className="st-fp__kind"
            onClick={() => setKind(k)}
          >
            {KIND_CHIP[k]}
          </button>
        ))}
      </fieldset>
      <Command.List
        className="st-fp__list"
        onPointerLeave={() => useFontPreview.getState().clear()}
      >
        {!offerTyped && (
          <Command.Empty className="st-fp__empty">No font by that name.</Command.Empty>
        )}
        {offerTyped && (
          <Command.Group heading="Google Fonts" className="st-fp__group" forceMount>
            {(() => {
              const value = val("typed", lookup.family ?? typed);
              const ok = lookup.state === "found" && lookup.family;
              if (ok) picks.set(value, { kind: "google", family: lookup.family as string });
              return (
                <Command.Item
                  value={value}
                  keywords={[query]}
                  forceMount
                  disabled={!ok}
                  className="st-fp__item"
                  onSelect={() => ok && onPick({ kind: "google", family: lookup.family as string })}
                >
                  <span className="st-fp__check" />
                  <span
                    className="st-fp__name"
                    style={ok ? { fontFamily: `"${lookup.family}", var(--st-font)` } : undefined}
                  >
                    {lookup.state === "checking"
                      ? `Looking for “${typed}”…`
                      : ok
                        ? lookup.family
                        : `No Google font called “${typed}”`}
                  </span>
                  {ok && <span className="st-fp__meta">Google Fonts</span>}
                </Command.Item>
              );
            })()}
          </Command.Group>
        )}
        {kind === "all" && (
          <Command.Group heading="On this site" className="st-fp__group">
            <Command.Item
              value={pairingValue}
              keywords={[pairingFamily, "pairing", "default"]}
              className="st-fp__item"
              data-current={pairingOn ? "" : undefined}
              onSelect={() => onPick({ kind: "pairing" })}
            >
              <span className="st-fp__check">{pairingOn && <Check aria-hidden="true" />}</span>
              <span
                className="st-fp__name"
                style={
                  role === "label" && pairingFamily === "Same as text"
                    ? undefined
                    : { fontFamily: `"${pairingFamily}", var(--st-font)` }
                }
              >
                {pairingFamily}
              </span>
              <span className="st-fp__meta">Pairing</span>
            </Command.Item>
            {inUse
              .filter((f) => f.toLowerCase() !== pairingFamily.toLowerCase())
              .map((f) => row("site", f, { kind: "google", family: f }, "In use"))}
          </Command.Group>
        )}
        {kind === "all" && uploaded.length > 0 && (
          <Command.Group heading="Uploaded" className="st-fp__group">
            {uploaded.map((f) => row("up", f.family, { kind: "uploaded", family: f.family }))}
          </Command.Group>
        )}
        <Command.Group
          heading={kind === "all" ? "Google Fonts" : KIND_LABEL[kind]}
          className="st-fp__group"
        >
          {catalog.map((f) =>
            row("cat", f.family, { kind: "google", family: f.family, fontKind: f.kind }),
          )}
        </Command.Group>
      </Command.List>
      <div className="st-fp__foot">
        {onUpload ? (
          <button type="button" className="st-fp__upload" onClick={onUpload}>
            <Upload aria-hidden="true" />
            Upload a font…
          </button>
        ) : (
          <span className="st-fp__note">
            {role === "label"
              ? "Uploaded fonts can be used for headings and text."
              : "Ask the site’s owner to upload fonts."}
          </span>
        )}
      </div>
    </Command>
  );
}

/**
 * The font for one role, as a field: the font's name drawn in the font. Opens the picker.
 * `canUpload` offers "Upload a font…" (owners and designers).
 */
export function FontField({
  fontRole: role,
  disabled,
  canUpload,
  side = "left",
  label,
  compact,
  showRole,
}: {
  fontRole: FontRole;
  disabled?: boolean;
  canUpload?: boolean;
  side?: "left" | "right" | "bottom";
  /** Accessible name (defaults to "Headings font" etc.). */
  label?: string;
  /** Toolbar size: smaller, no source line. */
  compact?: boolean;
  /** Show the role ("Headings") inside the field, for lists of fields without labels. */
  showRole?: boolean;
}) {
  const styles = useDocStore((s) => s.doc.styles);
  useStudioFontFaces(styles);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const commit = useCommitFont();
  const current = roleFont(styles, role);
  useFontSamples(
    useMemo(
      () => (current.source === "uploaded" ? [] : [current.family]),
      [current.source, current.family],
    ),
  );
  const note =
    current.source === "uploaded" ? "Uploaded" : current.followsText ? "Same as text" : null;
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) useFontPreview.getState().clear();
  };
  return (
    <>
      <RPopover.Root open={open} onOpenChange={onOpenChange}>
        <RPopover.Trigger asChild>
          <button
            type="button"
            className={cx("st-ff", compact && "st-ff--compact")}
            disabled={disabled}
            aria-label={`${label ?? `${ROLE_LABEL[role]} font`}: ${current.family}`}
          >
            <span
              className="st-ff__name"
              style={{ fontFamily: `"${current.family}", var(--st-font)` }}
            >
              {current.family}
            </span>
            {!compact && (showRole || note) && (
              <span className="st-ff__source">{showRole ? ROLE_LABEL[role] : note}</span>
            )}
            <ChevronDown className="st-ff__chev" aria-hidden="true" />
          </button>
        </RPopover.Trigger>
        <RPopover.Portal>
          <RPopover.Content
            side={side}
            align="start"
            sideOffset={8}
            collisionPadding={8}
            className="st-pop st-fp__pop"
            aria-label={`${ROLE_LABEL[role]} font`}
            onCloseAutoFocus={(e) => {
              if (uploading) e.preventDefault();
            }}
          >
            <div className="st-fp__title">
              <span>{ROLE_LABEL[role]} font</span>
              <span className="st-fp__scope">Used across your site</span>
            </div>
            <FontList
              role={role}
              styles={styles}
              onPick={(pick) => {
                if (commit(role, pick)) setOpen(false);
              }}
              onUpload={
                canUpload && role !== "label"
                  ? () => {
                      setOpen(false);
                      setUploading(true);
                    }
                  : undefined
              }
            />
          </RPopover.Content>
        </RPopover.Portal>
      </RPopover.Root>
      {uploading && (
        <FontUploadDialog
          styles={styles}
          role={role === "label" ? "heading" : role}
          onClose={() => setUploading(false)}
          onUploaded={(family, r) => commit(r, { kind: "uploaded", family })}
        />
      )}
    </>
  );
}
