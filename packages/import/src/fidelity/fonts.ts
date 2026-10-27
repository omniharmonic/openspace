/**
 * Which of the original site's fonts can be carried over as they are: a family is used when
 * Google Fonts serves it (then it self-hosts at publish like the curated pairings' fonts), or when
 * a curated pairing already uses it. Anything else (licensed fonts such as Freight or Proxima
 * Nova) falls back to the closest curated pairing, and the report says it can be uploaded.
 */
import { TYPE_PAIRINGS } from "@omniharmonic/openspace-theme";
import type { SqTheme } from "../types";

const KNOWN = new Set(
  TYPE_PAIRINGS.flatMap((p) => [p.heading.family, p.body.family]).map((f) => f.toLowerCase()),
);

/** Ask Google Fonts whether it serves each family (an unknown family answers HTTP 400). */
export async function confirmGoogleFonts(
  families: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const out: string[] = [];
  await Promise.all(
    [...new Set(families.map((f) => f.trim()).filter(Boolean))].map(async (family) => {
      if (KNOWN.has(family.toLowerCase())) {
        out.push(family.toLowerCase());
        return;
      }
      if (!/^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/.test(family)) return;
      try {
        const r = await fetchImpl(
          `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}&display=swap`,
          { signal: AbortSignal.timeout(10_000) },
        );
        if (r.ok && /@font-face/.test(await r.text())) out.push(family.toLowerCase());
      } catch {
        // offline or refused: not confirmed
      }
    }),
  );
  return out.sort();
}

/** Confirm the theme's measured fonts (sets `theme.googleFonts`). */
export async function confirmThemeFonts(theme: SqTheme, fetchImpl?: typeof fetch): Promise<void> {
  const t = theme.typography;
  const families = [t?.heading?.family, t?.body?.family, t?.label?.family].filter(
    (f): f is string => !!f,
  );
  if (!families.length) return;
  theme.googleFonts = await confirmGoogleFonts(families, fetchImpl);
}
