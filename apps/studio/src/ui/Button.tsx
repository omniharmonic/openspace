import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from "react";
import "./Button.css";
import { cx } from "./cx";
import { focusableDisabledProps } from "./focusableDisabled";
import { Spinner } from "./Spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon shown before the label. */
  icon?: ReactNode;
  /** Icon shown after the label. */
  trailing?: ReactNode;
  loading?: boolean;
  block?: boolean;
  /**
   * When disabled, stay focusable (aria-disabled) so a wrapping Tooltip can
   * explain why. Use whenever a disabled button has a tooltip.
   */
  focusableWhenDisabled?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    icon,
    trailing,
    loading = false,
    block = false,
    className,
    children,
    disabled,
    focusableWhenDisabled = false,
    type = "button",
    ...rest
  },
  ref,
) {
  const soft = focusableWhenDisabled && disabled && !loading;
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        "st-button",
        `st-button--${variant}`,
        `st-button--${size}`,
        block && "st-button--block",
        loading && "st-button--loading",
        className,
      )}
      disabled={soft ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
      {...(soft ? focusableDisabledProps() : {})}
    >
      {loading ? (
        <Spinner size={12} />
      ) : icon ? (
        <span className="st-button__icon">{icon}</span>
      ) : null}
      {children != null && <span className="st-button__label">{children}</span>}
      {trailing && <span className="st-button__icon">{trailing}</span>}
    </button>
  );
});
