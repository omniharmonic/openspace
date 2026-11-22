/**
 * Site Styles leftovers from the old "Type & spacing" section, now where people look for them:
 * label details (capitals, tracking, eyebrow color) under Advanced, and the page rhythm (content
 * width, section spacing) under Layout. Fonts and sizes live in the font fields and Text styles.
 */
import type { Styles } from "@omniharmonic/openspace-schema";
import { NumberScrubInput, Segmented, Toggle } from "../../ui";
import { PropRow } from "../inspector/ui";
import type { StylesSet } from "./model";

export { FAMILY_RE, guessCategory } from "./roleFonts";

type Commit = (set: StylesSet, label: string, mergeKey?: string) => boolean;

const LABEL_PRESETS = ["eyebrow", "button", "nav"] as const;

export function LabelDetails({
  styles,
  commit,
  disabled,
}: {
  styles: Styles;
  commit: Commit;
  disabled: boolean;
}) {
  const t = styles.choices.typography;
  const scale = t?.scale ?? {};
  const caps = LABEL_PRESETS.every((p) => scale[p]?.case === "uppercase");
  const tracking = scale.eyebrow?.letterSpacing ?? null;
  const setLabels = (patch: { case?: string; letterSpacing?: number }, label: string) => {
    const set: StylesSet = {};
    for (const p of LABEL_PRESETS)
      for (const [k, v] of Object.entries(patch)) set[`choices.typography.scale.${p}.${k}`] = v;
    commit(set, label, "label-type");
  };
  return (
    <>
      <PropRow label="Labels in capitals" hint="Eyebrows, buttons and the menu together.">
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
    </>
  );
}

export function PageRhythm({
  styles,
  commit,
  disabled,
}: {
  styles: Styles;
  commit: Commit;
  disabled: boolean;
}) {
  const layout = styles.choices.layout;
  return (
    <>
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
    </>
  );
}
