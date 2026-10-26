import { useEffect, useState } from "react";
import { asRole, isDesigner, type Role } from "../../inspector/model/permissions";

/**
 * Who may arrange a grid. Placing blocks is a layout change: the Hub denies `grid.place` to
 * editors and contributors (`transformForRole`), so only owners and designers get the handles.
 * A locked section isn't rearranged on the canvas by anyone until it is unlocked, and phones
 * (a Studio viewport under 768px) get the simplified reorder list instead of free placement
 * (FR-22).
 */
export interface GridCaps {
  edit: boolean;
  /** One plain sentence when editing isn't possible. */
  reason?: string;
}

export function gridCaps(
  role: Role | string | undefined,
  section: { locked?: boolean | undefined } | undefined,
): GridCaps {
  const r = asRole(role);
  if (!isDesigner(r))
    return {
      edit: false,
      reason:
        r === "editor"
          ? "Only the site’s designer can move blocks on the grid."
          : "You can’t change the layout of pages.",
    };
  if (section?.locked)
    return { edit: false, reason: "This section is locked. Unlock it to move its blocks." };
  return { edit: true };
}

export const PHONE_QUERY = "(max-width: 767px)";

/** Is Studio itself on a phone-sized viewport? */
export function isPhoneViewport(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(PHONE_QUERY).matches);
}

export function usePhoneViewport(): boolean {
  const [phone, setPhone] = useState(isPhoneViewport);
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE_QUERY);
    if (!mq) return;
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return phone;
}

export type { Role };
