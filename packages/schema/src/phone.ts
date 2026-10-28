import { type Responsive, resolve } from "./responsive";

/**
 * Phone defaults (Squarespace-style "a change on desktop works on phones"): what a section looks
 * like on a phone when it only says how it looks on bigger screens. An explicit `m` value always
 * wins. The renderer, Studio's inspector and the Phone check all use these, so what Studio shows
 * is what visitors get.
 */

/** The largest padding steps come down on phones, so a generous desktop rhythm doesn't leave a phone screen mostly empty. */
export const PHONE_PADDING: Readonly<Record<string, string>> = {
  "3xl": "xl",
  "2xl": "lg",
  xl: "lg",
};

/** Section padding on phones: the stored `m`, else the tablet/desktop step brought down. */
export function phonePadding<T extends string>(padding: Responsive<T>): T {
  if (padding.m !== undefined) return padding.m;
  const up = resolve(padding, "t");
  return (PHONE_PADDING[up] ?? up) as T;
}

/** Stack columns on phones: the stored `m`, else one column. */
export function phoneColumns(columns: Responsive<number[]>): number[] {
  return columns.m ?? [12];
}

/** A responsive value with the phone default filled in (for renderers that emit every breakpoint). */
export function withPhoneDefault<T>(value: Responsive<T>, phone: T): Responsive<T> {
  return value.m === undefined ? { ...value, m: phone } : value;
}
