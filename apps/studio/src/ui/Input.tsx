import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx";
import "./Input.css";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "prefix"> {
  prefix?: ReactNode;
  suffix?: ReactNode;
  size?: "sm" | "md" | "lg";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { prefix, suffix, size = "md", className, ...rest },
  ref,
) {
  return (
    <div
      className={cx(
        "st-input",
        `st-input--${size}`,
        rest.disabled && "st-input--disabled",
        rest["aria-invalid"] && "st-input--invalid",
        className,
      )}
    >
      {prefix && <span className="st-input__affix">{prefix}</span>}
      <input ref={ref} className="st-input__el" spellCheck={false} {...rest} />
      {suffix && <span className="st-input__affix st-input__affix--end">{suffix}</span>}
    </div>
  );
});

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx("st-textarea", className)} {...rest} />;
});
