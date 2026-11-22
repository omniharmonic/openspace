import {
  isSpaceToken,
  MAX_SPACE_PX,
  type Responsive,
  type SpaceValue,
} from "@omniharmonic/openspace-schema";
import type { Density } from "@omniharmonic/openspace-theme";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  Link2,
  MoveVertical,
  Unlink,
} from "lucide-react";
import type { ReactNode } from "react";
import { Menu, type MenuEntry, NumberScrubInput, Segmented, Tooltip } from "../../../ui";
import { THEME_LABEL } from "../../editor/model/themes";
import { BP_LABEL, type Bp, clearAt, overriddenBps, readAt, setAt } from "../model/responsive";
import { spacePx, stepOptions, valueForPx } from "../model/spacing";
import { PropRow, type TokenOption, TokenPicker } from "../ui";

/**
 * A responsive token control (FR-15): edits the value at the breakpoint being previewed.
 * Tablet/phone edits become overrides (dots), with a link toggle to inherit again.
 */
export function ResponsiveField<T extends string | number>({
  label,
  value,
  bp,
  base,
  disabled,
  onCommit,
  render,
  allowUnset = true,
  baseHint,
  phoneDefault,
}: {
  label: string;
  value: Responsive<T> | undefined;
  bp: Bp;
  /** Desktop value to use when a tablet/phone override is the first value set. */
  base: T;
  disabled?: boolean;
  onCommit: (next: Responsive<T> | undefined) => void;
  render: (current: T | undefined, set: (v: T | undefined) => void) => ReactNode;
  allowUnset?: boolean;
  /** Shown before the first tablet/phone value when it also sets desktop to `base`. */
  baseHint?: string;
  /** What phones get automatically when there is no phone value (e.g. lighter padding). */
  phoneDefault?: (value: Responsive<T>) => T;
}) {
  const read = readAt(value, bp);
  const auto =
    bp === "m" && !read.overridden && value && phoneDefault ? phoneDefault(value) : undefined;
  const r = auto !== undefined && auto !== read.value ? { ...read, value: auto } : read;
  const dots = overriddenBps(value);
  const set = (v: T | undefined) => {
    if (v === undefined) {
      if (bp !== "d") onCommit(clearAt(value, bp));
      // Desktop is the base: with tablet/phone values still set, keep them (desktop takes
      // the base value) rather than silently deleting them.
      else if (value?.t !== undefined || value?.m !== undefined) onCommit({ ...value, d: base });
      else onCommit(allowUnset ? undefined : value);
      return;
    }
    onCommit(setAt(value, bp, v, base));
  };
  const linked = bp !== "d" && !r.overridden;
  return (
    <PropRow
      label={label}
      overrides={dots}
      {...(bp !== "d" && r.overridden
        ? {
            onReset: () => onCommit(clearAt(value, bp)),
            resetLabel: `Use the ${BP_LABEL[r.inheritedFrom ?? (bp === "m" && value?.t !== undefined ? "t" : "d")].toLowerCase()} value`,
          }
        : {})}
      hint={
        linked
          ? value === undefined && baseHint
            ? baseHint
            : r !== read
              ? "Automatic for phones (a little less than desktop)"
              : `Same as ${BP_LABEL[r.inheritedFrom ?? "d"].toLowerCase()}`
          : undefined
      }
    >
      {render(r.value, (v) => !disabled && set(v))}
      {bp !== "d" && (
        <Tooltip
          content={
            r.overridden
              ? `Inherit from ${BP_LABEL[bp === "m" ? "t" : "d"].toLowerCase()}`
              : `Set a ${BP_LABEL[bp].toLowerCase()} value`
          }
        >
          <button
            type="button"
            className="st-ip-icon-btn st-ip-fixed"
            aria-pressed={r.overridden}
            aria-label={`${label}: ${r.overridden ? "override" : "inherit"} on ${BP_LABEL[bp].toLowerCase()}`}
            disabled={disabled}
            onClick={() =>
              r.overridden
                ? onCommit(clearAt(value, bp))
                : onCommit(setAt(value, bp, (r.value ?? base) as T, base))
            }
          >
            {r.overridden ? <Unlink aria-hidden="true" /> : <Link2 aria-hidden="true" />}
          </button>
        </Tooltip>
      )}
    </PropRow>
  );
}

export function TokenSelect<T extends string>(props: {
  label: string;
  value: T | undefined;
  options: ReadonlyArray<TokenOption<T>>;
  onChange: (v: T | undefined) => void;
  disabled?: boolean;
  defaultLabel?: string;
  segmented?: boolean;
}) {
  return <TokenPicker<T> {...props} />;
}

export function AlignControl({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: "start" | "center" | "end" | undefined;
  onChange: (v: "start" | "center" | "end") => void;
  disabled?: boolean;
}) {
  return (
    <Segmented<"start" | "center" | "end">
      disabled={disabled}
      aria-label={label}
      size="sm"
      block
      value={value ?? "start"}
      onValueChange={(v) => !disabled && onChange(v)}
      options={[
        { value: "start", label: <AlignLeft />, ariaLabel: "Align start" },
        { value: "center", label: <AlignCenter />, ariaLabel: "Align center" },
        { value: "end", label: <AlignRight />, ariaLabel: "Align end" },
      ]}
    />
  );
}

/** Color theme swatches rendered in the site's real theme colors. */
export function ThemeSwatches({
  label,
  value,
  colors,
  onChange,
  disabled,
  inheritLabel,
}: {
  label: string;
  value: string | undefined;
  colors: Record<string, { background: string; heading: string; accent: string }>;
  onChange: (v: string | undefined) => void;
  disabled?: boolean;
  /** Offer "inherit" (e.g. the section's theme for a block). */
  inheritLabel?: string;
}) {
  const themes = Object.keys(THEME_LABEL) as Array<keyof typeof THEME_LABEL>;
  return (
    <fieldset className="st-ip-themes st-ip-fieldset">
      <legend className="st-visually-hidden">{label}</legend>
      {themes.map((t) => {
        const c = colors[t];
        return (
          <button
            key={t}
            type="button"
            className="st-ip-theme"
            aria-pressed={value === t}
            aria-label={THEME_LABEL[t]}
            disabled={disabled}
            onClick={() => onChange(value === t && inheritLabel ? undefined : t)}
          >
            <span
              className="st-ip-theme__chip"
              style={{
                background: c?.background,
                color: c?.heading,
                borderBottom: `3px solid ${c?.accent}`,
              }}
            >
              Aa
            </span>
            {THEME_LABEL[t].replace(" accent", "+")}
          </button>
        );
      })}
    </fieldset>
  );
}

/**
 * A spacing control (Squarespace-easy, Figma-precise): the value in px, scrubbed or typed, with
 * the site's spacing steps one click away. Typing a step's exact size stores the step (it keeps
 * following the density); any other number is stored as exact pixels. Empty = "Auto".
 */
export function SpaceField({
  label,
  value,
  density,
  autoPx,
  disabled,
  onChange,
  icon,
  allowAuto = true,
}: {
  label: string;
  value: SpaceValue | undefined;
  density: Density;
  /** What "Auto" (nothing set) comes to in px on this device. */
  autoPx: number;
  disabled?: boolean;
  /** `merge`: part of a continuous scrub (one undo step). */
  onChange: (value: SpaceValue | undefined, merge: boolean) => void;
  icon?: ReactNode;
  allowAuto?: boolean;
}) {
  const px = value === undefined ? null : spacePx(value, density);
  const step = value !== undefined && isSpaceToken(value) ? value : undefined;
  return (
    <div className="st-space">
      <NumberScrubInput
        label={label}
        handle={icon ?? <MoveVertical />}
        value={px}
        mixedLabel={String(autoPx)}
        min={0}
        max={MAX_SPACE_PX}
        unit="px"
        disabled={disabled}
        onChange={(v) => onChange(valueForPx(v, density), true)}
        onChangeEnd={(v) => onChange(valueForPx(v, density), false)}
      />
      <Menu
        label={`${label} steps`}
        align="end"
        trigger={
          <button
            type="button"
            className="st-space__steps"
            aria-label={`${label}: choose a spacing step`}
            disabled={disabled}
            data-step={step ?? undefined}
            data-auto={value === undefined ? "" : undefined}
          >
            {value === undefined ? (
              "AUTO"
            ) : step ? (
              step === "none" ? (
                "0"
              ) : (
                step.toUpperCase()
              )
            ) : (
              <ChevronDown aria-hidden="true" />
            )}
          </button>
        }
        items={[
          ...(allowAuto
            ? [
                {
                  label: `Auto · ${autoPx}px`,
                  onSelect: () => onChange(undefined, false),
                } as MenuEntry,
                { type: "separator" } as MenuEntry,
              ]
            : []),
          { type: "label", label: "Site spacing steps" } as MenuEntry,
          ...stepOptions(density).map(
            (o) =>
              ({
                label: `${o.label} · ${o.px}px`,
                onSelect: () => onChange(o.value, false),
              }) as MenuEntry,
          ),
        ]}
      />
    </div>
  );
}
