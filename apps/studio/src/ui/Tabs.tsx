import { Tabs as RTabs } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "./cx";
import "./Tabs.css";

export interface TabItem<V extends string = string> {
  value: V;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<V extends string = string> {
  items: ReadonlyArray<TabItem<V>>;
  value?: V;
  defaultValue?: V;
  onValueChange?: (value: V) => void;
  "aria-label"?: string;
  className?: string;
  /** "line" for panel headers, "pill" for page-level switches. */
  variant?: "line" | "pill";
}

export function Tabs<V extends string = string>({
  items,
  value,
  defaultValue,
  onValueChange,
  className,
  variant = "line",
  "aria-label": ariaLabel,
}: TabsProps<V>) {
  return (
    <RTabs.Root
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={(v) => onValueChange?.(v as V)}
      className={cx("st-tabs", `st-tabs--${variant}`, className)}
    >
      <RTabs.List className="st-tabs__list" aria-label={ariaLabel}>
        {items.map((t) => (
          <RTabs.Trigger key={t.value} value={t.value} disabled={t.disabled} className="st-tabs__tab">
            {t.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {items.map((t) => (
        <RTabs.Content key={t.value} value={t.value} className="st-tabs__panel">
          {t.content}
        </RTabs.Content>
      ))}
    </RTabs.Root>
  );
}
