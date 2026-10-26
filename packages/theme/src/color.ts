/**
 * Color math: OKLCH ⇄ OKLab ⇄ linear sRGB ⇄ sRGB (hex), CSS color parsing, and gamut mapping
 * by chroma reduction. Matrices from Björn Ottosson's OKLab reference and CSS Color 4.
 */

/** OKLCH: lightness 0–1, chroma ≥ 0 (≈0–0.37 in sRGB), hue in degrees 0–360. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** OKLab: lightness 0–1, a/b opponent axes. */
export interface Oklab {
  l: number;
  a: number;
  b: number;
}

/** RGB triple. Gamma-encoded sRGB or linear-light sRGB depending on context, channels 0–1. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const GAMUT_EPSILON = 1e-6;
/** Below this chroma a color is treated as achromatic (hue is meaningless). */
export const ACHROMATIC_CHROMA = 1e-4;

// --- transfer functions ---------------------------------------------------------------------

export function srgbChannelToLinear(v: number): number {
  const abs = Math.abs(v);
  const lin = abs <= 0.04045 ? abs / 12.92 : ((abs + 0.055) / 1.055) ** 2.4;
  return Math.sign(v) * lin;
}

export function linearChannelToSrgb(v: number): number {
  const abs = Math.abs(v);
  const enc = abs <= 0.0031308 ? abs * 12.92 : 1.055 * abs ** (1 / 2.4) - 0.055;
  return Math.sign(v) * enc;
}

export function srgbToLinear({ r, g, b }: Rgb): Rgb {
  return { r: srgbChannelToLinear(r), g: srgbChannelToLinear(g), b: srgbChannelToLinear(b) };
}

export function linearToSrgb({ r, g, b }: Rgb): Rgb {
  return { r: linearChannelToSrgb(r), g: linearChannelToSrgb(g), b: linearChannelToSrgb(b) };
}

// --- OKLab ------------------------------------------------------------------------------------

export function linearSrgbToOklab({ r, g, b }: Rgb): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToLinearSrgb({ l: L, a, b }: Oklab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

export function normalizeHue(h: number): number {
  const n = h % 360;
  return n < 0 ? n + 360 : n;
}

export function oklabToOklch({ l, a, b }: Oklab): Oklch {
  const c = Math.sqrt(a * a + b * b);
  const h = c < ACHROMATIC_CHROMA ? 0 : normalizeHue((Math.atan2(b, a) * 180) / Math.PI);
  return { l, c, h };
}

export function oklchToOklab({ l, c, h }: Oklch): Oklab {
  const rad = (h * Math.PI) / 180;
  return { l, a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

export function srgbToOklch(rgb: Rgb): Oklch {
  return oklabToOklch(linearSrgbToOklab(srgbToLinear(rgb)));
}

/** Unclamped sRGB (may fall outside 0–1 when the color is out of gamut). */
export function oklchToSrgb(color: Oklch): Rgb {
  return linearToSrgb(oklabToLinearSrgb(oklchToOklab(color)));
}

// --- gamut mapping ------------------------------------------------------------------------------

export function inSrgbGamut(color: Oklch): boolean {
  const { r, g, b } = oklabToLinearSrgb(oklchToOklab(color));
  return [r, g, b].every((v) => v >= -GAMUT_EPSILON && v <= 1 + GAMUT_EPSILON);
}

/**
 * Map an OKLCH color into sRGB by reducing chroma (hue and lightness preserved) — binary search
 * for the largest in-gamut chroma. Lightness is clamped to 0–1 first.
 */
export function gamutMap(color: Oklch): Oklch {
  const l = Math.min(1, Math.max(0, color.l));
  const base = { l, c: Math.max(0, color.c), h: normalizeHue(color.h) };
  if (l <= 0) return { l: 0, c: 0, h: base.h };
  if (l >= 1) return { l: 1, c: 0, h: base.h };
  if (inSrgbGamut(base)) return base;
  let lo = 0;
  let hi = base.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inSrgbGamut({ ...base, c: mid })) lo = mid;
    else hi = mid;
  }
  return { ...base, c: lo };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Gamut-mapped, clamped sRGB (0–1 channels). */
export function oklchToSrgbInGamut(color: Oklch): Rgb {
  const { r, g, b } = oklchToSrgb(gamutMap(color));
  return { r: clamp01(r), g: clamp01(g), b: clamp01(b) };
}

// --- hex -----------------------------------------------------------------------------------------

const hex2 = (v: number) =>
  Math.round(clamp01(v) * 255)
    .toString(16)
    .padStart(2, "0");

/** sRGB (0–1) → lowercase `#rrggbb`. */
export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` → sRGB (alpha ignored). */
export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m?.[1]) throw new Error(`Invalid hex color: ${hex}`);
  let h = m[1];
  if (h.length <= 4) h = [...h].map((ch) => ch + ch).join("");
  const n = (i: number) => Number.parseInt(h.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4) };
}

/** OKLCH → gamut-mapped `#rrggbb`. */
export function oklchToHex(color: Oklch): string {
  return rgbToHex(oklchToSrgbInGamut(color));
}

export function hexToOklch(hex: string): Oklch {
  return srgbToOklch(hexToRgb(hex));
}

// --- CSS parsing -----------------------------------------------------------------------------

/** Parse a number with optional `%` against a reference value for 100%. */
function num(token: string, percentRef: number): number {
  const t = token.trim().toLowerCase();
  if (t === "none") return 0;
  if (t.endsWith("%")) return (Number.parseFloat(t) / 100) * percentRef;
  const v = Number.parseFloat(t);
  if (!Number.isFinite(v)) throw new Error(`Invalid number: ${token}`);
  return v;
}

function hue(token: string): number {
  const t = token.trim().toLowerCase();
  if (t === "none") return 0;
  const v = Number.parseFloat(t);
  if (!Number.isFinite(v)) throw new Error(`Invalid hue: ${token}`);
  if (t.endsWith("turn")) return normalizeHue(v * 360);
  if (t.endsWith("grad")) return normalizeHue(v * 0.9);
  if (t.endsWith("rad")) return normalizeHue((v * 180) / Math.PI);
  return normalizeHue(v);
}

/** Split CSS function arguments (`a b c / alpha` or `a, b, c, alpha`); alpha is dropped. */
function args(body: string): string[] {
  const noAlpha = body.split("/")[0] ?? "";
  const parts = noAlpha
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.slice(0, 3);
}

// CIELAB (D50) → linear sRGB (CSS Color 4 matrices).
const D50 = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585] as const;
function labToLinearSrgb(L: number, a: number, b: number): Rgb {
  const k = 24389 / 27;
  const e = 216 / 24389;
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
  const yr = L > k * e ? fy ** 3 : L / k;
  const zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  const x50 = xr * D50[0];
  const y50 = yr * D50[1];
  const z50 = zr * D50[2];
  const x = 0.955473421488075 * x50 - 0.02309845494876471 * y50 + 0.06325924320057072 * z50;
  const y = -0.0283697093338637 * x50 + 1.0099953980813041 * y50 + 0.021041441191917323 * z50;
  const z = 0.012314014864481998 * x50 - 0.020507649298898964 * y50 + 1.330365926242124 * z50;
  return {
    r: 3.2409699419045226 * x - 1.537383177570094 * y - 0.4986107602930034 * z,
    g: -0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z,
    b: 0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z,
  };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return { r: f(0), g: f(8), b: f(4) };
}

/**
 * Parse a CSS color (hex, `oklch()`, `oklab()`, `rgb()/rgba()`, `hsl()/hsla()`, `lab()`, `lch()`)
 * into OKLCH. Out-of-gamut inputs are kept as-is; map with {@link gamutMap} before display.
 */
export function parseColor(input: string): Oklch {
  const s = input.trim().toLowerCase();
  if (s.startsWith("#")) return hexToOklch(s);
  const m = /^([a-z]+)\(([^()]*)\)$/.exec(s);
  if (!m?.[1] || m[2] === undefined) throw new Error(`Unsupported color: ${input}`);
  const fn = m[1];
  const parts = args(m[2]);
  if (parts.length !== 3) throw new Error(`Expected 3 components: ${input}`);
  const [p0, p1, p2] = parts as [string, string, string];
  switch (fn) {
    case "oklch":
      return { l: num(p0, 1), c: Math.max(0, num(p1, 0.4)), h: hue(p2) };
    case "oklab":
      return oklabToOklch({ l: num(p0, 1), a: num(p1, 0.4), b: num(p2, 0.4) });
    case "rgb":
    case "rgba":
      return srgbToOklch({ r: num(p0, 255) / 255, g: num(p1, 255) / 255, b: num(p2, 255) / 255 });
    case "hsl":
    case "hsla":
      return srgbToOklch(hslToRgb(hue(p0), num(p1, 100) / 100, num(p2, 100) / 100));
    case "lab":
      return oklabToOklch(
        linearSrgbToOklab(labToLinearSrgb(num(p0, 100), num(p1, 125), num(p2, 125))),
      );
    case "lch": {
      const L = num(p0, 100);
      const C = num(p1, 150);
      const H = (hue(p2) * Math.PI) / 180;
      return oklabToOklch(linearSrgbToOklab(labToLinearSrgb(L, C * Math.cos(H), C * Math.sin(H))));
    }
    default:
      throw new Error(`Unsupported color function: ${fn}()`);
  }
}

/** True when {@link parseColor} accepts the input. */
export function isColor(input: string): boolean {
  try {
    parseColor(input);
    return true;
  } catch {
    return false;
  }
}

const round = (v: number, digits: number) => {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  return Object.is(r, -0) ? 0 : r;
};

/** Format as a CSS `oklch()` string, e.g. `oklch(0.62 0.09 145)`. */
export function formatOklch({ l, c, h }: Oklch): string {
  const cc = round(c, 4);
  return `oklch(${round(l, 4)} ${cc} ${cc === 0 ? 0 : round(h, 2)})`;
}

/** Any CSS color → gamut-mapped `#rrggbb`. */
export function toHex(input: string | Oklch): string {
  return oklchToHex(typeof input === "string" ? parseColor(input) : input);
}

/** Shortest-path interpolation between two hues (t = 0 → a, 1 → b). */
export function mixHue(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return normalizeHue(a + d * t);
}

/** Euclidean distance in OKLab (ΔE_OK). */
export function deltaEOK(x: Oklch, y: Oklch): number {
  const a = oklchToOklab(x);
  const b = oklchToOklab(y);
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}
