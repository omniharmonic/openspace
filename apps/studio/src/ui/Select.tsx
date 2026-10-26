import { Check, ChevronDown } from "lucide-react";
import { Select as RSelect } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "./cx";
import "./Select.css";

export interface SelectOption<V extends string = string> {
  value: V;
  label: ReactNode;
  /** Plain text used for type-ahead when label is not a string. */
  textValue?: string;
  disabled?: boolean;
}

export interface SelectProps<V extends string = string> {
  value: V | undefined;
  onValueChange: (value: V) => void;
  options: ReadonlyArray<SelectOption<V>>;
  placeholder?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

export function Select<V extends string = string>({
  value,
  onValueChange,
  options,
  placeholder = "Choose…",
  size = "md",
  disabled,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
}: SelectProps<V>) {
  return (
    <RSelect.Root value={value} onValueChange={(v) => onValueChange(v as V)} disabled={disabled}>
      <RSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        className={cx("st-select", `st-select--${size}`, className)}
      >
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon className="st-select__chevron">
          <ChevronDown />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content className="st-select__content st-pop" position="popper" sideOffset={4}>
          <RSelect.Viewport className="st-select__viewport">
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                textValue={o.textValue}
                className="st-select__item st-menu__item"
              >
                <RSelect.ItemIndicator className="st-select__check">
                  <Check />
                </RSelect.ItemIndicator>
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}
