import { FOOTER, type Position } from "@openspace/ops";
import { compiledStylesFor } from "@openspace/renderer";
import { COLOR_THEMES, type ColorTheme, type Section } from "@openspace/schema";
import {
  ArrowDown,
  ArrowUp,
  CopyPlus,
  Eye,
  EyeOff,
  LayoutDashboard,
  Paintbrush,
  Pencil,
  Plus,
  Rows3,
  Sparkles,
  Trash,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cx, IconButton, Menu, Popover, Segmented, toast } from "../../../ui";
import { BlockIcon } from "../blockIcons";
import { useEditorUi } from "../editor-store";
import {
  deleteItems,
  duplicateItems,
  insertSection,
  moveItems,
  setLayoutMode,
  setSectionTheme,
  toggleHidden,
} from "../model/actions";
import { useDocStore, useDocStoreApi } from "../model/context";
import {
  blockLabel,
  blockName,
  locate,
  type SelItem,
  sameItem,
  sectionLabel,
} from "../model/selection";
import { STARTERS } from "../model/starters";
import { THEME_LABEL } from "../model/themes";
import { hasEditableText } from "../text/fields";
import { TextToolbar } from "../text/TextToolbar";
import { cssSize, elementFor, overlayPointer, type Rect, rectFor, useFrameTick } from "./geometry";

interface OverlayProps {
  frameDoc: Document | null;
  scale: number;
  /** Visible frame size in Studio pixels. */
  width: number;
  height: number;
}

const visible = (r: Rect | null, h: number): r is Rect => Boolean(r && r.y + r.h >= 0 && r.y <= h);

/**
 * Canvas chrome drawn in the Studio document over the iframe: hover outlines with labels,
 * selection boxes with handles and a size readout, the floating block/section/text toolbars
 * and the "+" affordances between sections.
 */
export function Overlay({ frameDoc, scale, width, height }: OverlayProps) {
  const api = useDocStoreApi();
  const version = useDocStore((s) => s.version);
  const pageId = useDocStore((s) => s.pageId);
  const hover = useDocStore((s) => s.hover);
  const selection = useDocStore((s) => s.selection);
  const editing = useDocStore((s) => s.editing);
  const editingKind = useDocStore((s) => (s.editing ? (s.editingField?.kind ?? null) : null));
  const doc = useDocStore((s) => s.doc);
  useFrameTick(frameDoc, [version, scale, pageId]);

  const hoverRect =
    hover && !selection.some((s) => sameItem(s, hover)) ? rectFor(frameDoc, hover, scale) : null;
  const single = selection.length === 1 ? selection[0] : undefined;
  const singleLoc = single ? locate(doc, pageId, single) : undefined;

  // The section that gets "+" affordances: hovered, else the selection's.
  const focusSection: SelItem | undefined = (() => {
    const item = hover ?? single;
    if (!item) return undefined;
    const loc = locate(doc, pageId, item);
    return loc ? { kind: "section", id: loc.section.id } : undefined;
  })();
  const focusLoc = focusSection ? locate(doc, pageId, focusSection) : undefined;
  const focusRect = focusSection ? rectFor(frameDoc, focusSection, scale) : null;

  return (
    <div
      className="st-ov"
      style={{ width, height }}
      onPointerOver={(e) => {
        if (e.target !== e.currentTarget) overlayPointer.inside = true;
      }}
      onPointerOut={(e) => {
        overlayPointer.inside = false;
        const to = e.relatedTarget as Element | null;
        // Back onto the page (the iframe) or onto other chrome: the hover carries on.
        if (to?.tagName === "IFRAME" || to?.closest?.(".st-ov")) return;
        api.getState().setHover(null);
      }}
    >
      <div className="st-ov__clip">
        {visible(hoverRect, height) && hover && (
          <Outline rect={hoverRect} kind={hover.kind} variant="hover">
            <span className="st-ov__tag">
              {hover.kind === "block" ? (
                <>
                  <BlockIcon type={locate(doc, pageId, hover)?.block?.type ?? ""} />
                  {(() => {
                    const b = locate(doc, pageId, hover)?.block;
                    return b ? blockName(b) : "";
                  })()}
                </>
              ) : (
                (() => {
                  const loc = locate(doc, pageId, hover);
                  return loc ? sectionLabel(doc, loc.section, loc.sectionIndex) : "";
                })()
              )}
            </span>
          </Outline>
        )}
        {selection.map((item) => {
          const r = rectFor(frameDoc, item, scale);
          if (!visible(r, height)) return null;
          const size = selection.length === 1 && !editing ? cssSize(frameDoc, item) : null;
          return (
            <Outline
              key={`${item.kind}:${item.id}`}
              rect={r}
              kind={item.kind}
              variant={editing === item.id ? "editing-block" : "selected"}
              handles={selection.length === 1 && !editing}
            >
              {size && (
                <span className="st-ov__size st-num">
                  {size.w} × {size.h}
                </span>
              )}
            </Outline>
          );
        })}
      </div>

      {focusLoc && focusRect && visible(focusRect, height) && !editing && (
        <AddSectionAffordances
          section={focusLoc.section}
          isFooter={focusLoc.container === FOOTER}
          rect={focusRect}
          height={height}
        />
      )}

      {single &&
        singleLoc &&
        !editing &&
        (() => {
          const r = rectFor(frameDoc, single, scale);
          if (!visible(r, height)) return null;
          return single.kind === "block" ? (
            <Floating rect={r} width={width} height={height} placement="above">
              <BlockToolbar item={single} />
            </Floating>
          ) : (
            <Floating rect={r} width={width} height={height} placement="inside-top">
              <SectionToolbar section={singleLoc.section} frameDoc={frameDoc} />
            </Floating>
          );
        })()}

      {editing &&
        (() => {
          const field = frameDoc?.querySelector("[data-os-editing-field]");
          const fr = field?.getBoundingClientRect();
          const r = fr
            ? { x: fr.left * scale, y: fr.top * scale, w: fr.width * scale, h: fr.height * scale }
            : rectFor(frameDoc, { kind: "block", id: editing }, scale);
          if (!visible(r, height)) return null;
          return (
            <>
              <div className="st-ov__clip">
                <Outline rect={r} kind="block" variant="editing" />
              </div>
              {editingKind === "rich" && (
                <Floating rect={r} width={width} height={height} placement="above">
                  <TextToolbar />
                </Floating>
              )}
            </>
          );
        })()}
    </div>
  );
}

function Outline({
  rect,
  kind,
  variant,
  handles,
  children,
}: {
  rect: Rect;
  kind: SelItem["kind"];
  variant: "hover" | "selected" | "editing" | "editing-block";
  handles?: boolean;
  children?: ReactNode;
}) {
  const style: CSSProperties = {
    transform: `translate(${Math.round(rect.x)}px, ${Math.round(rect.y)}px)`,
    width: Math.round(rect.w),
    height: Math.round(rect.h),
  };
  return (
    <div
      className={cx("st-ov__box", `st-ov__box--${variant}`, `st-ov__box--${kind}`)}
      style={style}
    >
      {handles && (
        <>
          <i className="st-ov__handle" data-pos="nw" />
          <i className="st-ov__handle" data-pos="ne" />
          <i className="st-ov__handle" data-pos="sw" />
          <i className="st-ov__handle" data-pos="se" />
        </>
      )}
      {children}
    </div>
  );
}

/** Positions a toolbar relative to a rect, clamped inside the frame. */
function Floating({
  rect,
  width,
  height,
  placement,
  children,
}: {
  rect: Rect;
  width: number;
  height: number;
  placement: "above" | "inside-top";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 36 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight || 36;
    if (w !== size.w || h !== size.h) setSize({ w, h });
  });
  const gap = 8;
  let top: number;
  let left: number;
  if (placement === "above") {
    top = rect.y - size.h - gap;
    if (top < 4) top = Math.min(rect.y + rect.h + gap, height - size.h - 4);
    if (top < 4) top = 4;
    left = rect.x;
  } else {
    top = Math.max(rect.y, 0) + gap;
    left = rect.x + rect.w - size.w - gap;
  }
  left = Math.max(4, Math.min(left, width - size.w - 4));
  top = Math.max(4, Math.min(top, height - size.h - 4));
  return (
    <div
      ref={ref}
      className="st-ov__floating"
      style={{ transform: `translate(${Math.round(left)}px, ${Math.round(top)}px)` }}
    >
      {children}
    </div>
  );
}

function Bar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="st-ov__bar" role="toolbar" aria-label={label}>
      {children}
    </div>
  );
}

const Sep = () => <span className="st-ov__sep" aria-hidden="true" />;

function BlockToolbar({ item }: { item: SelItem }) {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const loc = locate(doc, pageId, item);
  const block = loc?.block;
  if (!loc || !block) return null;
  const s = () => api.getState();
  const items = [item];
  return (
    <Bar label={`${blockLabel(block.type)} block`}>
      <span className="st-ov__title">
        <BlockIcon type={block.type} />
        {blockName(block)}
      </span>
      <Sep />
      {hasEditableText(block) && (
        <IconButton
          size="sm"
          label="Edit text"
          shortcut="enter"
          icon={<Pencil />}
          onClick={() => s().setEditing(block.id)}
        />
      )}
      <IconButton
        size="sm"
        label="Style"
        icon={<Paintbrush />}
        onClick={() => useEditorUi.setState({ inspectorOpen: true, chromeHidden: false })}
      />
      <IconButton
        size="sm"
        label="Duplicate"
        shortcut="mod+d"
        icon={<CopyPlus />}
        onClick={() => s().run(duplicateItems(s().doc, s().pageId, items))}
      />
      <IconButton
        size="sm"
        label="Move up"
        shortcut="alt+arrowup"
        icon={<ArrowUp />}
        onClick={() => s().run(moveItems(s().doc, s().pageId, items, -1))}
      />
      <IconButton
        size="sm"
        label="Move down"
        shortcut="alt+arrowdown"
        icon={<ArrowDown />}
        onClick={() => s().run(moveItems(s().doc, s().pageId, items, 1))}
      />
      <IconButton
        size="sm"
        label="Delete"
        shortcut="backspace"
        icon={<Trash />}
        onClick={() => s().run(deleteItems(s().doc, s().pageId, items))}
      />
      <Sep />
      <IconButton
        size="sm"
        label="Ask AI"
        icon={<Sparkles />}
        onClick={() =>
          toast({
            title: "Ask your AI about this block",
            description: `Connect your AI from the site menu, then ask it to change “${blockName(block)}” on ${doc.pages[pageId as never]?.title ?? "this page"}.`,
          })
        }
      />
    </Bar>
  );
}

function ThemeSwatch({ theme }: { theme: ColorTheme }) {
  const doc = useDocStore((s) => s.doc);
  const colors = useMemo(() => compiledStylesFor(doc.styles).tokens.themes, [doc.styles]);
  const c = colors[theme] as unknown as Record<string, string>;
  return (
    <span
      className="st-ov__swatch"
      style={{ background: c.background, color: c.accent, borderColor: c.border }}
      aria-hidden="true"
    >
      <i style={{ background: c.text }} />
    </span>
  );
}

function SectionToolbar({ section, frameDoc }: { section: Section; frameDoc: Document | null }) {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const loc = locate(doc, pageId, { kind: "section", id: section.id });
  if (!loc) return null;
  const isFooter = loc.container === FOOTER;
  const s = () => api.getState();
  const items: SelItem[] = [{ kind: "section", id: section.id }];
  const theme = section.style.colorTheme ?? "light";
  const measure = (id: string) => {
    const el = elementFor(frameDoc, { kind: "block", id });
    return el ? el.getBoundingClientRect().height : undefined;
  };
  return (
    <Bar label={`${sectionLabel(doc, section, loc.sectionIndex)} section`}>
      <span className="st-ov__title">{sectionLabel(doc, section, loc.sectionIndex)}</span>
      <Sep />
      {!isFooter && (
        <>
          <IconButton
            size="sm"
            label="Move up"
            shortcut="alt+arrowup"
            icon={<ArrowUp />}
            onClick={() => s().run(moveItems(s().doc, s().pageId, items, -1))}
          />
          <IconButton
            size="sm"
            label="Move down"
            shortcut="alt+arrowdown"
            icon={<ArrowDown />}
            onClick={() => s().run(moveItems(s().doc, s().pageId, items, 1))}
          />
          <IconButton
            size="sm"
            label="Duplicate"
            shortcut="mod+d"
            icon={<CopyPlus />}
            onClick={() => s().run(duplicateItems(s().doc, s().pageId, items))}
          />
          <IconButton
            size="sm"
            label={section.hidden ? "Show section" : "Hide section"}
            icon={section.hidden ? <EyeOff /> : <Eye />}
            active={section.hidden ? true : undefined}
            onClick={() => s().run(toggleHidden(s().doc, s().pageId, section))}
          />
        </>
      )}
      <Menu
        label="Color theme"
        trigger={
          <button
            type="button"
            className="st-ov__theme"
            aria-label={`Color theme: ${THEME_LABEL[theme]}`}
          >
            <ThemeSwatch theme={theme} />
          </button>
        }
        items={COLOR_THEMES.map((t) => ({
          type: "checkbox" as const,
          label: THEME_LABEL[t],
          checked: t === theme,
          onCheckedChange: () => {
            s().run(setSectionTheme(s().doc, s().pageId, section, t));
          },
        }))}
      />
      <Segmented<"stack" | "grid">
        aria-label="Layout"
        size="sm"
        value={section.layout.mode}
        onValueChange={(mode) =>
          s().run(setLayoutMode(s().doc, s().pageId, section.id, mode, measure))
        }
        options={[
          { value: "stack", label: <Rows3 />, ariaLabel: "Stack layout" },
          { value: "grid", label: <LayoutDashboard />, ariaLabel: "Grid layout" },
        ]}
      />
      {!isFooter && (
        <>
          <Sep />
          <IconButton
            size="sm"
            label="Delete section"
            shortcut="backspace"
            icon={<Trash />}
            onClick={() => s().run(deleteItems(s().doc, s().pageId, items))}
          />
        </>
      )}
    </Bar>
  );
}

function AddSectionAffordances({
  section,
  isFooter,
  rect,
  height,
}: {
  section: Section;
  isFooter: boolean;
  rect: Rect;
  height: number;
}) {
  const edges: Array<{ y: number; at: Position; label: string }> = [];
  if (isFooter) edges.push({ y: rect.y, at: "end", label: "Add a section above the footer" });
  else {
    edges.push({ y: rect.y, at: { before: section.id }, label: "Add a section above" });
    edges.push({ y: rect.y + rect.h, at: { after: section.id }, label: "Add a section below" });
  }
  return (
    <>
      {edges
        .filter((e) => e.y > -12 && e.y < height + 12)
        .map((e) => (
          <AddSectionButton key={e.label} y={e.y} x={rect.x} w={rect.w} at={e.at} label={e.label} />
        ))}
    </>
  );
}

function AddSectionButton({
  x,
  y,
  w,
  at,
  label,
}: {
  x: number;
  y: number;
  w: number;
  at: Position;
  label: string;
}) {
  const api = useDocStoreApi();
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cx("st-ov__add", open && "is-open")}
      style={{
        transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)`,
        width: Math.round(w),
      }}
    >
      <span className="st-ov__add-line" aria-hidden="true" />
      <Popover
        open={open}
        onOpenChange={setOpen}
        title="Add a section"
        width={280}
        trigger={
          <button type="button" className="st-ov__add-btn" aria-label={label}>
            <Plus aria-hidden="true" />
          </button>
        }
      >
        <ul className="st-ov__starters">
          {STARTERS.map((st) => (
            <li key={st.id}>
              <button
                type="button"
                onClick={() => {
                  const s = api.getState();
                  s.run(insertSection(s.pageId, st.build(), at));
                  setOpen(false);
                }}
              >
                <strong>{st.label}</strong>
                <span>{st.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  );
}
