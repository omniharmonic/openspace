/**
 * Which of the original site's fonts can be carried over as they are: a family is used when
 * Google Fonts serves it (then it self-hosts at publish like the curated pairings' fonts), or when
 * a curated pairing already uses it. Anything else (licensed fonts such as Freight or Proxima
 * Nova) falls back to the closest curated pairing, and the report says it can be uploaded.
 */

import type { WebFont } from "@omniharmonic/openspace-schema";
import { TYPE_PAIRINGS } from "@omniharmonic/openspace-theme";
import type { SqTheme } from "../types";
import { isSystemFont } from "./font-match";

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
      // System fonts (Georgia, Helvetica…) are never fetched, even where Google answers for the
      // name: their metric-compatible open twins stand in (font-match.ts).
      if (isSystemFont(family)) return;
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

/** The Google Fonts CSS2 URL for one family (the same shape the theme asks for). */
function familyUrl(family: string, weights: number[], italic: boolean): string {
  const name = family.replace(/ /g, "+");
  const ws = [...new Set(weights)].sort((a, b) => a - b);
  const axis = italic
    ? `ital,wght@${[...ws.map((w) => `0,${w}`), ...ws.map((w) => `1,${w}`)].join(";")}`
    : `wght@${ws.join(";")}`;
  return `https://fonts.googleapis.com/css2?family=${name}:${axis}&display=swap`;
}

/**
 * Keep only weights and italics Google Fonts serves for a family: one unavailable weight makes
 * the whole stylesheet request fail (and every font with it). Tries what the site used, then
 * without italics, then regular + bold, then regular. Offline, the font is left as it is.
 */
export async function fitGoogleWeights(
  font: WebFont,
  fetchImpl: typeof fetch = fetch,
): Promise<WebFont> {
  const weights = font.weights?.length ? font.weights : [400];
  const tries: [number[], boolean][] = [
    [weights, Boolean(font.italic)],
    ...(font.italic ? ([[weights, false]] as [number[], boolean][]) : []),
    [[400, 700], Boolean(font.italic)],
    [[400, 700], false],
    [[400], false],
  ];
  for (const [ws, it] of tries) {
    try {
      const r = await fetchImpl(familyUrl(font.family, ws, it), {
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) {
        const { italic: _i, weights: _w, ...rest } = font;
        return { ...rest, weights: ws, ...(it ? { italic: true } : {}) };
      }
      if (r.status !== 400) return font;
    } catch {
      return font;
    }
  }
  return font;
}
