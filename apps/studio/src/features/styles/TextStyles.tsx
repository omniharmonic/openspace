/**
 * Text styles: every typography preset as one row drawn in its own font and size, like Figma's
 * text styles. Clicking a row opens its type settings — size first (a slider anyone can use),
 * then phone size, line height, letter spacing, weight, capitals and font for designers.
 * Changes apply to every piece of text that uses the style, on every page.
 */
import type { FontRole, Styles, TypeScalePreset, TypeStep } from "@omniharmonic/openspace-schema";
import {
  AArrowDown,
  AArrowUp,
  ALargeSmall,
  ChevronRight,
  MoveHorizontal,
  RotateCcw,
  Smartphone,
  UnfoldVertical,
} from "lucide-react";
import { Popover as RPopover } from "radix-ui";
import { useState } from "react";
import {
  Button,
  IconButton,
  NumberScrubInput,
  Segmented,
  Select,
  Slider,
  Tooltip,
  toast,
} from "../../ui";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { stylesOp } from "../inspector/model/edits";
import { PropRow } from "../inspector/ui";
import type { StylesSet } from "./model";
import { ROLE_LABEL, roleFont } from "./roleFonts";
import {
  resetStepPatch,
  resolveStep,
  scaleAllPatch,
  sizePatch,
  stepPatch,
  TEXT_STYLE_ROWS,
  type TextStyleRow,
  textStyleRow,
} from "./typeStyles";
import "./font-picker.css";

type Commit = (set: StylesSet, label: string, mergeKey?: string) => boolean;

export function useStylesCommit(): Commit {
  const api = useDocStoreApi();
  return (set, label, mergeKey) => {
    const r = api.getState().commit([stylesOp(set)], { label, ...(mergeKey ? { mergeKey } : {}) });
    if (!r.ok)
      toast({
        tone: "danger",
        title: "That change couldn’t be made",
        description: r.errors[0]?.message,
      });
    return r.ok;
  };
}

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

const CASES: Array<{ value: NonNullable<TypeStep["case"]>; label: string; aria: string }> = [
  { value: "none", label: "Aa", aria: "As typed" },
  { value: "uppercase", label: "AA", aria: "Capitals" },
  { value: "lowercase", label: "aa", aria: "Lowercase" },
  { value: "capitalize", label: "Aa Aa", aria: "Title case" },
];

/** The type settings for one text style (the popover body; also used by the inline toolbar). */
export function TypeSettings({
  preset,
  styles,
  commit,
  disabled,
}: {
  preset: TypeScalePreset;
  styles: Styles;
  commit: Commit;
  disabled?: boolean;
}) {
  const row = textStyleRow(preset) as TextStyleRow;
  const s = resolveStep(styles, preset);
  const [more, setMore] = useState(s.tuned && (s.letterSpacing !== null || s.weight !== null));
  const key = `type-${preset}`;
  const set = <K extends keyof TypeStep>(
    k: K,
    v: TypeStep[K] | undefined,
    label: string,
    merge = false,
  ) => commit(stepPatch(preset, k, v), label, merge ? `${key}-${k}` : undefined);
  const id = `st-ts-${preset}`;
  return (
    <div className="st-ts">
      <div className="st-ts__size">
        <label htmlFor={`${id}-size`} className="st-ts__label">
          Size
        </label>
        <Slider
          aria-label={`${row.label} size`}
          value={s.size}
          min={row.min}
          max={row.max}
          disabled={disabled}
          onValueChange={(v) =>
            commit(sizePatch(preset, v, !s.mobileAuto), `Resize ${row.label}`, `${key}-size`)
          }
        />
        <NumberScrubInput
          id={`${id}-size`}
          label={`${row.label} size in pixels`}
          handle={<ALargeSmall />}
          className="st-ts__num"
          value={s.size}
          min={row.min}
          max={row.max}
          unit="px"
          disabled={disabled}
          onChange={(v) =>
            commit(sizePatch(preset, v, !s.mobileAuto), `Resize ${row.label}`, `${key}-size`)
          }
        />
      </div>
      <PropRow
        label="On phones"
        hint={s.mobileAuto ? "Scales down automatically." : undefined}
        onReset={
          s.mobileAuto || disabled
            ? undefined
            : () => set("sizeMobile", undefined, "Phone size follows desktop")
        }
        resetLabel="Scale automatically"
      >
        <NumberScrubInput
          label={`${row.label} size on phones`}
          handle={<Smartphone />}
          value={s.sizeMobile}
          min={9}
          max={Math.min(160, s.size)}
          unit="px"
          disabled={disabled}
          onChange={(v) => set("sizeMobile", Math.round(v), `Resize ${row.label} on phones`, true)}
        />
      </PropRow>
      <PropRow label="Line height">
        <NumberScrubInput
          label={`${row.label} line height`}
          handle={<UnfoldVertical />}
          value={Math.round(s.lineHeight * 100) / 100}
          min={0.7}
          max={3}
          step={0.05}
          disabled={disabled}
          onChange={(v) =>
            set("lineHeight", Math.round(v * 100) / 100, `Change ${row.label} line height`, true)
          }
        />
      </PropRow>
      <PropRow label="Capitals">
        <Segmented<NonNullable<TypeStep["case"]>>
          aria-label={`${row.label} capitals`}
          size="sm"
          block
          disabled={disabled}
          value={s.case ?? "none"}
          onValueChange={(v) => !disabled && set("case", v, `Change ${row.label} capitals`)}
          options={CASES.map((c) => ({ value: c.value, label: c.label, ariaLabel: c.aria }))}
        />
      </PropRow>
      {more ? (
        <>
          <PropRow label="Letter spacing">
            <NumberScrubInput
              label={`${row.label} letter spacing`}
              handle={<MoveHorizontal />}
              value={s.letterSpacing}
              mixedLabel="Auto"
              min={-0.2}
              max={1}
              step={0.01}
              unit="em"
              disabled={disabled}
              onChange={(v) =>
                set("letterSpacing", Math.round(v * 100) / 100, `Change ${row.label} spacing`, true)
              }
            />
          </PropRow>
          <PropRow label="Weight">
            <Select<string>
              aria-label={`${row.label} weight`}
              size="sm"
              disabled={disabled}
              value={s.weight ? String(s.weight) : "auto"}
              onValueChange={(v) =>
                set("weight", v === "auto" ? undefined : Number(v), `Change ${row.label} weight`)
              }
              options={[
                { value: "auto", label: "From the font" },
                ...Object.entries(WEIGHT_NAME).map(([w, n]) => ({
                  value: w,
                  label: `${n} · ${w}`,
                })),
              ]}
            />
          </PropRow>
          <PropRow label="Font" hint={`${roleFont(styles, s.font).family}`}>
            <Segmented<FontRole>
              aria-label={`${row.label} font`}
              size="sm"
              block
              disabled={disabled}
              value={s.font}
              onValueChange={(v) =>
                !disabled &&
                set(
                  "font",
                  v === row.role ? undefined : v,
                  `Use the ${ROLE_LABEL[v].toLowerCase()} font for ${row.label}`,
                )
              }
              options={(["heading", "body", "label"] as const).map((r) => ({
                value: r,
                label: ROLE_LABEL[r],
              }))}
            />
          </PropRow>
        </>
      ) : (
        <button type="button" className="st-ts__more" onClick={() => setMore(true)}>
          Letter spacing, weight and font…
        </button>
      )}
      {s.tuned && !disabled && (
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw />}
          onClick={() => commit(resetStepPatch(preset), `Reset ${row.label}`)}
        >
          Reset {row.label}
        </Button>
      )}
    </div>
  );
}

/** One text style as a row: its name in its own font, its size, and a chevron. */
function StyleRow({
  row,
  styles,
  commit,
  disabled,
  side,
}: {
  row: TextStyleRow;
  styles: Styles;
  commit: Commit;
  disabled?: boolean;
  side: "left" | "right";
}) {
  const s = resolveStep(styles, row.preset);
  const family = roleFont(styles, s.font).family;
  return (
    <RPopover.Root>
      <RPopover.Trigger asChild>
        <button
          type="button"
          className="st-tsrow"
          disabled={disabled}
          aria-label={`${row.label}: ${s.size} pixels. Edit type settings`}
          data-tuned={s.tuned ? "" : undefined}
        >
          <span
            className="st-tsrow__sample"
            style={{
              fontFamily: `"${family}", var(--st-font)`,
              fontSize: Math.max(12, Math.min(26, s.size * 0.42 + 6)),
              textTransform: s.case && s.case !== "none" ? s.case : undefined,
              letterSpacing: s.case === "uppercase" ? "0.06em" : undefined,
            }}
          >
            {row.label}
          </span>
          <span className="st-tsrow__size">{s.size}</span>
          <ChevronRight className="st-tsrow__chev" aria-hidden="true" />
        </button>
      </RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content
          side={side}
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className="st-pop st-ts__pop"
          aria-label={`${row.label} type settings`}
        >
          <div className="st-fp__title">
            <span>{row.label}</span>
            <span className="st-fp__scope">Every {row.label.toLowerCase()} on your site</span>
          </div>
          <TypeSettings preset={row.preset} styles={styles} commit={commit} disabled={disabled} />
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

/**
 * The list of text styles. `presets` limits it (e.g. the styles a block uses); `scaleAll` shows
 * the one-click smaller/larger buttons.
 */
export function TextStyles({
  presets,
  disabled,
  side = "right",
  scaleAll,
}: {
  presets?: readonly TypeScalePreset[];
  disabled?: boolean;
  side?: "left" | "right";
  scaleAll?: boolean;
}) {
  const styles = useDocStore((s) => s.doc.styles);
  const commit = useStylesCommit();
  const rows = presets
    ? TEXT_STYLE_ROWS.filter((r) => presets.includes(r.preset))
    : TEXT_STYLE_ROWS;
  return (
    <div className="st-tslist">
      {scaleAll && (
        <div className="st-tslist__scale">
          <span>All text</span>
          <Tooltip content="Make every text style a little smaller">
            <IconButton
              size="sm"
              label="Make all text smaller"
              icon={<AArrowDown />}
              disabled={disabled}
              onClick={() => commit(scaleAllPatch(styles, 1 / 1.08), "Make all text smaller")}
            />
          </Tooltip>
          <Tooltip content="Make every text style a little larger">
            <IconButton
              size="sm"
              label="Make all text larger"
              icon={<AArrowUp />}
              disabled={disabled}
              onClick={() => commit(scaleAllPatch(styles, 1.08), "Make all text larger")}
            />
          </Tooltip>
        </div>
      )}
      {rows.map((row) => (
        <StyleRow
          key={row.preset}
          row={row}
          styles={styles}
          commit={commit}
          disabled={disabled}
          side={side}
        />
      ))}
    </div>
  );
}
