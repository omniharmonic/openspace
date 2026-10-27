/**
 * Fonts the importer may not copy: licensed foundry fonts (Adobe Fonts/Typekit, Fonts.com,
 * Hoefler's Cloud.typography, MyFonts, Webtype…) and fonts a site self-hosts under an unknown
 * licence. They are never downloaded; instead the nearest open-licence family is chosen — by the
 * metrics a browser measured on the live site (x-height, cap height, width, small caps) against
 * the same metrics of open Google Fonts families (`font-metrics.ts`), within the font's category,
 * with well-known equivalents as tie-breakers. System fonts (Georgia, Helvetica…) get their
 * metric-compatible open twins. The report and the "Use your own font licence" checklist item say
 * what was replaced, so an owner with a web licence can upload the real files.
 */
import { fontCategory } from "../map/theme";
import { OPEN_FONT_METRICS } from "./font-metrics";
import type { FontMetrics } from "./probe";

export type FontCategory = "serif" | "sans-serif" | "monospace";

/** Where a family comes from, as far as the importer can tell. */
export type FontSource = "google" | "licensed" | "system" | "self-hosted";

/** Hosts of licensed web-font services (fonts served from them may not be copied). */
export const LICENSED_FONT_HOSTS =
  /(?:^|\.)(?:typekit\.net|typekit\.com|fonts\.adobe\.com|edgefonts\.net|fonts\.net|fonts\.com|cloud\.typography\.com|typography\.com|myfonts\.net|webtype\.com|typenetwork\.com|fontdeck\.com|fontspring\.com|monotype\.com)$/i;

/** Families every device ships (never embedded; their open twins stand in on the web). */
const SYSTEM: Record<string, { twin: string; category: FontCategory }> = {
  georgia: { twin: "Gelasio", category: "serif" },
  "times new roman": { twin: "Tinos", category: "serif" },
  times: { twin: "Tinos", category: "serif" },
  "times-roman": { twin: "Tinos", category: "serif" },
  arial: { twin: "Arimo", category: "sans-serif" },
  helvetica: { twin: "Arimo", category: "sans-serif" },
  "helvetica neue": { twin: "Inter", category: "sans-serif" },
  verdana: { twin: "PT Sans", category: "sans-serif" },
  tahoma: { twin: "PT Sans", category: "sans-serif" },
  "trebuchet ms": { twin: "Fira Sans", category: "sans-serif" },
  "gill sans": { twin: "Lato", category: "sans-serif" },
  palatino: { twin: "Domine", category: "serif" },
  "palatino linotype": { twin: "Domine", category: "serif" },
  "book antiqua": { twin: "Domine", category: "serif" },
  garamond: { twin: "EB Garamond", category: "serif" },
  baskerville: { twin: "Libre Baskerville", category: "serif" },
  "courier new": { twin: "Cousine", category: "monospace" },
  courier: { twin: "Courier Prime", category: "monospace" },
  "segoe ui": { twin: "Noto Sans", category: "sans-serif" },
  "-apple-system": { twin: "Inter", category: "sans-serif" },
  "system-ui": { twin: "Inter", category: "sans-serif" },
  "sf pro text": { twin: "Inter", category: "sans-serif" },
  "sf pro display": { twin: "Inter", category: "sans-serif" },
};

/**
 * Well-known licensed families and their usual open stand-ins (first = preferred), with their
 * category: used without measurements, and as a tie-breaker with them.
 */
const EQUIVALENTS: [RegExp, FontCategory, string[]][] = [
  [/garamond/, "serif", ["EB Garamond", "Cormorant Garamond"]],
  [/freight-?sans/, "sans-serif", ["Proza Libre", "Alegreya Sans"]],
  [/freight.*(?:big|display)/, "serif", ["Cormorant Garamond", "Playfair Display"]],
  [/freight/, "serif", ["Crimson Pro", "Libre Caslon Text"]],
  [/minion/, "serif", ["Crimson Pro", "Crimson Text"]],
  [/caslon/, "serif", ["Libre Caslon Text"]],
  [/baskerville/, "serif", ["Libre Baskerville", "Baskervville"]],
  [/bodoni|didot/, "serif", ["Bodoni Moda", "Playfair Display"]],
  [/trajan/, "serif", ["Cinzel"]],
  [/tisa|chaparral/, "serif", ["Merriweather", "Bitter"]],
  [/mrs-?eaves/, "serif", ["Libre Baskerville"]],
  [/miller|tiempos|lyon|publico|canela|ogg|recoleta/, "serif", ["Newsreader", "Fraunces"]],
  [/rockwell|museo-?slab|archer|sentinel/, "serif", ["Zilla Slab", "Arvo"]],
  [/proxima/, "sans-serif", ["Figtree", "Montserrat", "Nunito Sans"]],
  [/gotham|metropolis/, "sans-serif", ["Montserrat"]],
  [/futura|spartan/, "sans-serif", ["Jost", "League Spartan"]],
  [/brandon/, "sans-serif", ["Josefin Sans", "Questrial"]],
  [/avenir|nunito/, "sans-serif", ["Nunito Sans", "Figtree"]],
  [/acumin|franklin/, "sans-serif", ["Archivo", "Libre Franklin"]],
  [/europa|museo-?sans/, "sans-serif", ["Mulish", "Lato"]],
  [/aktiv|neue-?haas|helvetica|graphik|untitled-?sans|suisse/, "sans-serif", ["Inter", "Arimo"]],
  [/circular|cerebri|gt-?walsheim|sofia-?pro/, "sans-serif", ["DM Sans", "Plus Jakarta Sans"]],
  [/din|bahnschrift/, "sans-serif", ["Barlow", "Barlow Semi Condensed"]],
  [/gill/, "sans-serif", ["Lato"]],
  [/myriad|source-?sans/, "sans-serif", ["Source Sans 3", "PT Sans"]],
  [/univers|frutiger|segoe/, "sans-serif", ["Noto Sans", "Open Sans"]],
  [
    /trade-?gothic|news-?gothic|alternate-?gothic|knockout|league-?gothic/,
    "sans-serif",
    ["Oswald", "Archivo Narrow"],
  ],
  [/apercu|maison|founders/, "sans-serif", ["Work Sans", "Inter"]],
  [/mono|courier|consol/, "monospace", ["IBM Plex Mono", "JetBrains Mono"]],
];

const key = (s: string) => s.trim().toLowerCase().replace(/["']/g, "");

/** The category of a family: known equivalents first, then the name. */
export function categoryOf(family: string): FontCategory {
  const k = key(family);
  const sys = SYSTEM[k];
  if (sys) return sys.category;
  const eq = EQUIVALENTS.find(([re]) => re.test(k.replace(/\s+/g, "-")));
  return eq ? eq[1] : fontCategory(family);
}

export function isSystemFont(family: string): boolean {
  return key(family) in SYSTEM;
}

export interface FontMatch {
  /** The open family to use (a Google Fonts name). */
  family: string;
  category: FontCategory;
  /** How it was chosen. */
  via: "system twin" | "metrics" | "known equivalent" | "category";
  /** Metric distance to the original (0 = identical), when measured. */
  distance?: number;
}

/** Distance between two fonts' measured shapes (x-height and width weigh most). */
export function metricDistance(
  a: Pick<FontMetrics, "xHeight" | "capHeight" | "width">,
  b: Pick<FontMetrics, "xHeight" | "capHeight" | "width">,
): number {
  // x-height relative to cap height is what the eye reads as "the same font size".
  const ra = a.xHeight / Math.max(0.01, a.capHeight);
  const rb = b.xHeight / Math.max(0.01, b.capHeight);
  return (
    Math.abs(a.xHeight - b.xHeight) * 1.5 +
    Math.abs(ra - rb) * 0.6 +
    Math.abs(a.width - b.width) * 1.2 +
    Math.abs(a.capHeight - b.capHeight) * 0.4
  );
}

/**
 * The nearest open-licence family for one the site may not copy. `metrics` (from the look probe)
 * make it a measured match; without them a known equivalent or the category's default is used.
 */
export function nearestOpenFont(family: string, metrics?: FontMetrics): FontMatch {
  const k = key(family);
  const sys = SYSTEM[k];
  if (sys) return { family: sys.twin, category: sys.category, via: "system twin" };
  // Already an open family (a Google Fonts name): itself.
  const own = OPEN_FONT_METRICS.find(([name]) => name.toLowerCase() === k);
  if (own) return { family: own[0], category: own[1], via: "metrics", distance: 0 };
  const category = metrics?.category ?? categoryOf(family);
  const eq = EQUIVALENTS.find(([re]) => re.test(k.replace(/\s+/g, "-")))?.[2] ?? [];
  if (metrics && metrics.xHeight > 0 && metrics.capHeight > 0) {
    const pool = OPEN_FONT_METRICS.filter(
      ([, cat, , , , sc]) => cat === category && Boolean(sc) === Boolean(metrics.smallCaps),
    );
    const list = pool.length ? pool : OPEN_FONT_METRICS.filter(([, cat]) => cat === category);
    let best: FontMatch | undefined;
    for (const [name, cat, xHeight, capHeight, width] of list) {
      let d = metricDistance(metrics, { xHeight, capHeight, width });
      // A known equivalent wins a near tie.
      if (eq.includes(name)) d -= 0.004 * (eq.length - eq.indexOf(name));
      if (!best || d < (best.distance ?? Number.POSITIVE_INFINITY))
        best = { family: name, category: cat, via: "metrics", distance: Math.max(0, d) };
    }
    if (best) return { ...best, distance: Math.round((best.distance ?? 0) * 1000) / 1000 };
  }
  if (eq[0]) return { family: eq[0], category, via: "known equivalent" };
  const fallback =
    category === "serif" ? "Source Serif 4" : category === "monospace" ? "IBM Plex Mono" : "Inter";
  return { family: fallback, category, via: "category" };
}

/** Is this font served by a licensed web-font service (from the page's font requests)? */
export function servedByLicensedHost(urls: readonly string[]): string[] {
  const hosts = new Set<string>();
  for (const u of urls) {
    try {
      const h = new URL(u).hostname;
      if (LICENSED_FONT_HOSTS.test(h)) hosts.add(h);
    } catch {
      // not a URL
    }
  }
  return [...hosts];
}

/** A service's plain name for the report ("Adobe Fonts"). */
export function serviceName(host: string): string {
  if (/typekit|adobe|edgefonts/.test(host)) return "Adobe Fonts";
  if (/fonts\.(?:net|com)|monotype/.test(host)) return "Fonts.com (Monotype)";
  if (/typography\.com/.test(host)) return "Hoefler&Co. Cloud.typography";
  if (/myfonts/.test(host)) return "MyFonts";
  if (/webtype/.test(host)) return "Webtype";
  if (/typenetwork/.test(host)) return "Type Network";
  return host;
}
