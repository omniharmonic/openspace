/**
 * Site Styles → "Your type and spacing": the site's own fonts (any free Google font) for headings,
 * text and labels, the sizes of the main type presets, capitals and tracking for labels, the
 * eyebrow color, and the page rhythm (content width, section spacing). Imports fill these in from
 * the original site; owners and designers can fine-tune or reset them to the pairing's.
 */
import type { Styles, TypeScalePreset } from "@omniharmonic/openspace-schema";
import { useEffect, useState } from "react";
import { Button, Input, NumberScrubInput, Segmented, Toggle } from "../../ui";
import { PropRow } from "../inspector/ui";
import type { StylesSet } from "./model";

type Commit = (set: StylesSet, label: string, mergeKey?: string) => boolean;
type Role = "heading" | "body" | "label";

const ROLE_LABEL: Record<Role, string> = { heading: "Headings", body: "Text", label: "Labels" };
const ROLE_HINT: Record<Role, string> = {
  heading: "e.g. Cormorant Garamond",
  body: "e.g. EB Garamond",
  label: "Eyebrows, buttons, menu",
};

const SERIF =
  /serif|garamond|baskerville|caslon|playfair|lora|merriweather|crimson|cormorant|spectral|domine|prata|libre|fraunces|newsreader|literata|bodoni|didot|vollkorn|cardo|alegreya|bitter|zilla|slab/i;

/** Google Fonts category for a family name (good enough for the fallback stack). */
export function guessCategory(family: string): "serif" | "sans-serif" | "monospace" {
  if (/mono|code/i.test(family)) return "monospace";
  if (/sans/i.test(family)) return "sans-serif";
  return SERIF.test(family) ? "serif" : "sans-serif";
}

/** A family name Site Styles accepts (letters, numbers, spaces). */
export const FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/;

function FontRow({
  role,
  styles,
  commit,
  disabled,
}: {
  role: Role;
  styles: Styles;
  commit: Commit;
  disabled: boolean;
}) {
  const current = styles.choices.typography?.[role]?.family ?? "";
  const [draft, setDraft] = useState(current);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(current), [current]);
  const apply = () => {
    const v = draft.trim().replace(/\s+/g, " ");
    if (v === current) return;
    if (!v) {
      setError(null);
      commit({ [`choices.typography.${role}`]: undefined }, `Use the pairing's ${role} font`);
      return;
    }
    if (!FAMILY_RE.test(v)) {
      setError("Use the font's name as Google Fonts spells it.");
      return;
    }
    setError(null);
    commit(
      {
        [`choices.typography.${role}`]: {
          family: v,
          category: guessCategory(v),
          ...(role === "label" ? {} : { italic: true }),
        },
      },
      `Use ${v} for ${ROLE_LABEL[role].toLowerCase()}`,
    );
  };
  const id = `st-ss-font-${role}`;
  return (
    <PropRow label={ROLE_LABEL[role]} htmlFor={id} error={error}>
      <Input
        id={id}
        size="sm"
        value={draft}
        disabled={disabled}
        placeholder={current ? undefined : `Pairing font · ${ROLE_HINT[role]}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
        }}
      />
    </PropRow>
  );
}

const SIZES: { preset: TypeScalePreset; label: string; min: number; max: number }[] = [
  { preset: "display", label: "Display", min: 24, max: 200 },
  { preset: "h1", label: "Heading 1", min: 20, max: 160 },
  { preset: "h2", label: "Heading 2", min: 16, max: 120 },
  { preset: "body", label: "Text", min: 12, max: 28 },
  { preset: "eyebrow", label: "Labels", min: 9, max: 20 },
];

const LABEL_PRESETS = ["eyebrow", "button", "nav"] as const;

export function SiteTypography({
  styles,
  commit,
  disabled,
}: {
  styles: Styles;
  commit: Commit;
  disabled: boolean;
}) {
  const t = styles.choices.typography;
  const layout = styles.choices.layout;
  const scale = t?.scale ?? {};
  const caps = LABEL_PRESETS.every((p) => scale[p]?.case === "uppercase");
  const tracking = scale.eyebrow?.letterSpacing ?? null;
  const setSize = (preset: TypeScalePreset, size: number, end: boolean) =>
    commit(
      {
        [`choices.typography.scale.${preset}.size`]: Math.round(size),
        // A new desktop size: let the phone size follow it.
        [`choices.typography.scale.${preset}.sizeMobile`]: undefined,
      },
      "Change type size",
      end ? undefined : `type-size-${preset}`,
    );
  const setLabels = (patch: { case?: string; letterSpacing?: number }, label: string) => {
    const set: StylesSet = {};
    for (const p of LABEL_PRESETS)
      for (const [k, v] of Object.entries(patch)) set[`choices.typography.scale.${p}.${k}`] = v;
    commit(set, label, "label-type");
  };
  const tuned = Boolean(t || layout);
  return (
    <div className="st-ss-type">
      {(["heading", "body", "label"] as const).map((role) => (
        <FontRow key={role} role={role} styles={styles} commit={commit} disabled={disabled} />
      ))}
      <p className="st-ip-row__hint">
        Any free Google font by name; it is stored with your site when it publishes.
      </p>
      {SIZES.map((s) => (
        <PropRow key={s.preset} label={s.label}>
          <NumberScrubInput
            label={`${s.label} size`}
            value={scale[s.preset]?.size ?? null}
            mixedLabel="Auto"
            min={s.min}
            max={s.max}
            unit="px"
            disabled={disabled}
            onChange={(v) => setSize(s.preset, v, false)}
            onChangeEnd={(v) => setSize(s.preset, v, true)}
          />
        </PropRow>
      ))}
      <PropRow label="Labels in capitals">
        <Toggle
          aria-label="Labels in capitals"
          size="sm"
          checked={caps}
          disabled={disabled}
          onCheckedChange={(on) =>
            setLabels(
              { case: on ? "uppercase" : "none" },
              on ? "Labels in capitals" : "Labels as typed",
            )
          }
        />
      </PropRow>
      <PropRow label="Label spacing">
        <NumberScrubInput
          label="Letter spacing of labels"
          value={tracking}
          mixedLabel="Auto"
          min={-0.05}
          max={0.5}
          step={0.01}
          unit="em"
          disabled={disabled}
          onChange={(v) =>
            setLabels({ letterSpacing: Math.round(v * 100) / 100 }, "Change label spacing")
          }
        />
      </PropRow>
      <PropRow label="Eyebrows">
        <Segmented
          disabled={disabled}
          aria-label="Eyebrow color"
          size="sm"
          block
          value={t?.eyebrowColor ?? "accent"}
          onValueChange={(v) =>
            !disabled && commit({ "choices.typography.eyebrowColor": v }, "Change eyebrow color")
          }
          options={[
            { value: "accent", label: "Accent" },
            { value: "muted", label: "Muted" },
          ]}
        />
      </PropRow>
      <PropRow label="Content width">
        <NumberScrubInput
          label="Content width"
          value={layout?.contentWidth ?? null}
          mixedLabel="Auto"
          min={480}
          max={2400}
          step={8}
          unit="px"
          disabled={disabled}
          onChange={(v) =>
            commit(
              { "choices.layout.contentWidth": Math.round(v) },
              "Change content width",
              "width",
            )
          }
        />
      </PropRow>
      <PropRow label="Section spacing">
        <NumberScrubInput
          label="Space above and below sections"
          value={layout?.sectionPadding ?? null}
          mixedLabel="Auto"
          min={0}
          max={320}
          unit="px"
          disabled={disabled}
          onChange={(v) =>
            commit(
              {
                "choices.layout.sectionPadding": Math.round(v),
                "choices.layout.sectionPaddingMobile": undefined,
              },
              "Change section spacing",
              "section-spacing",
            )
          }
        />
      </PropRow>
      {tuned && !disabled && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            commit(
              { "choices.typography": undefined, "choices.layout": undefined },
              "Use the pairing's type and spacing",
            )
          }
        >
          Reset to the pairing’s type and spacing
        </Button>
      )}
    </div>
  );
}
