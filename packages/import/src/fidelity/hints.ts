/**
 * Layout hints from the live page as a browser measured it: each imported section is matched to
 * the original section with the same heading, then a card grid takes the original's number of
 * columns, and an image beside text takes the original's share of the width. Only applied where
 * the measurement is unambiguous; everything else keeps the mapper's choice.
 */
import type { Block, Section } from "@omniharmonic/openspace-schema";
import type { ProbeSection } from "./probe";

const norm = (s: string | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function headingOf(section: Section): string | undefined {
  for (const b of section.blocks) {
    if (b.type === "heading" && typeof b.fields.text === "string") return b.fields.text;
    if (b.type === "text") {
      const doc = b.fields.content as {
        content?: { type: string; content?: { text?: string }[] }[];
      };
      const h = doc?.content?.find((n) => n.type === "heading");
      if (h) return (h.content ?? []).map((t) => t.text ?? "").join("");
    }
  }
  return undefined;
}

/** Apply the measured layout to a page's sections; returns what changed (for the report). */
export function applyLayoutHints(
  sections: Section[],
  probe: { viewport: number; contentWidth?: number; sections: ProbeSection[] },
): string[] {
  const changed: string[] = [];
  const byHeading = new Map<string, ProbeSection>();
  for (const p of probe.sections) if (p.heading) byHeading.set(norm(p.heading.text), p);
  let current: ProbeSection | undefined;
  for (const section of sections) {
    const h = headingOf(section);
    // Parts of one original section (split by column structure) share its measurement.
    if (h) current = byHeading.get(norm(h));
    const p = current;
    if (!p) continue;
    const label = h ?? p.heading?.text ?? "a section";
    // Card grids: as many per row as the original showed.
    for (const b of section.blocks as Block[]) {
      if (b.type !== "columns" || !Array.isArray(b.fields.items)) continue;
      const n = (b.fields.items as unknown[]).length;
      const cols = Math.min(6, p.columns, n);
      if (cols >= 2 && String(cols) !== b.fields.columns) {
        b.fields.columns = String(cols);
        changed.push(`"${label}": ${cols} cards per row, as on the original`);
      }
    }
    // An image beside the words: the original's share of the width (twelfths of the content).
    const layout = section.layout;
    if (layout.mode !== "stack" || layout.columns.d.length !== 2 || !p.image) continue;
    const imageCol = [0, 1].find((c) =>
      section.blocks.every((b) => (b.column ?? 0) !== c || b.type === "image"),
    );
    if (imageCol === undefined || !section.blocks.some((b) => (b.column ?? 0) === imageCol))
      continue;
    const content = probe.contentWidth ?? probe.viewport * 0.85;
    const share = (p.image.widthShare * probe.viewport) / content;
    const span = Math.max(3, Math.min(8, Math.round(share * 12)));
    const spans = imageCol === 0 ? [span, 12 - span] : [12 - span, span];
    if (spans.join() !== layout.columns.d.join()) {
      layout.columns = { ...layout.columns, d: spans };
      changed.push(`"${label}": the image takes ${span}/12 of the width, as on the original`);
    }
  }
  return changed;
}
