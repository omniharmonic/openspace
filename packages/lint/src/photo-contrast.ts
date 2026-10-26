import type { Block, RichTextDoc, Section, StyleChoices } from "@openspace/schema";
import { contrastRatio, toHex } from "@openspace/theme";
import { NON_TEXT_BLOCKS } from "./content";

/**
 * Worst-case contrast of text drawn over a photo or video section background (doc 04 §3.3).
 *
 * A photograph can be any brightness anywhere, so the only colour we can rely on behind the
 * text is the scrim: the overlay colour at its opacity, composited over the photo. The worst
 * cases are the overlay blended over pure black and over pure white; text must reach its WCAG
 * minimum against both. Blocks with their own colour theme sit on a panel and are skipped.
 */

export interface PhotoTextCheck {
  /** Theme role the text is drawn in (`heading`, `text`, `link`, `text-muted`). */
  role: string;
  /** What the text is, in plain language ("Eyebrow", "Body text"). */
  label: string;
  /** Minimum ratio: 3 for large headings, 4.5 for everything else. */
  min: number;
}

export interface PhotoContrastFailure extends PhotoTextCheck {
  ratio: number;
  blockId: string;
}

const SOLID_PRIMARY: ReadonlySet<StyleChoices["buttons"]> = new Set(["solid", "pill-solid"]);

function richChecks(doc: RichTextDoc | undefined, out: PhotoTextCheck[]) {
  const walk = (nodes: unknown[]) => {
    for (const n of nodes as {
      type: string;
      attrs?: { preset?: string };
      content?: unknown[];
      marks?: { type: string }[];
    }[]) {
      if (n.type === "heading") out.push({ role: "heading", label: "Heading", min: 3 });
      else if (n.type === "paragraph" && n.attrs?.preset === "eyebrow")
        out.push({ role: "text-muted", label: "Eyebrow", min: 4.5 });
      else if (n.type === "paragraph") out.push({ role: "text", label: "Body text", min: 4.5 });
      if (n.type === "text" && n.marks?.some((m) => m.type === "link"))
        out.push({ role: "link", label: "Link", min: 4.5 });
      if (n.content) walk(n.content);
    }
  };
  if (doc?.content) walk(doc.content);
}

/** The text colours a block draws directly on the section background. */
export function photoTextChecks(block: Block, buttons: StyleChoices["buttons"]): PhotoTextCheck[] {
  if (NON_TEXT_BLOCKS.has(block.type)) return [];
  const f = block.fields as Record<string, unknown>;
  const out: PhotoTextCheck[] = [];
  switch (block.type) {
    case "heading":
      out.push({ role: "heading", label: "Heading", min: 3 });
      if (f.eyebrow) out.push({ role: "link", label: "Eyebrow", min: 4.5 });
      if (f.subheading) out.push({ role: "text", label: "Introduction", min: 4.5 });
      break;
    case "text":
      richChecks(f.content as RichTextDoc, out);
      break;
    case "button": {
      const role = (f.role as string) ?? "primary";
      if (role === "primary" && !SOLID_PRIMARY.has(buttons))
        out.push({ role: "link", label: "Button label", min: 4.5 });
      else if (role !== "primary") out.push({ role: "text", label: "Button label", min: 4.5 });
      if (f.secondaryLabel) out.push({ role: "text", label: "Second button label", min: 4.5 });
      if (f.note) out.push({ role: "text-muted", label: "Button note", min: 4.5 });
      break;
    }
    default:
      out.push({ role: "text", label: "Text", min: 4.5 });
  }
  return out;
}

function rgb(hex: string): [number, number, number] {
  const h = toHex(hex).replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** `color` at `opacity` composited over `under` (sRGB, as browsers paint an overlay). */
export function blendOver(color: string, opacity: number, under: string): string {
  const a = rgb(color);
  const b = rgb(under);
  const mix = a.map((c, i) => Math.round(c * opacity + (b[i] as number) * (1 - opacity)));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Contrast of `text` against the scrim over the darkest and brightest possible photo. */
export function worstCaseRatio(text: string, overlay: string, opacity: number): number {
  return Math.min(
    contrastRatio(text, blendOver(overlay, opacity, "#000000")),
    contrastRatio(text, blendOver(overlay, opacity, "#ffffff")),
  );
}

/**
 * Text in a photo-background section that can fail contrast somewhere on the photo, plus the
 * smallest overlay opacity (in 5% steps) that makes every piece pass, if there is one.
 */
export function photoContrast(
  section: Section,
  roles: Record<string, string>,
  overlay: string,
  opacity: number,
  buttons: StyleChoices["buttons"],
): { failures: PhotoContrastFailure[]; minOpacity: number | undefined } {
  const checks: (PhotoTextCheck & { blockId: string; color: string })[] = [];
  for (const b of section.blocks) {
    if (b.style?.colorTheme) continue;
    for (const c of photoTextChecks(b, buttons)) {
      const color = roles[c.role];
      if (color) checks.push({ ...c, blockId: b.id, color });
    }
  }
  const failing = (alpha: number) =>
    checks
      .map((c) => ({ ...c, ratio: worstCaseRatio(c.color, overlay, alpha) }))
      .filter((c) => c.ratio < c.min);
  const failures = failing(opacity).map(({ color: _c, ...rest }) => rest);
  let minOpacity: number | undefined;
  if (failures.length)
    for (let a = Math.ceil(opacity * 20) / 20; a <= 0.95 + 1e-9; a += 0.05)
      if (failing(a).length === 0) {
        minOpacity = Math.round(a * 100) / 100;
        break;
      }
  return { failures, minOpacity };
}
