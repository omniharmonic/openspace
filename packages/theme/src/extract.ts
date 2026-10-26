import {
  formatOklch,
  linearSrgbToOklab,
  type Oklab,
  oklabToOklch,
  oklchToHex,
  srgbChannelToLinear,
} from "./color";

export interface PaletteCandidate {
  hex: string;
  oklch: string;
  l: number;
  c: number;
  h: number;
  /** Share of (opaque, sampled) pixels in this cluster, 0–1. */
  population: number;
  /** Ranking score: population weighted by chroma, penalizing near-white/black. */
  score: number;
}

export interface ExtractOptions {
  /** Number of clusters (default 6). */
  k?: number;
  /** Max candidates returned (default 5). */
  count?: number;
  /** Max pixels sampled (default 20 000; sampling is a fixed stride, so deterministic). */
  maxSamples?: number;
  /** Channels per pixel in `pixels` (default 4, RGBA). */
  channels?: 3 | 4;
}

// 8-bit sRGB → linear lookup.
const LINEAR = Array.from({ length: 256 }, (_, i) => srgbChannelToLinear(i / 255));

const dist2 = (a: Oklab, b: Oklab) => (a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2;

/**
 * Brand color candidates from image pixels (logo or hero photo): weighted k-means in OKLab
 * (samples weighted toward chromatic pixels), deterministic farthest-point seeding, clusters
 * ranked by population × chroma. Near-white, near-black and gray clusters rank last; if the image
 * is entirely achromatic the grays are still returned.
 */
export function extractPalette(
  pixels: Uint8ClampedArray | Uint8Array | number[],
  options: ExtractOptions = {},
): PaletteCandidate[] {
  const channels = options.channels ?? 4;
  const k = Math.max(1, options.k ?? 6);
  const count = options.count ?? 5;
  const total = Math.floor(pixels.length / channels);
  const stride = Math.max(1, Math.ceil(total / (options.maxSamples ?? 20000)));

  const samples: Oklab[] = [];
  const weights: number[] = [];
  for (let i = 0; i < total; i += stride) {
    const o = i * channels;
    if (channels === 4 && (pixels[o + 3] ?? 255) < 128) continue;
    const lab = linearSrgbToOklab({
      r: LINEAR[pixels[o] ?? 0] as number,
      g: LINEAR[pixels[o + 1] ?? 0] as number,
      b: LINEAR[pixels[o + 2] ?? 0] as number,
    });
    samples.push(lab);
    weights.push(1 + 12 * Math.hypot(lab.a, lab.b));
  }
  if (samples.length === 0) return [];

  // Farthest-point seeding from the heaviest (most chromatic) sample.
  let first = 0;
  for (let i = 1; i < samples.length; i++) if ((weights[i] ?? 0) > (weights[first] ?? 0)) first = i;
  const centers: Oklab[] = [{ ...(samples[first] as Oklab) }];
  const nearest = samples.map((s) => dist2(s, centers[0] as Oklab));
  while (centers.length < Math.min(k, samples.length)) {
    let far = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((nearest[i] ?? 0) * (weights[i] ?? 0) > (nearest[far] ?? 0) * (weights[far] ?? 0))
        far = i;
    }
    if ((nearest[far] ?? 0) === 0) break;
    const c = { ...(samples[far] as Oklab) };
    centers.push(c);
    for (let i = 0; i < samples.length; i++) {
      nearest[i] = Math.min(nearest[i] ?? 0, dist2(samples[i] as Oklab, c));
    }
  }

  const assign = new Array<number>(samples.length).fill(0);
  for (let iter = 0; iter < 16; iter++) {
    let moved = false;
    for (let i = 0; i < samples.length; i++) {
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let j = 0; j < centers.length; j++) {
        const d = dist2(samples[i] as Oklab, centers[j] as Oklab);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        moved = true;
      }
    }
    const sums = centers.map(() => ({ l: 0, a: 0, b: 0, w: 0 }));
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i] as Oklab;
      const w = weights[i] ?? 1;
      const acc = sums[assign[i] ?? 0];
      if (!acc) continue;
      acc.l += s.l * w;
      acc.a += s.a * w;
      acc.b += s.b * w;
      acc.w += w;
    }
    sums.forEach((acc, j) => {
      if (acc.w > 0) centers[j] = { l: acc.l / acc.w, a: acc.a / acc.w, b: acc.b / acc.w };
    });
    if (!moved && iter > 0) break;
  }

  const counts = centers.map(() => 0);
  for (const a of assign) counts[a] = (counts[a] ?? 0) + 1;

  const candidates: PaletteCandidate[] = [];
  centers.forEach((center, j) => {
    const n = counts[j] ?? 0;
    if (n === 0) return;
    const lch = oklabToOklch(center);
    const population = n / samples.length;
    const chromaWeight = Math.min(1, lch.c / 0.12);
    const extreme = lch.l > 0.96 || lch.l < 0.12 ? 0.05 : 1;
    const score = population * (0.04 + chromaWeight) * extreme;
    candidates.push({
      hex: oklchToHex(lch),
      oklch: formatOklch(lch),
      l: lch.l,
      c: lch.c,
      h: lch.h,
      population,
      score,
    });
  });

  candidates.sort((a, b) => b.score - a.score || a.hex.localeCompare(b.hex));
  // Merge near-duplicate clusters (same visible color).
  const out: PaletteCandidate[] = [];
  for (const c of candidates) if (!out.some((o) => o.hex === c.hex)) out.push(c);
  return out.slice(0, count);
}
