/**
 * Drag spacing on the canvas (Squarespace's section edges, Figma's padding overlay): a selected
 * section shows its top and bottom padding as tinted bands; a selected block in a stack column
 * shows the gap below it. Grab the band's handle and drag. Values snap to the site's spacing
 * steps; hold Alt for exact pixels. A linked section padding moves both sides unless Shift is
 * held (then only the side being dragged). Edits go to the breakpoint being previewed, and one
 * drag is one undo step.
 */
import type { Responsive, Section, SpaceValue } from "@omniharmonic/openspace-schema";
import { useRef, useState } from "react";
import { cx } from "../../../ui";
import { useEditBp } from "../../inspector/env";
import { sectionOp } from "../../inspector/model/edits";
import { setAt } from "../../inspector/model/responsive";
import { autoSpacing, snapPx } from "../../inspector/model/spacing";
import { useDocStore, useDocStoreApi } from "../model/context";
import type { SelItem } from "../model/selection";
import { elementFor, type Rect } from "./geometry";

type Side = "top" | "bottom" | "gap";

interface Band {
  side: Side;
  rect: Rect;
  px: number;
}

interface Drag {
  id: number;
  side: Side;
  startY: number;
  startPx: number;
  shown: { px: number; step?: string };
}

function Readout({ px, step, free }: { px: number; step?: string; free: boolean }) {
  return (
    <span className="st-sp__readout st-num">
      {px}
      <small>px</small>
      {step && !free && <em>{step === "none" ? "0" : step.toUpperCase()}</em>}
    </span>
  );
}

export function SpacingHandles({
  frameDoc,
  scale,
  item,
  section,
  container,
  disabled,
}: {
  frameDoc: Document | null;
  scale: number;
  item: SelItem;
  section: Section;
  container: string;
  disabled: boolean;
}) {
  const api = useDocStoreApi();
  const density = useDocStore((s) => s.doc.styles.choices.density);
  const bp = useEditBp();
  const [drag, setDrag] = useState<Drag | null>(null);
  const [alt, setAlt] = useState(false);
  const drag$ = useRef<Drag | null>(null);
  const el = elementFor(frameDoc, item);
  if (!el || !frameDoc) return null;
  const win = frameDoc.defaultView;
  if (!win) return null;
  const box = el.getBoundingClientRect();
  const r: Rect = {
    x: box.left * scale,
    y: box.top * scale,
    w: box.width * scale,
    h: box.height * scale,
  };

  const bands: Band[] = [];
  if (item.kind === "section") {
    const cs = win.getComputedStyle(el);
    const top = Number.parseFloat(cs.paddingTop) || 0;
    const bottom = Number.parseFloat(cs.paddingBottom) || 0;
    bands.push({ side: "top", rect: { ...r, h: top * scale }, px: Math.round(top) });
    bands.push({
      side: "bottom",
      rect: { ...r, y: r.y + r.h - bottom * scale, h: bottom * scale },
      px: Math.round(bottom),
    });
  } else if (section.layout.mode === "stack") {
    // The gap to the next block in the same column.
    let next = el.nextElementSibling as HTMLElement | null;
    while (next && !next.matches("[data-os-block]")) next = next.nextElementSibling as HTMLElement;
    if (next) {
      const nb = next.getBoundingClientRect();
      const gap = Math.max(0, nb.top - box.bottom);
      bands.push({
        side: "gap",
        rect: { x: r.x, y: box.bottom * scale, w: r.w, h: gap * scale },
        px: Math.round(gap),
      });
    }
  }
  if (!bands.length) return null;

  const linked =
    section.style.paddingTop === undefined && section.style.paddingBottom === undefined;
  const block = item.kind === "block" ? section.blocks.find((b) => b.id === item.id) : undefined;

  /** One undo step per drag (or per key press): merges only within a gesture. */
  const commit = (side: Side, value: SpaceValue, oneSide: boolean, gesture: number) => {
    const s = api.getState();
    if (side === "gap" && block) {
      s.commit(
        [
          {
            op: "block.update",
            page: container,
            block: block.id,
            spaceBelow: setAt(block.spaceBelow, bp, value, autoSpacing(density, "d").blockGap),
          } as never,
        ],
        { label: "Change space below", mergeKey: `drag-gap:${block.id}:${gesture}` },
      );
      return;
    }
    const st = section.style;
    const base = autoSpacing(density, "d").sectionPad;
    const set: Record<string, Responsive<SpaceValue> | undefined> = {};
    if (linked && !oneSide) {
      set["style.padding"] = setAt(st.padding, bp, value, base);
    } else {
      // One side on its own: the other side keeps what it shows now.
      const key = side === "top" ? "paddingTop" : "paddingBottom";
      const other = side === "top" ? "paddingBottom" : "paddingTop";
      set[`style.${key}`] = setAt(st[key] ?? st.padding, bp, value, base);
      if (st[other] === undefined)
        set[`style.${other}`] = st.padding ?? {
          d: bands.find((b) => b.side !== side)?.px ?? base,
        };
    }
    s.commit([sectionOp(container, section, set)], {
      label: side === "top" ? "Change top spacing" : "Change bottom spacing",
      mergeKey: `drag-pad:${section.id}:${gesture}`,
    });
  };

  const start = (band: Band) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const d: Drag = {
      id: e.timeStamp,
      side: band.side,
      startY: e.clientY,
      startPx: band.px,
      shown: { px: band.px },
    };
    drag$.current = d;
    setDrag(d);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const cur = drag$.current;
      if (!cur) return;
      const dy = (ev.clientY - cur.startY) / scale;
      // Top padding and gaps grow downward; the bottom band's handle sits on its top edge.
      const raw = cur.side === "bottom" ? cur.startPx - dy : cur.startPx + dy;
      const snap = snapPx(raw, density, { free: ev.altKey });
      setAlt(ev.altKey);
      if (snap.px === cur.shown.px) return;
      cur.shown = { px: snap.px, ...(snap.step ? { step: snap.step } : {}) };
      setDrag({ ...cur });
      commit(cur.side, snap.value, ev.shiftKey, cur.id);
    };
    const up = () => {
      drag$.current = null;
      setDrag(null);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const nudge = (band: Band) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? 8 : 1;
    const up = e.key === "ArrowUp";
    // The handle moves with the arrow: up shrinks top padding/gaps, grows bottom padding.
    const delta = band.side === "bottom" ? (up ? step : -step) : up ? -step : step;
    commit(
      band.side,
      snapPx(band.px + delta, density, { free: true }).value,
      e.altKey,
      e.timeStamp,
    );
  };

  const label = (side: Side) =>
    side === "gap"
      ? "Space below this block"
      : linked
        ? "Space above and below the section"
        : side === "top"
          ? "Space above the section's content"
          : "Space below the section's content";

  return (
    <div className="st-sp" data-dragging={drag ? "" : undefined}>
      {bands.map((band) => {
        const active = drag?.side === band.side;
        const px = active ? drag.shown.px : band.px;
        const handleY = band.side === "bottom" ? band.rect.y : band.rect.y + band.rect.h;
        // Off-centre, so the grip never sits on the "+ add section" button or the size badge.
        const handleX = band.rect.x + Math.min(160, band.rect.w * 0.3);
        return (
          <div key={band.side}>
            <div
              className={cx("st-sp__band", active && "is-active")}
              style={{
                left: band.rect.x,
                top: band.rect.y,
                width: band.rect.w,
                height: Math.max(0, band.rect.h),
              }}
            />
            <button
              type="button"
              className={cx("st-sp__handle", active && "is-active")}
              style={{ left: handleX, top: handleY }}
              aria-label={`${label(band.side)}: ${px} pixels. Drag or use the arrow keys.`}
              title="Drag to change · Alt: exact pixels · Shift: this side only"
              disabled={disabled}
              onPointerDown={start(band)}
              onKeyDown={nudge(band)}
            >
              <span className="st-sp__grip" aria-hidden="true" />
            </button>
            {(active || band.rect.h > 18) && (
              <div
                className="st-sp__label"
                style={{
                  left: handleX + 30,
                  top: band.rect.y + Math.max(0, band.rect.h) / 2,
                }}
              >
                <Readout px={px} step={active ? drag.shown.step : undefined} free={alt} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
