import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "../../../ui";
import { DEVICE_HEIGHTS, DEVICE_WIDTHS, effectiveZoom, useEditorUi } from "../editor-store";
import { useDocStore, useDocStoreApi } from "../model/context";
import { locate, type SelItem } from "../model/selection";
import { canEditInline, setPendingCaret } from "../text/InlineText";
import { CanvasFrame } from "./CanvasFrame";
import { overlayPointer } from "./geometry";
import { Overlay } from "./Overlay";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

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
    return () => el.removeEventListener("wheel", onWheel);
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
      if (useEditorUi.getState().panning) return;
      api.getState().setHover(itemAt(e.target));
    };
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    const onLeave = () => {
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        if (!overlayPointer.inside) api.getState().setHover(null);
      }, 120);
    };
    const onClick = (e: MouseEvent) => {
      const s = api.getState();
      const item = itemAt(e.target);
      const editingEl = s.editing
        ? (e.target as Element).closest?.(`[data-os-id="${s.editing}"]`)
        : null;
      if (editingEl) return; // clicks inside the text being edited belong to the editor
      e.preventDefault();
      if (!item) {
        s.select(null);
        return;
      }
      const already = s.selection.length === 1 && s.selection[0]?.id === item.id;
      if (already && item.kind === "block" && !e.shiftKey) {
        const block = locate(s.doc, s.pageId, item)?.block;
        if (block && canEditInline(block)) {
          setPendingCaret({ x: e.clientX, y: e.clientY });
          s.setEditing(block.id);
          return;
        }
      }
      s.select(item, { additive: e.shiftKey });
    };
    const onDblClick = (e: MouseEvent) => {
      const s = api.getState();
      const item = itemAt(e.target);
      if (item?.kind !== "block" || s.editing === item.id) return;
      const block = locate(s.doc, s.pageId, item)?.block;
      if (block && canEditInline(block)) {
        e.preventDefault();
        setPendingCaret({ x: e.clientX, y: e.clientY });
        s.setEditing(block.id);
      }
    };
    const stop = (e: Event) => e.preventDefault();
    win.addEventListener("wheel", onWheel, { passive: false });
    frameDoc.addEventListener("pointermove", onMove);
    frameDoc.documentElement.addEventListener("pointerleave", onLeave);
    frameDoc.addEventListener("click", onClick, true);
    frameDoc.addEventListener("dblclick", onDblClick, true);
    frameDoc.addEventListener("submit", stop, true);
    return () => {
      win.removeEventListener("wheel", onWheel);
      frameDoc.removeEventListener("pointermove", onMove);
      frameDoc.documentElement.removeEventListener("pointerleave", onLeave);
      frameDoc.removeEventListener("click", onClick, true);
      frameDoc.removeEventListener("dblclick", onDblClick, true);
      frameDoc.removeEventListener("submit", stop, true);
      clearTimeout(leaveTimer);
    };
  }, [frameDoc, scale, api]);

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
