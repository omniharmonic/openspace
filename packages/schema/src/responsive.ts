import { z } from "zod";

/**
 * Responsive values (Global Constraint 7). Desktop is required and authoring is
 * desktop-first; a missing breakpoint inherits from the next larger one: `m ← t ← d`.
 *
 * Breakpoints: mobile < 768px, tablet 768–1199px, desktop ≥ 1200px.
 */
export type Breakpoint = "d" | "t" | "m";

export const BREAKPOINTS: readonly Breakpoint[] = ["d", "t", "m"] as const;

export const BREAKPOINT_INFO = {
  d: { label: "Desktop", minWidth: 1200, maxWidth: null, previewWidth: 1440 },
  t: { label: "Tablet", minWidth: 768, maxWidth: 1199, previewWidth: 834 },
  m: { label: "Mobile", minWidth: 0, maxWidth: 767, previewWidth: 390 },
} as const satisfies Record<
  Breakpoint,
  { label: string; minWidth: number; maxWidth: number | null; previewWidth: number }
>;

export interface Responsive<T> {
  d: T;
  t?: T;
  m?: T;
}

/** The breakpoint whose value `bp` inherits from when its own value is missing. */
export function parentBreakpoint(bp: Breakpoint): Breakpoint | undefined {
  return bp === "m" ? "t" : bp === "t" ? "d" : undefined;
}

/** Resolve a responsive value at a breakpoint, applying `m ← t ← d` inheritance. */
export function resolve<T>(value: Responsive<T>, bp: Breakpoint): T;
export function resolve<T>(value: Responsive<T> | undefined, bp: Breakpoint): T | undefined;
export function resolve<T>(value: Responsive<T> | undefined, bp: Breakpoint): T | undefined {
  if (value === undefined) return undefined;
  if (bp === "m")
    return value.m !== undefined ? value.m : value.t !== undefined ? value.t : value.d;
  if (bp === "t") return value.t !== undefined ? value.t : value.d;
  return value.d;
}

/**
 * True if `bp` overrides the inherited value (Studio shows a dot for these). Desktop is the base
 * value, never an override.
 */
export function isOverridden<T>(value: Responsive<T> | undefined, bp: Breakpoint): boolean {
  return bp !== "d" && value !== undefined && value[bp] !== undefined;
}

/** Resolve all three breakpoints at once. */
export function resolveAll<T>(value: Responsive<T>): Record<Breakpoint, T> {
  return { d: resolve(value, "d"), t: resolve(value, "t"), m: resolve(value, "m") };
}

/** Zod helper: `{ d: schema, t?: schema, m?: schema }`. */
export function responsive<T extends z.ZodType>(schema: T) {
  return z.strictObject({
    d: schema,
    t: schema.optional(),
    m: schema.optional(),
  });
}
