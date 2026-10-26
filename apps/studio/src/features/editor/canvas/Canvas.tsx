import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "../../../ui";
import { DEVICE_HEIGHTS, DEVICE_WIDTHS, effectiveZoom, useEditorUi } from "../editor-store";
import { gridController } from "../grid/controller";
import { useDocStore, useDocStoreApi } from "../model/context";
import { locate, type SelItem } from "../model/selection";
import { fieldAtPoint, plainTextTargets } from "../text/fields";
import { setPendingCaret } from "../text/InlineText";
import { type PlainTextSession, startPlainTextEdit } from "../text/plainText";
import { CanvasFrame } from "./CanvasFrame";
import { overlayPointer } from "./geometry";
import { Overlay } from "./Overlay";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** Zoom when the current pinch began (shared across re-bound listeners). */
let pinchStart: number | null = null;

/**
 * Safari reports trackpad pinches as non-standard `gesture*` events (not ctrl+wheel). Zoom from
 * the scale at the start of the gesture.
 */
export function listenSafariPinch(
  target: EventTarget,
  scale: number,
  zoom: (next: number, clientX: number, clientY: number) => void,
): () => void {
  type GestureEvent = Event & { scale: number; clientX: number; clientY: number };
  const onStart = (e: Event) => {
    e.preventDefault();
    pinchStart = scale;
  };
  const onChange = (e: Event) => {
    e.preventDefault();
    const g = e as GestureEvent;
    // `g.scale` is relative to the gesture's start; listeners are re-bound as the zoom changes.
    zoom((pinchStart ?? scale) * g.scale, g.clientX, g.clientY);
    if (e.type === "gestureend") pinchStart = null;
  };
  target.addEventListener("gesturestart", onStart);
  target.addEventListener("gesturechange", onChange);
  target.addEventListener("gestureend", onChange);
  return () => {
    target.removeEventListener("gesturestart", onStart);
    target.removeEventListener("gesturechange", onChange);
    target.removeEventListener("gestureend", onChange);
  };
}

/** What a pointer event in the canvas document points at. */
export function itemAt(target: EventTarget | null): SelItem | null {
  const el = target as Element | null;
  if (!el || typeof el !== "object" || !("closest" in el)) return null;
  const found = el.closest("[data-os-block],[data-os-section]");
  const id = found?.getAttribute("data-os-id");
  if (!found || !id) return null;
  return { kind: found.hasAttribute("data-os-block") ? "block" : "section", id };
}

/**
 * The canvas: a device-width frame (1440/834/390 or fitted) that zooms like Figma
 * (⌘+/⌘−/⌘0, pinch, ctrl/⌘-wheel around the pointer) and pans with space-drag.
 */
export function Canvas({
  siteName,
  onFrameDocument,
}: {
  siteName: string;
  onFrameDocument?: (doc: Document | null) => void;
}) {
  const api = useDocStoreApi();
  const breakpoint = useEditorUi((s) => s.breakpoint);
  const zoom = useEditorUi((s) => s.zoom);
  const fitScale = useEditorUi((s) => s.fitScale);
  const panning = useEditorUi((s) => s.panning);
  const setFitScale = useEditorUi((s) => s.setFitScale);
  const pageTitle = useDocStore((s) => s.doc.pages[s.pageId as never]?.title ?? "");
  const ref = useRef<HTMLElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameDoc, setFrameDoc] = useState<Document | null>(null);
  const device = DEVICE_WIDTHS[breakpoint];
  const scale = effectiveZoom({ zoom, fitScale });
  const [availH, setAvailH] = useState(0);
  // Phones and tablets keep their real screen height; the desktop frame fills the canvas
  // (within a sensible range, since sections sized in viewport units depend on it).
  const viewport =
    breakpoint === "desktop" && availH > 0
      ? Math.round(Math.min(1200, Math.max(640, availH / scale)))
      : DEVICE_HEIGHTS[breakpoint];

  const onDoc = (d: Document | null) => {
    setFrameDoc(d);
    onFrameDocument?.(d);
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const avail = el.clientWidth - (el.clientWidth < 768 ? 24 : 96);
      if (avail > 0) setFitScale(Math.min(1, avail / device));
      setAvailH(el.clientHeight - (el.clientWidth < 768 ? 40 : 96));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [device, setFitScale]);

  // Zoom around a point given in Studio client coordinates.
  const zoomAt = useRef((_next: number, _cx: number, _cy: number) => {});
  zoomAt.current = (next: number, clientX: number, clientY: number) => {
    const el = ref.current;
    const frame = frameRef.current;
    const z = clampZoom(next);
    if (!el || !frame || z === scale) return;
    const fr = frame.getBoundingClientRect();
    // Point in unscaled page pixels under the pointer.
    const px = (clientX - fr.left) / scale;
    const py = (clientY - fr.top) / scale;
    useEditorUi.getState().setZoom(z);
    requestAnimationFrame(() => {
      const nfr = frame.getBoundingClientRect();
      el.scrollLeft += nfr.left + px * z - clientX;
      el.scrollTop += nfr.top + Math.min(py * z, nfr.height) - clientY;
    });
  };

  // ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms; in the canvas area…
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAt.current(scale * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const offGestures = listenSafariPinch(el, scale, (z, x, y) => zoomAt.current(z, x, y));
    return () => {
      el.removeEventListener("wheel", onWheel);
      offGestures();
    };
  }, [scale]);

  // …and over the page itself (events inside the iframe never reach the Studio document).
  useEffect(() => {
    const win = frameDoc?.defaultView;
    const frame = frameRef.current;
    if (!frameDoc || !win || !frame) return;
    const toClient = (x: number, y: number) => {
      const fr = frame.getBoundingClientRect();
      return { x: fr.left + x * scale, y: fr.top + y * scale };
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = toClient(e.clientX, e.clientY);
      zoomAt.current(scale * Math.exp(-e.deltaY * 0.01), p.x, p.y);
    };
    const onMove = (e: PointerEvent) => {
      if (useEditorUi.getState().panning || gridController.active) return;
      api.getState().setHover(itemAt(e.target));
    };
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    const onLeave = () => {
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        if (!overlayPointer.inside) api.getState().setHover(null);
      }, 120);
    };
    /** Start editing the text field under the pointer in this block, if there is one. */
    const editAt = (blockId: string, e: MouseEvent): boolean => {
      const s = api.getState();
      const block = locate(s.doc, s.pageId, { kind: "block", id: blockId })?.block;
      const el = (e.target as Element).closest?.(`[data-os-id="${blockId}"][data-os-block]`);
      if (!block || !el) return false;
      const field = fieldAtPoint(el, block, e.clientX, e.clientY);
      if (!field) return false;
      setPendingCaret({ x: e.clientX, y: e.clientY });
      s.setEditing(block.id, field);
      return true;
    };
    const onClick = (e: MouseEvent) => {
      if (gridController.consumeClick()) {
        // The click that ends a grid drag or marquee.
        e.preventDefault();
        return;
      }
      const s = api.getState();
      const inField = (e.target as Element).closest?.("[data-os-editing-field]");
      if (inField) {
        // Clicks inside the field being edited belong to the editor (never follow links).
        if (inField.hasAttribute("data-os-plain-editing")) e.preventDefault();
        return;
      }
      e.preventDefault();
      const item = itemAt(e.target);
      if (!item) {
        s.select(null);
        return;
      }
      const already =
        s.selection.length === 1 && s.selection[0]?.id === item.id && item.kind === "block";
      if (already && !e.shiftKey && editAt(item.id, e)) return;
      s.select(item, { additive: e.shiftKey });
    };
    const onDblClick = (e: MouseEvent) => {
      const item = itemAt(e.target);
      if (item?.kind !== "block" || (e.target as Element).closest?.("[data-os-editing-field]"))
        return;
      if (editAt(item.id, e)) e.preventDefault();
    };
    const stop = (e: Event) => e.preventDefault();
    // Grid sections: drag blocks to move them, or drag on empty grid space to marquee-select.
    const onDown = (e: PointerEvent) => gridController.pointerDownInFrame(e);
    win.addEventListener("wheel", onWheel, { passive: false });
    const offGestures = listenSafariPinch(win, scale, (z, x, y) => {
      const p = toClient(x, y);
      zoomAt.current(z, p.x, p.y);
    });
    frameDoc.addEventListener("pointermove", onMove);
    frameDoc.addEventListener("pointerdown", onDown);
    frameDoc.documentElement.addEventListener("pointerleave", onLeave);
    frameDoc.addEventListener("click", onClick, true);
    frameDoc.addEventListener("dblclick", onDblClick, true);
    frameDoc.addEventListener("submit", stop, true);
    return () => {
      win.removeEventListener("wheel", onWheel);
      offGestures();
      frameDoc.removeEventListener("pointermove", onMove);
      frameDoc.removeEventListener("pointerdown", onDown);
      frameDoc.documentElement.removeEventListener("pointerleave", onLeave);
      frameDoc.removeEventListener("click", onClick, true);
      frameDoc.removeEventListener("dblclick", onDblClick, true);
      frameDoc.removeEventListener("submit", stop, true);
      clearTimeout(leaveTimer);
    };
  }, [frameDoc, scale, api]);

  // Plain text fields edit in place: one contenteditable session per (block, field).
  useEffect(() => {
    if (!frameDoc) return;
    let session: PlainTextSession | null = null;
    const sync = () => {
      const s = api.getState();
      const want =
        s.editing && s.editingField?.kind === "plain"
          ? { blockId: s.editing, path: s.editingField.path }
          : null;
      if (session && (!want || want.blockId !== session.blockId || want.path !== session.path)) {
        const old = session;
        session = null;
        old.end(true);
      }
      if (want && !session) {
        const block = locate(s.doc, s.pageId, { kind: "block", id: want.blockId })?.block;
        const el = frameDoc.querySelector(`[data-os-id="${want.blockId}"][data-os-block]`);
        const target = block && el ? plainTextTargets(el, block).get(want.path) : undefined;
        if (!target) {
          s.setEditing(null);
          return;
        }
        session = startPlainTextEdit(api, target, want.blockId, want.path);
      }
    };
    sync();
    const unsubscribe = api.subscribe((st, prev) => {
      if (st.editing !== prev.editing || st.editingField !== prev.editingField) sync();
    });
    return () => {
      unsubscribe();
      session?.end(true);
    };
  }, [frameDoc, api]);

  // Space-drag panning: moves the canvas, or scrolls the page when the canvas can't move.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPanDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPanMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = ref.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    drag.current = { x: e.clientX, y: e.clientY };
    const beforeTop = el.scrollTop;
    el.scrollLeft -= dx;
    el.scrollTop -= dy;
    if (el.scrollTop === beforeTop && dy !== 0) frameDoc?.defaultView?.scrollBy(0, -dy / scale);
  };
  const onPanUp = () => {
    drag.current = null;
  };

  const w = Math.round(device * scale);
  const h = Math.round(viewport * scale);
  return (
    <section
      ref={ref}
      className={cx("st-ed-canvas", panning && "is-panning")}
      aria-label="Canvas"
      data-editor-surface=""
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) api.getState().select(null);
      }}
    >
      <div
        ref={frameRef}
        className={cx("st-ed-canvas__frame", `st-ed-canvas__frame--${breakpoint}`)}
        style={{ width: w, height: h }}
      >
        <span className="st-ed-canvas__label">
          {pageTitle || siteName} <span className="st-num">{device}</span>
        </span>
        <div className="st-ed-canvas__viewport">
          <CanvasFrame width={device} height={viewport} scale={scale} onDocument={onDoc} />
        </div>
        <Overlay frameDoc={frameDoc} scale={scale} width={w} height={h} />
        {panning && (
          <div
            className="st-ed-canvas__pan"
            onPointerDown={onPanDown}
            onPointerMove={onPanMove}
            onPointerUp={onPanUp}
            onPointerCancel={onPanUp}
          />
        )}
      </div>
    </section>
  );
}
