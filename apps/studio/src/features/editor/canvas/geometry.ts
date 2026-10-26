import { useEffect, useState } from "react";
import type { SelItem } from "../model/selection";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The canvas element for a section/block id. */
export function elementFor(frameDoc: Document | null, item: SelItem): HTMLElement | null {
  if (!frameDoc) return null;
  const attr = item.kind === "block" ? "data-os-block" : "data-os-section";
  return frameDoc.querySelector<HTMLElement>(`[data-os-id="${CSS.escape(item.id)}"][${attr}]`);
}

/**
 * An element's box in overlay coordinates: iframe viewport pixels times the zoom. Overlays are
 * drawn in the Studio document so outlines and handles stay 1px-crisp at any zoom.
 */
export function rectFor(frameDoc: Document | null, item: SelItem, scale: number): Rect | null {
  const el = elementFor(frameDoc, item);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left * scale, y: r.top * scale, w: r.width * scale, h: r.height * scale };
}

/** Unscaled CSS size (what the page actually measures), for the size readout. */
export function cssSize(frameDoc: Document | null, item: SelItem): { w: number; h: number } | null {
  const el = elementFor(frameDoc, item);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height) };
}

/**
 * A counter that bumps (once per animation frame at most) whenever canvas geometry may have
 * changed: scrolling, resizing, layout changes, fonts or images loading.
 */
export function useFrameTick(frameDoc: Document | null, deps: unknown[] = []): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const win = frameDoc?.defaultView;
    if (!frameDoc || !win) return;
    let raf = 0;
    const bump = () => {
      if (raf) return;
      raf = win.requestAnimationFrame(() => {
        raf = 0;
        setTick((t) => t + 1);
      });
    };
    win.addEventListener("scroll", bump, { passive: true });
    win.addEventListener("resize", bump);
    frameDoc.addEventListener("load", bump, true);
    const RO = (win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    const ro = RO ? new RO(bump) : null;
    ro?.observe(frameDoc.body);
    const MO = (win as unknown as { MutationObserver?: typeof MutationObserver }).MutationObserver;
    const mo = MO ? new MO(bump) : null;
    mo?.observe(frameDoc.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    frameDoc.fonts?.ready.then(bump).catch(() => {});
    bump();
    return () => {
      if (raf) win.cancelAnimationFrame(raf);
      win.removeEventListener("scroll", bump);
      win.removeEventListener("resize", bump);
      frameDoc.removeEventListener("load", bump, true);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [frameDoc, ...deps]);
  return tick;
}

/**
 * Whether the pointer is over canvas chrome (toolbars, "+" buttons). Moving from the page onto
 * that chrome leaves the iframe, which must not clear the hover the chrome belongs to.
 */
export const overlayPointer = { inside: false };
