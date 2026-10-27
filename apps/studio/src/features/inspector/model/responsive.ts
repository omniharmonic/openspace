import {
  type Breakpoint as Bp,
  isOverridden,
  type Responsive,
  resolve,
} from "@omniharmonic/openspace-schema";
import type { Breakpoint } from "../../editor/editor-store";

export type { Bp };

/** The device preview → the breakpoint its edits target. */
export const BP_OF: Record<Breakpoint, Bp> = { desktop: "d", tablet: "t", mobile: "m" };
export const BP_LABEL: Record<Bp, string> = { d: "Desktop", t: "Tablet", m: "Phone" };

/**
 * Set a responsive value at one breakpoint. Desktop is the base value; a tablet/phone value is
 * an override. When there is no base yet, `base` supplies the desktop value (so an override on
 * a phone never changes the desktop look the person can't see).
 */
export function setAt<T>(
  value: Responsive<T> | undefined,
  bp: Bp,
  next: T,
  base?: T,
): Responsive<T> {
  if (bp === "d") return { ...(value ?? {}), d: next } as Responsive<T>;
  const d = value?.d ?? base ?? next;
  return { ...(value ?? {}), d, [bp]: next } as Responsive<T>;
}

/** Remove a tablet/phone override (it inherits again). Desktop can't be cleared this way. */
export function clearAt<T>(value: Responsive<T> | undefined, bp: Bp): Responsive<T> | undefined {
  if (!value || bp === "d") return value;
  const out = { ...value };
  delete out[bp];
  return out;
}

/** The value shown at a breakpoint and whether it is this breakpoint's own override. */
export function readAt<T>(
  value: Responsive<T> | undefined,
  bp: Bp,
): { value: T | undefined; overridden: boolean; inheritedFrom: Bp | undefined } {
  const own = isOverridden(value, bp);
  const from: Bp | undefined =
    bp === "d" || own ? undefined : bp === "m" && value?.t !== undefined ? "t" : "d";
  return { value: resolve(value, bp), overridden: own, inheritedFrom: from };
}

/** Breakpoints (other than desktop) that override `value`; Studio shows a dot for each. */
export function overriddenBps(value: Responsive<unknown> | undefined): Bp[] {
  return (["t", "m"] as const).filter((bp) => isOverridden(value, bp));
}

/** Drop overrides equal to what they would inherit anyway (keeps documents tidy). */
export function tidy<T>(value: Responsive<T>): Responsive<T> {
  const out = { ...value };
  if (out.t !== undefined && JSON.stringify(out.t) === JSON.stringify(out.d)) delete out.t;
  const mParent = out.t !== undefined ? out.t : out.d;
  if (out.m !== undefined && JSON.stringify(out.m) === JSON.stringify(mParent)) delete out.m;
  return out;
}
