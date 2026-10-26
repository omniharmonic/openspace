import { cx } from "./cx";
import "./Spinner.css";

export interface SpinnerProps {
  size?: number;
  className?: string;
  /** When set, the spinner is announced as a status with this label. */
  label?: string;
}

export function Spinner({ size = 14, className, label }: SpinnerProps) {
  const ring = (
    <span
      className={cx("st-spinner", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
  if (!label) return ring;
  return (
    <span role="status" className="st-spinner-status">
      {ring}
      <span className="st-visually-hidden">{label}</span>
    </span>
  );
}
