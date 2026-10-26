/**
 * Pixel analysis for uploads (arch §5.6 step 3), on a small RGBA sample of the image.
 */

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/**
 * The image's dominant color as `#rrggbb`: the most common color bucket (4 bits per channel,
 * weighted by opacity), averaged. Transparent images report their visible pixels only.
 */
export function dominantColor(rgba: Uint8ClampedArray | Uint8Array): string {
  const count = new Float64Array(4096);
  const sums = new Float64Array(4096 * 3);
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a = (rgba[i + 3] ?? 0) / 255;
    if (a < 0.1) continue;
    const r = rgba[i] ?? 0;
    const g = rgba[i + 1] ?? 0;
    const b = rgba[i + 2] ?? 0;
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    count[k] = (count[k] ?? 0) + a;
    sums[k * 3] = (sums[k * 3] ?? 0) + r * a;
    sums[k * 3 + 1] = (sums[k * 3 + 1] ?? 0) + g * a;
    sums[k * 3 + 2] = (sums[k * 3 + 2] ?? 0) + b * a;
  }
  let best = -1;
  let bestCount = 0;
  for (let k = 0; k < 4096; k++) {
    if ((count[k] ?? 0) > bestCount) {
      bestCount = count[k] ?? 0;
      best = k;
    }
  }
  if (best < 0) return "#808080";
  return `#${hex2((sums[best * 3] ?? 0) / bestCount)}${hex2((sums[best * 3 + 1] ?? 0) / bestCount)}${hex2((sums[best * 3 + 2] ?? 0) / bestCount)}`;
}

/**
 * Suggested focal point `[x, y]` (0..1) from a simple saliency heuristic: local contrast
 * (gradient energy) plus how far a color's saturation stands out from the frame, with a mild bias toward the middle of the frame. The
 * suggestion is the weighted center of the most salient tenth of the image. Flat images get the
 * center.
 */
export function suggestFocal(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): [number, number] {
  if (width < 3 || height < 3) return [0.5, 0.5];
  const lum = new Float32Array(width * height);
  const sat = new Float32Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const r = (rgba[p * 4] ?? 0) / 255;
    const g = (rgba[p * 4 + 1] ?? 0) / 255;
    const b = (rgba[p * 4 + 2] ?? 0) / 255;
    const a = (rgba[p * 4 + 3] ?? 255) / 255;
    lum[p] = (0.2126 * r + 0.7152 * g + 0.0722 * b) * a;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sat[p] = (max === 0 ? 0 : (max - min) / max) * a;
  }
  // Saturation only counts where it stands out from the frame (a blue sky is not a subject).
  let meanSat = 0;
  for (const v of sat) meanSat += v;
  meanSat /= sat.length;
  const energy = new Float32Array(width * height);
  let maxE = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x;
      const dx = (lum[p + 1] ?? 0) - (lum[p - 1] ?? 0);
      const dy = (lum[p + width] ?? 0) - (lum[p - width] ?? 0);
      const cx = x / (width - 1) - 0.5;
      const cy = y / (height - 1) - 0.5;
      const centerBias = 1 - 0.6 * (cx * cx + cy * cy) * 2;
      const e =
        (Math.abs(dx) + Math.abs(dy) + 0.35 * Math.abs((sat[p] ?? 0) - meanSat)) * centerBias;
      energy[p] = e;
      if (e > maxE) maxE = e;
    }
  }
  if (maxE < 0.02) return [0.5, 0.5];
  // Threshold at the 90th percentile of energy.
  const sorted = Array.from(energy).sort((a, b) => a - b);
  const threshold = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  let sx = 0;
  let sy = 0;
  let sw = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const e = energy[y * width + x] ?? 0;
      if (e < threshold || e <= 0) continue;
      sx += (x + 0.5) * e;
      sy += (y + 0.5) * e;
      sw += e;
    }
  }
  if (sw === 0) return [0.5, 0.5];
  const clamp = (v: number) => Math.round(Math.min(0.9, Math.max(0.1, v)) * 100) / 100;
  return [clamp(sx / sw / width), clamp(sy / sw / height)];
}

/** True if any pixel is not fully opaque. */
export function hasTransparency(rgba: Uint8ClampedArray | Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) if ((rgba[i] ?? 255) < 255) return true;
  return false;
}

/** Scale `w × h` so the long edge is at most `max` (never upscales). */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}
