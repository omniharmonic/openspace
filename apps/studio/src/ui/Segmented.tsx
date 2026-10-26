import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "./cx";
import "./Segmented.css";
import { Tooltip } from "./Tooltip";

export interface SegmentedOption<V extends string = string> {
  value: V;
  label: ReactNode;
  /** Accessible name when label is an icon; also used as tooltip. */
  ariaLabel?: string;
  shortcut?: string;
  disabled?: boolean;
}

export interface SegmentedProps<V extends string = string> {
  value: V;
  onValueChange: (value: V) => void;
  options: ReadonlyArray<SegmentedOption<V>>;
  "aria-label": string;
  size?: "sm" | "md";
  block?: boolean;
  className?: string;
}

/** Single-choice segmented control; never deselects. */
export function Segmented<V extends string = string>({
  value,
  onValueChange,
  options,
  size = "md",
  block,
  className,
  "aria-label": ariaLabel,
}: SegmentedProps<V>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as V)}
      aria-label={ariaLabel}
      className={cx("st-seg", `st-seg--${size}`, block && "st-seg--block", className)}
    >
      {options.map((o) => {
        const item = (
          <ToggleGroup.Item
            key={o.value}
            value={o.value}
            disabled={o.disabled}
            aria-label={o.ariaLabel}
            className="st-seg__item"
          >
            {o.label}
          </ToggleGroup.Item>
        );
        return o.ariaLabel ? (
          <Tooltip key={o.value} content={o.ariaLabel} shortcut={o.shortcut}>
            {item}
          </Tooltip>
        ) : (
          item
        );
      })}
    </ToggleGroup.Root>
  );
}
