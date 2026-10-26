import type { GridRect, SiteDocument } from "@openspace/schema";
import {
  ArrowDownToLine,
  BringToFront,
  ListOrdered,
  RotateCcw,
  SendToBack,
  TriangleAlert,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button, cx, IconButton, Toggle, Tooltip } from "../../../ui";
import { useInspectorRole } from "../../inspector/env";
import { rectFor } from "../canvas/geometry";
import { useEditorUi } from "../editor-store";
import { useDocStore, useDocStoreApi } from "../model/context";
import { locate, type SelItem } from "../model/selection";
import { gridCaps, usePhoneViewport } from "./caps";
import {
  customizeTabletCommand,
  emptyTrailingRows,
  resetMobileCommand,
  trimRowsCommand,
  zOrderCommand,
} from "./commands";
import { gridController, measureGrid, useGridDrag } from "./controller";
import {
  type Box,
  colEnd,
  colStart,
  displayRects,
  editBp,
  type GridMetrics,
  type GridSection,
  HANDLES,
  type Handle,
  isGridSection,
  isMobileAuto,
  rectBox,
  rowEnd,
  tabletCustomized,
  textOverlaps,
  VIEW_BP,
  type ZAction,
} from "./model";
import { PhoneReorder } from "./PhoneReorder";
import "./grid.css";

/** Renders of the grid layer (the perf test asserts a drag doesn't re-render per move). */
export const gridLayerRenders = { count: 0 };

/** Extra row lines drawn below the last row: rows grow when blocks are dragged down. */
const EXTRA_ROWS = 6;

interface GridLayerProps {
  frameDoc: Document | null;
  scale: number;
  width: number;
  height: number;
  /** Override canvas measuring (tests). */
  measure?: (sectionId: string) => GridMetrics | null;
}

/** The grid section the person is working in: the dragged one, else the selection's. */
function activeSection(
  doc: SiteDocument,
  pageId: string,
  selection: readonly SelItem[],
  dragging: string | undefined,
): GridSection | undefined {
  const first = dragging ? { kind: "section" as const, id: dragging } : selection[0];
  if (!first) return undefined;
  const loc = locate(doc, pageId, first);
  return loc && isGridSection(loc.section) ? loc.section : undefined;
}

/**
 * Grid editing on the canvas (Fluid Engine parity): column guides, row lines and bleed tracks
 * for the grid section in focus, 8 resize handles, the drag loop's ghost/guide layers, a live
 * text-overlap warning, and a small grid bar (stacking order, trim rows, tablet override,
 * phone layout reset). On a phone-sized Studio it shows only the simplified reorder list.
 */
export function GridLayer({ frameDoc, scale, width, height, measure }: GridLayerProps) {
  gridLayerRenders.count++;
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const selection = useDocStore((s) => s.selection);
  const editing = useDocStore((s) => s.editing);
  const device = useEditorUi((s) => s.breakpoint);
  const role = useInspectorRole();
  const phone = usePhoneViewport();
  const active = useGridDrag((s) => s.active);

  const rootRef = useRef<HTMLDivElement>(null);
  const ghostsRef = useRef<HTMLDivElement>(null);
  const guidesRef = useRef<HTMLDivElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);

  // Hand the drag loop what it needs (no state: read at pointer time).
  useLayoutEffect(() => {
    gridController.ctx = {
      frameDoc,
      scale,
      store: api,
      device,
      role,
      phone,
      overlay: rootRef.current,
      layers: {
        ghosts: ghostsRef.current,
        guides: guidesRef.current,
        marquee: marqueeRef.current,
        badge: badgeRef.current,
        readout: readoutRef.current,
      },
      ...(measure ? { measure: (id: string) => measure(id) } : {}),
    };
  });
  useEffect(
    () => () => {
      if (gridController.ctx?.store === api) {
        gridController.cancel();
        gridController.ctx = null;
      }
    },
    [api],
  );

  const section = activeSection(doc, pageId, selection, active?.sectionId);
  const view = VIEW_BP[device];
  const metrics = section
    ? measure
      ? measure(section.id)
      : measureGrid(frameDoc, section.id, view)
    : null;
  const caps = gridCaps(role, section);
  const win = frameDoc?.defaultView;
  const sx = win?.scrollX ?? 0;
  const sy = win?.scrollY ?? 0;
  const toOv = (b: Box): Box => ({
    x: (b.x - sx) * scale,
    y: (b.y - sy) * scale,
    w: b.w * scale,
    h: b.h * scale,
  });

  const rects = section ? displayRects(section.layout, view) : new Map<string, GridRect>();
  const selectedIds = selection
    .filter((i) => i.kind === "block" && rects.has(i.id))
    .map((i) => i.id);
  const single = selectedIds.length === 1 && selection.length === 1 ? selectedIds[0] : undefined;
  const singleRect = single ? rects.get(single) : undefined;
  const overlapping = section && single ? textOverlaps(section, rects, [single]).length > 0 : false;

  const chrome = Boolean(section && metrics && !phone);
  const showHandles =
    chrome && caps.edit && single && singleRect && !editing && active?.kind !== "move";

  return (
    <div
      ref={rootRef}
      className={cx("st-grid", active && `is-${active.kind}`)}
      style={{ width, height }}
      data-grid-active={active?.kind}
    >
      <div className="st-grid__clip">
        {chrome && metrics && section && (
          <GridLines metrics={metrics} toOv={toOv} rows={rows(section, view)} />
        )}
        {showHandles && metrics && singleRect && single && (
          <Handles id={single} box={toOv(rectBox(metrics, singleRect))} />
        )}
        {chrome && metrics && single && singleRect && overlapping && !active && (
          <span
            className="st-grid__badge"
            style={{
              transform: `translate(${toOv(rectBox(metrics, singleRect)).x}px, ${Math.max(
                0,
                toOv(rectBox(metrics, singleRect)).y - 26,
              )}px)`,
            }}
          >
            <TriangleAlert aria-hidden="true" /> Text overlaps text
          </span>
        )}
        <div ref={ghostsRef} className="st-grid__ghosts" />
        <div ref={guidesRef} className="st-grid__guides" />
        <div ref={marqueeRef} className="st-grid__marquee" style={{ display: "none" }} />
        <div ref={readoutRef} className="st-grid__readout st-num" style={{ display: "none" }} />
        <div
          ref={badgeRef}
          className="st-grid__badge st-grid__badge--live"
          role="status"
          style={{ display: "none" }}
        >
          <TriangleAlert aria-hidden="true" /> Text overlaps text
        </div>
      </div>
      {section && !active && !editing && (
        <GridBar
          section={section}
          frameDoc={frameDoc}
          scale={scale}
          width={width}
          height={height}
          phone={phone}
          selectedIds={selectedIds}
        />
      )}
    </div>
  );
}

function rows(section: GridSection, view: "d" | "t" | "m"): number {
  const r = section.layout.rows;
  return view === "d" ? r.d : view === "t" ? (r.t ?? r.d) : (r.m ?? r.t ?? r.d);
}

/** Column guides, row unit lines and the bleed tracks of one grid section. */
function GridLines({
  metrics: m,
  toOv,
  rows: rowCount,
}: {
  metrics: GridMetrics;
  toOv: (b: Box) => Box;
  rows: number;
}) {
  const total = Math.max(rowCount, m.rowStarts.length);
  const top = m.top;
  const bottom = rowEnd(m, total + EXTRA_ROWS);
  const live = rowEnd(m, total);
  const area = toOv({ x: m.fullStart, y: top, w: m.fullEnd - m.fullStart, h: bottom - top });
  const cols = Array.from({ length: m.cols }, (_, i) =>
    toOv({
      x: colStart(m, i + 1),
      y: top,
      w: colEnd(m, i + 1) - colStart(m, i + 1),
      h: live - top,
    }),
  );
  const lines = Array.from({ length: total + EXTRA_ROWS + 1 }, (_, i) => ({
    y: toOv({ x: 0, y: i === 0 ? top : rowEnd(m, i), w: 0, h: 0 }).y,
    extra: i > total,
  }));
  const left = toOv({ x: m.fullStart, y: top, w: colStart(m, 1) - m.fullStart, h: live - top });
  const right = toOv({
    x: colEnd(m, m.cols),
    y: top,
    w: m.fullEnd - colEnd(m, m.cols),
    h: live - top,
  });
  const box = (b: Box): CSSProperties => ({
    transform: `translate(${b.x}px, ${b.y}px)`,
    width: Math.max(0, b.w),
    height: Math.max(0, b.h),
  });
  return (
    <div className="st-grid__lines" aria-hidden="true" data-cols={m.cols}>
      <i className="st-grid__bleed" style={box(left)} />
      <i className="st-grid__bleed" style={box(right)} />
      {cols.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
        <i key={`c${i}`} className="st-grid__col" style={box(c)} />
      ))}
      {lines.map((l, i) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
          key={`r${i}`}
          className={cx("st-grid__row", l.extra && "is-extra")}
          style={{ transform: `translate(${area.x}px, ${l.y}px)`, width: area.w }}
        />
      ))}
    </div>
  );
}

const HANDLE_LABEL: Record<Handle, string> = {
  n: "Resize from the top",
  s: "Resize from the bottom",
  e: "Resize from the right",
  w: "Resize from the left",
  ne: "Resize from the top right",
  nw: "Resize from the top left",
  se: "Resize from the bottom right",
  sw: "Resize from the bottom left",
};

function Handles({ id, box }: { id: string; box: Box }) {
  return (
    <div
      className="st-grid__handles"
      style={{
        transform: `translate(${Math.round(box.x)}px, ${Math.round(box.y)}px)`,
        width: Math.round(box.w),
        height: Math.round(box.h),
      }}
    >
      {HANDLES.map((h) => (
        <span
          key={h}
          className="st-grid__handle"
          data-pos={h}
          role="presentation"
          title={HANDLE_LABEL[h]}
          onPointerDown={(e) => {
            gridController.pointerDownOnHandle(e.nativeEvent, id, h);
          }}
        />
      ))}
    </div>
  );
}

const BP_NAME = { d: "Desktop", t: "Tablet", m: "Phone" } as const;

function GridBar({
  section,
  frameDoc,
  scale,
  width,
  height,
  phone,
  selectedIds,
}: {
  section: GridSection;
  frameDoc: Document | null;
  scale: number;
  width: number;
  height: number;
  phone: boolean;
  selectedIds: string[];
}) {
  const api = useDocStoreApi();
  const pageId = useDocStore((s) => s.pageId);
  const device = useEditorUi((s) => s.breakpoint);
  const role = useInspectorRole();
  const caps = gridCaps(role, section);
  const [reorderOpen, setReorderOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.offsetWidth !== w) setW(el.offsetWidth);
  });
  const rect = rectFor(frameDoc, { kind: "section", id: section.id }, scale);
  if (!rect || rect.y + rect.h < 0 || rect.y > height) return null;
  const view = VIEW_BP[device];
  const bp = editBp(device, section.layout);
  const s = () => api.getState();
  const run = (cmd: Parameters<ReturnType<typeof s>["run"]>[0]) => s().run(cmd);
  const top = Math.max(4, Math.min(rect.y + rect.h - 40, height - 40));
  const left = Math.max(4, Math.min(rect.x + 8, width - w - 4));
  const style: CSSProperties = {
    transform: `translate(${Math.round(left)}px, ${Math.round(top)}px)`,
  };

  if (phone) {
    return (
      <div ref={ref} className="st-grid__bar" style={style}>
        <Button
          size="sm"
          variant="secondary"
          icon={<ListOrdered />}
          onClick={() => setReorderOpen(true)}
        >
          Reorder blocks
        </Button>
        <PhoneReorder section={section} open={reorderOpen} onOpenChange={setReorderOpen} />
      </div>
    );
  }

  const zBtn = (action: ZAction, label: string, shortcut: string, icon: ReactNode) => (
    <IconButton
      size="sm"
      label={label}
      shortcut={shortcut}
      icon={icon}
      disabled={!caps.edit || !selectedIds.length}
      onClick={() => run(zOrderCommand(s().doc, s().pageId, s().selection, action, bp))}
    />
  );
  const empty = emptyTrailingRows(section.layout, view === "t" && bp === "d" ? "d" : view);
  const auto = view === "m" ? isMobileAuto(section) : true;
  const customized = tabletCustomized(section.layout);
  return (
    <div ref={ref} className="st-grid__bar" style={style} role="toolbar" aria-label="Grid">
      <span className="st-grid__bar-label">
        Grid · {BP_NAME[view]}
        {view === "t" && !customized && <em> follows desktop</em>}
        {view === "m" && <em> {auto ? "automatic" : "custom"}</em>}
      </span>
      {!caps.edit ? (
        <span className="st-grid__bar-note">{caps.reason}</span>
      ) : (
        <>
          {selectedIds.length > 0 && (
            <>
              {zBtn("forward", "Bring forward", "mod+]", <BringToFront />)}
              {zBtn("backward", "Send backward", "mod+[", <SendToBack />)}
            </>
          )}
          {view === "t" && (
            <span className="st-grid__bar-toggle">
              <Toggle
                size="sm"
                id="st-grid-tablet"
                checked={customized}
                onCheckedChange={(on) =>
                  run(customizeTabletCommand(s().doc, pageId, section.id, on))
                }
              />
              <label htmlFor="st-grid-tablet">Customize tablet</label>
            </span>
          )}
          {view === "m" && (
            <Tooltip
              content={
                auto
                  ? "The phone layout already follows desktop"
                  : "Rebuild the phone layout from desktop"
              }
            >
              <Button
                size="sm"
                variant="ghost"
                icon={<RotateCcw />}
                disabled={auto}
                focusableWhenDisabled
                onClick={() => run(resetMobileCommand(s().doc, pageId, section.id))}
              >
                Reset mobile layout
              </Button>
            </Tooltip>
          )}
          {empty > 0 && (
            <Button
              size="sm"
              variant="ghost"
              icon={<ArrowDownToLine />}
              onClick={() => run(trimRowsCommand(s().doc, pageId, section.id))}
            >
              Trim {empty} empty {empty === 1 ? "row" : "rows"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
