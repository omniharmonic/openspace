import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import { cx } from "./cx";
import "./IconButton.css";
import { focusableDisabledProps } from "./focusableDisabled";
import { Tooltip } from "./Tooltip";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Accessible name; also the tooltip text. Required: icon-only controls must be labelled. */
  label: string;
  icon: ReactNode;
  shortcut?: string;
  size?: "sm" | "md" | "lg";
  /** Toggle state, rendered as aria-pressed. */
  active?: boolean;
  tooltip?: boolean;
  tooltipSide?: "top" | "right" | "bottom" | "left";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    shortcut,
    size = "md",
    active,
    tooltip = true,
    tooltipSide,
    className,
    type = "button",
    disabled,
    ...rest
  },
  ref,
) {
  // A disabled icon button with a tooltip stays focusable so the tooltip can still be read.
  const soft = Boolean(disabled) && tooltip;
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active}
      className={cx("st-icon-button", `st-icon-button--${size}`, className)}
      disabled={soft ? undefined : disabled}
      {...rest}
      {...(soft ? focusableDisabledProps() : {})}
    >
      {icon}
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      {button}
    </Tooltip>
  );
});
