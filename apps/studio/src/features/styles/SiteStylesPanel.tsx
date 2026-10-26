import { compiledStylesFor } from "@openspace/renderer";
import {
  BUTTON_STYLES,
  DENSITIES,
  IMAGE_TREATMENTS,
  type ImageTreatment,
  MOTION_LEVELS,
  SHAPES,
  type Styles,
} from "@openspace/schema";
import {
  curatedPalettes,
  flattenDtcg,
  fontStack,
  googleFontsUrl,
  IMAGE_TREATMENT_VALUES,
  type PaletteCandidate,
  TYPE_PAIRINGS,
  type TypePairing,
} from "@openspace/theme";
import { AlertTriangle, Check, ImagePlus, Plus, Trash2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, cx, Input, Segmented, Select, toast } from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { THEME_LABEL } from "../editor/model/themes";
import { useInspectorRole } from "../inspector/env";
import { previewSrc } from "../inspector/media";
import { stylesOp } from "../inspector/model/edits";
import { isDesigner } from "../inspector/model/permissions";
import { PanelSection, PropRow, RoleNote } from "../inspector/ui";
import {
  brandPatch,
  type ContrastIssue,
  contrastIssues,
  curatedPatch,
  extractFromImage,
  fixPatch,
  normaliseBrand,
  OVERRIDE_TYPES,
  overridePatch,
  overrideWarnings,
  ROLE_LABEL,
  type StylesSet,
  THEME_NAME,
} from "./model";
import "./styles.css";

type Commit = (set: StylesSet, label: string, mergeKey?: string) => boolean;

function useCommit(): Commit {
  const api = useDocStoreApi();
  return (set, label, mergeKey) => {
    const r = api.getState().commit([stylesOp(set)], { label, ...(mergeKey ? { mergeKey } : {}) });
    if (!r.ok)
      toast({
        tone: "danger",
        title: "That style couldn’t be applied",
        description: r.errors[0]?.message,
      });
    return r.ok;
  };
}

/** Load a pairing's fonts into Studio (subset to the sample glyphs) for the gallery. */
function usePairingFonts(pairings: readonly TypePairing[]) {
  useEffect(() => {
    for (const p of pairings) {
      const key = `st-font-${p.id}`;
      if (document.getElementById(key)) continue;
      const link = document.createElement("link");
      link.id = key;
      link.rel = "stylesheet";
      link.href = `${googleFontsUrl(p)}&text=${encodeURIComponent("AaBbGgQqRrTtYy Thequickbrownfoxjumpsoverthelazydog.,&'")}`;
      document.head.appendChild(link);
    }
  }, [pairings]);
}

function BrandColor({
  styles,
  commit,
  disabled,
}: {
  styles: Styles;
  commit: Commit;
  disabled: boolean;
}) {
  const brand = styles.choices.palette.brand;
  const hex = compiledStylesFor(styles).tokens.palette.brand;
  const [draft, setDraft] = useState(hex.toUpperCase());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(hex.toUpperCase()), [hex]);
  const apply = (v: string, merge = false) => {
    const next = normaliseBrand(v);
    if (!next) {
      setError("Use a color like #2F6B4F.");
      return;
    }
    setError(null);
    if (next !== brand)
      commit(brandPatch(next, "brand"), "Change brand color", merge ? "brand" : undefined);
  };
  return (
    <PropRow label="Brand color" htmlFor="st-ss-brand" error={error}>
      <label className="st-ss-brand__swatch" style={{ background: hex }}>
        <span className="st-visually-hidden">Pick brand color</span>
        <input
          type="color"
          value={hex}
          disabled={disabled}
          aria-label="Pick brand color"
          onChange={(e) => apply(e.target.value, true)}
        />
      </label>
      <Input
        id="st-ss-brand"
        size="sm"
        prefix={<span className="st-ip-count">#</span>}
        value={draft.replace(/^#/, "")}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => apply(draft)}
        onKeyDown={(e) => e.key === "Enter" && apply(draft)}
      />
    </PropRow>
  );
}

function FromImage({
  commit,
  disabled,
  logo,
}: {
  commit: Commit;
  disabled: boolean;
  logo?: string;
}) {
  const [candidates, setCandidates] = useState<PaletteCandidate[] | null>(null);
  const [source, setSource] = useState<"logo" | "image">("image");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const run = async (src: Blob | string, from: "logo" | "image") => {
    setBusy(true);
    try {
      setCandidates(await extractFromImage(src));
      setSource(from);
    } catch {
      toast({
        tone: "danger",
        title: "Couldn’t read colors from that image",
        description: "Try a JPEG or PNG.",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="st-ss-extract">
      <div className="st-ip-btnrow">
        {logo && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Wand2 />}
            disabled={disabled || busy}
            onClick={() => run(previewSrc(logo) ?? logo, "logo")}
          >
            From my logo
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          icon={<ImagePlus />}
          disabled={disabled || busy}
          onClick={() => file.current?.click()}
        >
          From a photo
        </Button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          aria-label="Choose a photo to take colors from"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void run(f, "image");
            e.target.value = "";
          }}
        />
      </div>
      {candidates && (
        <div className="st-ss-candidates">
          {candidates.map((c) => (
            <button
              key={c.hex}
              type="button"
              className="st-ss-candidate"
              style={{ background: c.hex }}
              aria-label={`Use ${c.hex.toUpperCase()}`}
              title={c.hex.toUpperCase()}
              disabled={disabled}
              onClick={() =>
                commit(brandPatch(c.hex.toLowerCase(), source), "Use color from image")
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeStrip({ styles }: { styles: Styles }) {
  const themes = compiledStylesFor(styles).tokens.themes;
  return (
    <div className="st-ss-strip">
      {(Object.keys(THEME_LABEL) as Array<keyof typeof THEME_LABEL>).map((t) => (
        <div
          key={t}
          className="st-ss-strip__chip"
          style={{ background: themes[t].background, color: themes[t].heading }}
          title={THEME_LABEL[t]}
        >
          <span>Aa</span>
          <i style={{ background: themes[t].accent }} />
        </div>
      ))}
    </div>
  );
}

function Palettes({
  styles,
  commit,
  disabled,
}: {
  styles: Styles;
  commit: Commit;
  disabled: boolean;
}) {
  const current = styles.choices.palette;
  return (
    <fieldset className="st-ss-palettes st-ip-fieldset">
      <legend className="st-visually-hidden">Curated palettes</legend>
      {curatedPalettes.map((p) => {
        const on =
          current.source === "curated" &&
          current.brand === p.brand &&
          current.neutral === p.neutral;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={on}
            className="st-ss-palette"
            title={p.description}
            disabled={disabled}
            onClick={() => commit(curatedPatch(p), `Use the ${p.name} palette`)}
          >
            <span className="st-ss-palette__chips">
              <span style={{ background: p.brand }} />
              <span className="st-ss-palette__n" data-neutral={p.neutral} />
            </span>
            <span className="st-ss-palette__name">{p.name}</span>
          </button>
        );
      })}
    </fieldset>
  );
}

function Pairings({
  styles,
  commit,
  disabled,
}: {
  styles: Styles;
  commit: Commit;
  disabled: boolean;
}) {
  usePairingFonts(TYPE_PAIRINGS);
  return (
    <fieldset className="st-ss-pairings st-ip-fieldset">
      <legend className="st-visually-hidden">Font pairings</legend>
      {TYPE_PAIRINGS.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={styles.choices.pairing === p.id}
          aria-label={p.name}
          className="st-ss-pairing"
          disabled={disabled}
          onClick={() => commit({ "choices.pairing": p.id }, "Change fonts")}
        >
          <span
            className="st-ss-pairing__head"
            style={{
              fontFamily: fontStack(p.heading),
              fontWeight: p.headingWeight,
              letterSpacing: p.headingTracking,
            }}
          >
            The quick fox
          </span>
          <span
            className="st-ss-pairing__body"
            style={{ fontFamily: fontStack(p.body), fontWeight: p.bodyWeight }}
          >
            Jumps over the lazy dog.
          </span>
          <span className="st-ss-pairing__name">
            {p.name}
            {styles.choices.pairing === p.id && <Check aria-hidden="true" />}
          </span>
        </button>
      ))}
    </fieldset>
  );
}

const BUTTON_LABEL: Record<(typeof BUTTON_STYLES)[number], string> = {
  solid: "Solid",
  outline: "Outline",
  underline: "Underline",
  "pill-solid": "Pill",
  "pill-outline": "Pill outline",
  "text-arrow": "Text →",
};

function Buttons({
  styles,
  commit,
  disabled,
}: {
  styles: Styles;
  commit: Commit;
  disabled: boolean;
}) {
  const accent = compiledStylesFor(styles).tokens.themes.light.accent;
  return (
    <fieldset className="st-ss-buttons st-ip-fieldset">
      <legend className="st-visually-hidden">Button style</legend>
      {BUTTON_STYLES.map((b) => (
        <button
          key={b}
          type="button"
          aria-pressed={styles.choices.buttons === b}
          className="st-ss-btnopt"
          disabled={disabled}
          onClick={() => commit({ "choices.buttons": b }, "Change button style")}
        >
          <span
            className={cx("st-ss-btnopt__sample", `is-${b}`)}
            style={{ ["--a" as string]: accent }}
          >
            {b === "text-arrow" ? "Book →" : "Book"}
          </span>
          {BUTTON_LABEL[b]}
        </button>
      ))}
    </fieldset>
  );
}

const SHAPE_RADIUS = { sharp: "0", soft: "6px", round: "16px" } as const;

function ImageTreatments({
  styles,
  commit,
  disabled,
}: {
  styles: Styles;
  commit: Commit;
  disabled: boolean;
}) {
  return (
    <fieldset className="st-ss-images st-ip-fieldset">
      <legend className="st-visually-hidden">Image treatment</legend>
      {IMAGE_TREATMENTS.map((t) => {
        const v = IMAGE_TREATMENT_VALUES[t as ImageTreatment] as Record<string, string>;
        const radius = (v.radius ?? "0").includes("var(") ? "12px" : v.radius;
        return (
          <button
            key={t}
            type="button"
            aria-pressed={styles.choices.imageTreatment === t}
            className="st-ss-imgopt"
            disabled={disabled}
            onClick={() => commit({ "choices.imageTreatment": t }, "Change image style")}
          >
            <span
              className={cx("st-ss-imgopt__sample", `is-${t}`)}
              style={{ borderRadius: radius }}
            />
            {t === "blob" ? "Organic" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        );
      })}
    </fieldset>
  );
}

function ContrastWarnings({
  issues,
  commit,
  disabled,
}: {
  issues: ContrastIssue[];
  commit: Commit;
  disabled: boolean;
}) {
  if (!issues.length)
    return (
      <p className="st-ss-ok">
        <Check aria-hidden="true" /> Every text and background pair is readable (WCAG AA).
      </p>
    );
  return (
    <ul className="st-ss-issues" aria-label="Contrast problems">
      {issues.map((i) => {
        const f = i.failure;
        const patch = fixPatch(i);
        return (
          <li key={`${f.theme}:${f.fg}:${f.bg}`} className="st-ss-issue">
            <AlertTriangle aria-hidden="true" />
            <div className="st-ss-issue__text">
              <strong>
                {ROLE_LABEL[f.fg] ?? f.fg} on {ROLE_LABEL[f.bg] ?? f.bg}
              </strong>
              <span>
                {THEME_NAME[f.theme]} theme · {f.ratio}:1, needs {f.required}:1
              </span>
            </div>
            <span className="st-ss-issue__pair" style={{ background: f.bgColor, color: f.fgColor }}>
              Aa
            </span>
            {patch ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled}
                title={
                  i.fix?.converged === false
                    ? "No single color passes on every background; this gets closest"
                    : "Use the nearest accessible color"
                }
                onClick={() => commit(patch, "Use nearest accessible color")}
              >
                {i.fix?.converged === false ? "Improve" : "Fix"}
              </Button>
            ) : (
              <span className="st-ip-count">Adjusted on publish</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function OverridesEditor({ styles, commit }: { styles: Styles; commit: Commit }) {
  const tokens = flattenDtcg(styles.overrides);
  const warnings = useMemo(() => overrideWarnings(styles), [styles]);
  const [path, setPath] = useState("");
  const [type, setType] = useState<string>("color");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const r = overridePatch(path, value, type);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    if (commit(r.set, "Set design token")) {
      setPath("");
      setValue("");
      setError(null);
    }
  };
  return (
    <div className="st-ss-tokens">
      {tokens.length > 0 && (
        <ul className="st-ss-tokenlist" aria-label="Design token overrides">
          {tokens.map((t) => {
            const dotted = t.path.join(".");
            return (
              <li key={dotted} className="st-ss-token">
                <code title={dotted}>{dotted}</code>
                <Input
                  size="sm"
                  aria-label={`${dotted} value`}
                  key={JSON.stringify(t.token.$value)}
                  defaultValue={String(t.token.$value)}
                  onBlur={(e) => {
                    if (e.target.value === String(t.token.$value)) return;
                    const r = overridePatch(dotted, e.target.value, t.type);
                    if (r.ok) commit(r.set, "Change design token");
                    else toast({ tone: "danger", title: r.message });
                  }}
                />
                <button
                  type="button"
                  className="st-ip-icon-btn"
                  aria-label={`Remove ${dotted}`}
                  onClick={() =>
                    commit({ [`overrides.${dotted}`]: undefined }, "Remove design token")
                  }
                >
                  <Trash2 aria-hidden="true" />
                </button>
                {warnings.get(dotted) && <p className="st-ip-row__error">{warnings.get(dotted)}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <div className="st-ss-tokenadd">
        <Input
          size="sm"
          aria-label="Token path"
          placeholder="color.dark.accent"
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
            setError(null);
          }}
        />
        <Select<string>
          aria-label="Token type"
          size="sm"
          value={type}
          onValueChange={setType}
          options={OVERRIDE_TYPES.map((t) => ({ value: t, label: t }))}
        />
        <Input
          size="sm"
          aria-label="Token value"
          placeholder={type === "color" ? "#1a2b3c" : type === "dimension" ? "1.25rem" : "value"}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button size="sm" variant="secondary" icon={<Plus />} onClick={add}>
          Add token
        </Button>
      </div>
      {error && (
        <p className="st-ip-row__error" role="alert">
          {error}
        </p>
      )}
      <p className="st-ip-row__hint">
        W3C design tokens. <code>color.all.text</code> sets a role in every section theme;{" "}
        <code>color.dark.text</code> in one.
      </p>
    </div>
  );
}

/**
 * Site Styles (FR-16): palette, fonts, density, shape, buttons, motion and image treatment.
 * Every change is a `styles.patch` op; the whole canvas restyles live.
 */
export function SiteStylesPanel() {
  const styles = useDocStore((s) => s.doc.styles);
  const logo = useDocStore((s) => s.doc.site.logo?.src);
  const role = useInspectorRole();
  const commit = useCommit();
  const can = isDesigner(role);
  const disabled = !can;
  const issues = useMemo(() => contrastIssues(styles), [styles]);
  const c = styles.choices;
  return (
    <div className="st-ss">
      {!can && (
        <RoleNote>
          Site styles are set by the site’s owner and designers. You can preview them here.
        </RoleNote>
      )}
      {issues.length > 0 && (
        <div className="st-ss-alert" role="status">
          <AlertTriangle aria-hidden="true" /> {issues.length} color{" "}
          {issues.length === 1 ? "pair is" : "pairs are"} hard to read.
        </div>
      )}
      <PanelSection title="Colors">
        <ThemeStrip styles={styles} />
        <BrandColor styles={styles} commit={commit} disabled={disabled} />
        <FromImage commit={commit} disabled={disabled} logo={logo} />
        <PropRow label="Palettes" stacked>
          <Palettes styles={styles} commit={commit} disabled={disabled} />
        </PropRow>
        <PropRow label="Neutrals">
          <Segmented
            disabled={disabled}
            aria-label="Neutral tint"
            size="sm"
            block
            value={c.palette.neutral}
            onValueChange={(v) =>
              !disabled && commit({ "choices.palette.neutral": v }, "Change neutrals")
            }
            options={[
              { value: "warm", label: "Warm" },
              { value: "cool", label: "Cool" },
              { value: "pure", label: "Pure" },
            ]}
          />
        </PropRow>
        <PropRow label="Contrast">
          <Segmented
            disabled={disabled}
            aria-label="Contrast"
            size="sm"
            block
            value={c.palette.contrast}
            onValueChange={(v) =>
              !disabled && commit({ "choices.palette.contrast": v }, "Change contrast")
            }
            options={[
              { value: "standard", label: "Standard" },
              { value: "high", label: "High" },
            ]}
          />
        </PropRow>
      </PanelSection>
      <PanelSection title="Fonts">
        <Pairings styles={styles} commit={commit} disabled={disabled} />
      </PanelSection>
      <PanelSection title="Spacing & shape">
        <PropRow label="Spacing" stacked>
          <Segmented
            disabled={disabled}
            aria-label="Spacing density"
            size="sm"
            block
            value={c.density}
            onValueChange={(v) => !disabled && commit({ "choices.density": v }, "Change spacing")}
            options={DENSITIES.map((d) => ({
              value: d,
              label: d === "compact" ? "Compact" : d === "comfortable" ? "Comfy" : "Airy",
            }))}
          />
        </PropRow>
        <PropRow label="Corners" stacked>
          <Segmented
            disabled={disabled}
            aria-label="Corner shape"
            size="sm"
            block
            value={c.shape}
            onValueChange={(v) => !disabled && commit({ "choices.shape": v }, "Change corners")}
            options={SHAPES.map((s) => ({
              value: s,
              label: (
                <>
                  <span className="st-ss-corner" style={{ borderTopLeftRadius: SHAPE_RADIUS[s] }} />
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </>
              ),
            }))}
          />
        </PropRow>
      </PanelSection>
      <PanelSection title="Buttons">
        <Buttons styles={styles} commit={commit} disabled={disabled} />
      </PanelSection>
      <PanelSection title="Images">
        <ImageTreatments styles={styles} commit={commit} disabled={disabled} />
      </PanelSection>
      <PanelSection title="Motion">
        <Segmented
          disabled={disabled}
          aria-label="Motion"
          size="sm"
          block
          value={c.motion}
          onValueChange={(v) => !disabled && commit({ "choices.motion": v }, "Change motion")}
          options={MOTION_LEVELS.map((m) => ({
            value: m,
            label: m === "none" ? "None" : m === "subtle" ? "Subtle" : "Expressive",
          }))}
        />
        <p className="st-ip-row__hint">
          Always off for visitors who ask their device for reduced motion.
        </p>
      </PanelSection>
      <PanelSection
        key={issues.length ? "issues" : "ok"}
        title="Readability"
        defaultOpen={issues.length > 0}
      >
        <ContrastWarnings issues={issues} commit={commit} disabled={disabled} />
      </PanelSection>
      {can && (
        <PanelSection title="Design tokens" defaultOpen={false}>
          <OverridesEditor styles={styles} commit={commit} />
        </PanelSection>
      )}
    </div>
  );
}
