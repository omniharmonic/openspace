import type { MouseEvent } from "react";

/**
 * Props for a control that is disabled but must stay focusable and hoverable
 * (so its tooltip can explain why). Uses aria-disabled instead of the
 * `disabled` attribute and swallows activation.
 */
export function focusableDisabledProps() {
  return {
    "aria-disabled": true as const,
    onClick: (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
