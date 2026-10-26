import { cloneElement, isValidElement, type ReactElement, type ReactNode, useId } from "react";
import { cx } from "./cx";
import "./Field.css";

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Shown to the right of the label, e.g. "Optional". */
  aside?: ReactNode;
  /** Single form control; receives id + aria-describedby. */
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
  className?: string;
  layout?: "stacked" | "inline";
}

/** Label + control + hint/error, wired for screen readers. */
export function Field({ label, hint, error, aside, children, className, layout = "stacked" }: FieldProps) {
  const id = useId();
  const controlId = children.props.id ?? `${id}-control`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;
  return (
    <div className={cx("st-field", `st-field--${layout}`, className)}>
      <div className="st-field__head">
        <label className="st-field__label" htmlFor={controlId}>
          {label}
        </label>
        {aside && <span className="st-field__aside">{aside}</span>}
      </div>
      <div className="st-field__control">{control}</div>
      {error ? (
        <p id={errorId} className="st-field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="st-field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
