import { Switch } from "radix-ui";
import { cx } from "./cx";
import "./Toggle.css";

export interface ToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
  "aria-describedby"?: string;
}

/** On/off switch. */
export function Toggle({ size = "md", className, ...props }: ToggleProps) {
  return (
    <Switch.Root className={cx("st-toggle", `st-toggle--${size}`, className)} {...props}>
      <Switch.Thumb className="st-toggle__thumb" />
    </Switch.Root>
  );
}
