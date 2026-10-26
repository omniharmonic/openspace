/** Join class names, skipping falsy values. */
export function cx(...parts: (string | false | null | undefined | 0)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** A CSSProperties-compatible object of custom properties (`{"--x": 1}`). */
export type CssVars = Record<`--${string}`, string | number>;

declare module "react" {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
