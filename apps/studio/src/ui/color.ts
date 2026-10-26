/** Small color helpers for the picker (sRGB hex ⇄ HSV). */
export interface Hsv {
  h: number; // 0–360
  s: number; // 0–1
  v: number; // 0–1
}

export function normalizeHex(input: string): string | null {
  let s = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s))
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  if (!/^[0-9a-f]{6}$/.test(s)) return null;
  return `#${s}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = normalizeHex(hex) ?? "#000000";
  return [1, 3, 5].map((i) => Number.parseInt(n.slice(i, i + 2), 16)) as [number, number, number];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((x) =>
      Math.round(Math.min(255, Math.max(0, x)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** WCAG relative luminance; used to pick legible ink on a swatch. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((x) => {
    const c = x / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
