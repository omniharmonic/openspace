/**
 * Measure (Figma's redlines): with something selected, hold Alt and point at anything else to see
 * the distances between them in page pixels. Pointing at what contains the selection (its
 * section) shows the distance to each of its edges. A selected grid block also shows which edges
 * and centres line up with its neighbours, without having to drag it.
 */
import type { Section } from "@omniharmonic/openspace-schema";
import { useEffect, useState } from "react";
import { smartGuides } from "../grid/model";
import { useDocStore } from "../model/context";
import { locate, type SelItem, sameItem } from "../model/selection";
import { elementFor } from "./geometry";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Line {
  axis: "x" | "y";
  /** Start and end along the axis (page px). */
  from: number;
  to: number;
  /** Cross-axis position (page px). */
  at: number;
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

const contains = (a: Box, b: Box) =>
  a.x <= b.x + 0.5 &&
  a.y <= b.y + 0.5 &&
  a.x + a.w >= b.x + b.w - 0.5 &&
  a.y + a.h >= b.y + b.h - 0.5;

/** Redlines between two boxes (page px): edge-to-edge gaps, or insets when one holds the other. */
export function measureLines(a: Box, b: Box): Line[] {
  const midY = (o: Box, p: Box) => (Math.max(o.y, p.y) + Math.min(o.y + o.h, p.y + p.h)) / 2;
  const midX = (o: Box, p: Box) => (Math.max(o.x, p.x) + Math.min(o.x + o.w, p.x + p.w)) / 2;
  const outer = contains(b, a) ? b : contains(a, b) ? a : null;
  if (outer) {
    const inner = outer === a ? b : a;
    const cx = inner.x + inner.w / 2;
    const cy = inner.y + inner.h / 2;
    return [
      { axis: "y", from: outer.y, to: inner.y, at: cx },
      { axis: "y", from: inner.y + inner.h, to: outer.y + outer.h, at: cx },
      { axis: "x", from: outer.x, to: inner.x, at: cy },
      { axis: "x", from: inner.x + inner.w, to: outer.x + outer.w, at: cy },
    ].filter((l) => l.to - l.from > 0.5) as Line[];
  }
  const lines: Line[] = [];
  const overlapX = a.x < b.x + b.w && b.x < a.x + a.w;
  const overlapY = a.y < b.y + b.h && b.y < a.y + a.h;
  if (!overlapY) {
    const [top, bottom] = a.y < b.y ? [a, b] : [b, a];
    lines.push({
      axis: "y",
      from: top.y + top.h,
      to: bottom.y,
      at: overlapX ? midX(a, b) : a.x + a.w / 2,
    });
  }
  if (!overlapX) {
    const [left, right] = a.x < b.x ? [a, b] : [b, a];
    lines.push({
      axis: "x",
      from: left.x + left.w,
      to: right.x,
      at: overlapY ? midY(a, b) : a.y + a.h / 2,
    });
  }
  return lines;
}

function useAltKey(frameDoc: Document | null) {
  const [alt, setAlt] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => setAlt(e.altKey);
    const off = () => setAlt(false);
    const docs = [document, frameDoc].filter(Boolean) as Document[];
    for (const d of docs) {
      d.addEventListener("keydown", on);
      d.addEventListener("keyup", on);
    }
    window.addEventListener("blur", off);
    return () => {
      for (const d of docs) {
        d.removeEventListener("keydown", on);
        d.removeEventListener("keyup", on);
      }
      window.removeEventListener("blur", off);
    };
  }, [frameDoc]);
  return alt;
}

function Lines({ lines, scale, guides }: { lines: Line[]; scale: number; guides?: boolean }) {
  return (
    <>
      {lines.map((l) => {
        const len = l.to - l.from;
        const style =
          l.axis === "y"
            ? { left: l.at * scale, top: l.from * scale, height: len * scale }
            : { top: l.at * scale, left: l.from * scale, width: len * scale };
        return (
          <div
            key={`${l.axis}:${Math.round(l.from)}:${Math.round(l.to)}:${Math.round(l.at)}`}
            className={guides ? "st-ms__guide" : "st-ms__line"}
            data-axis={l.axis}
            style={style}
          >
            {!guides && <span className="st-ms__value st-num">{Math.round(len)}</span>}
          </div>
        );
      })}
    </>
  );
}

export function Measure({
  frameDoc,
  scale,
  selected,
  dragging,
}: {
  frameDoc: Document | null;
  scale: number;
  selected: SelItem;
  dragging: boolean;
}) {
  const alt = useAltKey(frameDoc);
  const hover = useDocStore((s) => s.hover);
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const selEl = elementFor(frameDoc, selected);
  if (!selEl || dragging) return null;
  const a = boxOf(selEl);

  // Alt + hover: redlines.
  let lines: Line[] = [];
  if (alt) {
    let target: Element | null = null;
    if (hover && !sameItem(hover, selected)) target = elementFor(frameDoc, hover);
    if (!target) {
      // Nothing else pointed at: measure to the selection's own section.
      const loc = locate(doc, pageId, selected);
      if (loc && selected.kind === "block")
        target = elementFor(frameDoc, { kind: "section", id: loc.section.id });
    }
    if (target) lines = measureLines(a, boxOf(target));
  }

  // A selected grid block: which edges/centres line up with its neighbours.
  let guides: Line[] = [];
  const loc = selected.kind === "block" ? locate(doc, pageId, selected) : undefined;
  if (loc && (loc.section as Section).layout.mode === "grid" && !alt) {
    const secEl = elementFor(frameDoc, { kind: "section", id: loc.section.id });
    if (secEl) {
      const others = loc.section.blocks
        .filter((b) => b.id !== selected.id)
        .map((b) => elementFor(frameDoc, { kind: "block", id: b.id }))
        .filter(Boolean)
        .map((el) => boxOf(el as Element));
      const g = smartGuides(a, others, boxOf(secEl));
      guides = g.guides.map((x) => ({
        axis: x.axis === "x" ? "y" : "x",
        from: x.from,
        to: x.to,
        at: x.pos,
      }));
    }
  }
  if (!lines.length && !guides.length) return null;
  return (
    <div className="st-ms" aria-hidden="true">
      <Lines lines={guides} scale={scale} guides />
      <Lines lines={lines} scale={scale} />
    </div>
  );
}
