import type { GridRect } from "@openspace/schema";
import { create } from "zustand";
import { toast } from "../../../ui";
import { frameTickFreeze } from "../canvas/geometry";
import { useEditorUi } from "../editor-store";
import type { Command } from "../model/actions";
import { locate, type SelItem } from "../model/selection";
import type { EditorStore } from "../model/store";
import { gridCaps, type Role } from "./caps";
import { duplicateCommand, placeCommand } from "./commands";
import {
  type Box,
  canBleed,
  constrainAxis,
  type Device,
  displayRects,
  editBp,
  type GridBp,
  type GridMetrics,
  type GridSection,
  type Handle,
  isGridSection,
  isMobileAuto,
  metricsFromTracks,
  parseTracks,
  planMove,
  ROW_PX,
  rectBox,
  resizeRect,
  smartGuides,
  textOverlaps,
  VIEW_BP,
} from "./model";

/**
 * The grid drag loop. Pointer events feed an imperative session; every animation frame the
 * session recomputes the snapped placement and writes positions straight into the overlay's
 * DOM (CSS transforms) — React renders only when a drag starts and ends. On drop one command
 * (one undo step) writes a `grid.place` per moved item, or `block.insert`s for an ⌥-drag copy.
 */

/** Coarse drag state for React: which section is being arranged, and how. */
export interface ActiveDrag {
  sectionId: string;
  kind: "move" | "resize" | "marquee";
  ids: string[];
}
export const useGridDrag = create<{ active: ActiveDrag | null }>(() => ({ active: null }));

/** DOM layers the drag loop draws into (owned by `GridLayer`). */
export interface GridLayers {
  ghosts: HTMLElement | null;
  guides: HTMLElement | null;
  marquee: HTMLElement | null;
  badge: HTMLElement | null;
  readout: HTMLElement | null;
  /** The column/row guides (shifted while the canvas auto-scrolls). */
  lines?: HTMLElement | null;
}

export interface GridContext {
  frameDoc: Document | null;
  scale: number;
  store: EditorStore;
  device: Device;
  role: Role;
  phone: boolean;
  /** The overlay root in the Studio document (same origin as the iframe's viewport). */
  overlay: HTMLElement | null;
  layers: GridLayers;
  /** Override geometry measuring (tests). */
  measure?: (sectionId: string, view: GridBp) => GridMetrics | null;
  raf?: (cb: () => void) => number;
  cancelRaf?: (id: number) => void;
}

/** Auto-scroll zone at the canvas's top/bottom edge, and the fastest scroll per frame (page px). */
const AUTO_SCROLL_EDGE = 48;
const AUTO_SCROLL_MAX = 24;

/** Pixels the pointer travels before a press becomes a drag. */
export const DRAG_THRESHOLD = 4;

/** Measure a grid section's tracks from the canvas (page px, scroll included). */
export function measureGrid(
  frameDoc: Document | null,
  sectionId: string,
  view: GridBp,
): GridMetrics | null {
  const win = frameDoc?.defaultView;
  if (!frameDoc || !win) return null;
  const sec = frameDoc.querySelector(`[data-os-id="${CSS.escape(sectionId)}"][data-os-section]`);
  const grid = sec?.querySelector<HTMLElement>(".os-grid");
  if (!grid) return null;
  const r = grid.getBoundingClientRect();
  const cs = win.getComputedStyle(grid);
  const rem = Number.parseFloat(win.getComputedStyle(frameDoc.documentElement).fontSize) || 16;
  const unitRaw = cs.getPropertyValue("--row-unit").trim();
  const unit = unitRaw.endsWith("rem")
    ? Number.parseFloat(unitRaw) * rem
    : Number.parseFloat(unitRaw) || ROW_PX[view];
  const cols = view === "m" ? 8 : 24;
  const rows = parseTracks(cs.gridTemplateRows);
  return metricsFromTracks({
    left: r.left + win.scrollX,
    top: r.top + win.scrollY,
    width: r.width,
    cols,
    columns: parseTracks(cs.gridTemplateColumns),
    columnGap: Number.parseFloat(cs.columnGap) || 0,
    rows,
    rowGap: Number.parseFloat(cs.rowGap) || 0,
    rowUnit: unit,
    rowCount: Math.max(1, Math.round(r.height / unit)),
  });
}

interface BaseSession {
  pointerId: number;
  sectionId: string;
  section: GridSection;
  view: GridBp;
  bp: GridBp;
  metrics: GridMetrics;
  /** Pointer at press, in page px. */
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  /** Last pointer position in the canvas viewport (page px, scroll excluded). */
  cx: number;
  cy: number;
  /** Canvas scroll when the drag started (to shift the static guides while auto-scrolling). */
  scrollY0: number;
  shift: boolean;
  alt: boolean;
  started: boolean;
  /** Where pointer coordinates come from. */
  source: "frame" | "studio";
  cleanup: Array<() => void>;
}

interface MoveSession extends BaseSession {
  kind: "move";
  ids: string[];
  primary: number;
  start: GridRect[];
  bleed: boolean[];
  others: Box[];
  plan: GridRect[];
}

interface ResizeSession extends BaseSession {
  kind: "resize";
  id: string;
  handle: Handle;
  start: GridRect;
  bleed: boolean;
  others: Box[];
  plan: GridRect;
}

interface MarqueeSession extends BaseSession {
  kind: "marquee";
  boxes: Array<{ id: string; box: Box }>;
  picked: string;
  /** ⇧-marquee adds to these. */
  base: string[];
}

type Session = MoveSession | ResizeSession | MarqueeSession;

export class GridController {
  ctx: GridContext | null = null;
  session: Session | null = null;
  private raf = 0;
  private suppressClick = false;
  /** Frames drawn (for the perf test and the fps note). */
  frames = 0;

  get active(): boolean {
    return Boolean(this.session?.started);
  }

  /** A click that ends a drag must not also select or start text editing. */
  consumeClick(): boolean {
    const s = this.suppressClick;
    this.suppressClick = false;
    return s;
  }

  private view(): GridBp {
    return VIEW_BP[this.ctx?.device ?? "desktop"];
  }

  private measure(sectionId: string, view: GridBp): GridMetrics | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    return ctx.measure ? ctx.measure(sectionId, view) : measureGrid(ctx.frameDoc, sectionId, view);
  }

  private scroll(): { x: number; y: number } {
    const win = this.ctx?.frameDoc?.defaultView;
    return { x: win?.scrollX ?? 0, y: win?.scrollY ?? 0 };
  }

  /** A pointer event's position in page px. */
  private point(e: PointerEvent, source: "frame" | "studio"): { x: number; y: number } {
    const sc = this.scroll();
    if (source === "frame") return { x: e.clientX + sc.x, y: e.clientY + sc.y };
    const ctx = this.ctx;
    const o = ctx?.overlay?.getBoundingClientRect();
    const scale = ctx?.scale || 1;
    return {
      x: (e.clientX - (o?.left ?? 0)) / scale + sc.x,
      y: (e.clientY - (o?.top ?? 0)) / scale + sc.y,
    };
  }

  /**
   * Pointer down inside the canvas document. Starts a pending move (on a grid block the person
   * may arrange) or a pending marquee (on empty grid space). Returns true when it took the press.
   */
  pointerDownInFrame(e: PointerEvent): boolean {
    // A fresh press: whatever an Esc-cancelled drag left to swallow is over.
    if (!this.session) this.suppressClick = false;
    const ctx = this.ctx;
    if (!ctx || this.session || e.button !== 0 || ctx.phone) return false;
    if (useEditorUi.getState().panning) return false;
    const target = e.target as Element | null;
    if (!target || typeof target.closest !== "function") return false;
    if (target.closest("[data-os-editing-field]")) return false;
    const s = ctx.store.getState();
    const blockEl = target.closest("[data-os-block]");
    const view = this.view();
    if (blockEl) {
      const id = blockEl.getAttribute("data-os-id") ?? "";
      const loc = locate(s.doc, s.pageId, { kind: "block", id });
      if (!loc || !isGridSection(loc.section) || s.editing === id) return false;
      if (!gridCaps(ctx.role, loc.section).edit) return false;
      const section = loc.section;
      const metrics = this.measure(section.id, view);
      if (!metrics) return false;
      const inSection = new Set(section.blocks.map((b) => b.id as string));
      const selected = s.selection.filter((i) => i.kind === "block" && inSection.has(i.id));
      const ids = selected.some((i) => i.id === id) ? selected.map((i) => i.id) : [id];
      const rects = displayRects(section.layout, view);
      const start = ids.map((i) => rects.get(i)).filter((r): r is GridRect => Boolean(r));
      if (start.length !== ids.length) return false;
      const p = this.point(e, "frame");
      const others = [...rects.entries()]
        .filter(([o]) => !ids.includes(o))
        .map(([, r]) => rectBox(metrics, r));
      this.begin(
        {
          kind: "move",
          pointerId: e.pointerId,
          sectionId: section.id,
          section,
          view,
          bp: editBp(ctx.device, section.layout),
          metrics,
          x0: p.x,
          y0: p.y,
          dx: 0,
          dy: 0,
          cx: p.x - this.scroll().x,
          cy: p.y - this.scroll().y,
          scrollY0: this.scroll().y,
          shift: e.shiftKey,
          alt: e.altKey,
          started: false,
          source: "frame",
          cleanup: [],
          ids,
          primary: ids.indexOf(id),
          start,
          bleed: ids.map((i) => canBleed(section.blocks.find((b) => b.id === i))),
          others,
          plan: start,
        },
        target,
      );
      return true;
    }
    const secEl = target.closest("[data-os-section]");
    const secId = secEl?.getAttribute("data-os-id") ?? "";
    const loc = locate(s.doc, s.pageId, { kind: "section", id: secId });
    if (!loc || !isGridSection(loc.section)) return false;
    const metrics = this.measure(loc.section.id, view);
    if (!metrics) return false;
    const p = this.point(e, "frame");
    const rects = displayRects(loc.section.layout, view);
    this.begin(
      {
        kind: "marquee",
        pointerId: e.pointerId,
        sectionId: loc.section.id,
        section: loc.section,
        view,
        bp: view,
        metrics,
        x0: p.x,
        y0: p.y,
        dx: 0,
        dy: 0,
        cx: p.x - this.scroll().x,
        cy: p.y - this.scroll().y,
        scrollY0: this.scroll().y,
        shift: e.shiftKey,
        alt: false,
        started: false,
        source: "frame",
        cleanup: [],
        boxes: [...rects.entries()].map(([id, r]) => ({ id, box: rectBox(metrics, r) })),
        picked: "",
        base: e.shiftKey ? s.selection.filter((i) => i.kind === "block").map((i) => i.id) : [],
      },
      target,
    );
    return true;
  }

  /** Pointer down on one of the 8 resize handles (in the Studio overlay). */
  pointerDownOnHandle(e: PointerEvent, blockId: string, handle: Handle): boolean {
    const ctx = this.ctx;
    if (!ctx || this.session || e.button !== 0 || ctx.phone) return false;
    const s = ctx.store.getState();
    const loc = locate(s.doc, s.pageId, { kind: "block", id: blockId });
    if (!loc || !isGridSection(loc.section) || !gridCaps(ctx.role, loc.section).edit) return false;
    const view = this.view();
    const metrics = this.measure(loc.section.id, view);
    const rects = displayRects(loc.section.layout, view);
    const start = rects.get(blockId);
    if (!metrics || !start) return false;
    e.preventDefault();
    e.stopPropagation();
    const p = this.point(e, "studio");
    this.begin(
      {
        kind: "resize",
        pointerId: e.pointerId,
        sectionId: loc.section.id,
        section: loc.section,
        view,
        bp: editBp(ctx.device, loc.section.layout),
        metrics,
        x0: p.x,
        y0: p.y,
        dx: 0,
        dy: 0,
        cx: p.x - this.scroll().x,
        cy: p.y - this.scroll().y,
        scrollY0: this.scroll().y,
        shift: e.shiftKey,
        alt: false,
        started: false,
        source: "studio",
        cleanup: [],
        id: blockId,
        handle,
        start,
        bleed: canBleed(loc.block),
        others: [...rects.entries()]
          .filter(([o]) => o !== blockId)
          .map(([, r]) => rectBox(metrics, r)),
        plan: start,
      },
      e.target as Element | null,
    );
    return true;
  }

  private begin(session: Session, target: Element | null) {
    this.session = session;
    const ctx = this.ctx as GridContext;
    const doc = session.source === "frame" ? ctx.frameDoc : (target?.ownerDocument ?? null);
    const win = doc?.defaultView;
    try {
      (target as HTMLElement | null)?.setPointerCapture?.(session.pointerId);
    } catch {
      // Capture is best effort (synthetic events in tests have no active pointer).
    }
    const onMove = (ev: Event) => this.onMove(ev as PointerEvent);
    const onUp = (ev: Event) => this.onUp(ev as PointerEvent);
    const onCancel = () => this.cancel();
    const onKey = (ev: Event) => {
      const k = ev as KeyboardEvent;
      if (k.key === "Escape" && this.session) {
        k.preventDefault();
        k.stopPropagation();
        this.cancel(true);
        return;
      }
      if (k.key === "Alt" || k.key === "Shift") {
        const sess = this.session;
        if (!sess) return;
        sess.alt = k.altKey;
        sess.shift = k.shiftKey;
        this.schedule();
      }
    };
    // Images and links would start a native drag (and cancel the pointer stream).
    const noNativeDrag = (ev: Event) => ev.preventDefault();
    for (const d of [ctx.frameDoc, doc]) {
      if (!d) continue;
      d.addEventListener("dragstart", noNativeDrag, true);
      session.cleanup.push(() => d.removeEventListener("dragstart", noNativeDrag, true));
    }
    const targets: Array<Document | Window> = [];
    if (win) targets.push(win);
    if (ctx.frameDoc?.defaultView && ctx.frameDoc.defaultView !== win)
      targets.push(ctx.frameDoc.defaultView);
    if (typeof window !== "undefined" && !targets.includes(window)) targets.push(window);
    for (const t of targets) {
      t.addEventListener("pointermove", onMove, true);
      t.addEventListener("pointerup", onUp, true);
      t.addEventListener("pointercancel", onCancel, true);
      t.addEventListener("keydown", onKey, true);
      t.addEventListener("keyup", onKey, true);
      session.cleanup.push(() => {
        t.removeEventListener("pointermove", onMove, true);
        t.removeEventListener("pointerup", onUp, true);
        t.removeEventListener("pointercancel", onCancel, true);
        t.removeEventListener("keydown", onKey, true);
        t.removeEventListener("keyup", onKey, true);
      });
    }
  }

  private onMove(e: PointerEvent) {
    const s = this.session;
    if (!s || e.pointerId !== s.pointerId) return;
    // Events reach us from both documents while captured; use the one we started in.
    const fromFrame = (e.target as Node | null)?.ownerDocument === this.ctx?.frameDoc;
    if ((s.source === "frame") !== fromFrame && e.view) return;
    const p = this.point(e, s.source);
    s.dx = p.x - s.x0;
    s.dy = p.y - s.y0;
    const sc = this.scroll();
    s.cx = p.x - sc.x;
    s.cy = p.y - sc.y;
    s.shift = e.shiftKey;
    if (s.kind === "move") s.alt = e.altKey;
    if (!s.started) {
      if (s.kind !== "resize" && Math.hypot(s.dx, s.dy) < DRAG_THRESHOLD) return;
      this.start(s);
    }
    this.schedule();
  }

  private start(s: Session) {
    const ctx = this.ctx as GridContext;
    s.started = true;
    frameTickFreeze.active = true;
    const st = ctx.store.getState();
    st.setHover(null);
    if (s.kind === "move") {
      const sel = s.ids.map((id): SelItem => ({ kind: "block", id }));
      const same =
        st.selection.length === sel.length &&
        sel.every((i) => st.selection.some((x) => x.kind === i.kind && x.id === i.id));
      if (!same) st.setSelection(sel);
    }
    const root = ctx.frameDoc?.documentElement;
    if (root) root.style.userSelect = "none";
    ctx.frameDoc?.getSelection?.()?.removeAllRanges();
    useGridDrag.setState({
      active: {
        sectionId: s.sectionId,
        kind: s.kind,
        ids: s.kind === "move" ? s.ids : s.kind === "resize" ? [s.id] : [],
      },
    });
  }

  private schedule() {
    if (this.raf) return;
    const raf = this.ctx?.raf ?? ((cb: () => void) => requestAnimationFrame(cb));
    this.raf = raf(() => {
      this.raf = 0;
      this.frame();
    });
  }

  /** One animation frame: recompute the snapped placement and draw it (no React). */
  frame() {
    const s = this.session;
    const ctx = this.ctx;
    if (!s || !ctx || !s.started) return;
    this.frames++;
    const scrolling = this.autoScroll(s);
    let { dx, dy } = s;
    if (s.shift && s.kind === "move") ({ dx, dy } = constrainAxis(dx, dy));
    const m = s.metrics;
    if (s.kind === "move") {
      s.plan = planMove(m, s.start, s.primary, dx, dy, { bleed: s.bleed }).rects;
      const boxes = s.plan.map((r) => rectBox(m, r));
      const floats = s.start.map((r) => {
        const b = rectBox(m, r);
        return { ...b, x: b.x + dx, y: b.y + dy };
      });
      this.drawGhosts(boxes, floats, s.alt);
      this.drawGuides(boxes[s.primary] as Box, s.others, m);
      const rects = new Map(displayRects(s.section.layout, s.view));
      s.ids.forEach((id, i) => {
        rects.set(id, s.plan[i] as GridRect);
      });
      this.drawBadge(
        textOverlaps(s.section, rects, s.ids).length > 0 && !s.alt,
        boxes[s.primary] as Box,
        s.plan[s.primary] as GridRect,
      );
    } else if (s.kind === "resize") {
      // ⇧ keeps the proportions.
      s.plan = resizeRect(m, s.start, s.handle, dx, dy, { bleed: s.bleed, keepAspect: s.shift });
      const box = rectBox(m, s.plan);
      this.drawGhosts([box], [], false);
      this.drawGuides(box, s.others, m);
      const rects = new Map(displayRects(s.section.layout, s.view));
      rects.set(s.id, s.plan);
      this.drawBadge(textOverlaps(s.section, rects, [s.id]).length > 0, box, s.plan);
    } else {
      const box: Box = {
        x: Math.min(s.x0, s.x0 + dx),
        y: Math.min(s.y0, s.y0 + dy),
        w: Math.abs(dx),
        h: Math.abs(dy),
      };
      this.drawMarquee(box);
      const hit = s.boxes
        .filter(
          ({ box: b }) =>
            b.x < box.x + box.w && box.x < b.x + b.w && b.y < box.y + box.h && box.y < b.y + b.h,
        )
        .map((b) => b.id);
      const picked = [...s.base, ...hit.filter((id) => !s.base.includes(id))];
      const key = picked.join(",");
      if (key !== s.picked) {
        s.picked = key;
        ctx.store.getState().setSelection(picked.map((id) => ({ kind: "block", id })));
      }
    }
    if (scrolling) this.schedule();
  }

  /**
   * Near the top/bottom of the canvas the page scrolls by itself (faster closer to the edge);
   * the pointer's page position follows the scroll. Returns true while it keeps scrolling.
   */
  private autoScroll(s: Session): boolean {
    const win = this.ctx?.frameDoc?.defaultView;
    const root = this.ctx?.frameDoc?.documentElement;
    if (!win || !root || root.scrollHeight <= win.innerHeight) return false;
    const vh = win.innerHeight;
    let v = 0;
    if (s.cy < AUTO_SCROLL_EDGE) v = -Math.min(AUTO_SCROLL_MAX, (AUTO_SCROLL_EDGE - s.cy) / 2);
    else if (s.cy > vh - AUTO_SCROLL_EDGE)
      v = Math.min(AUTO_SCROLL_MAX, (s.cy - (vh - AUTO_SCROLL_EDGE)) / 2);
    if (!v) return false;
    const before = win.scrollY;
    win.scrollBy(0, Math.round(v) || Math.sign(v));
    if (win.scrollY === before) return false;
    const sc = this.scroll();
    s.dx = s.cx + sc.x - s.x0;
    s.dy = s.cy + sc.y - s.y0;
    const lines = this.ctx?.layers.lines;
    if (lines)
      lines.style.transform = `translateY(${-(sc.y - s.scrollY0) * (this.ctx?.scale ?? 1)}px)`;
    return true;
  }

  /** Page px → overlay px. */
  private toOverlay(b: Box): Box {
    const sc = this.scroll();
    const k = this.ctx?.scale ?? 1;
    return { x: (b.x - sc.x) * k, y: (b.y - sc.y) * k, w: b.w * k, h: b.h * k };
  }

  private pool(container: HTMLElement | null, n: number, className: string): HTMLElement[] {
    if (!container) return [];
    const doc = container.ownerDocument;
    const kids = [...container.children].filter((c) => c.classList.contains(className));
    while (kids.length < n) {
      const el = doc.createElement("div");
      el.className = className;
      container.appendChild(el);
      kids.push(el);
    }
    kids.forEach((k, i) => {
      (k as HTMLElement).style.display = i < n ? "" : "none";
    });
    return kids.slice(0, n) as HTMLElement[];
  }

  private place(el: HTMLElement, b: Box) {
    const o = this.toOverlay(b);
    el.style.transform = `translate3d(${o.x}px, ${o.y}px, 0)`;
    el.style.width = `${Math.max(0, o.w)}px`;
    el.style.height = `${Math.max(0, o.h)}px`;
  }

  private drawGhosts(targets: Box[], floats: Box[], copy: boolean) {
    const layer = this.ctx?.layers.ghosts ?? null;
    layer?.toggleAttribute("data-copy", copy);
    this.pool(layer, targets.length, "st-grid__ghost").forEach((el, i) => {
      this.place(el, targets[i] as Box);
    });
    this.pool(layer, floats.length, "st-grid__float").forEach((el, i) => {
      this.place(el, floats[i] as Box);
    });
  }

  private drawGuides(box: Box, others: Box[], m: GridMetrics) {
    const layer = this.ctx?.layers.guides ?? null;
    const section: Box = {
      x: m.colStarts[0] as number,
      y: m.top,
      w: (m.colEnds[m.cols - 1] as number) - (m.colStarts[0] as number),
      h: Math.max(1, (m.rowEnds[m.rowEnds.length - 1] ?? m.top) - m.top),
    };
    const { guides, distances } = smartGuides(box, others, section);
    this.pool(layer, guides.length, "st-grid__guide").forEach((el, i) => {
      const g = guides[i] as (typeof guides)[number];
      el.dataset.kind = g.kind;
      this.place(
        el,
        g.axis === "x"
          ? { x: g.pos, y: g.from, w: 0, h: g.to - g.from }
          : { x: g.from, y: g.pos, w: g.to - g.from, h: 0 },
      );
    });
    this.pool(layer, distances.length, "st-grid__dist").forEach((el, i) => {
      const d = distances[i] as (typeof distances)[number];
      el.dataset.axis = d.axis;
      el.dataset.value = String(Math.round(d.value));
      this.place(
        el,
        d.axis === "x"
          ? { x: d.from, y: d.at, w: d.to - d.from, h: 0 }
          : { x: d.at, y: d.from, w: 0, h: d.to - d.from },
      );
    });
  }

  private drawBadge(show: boolean, box: Box, rect: GridRect) {
    const badge = this.ctx?.layers.badge;
    const label = this.ctx?.layers.readout;
    if (label) {
      label.textContent = `${rect.w} × ${rect.h}${rect.bleed ? " · bleed" : ""}`;
      const o = this.toOverlay(box);
      label.style.transform = `translate3d(${o.x + o.w / 2}px, ${o.y + o.h + 6}px, 0) translateX(-50%)`;
      label.style.display = "";
    }
    if (!badge) return;
    badge.style.display = show ? "" : "none";
    if (show) {
      const o = this.toOverlay(box);
      badge.style.transform = `translate3d(${o.x}px, ${Math.max(0, o.y - 26)}px, 0)`;
    }
  }

  private drawMarquee(b: Box) {
    const el = this.ctx?.layers.marquee;
    if (!el) return;
    el.style.display = "";
    this.place(el, b);
  }

  private onUp(e: PointerEvent) {
    const s = this.session;
    if (!s || e.pointerId !== s.pointerId) return;
    if (!s.started) {
      this.end(false);
      return;
    }
    // Final position from the last pointer event.
    const p = this.point(e, s.source);
    const fromFrame = (e.target as Node | null)?.ownerDocument === this.ctx?.frameDoc;
    if ((s.source === "frame") === fromFrame || !e.view) {
      s.dx = p.x - s.x0;
      s.dy = p.y - s.y0;
    }
    this.frame();
    const ctx = this.ctx as GridContext;
    const st = ctx.store.getState();
    let cmd: Command | null = null;
    if (s.kind === "move") {
      const edits = s.ids.map((id, i) => ({ id, rect: s.plan[i] as GridRect }));
      cmd = s.alt
        ? duplicateCommand(st.doc, st.pageId, s.sectionId, edits, s.bp)
        : placeCommand(st.doc, st.pageId, s.sectionId, edits, s.bp, "Move on grid");
    } else if (s.kind === "resize") {
      cmd = placeCommand(
        st.doc,
        st.pageId,
        s.sectionId,
        [{ id: s.id, rect: s.plan }],
        s.bp,
        "Resize on grid",
      );
    }
    this.end(true);
    if (!cmd) return;
    const r = st.run(cmd);
    if (r.ok && s.bp === "d" && s.kind !== "marquee") this.remindPhone(s.section);
  }

  readonly reminded = new Set<string>();

  /**
   * Doc 04 §9 rule 9 ("after any grid change, review the mobile placement"): a section with its
   * own phone layout doesn't follow desktop edits, so say so once per section.
   */
  private remindPhone(section: GridSection) {
    if (this.reminded.has(section.id) || isMobileAuto(section)) return;
    this.reminded.add(section.id);
    toast({
      title: "Check the phone layout",
      description:
        "This section has its own phone arrangement, so desktop changes don’t move it. Review it in Phone view, or use “Reset mobile layout” to rebuild it from desktop.",
    });
  }

  /** Stop the drag without changing anything (a marquee keeps what it selected). */
  cancel(escaped = false) {
    this.end(Boolean(this.session?.started), escaped);
  }

  private end(dragged: boolean, escaped = false) {
    const s = this.session;
    if (!s) return;
    for (const c of s.cleanup) c();
    this.session = null;
    if (this.raf) {
      (this.ctx?.cancelRaf ?? ((id: number) => cancelAnimationFrame(id)))(this.raf);
      this.raf = 0;
    }
    const ctx = this.ctx;
    const root = ctx?.frameDoc?.documentElement;
    if (root && s.started) root.style.userSelect = "";
    for (const layer of [ctx?.layers.ghosts, ctx?.layers.guides]) {
      for (const k of [...(layer?.children ?? [])]) (k as HTMLElement).style.display = "none";
    }
    if (ctx?.layers.readout) ctx.layers.readout.style.display = "none";
    if (ctx?.layers.marquee) ctx.layers.marquee.style.display = "none";
    if (ctx?.layers.badge) ctx.layers.badge.style.display = "none";
    if (ctx?.layers.lines) ctx.layers.lines.style.transform = "";
    frameTickFreeze.active = false;
    if (dragged) {
      // The click that follows pointerup belongs to the drag. After Esc the button is still
      // down, so the click comes later: keep swallowing it until the next press.
      this.suppressClick = true;
      if (!escaped)
        setTimeout(() => {
          this.suppressClick = false;
        }, 0);
      useGridDrag.setState({ active: null });
      // Let the overlay re-measure (scrolls during the drag were not tracked).
      ctx?.frameDoc?.defaultView?.dispatchEvent(new Event("resize"));
    }
  }
}

/** The one controller for the canvas (there is one canvas per Studio window). */
export const gridController = new GridController();

// Dev builds expose the controller for profiling the drag loop from the console.
if (import.meta.env?.DEV && typeof window !== "undefined")
  (window as unknown as { __osGrid?: GridController }).__osGrid = gridController;
