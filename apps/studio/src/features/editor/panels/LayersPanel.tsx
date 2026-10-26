import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block, Section, SiteDocument } from "@openspace/schema";
import { ChevronRight, Eye, EyeOff, GripVertical, Lock, LockOpen } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { cx, IconButton } from "../../../ui";
import { BlockIcon } from "../blockIcons";
import {
  deleteItems,
  moveBlockTo,
  moveItems,
  moveSectionTo,
  renameBlock,
  renameSection,
  toggleBlockHidden,
  toggleHidden,
  toggleLocked,
} from "../model/actions";
import { useDocStore, useDocStoreApi } from "../model/context";
import { blockName, readingOrder, type SelItem, sameItem, sectionLabel } from "../model/selection";

const sid = (id: string) => `s:${id}`;
const bid = (id: string) => `b:${id}`;

export type DropTarget =
  | { kind: "section"; section: string; at: { before: string } | { after: string } }
  | {
      kind: "block";
      block: string;
      section: string;
      at: "end" | { before: string } | { after: string };
    };

/**
 * Where a dragged layer was dropped, as an editor command target (pure, for tests). A section
 * dropped onto one of another section's blocks counts as dropped onto that section; blocks of
 * grid sections are arranged on the canvas, not by order, so they don't move here.
 */
export function dropTarget(
  doc: SiteDocument,
  pageId: string,
  active: string,
  over: string,
): DropTarget | null {
  if (active === over) return null;
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  if (!page) return null;
  const sections = page.sections;
  const all = [...sections, doc.site.footer];
  const [ak, aid] = [active.slice(0, 1), active.slice(2)];
  let [ok, oid] = [over.slice(0, 1), over.slice(2)];
  if (ak === "s") {
    if (ok === "b") {
      const parent = all.find((s) => s.blocks.some((b) => b.id === oid));
      if (!parent) return null;
      [ok, oid] = ["s", parent.id];
    }
    const from = sections.findIndex((s) => s.id === aid);
    const to = sections.findIndex((s) => s.id === oid);
    if (from < 0 || to < 0 || from === to) return null;
    return { kind: "section", section: aid, at: from < to ? { after: oid } : { before: oid } };
  }
  const home = all.find((s) => s.blocks.some((b) => b.id === aid));
  if (!home || home.layout.mode === "grid") return null;
  if (ok === "s") {
    const target = all.find((s) => s.id === oid);
    return target && target.id !== home.id && target.layout.mode === "stack"
      ? { kind: "block", block: aid, section: oid, at: "end" }
      : null;
  }
  const target = all.find((s) => s.blocks.some((b) => b.id === oid));
  if (!target || target.layout.mode === "grid") return null;
  if (target.id === home.id) {
    const order: string[] = readingOrder(home).map((b) => b.id);
    const from = order.indexOf(aid);
    const to = order.indexOf(oid);
    return {
      kind: "block",
      block: aid,
      section: target.id,
      at: from < to ? { after: oid } : { before: oid },
    };
  }
  return { kind: "block", block: aid, section: target.id, at: { before: oid } };
}

/**
 * Collisions only against layers a drag can land on: sections against sections; blocks
 * against blocks and section rows. (One shared context otherwise lets a section "hit" the
 * nearest block row and the drop does nothing.)
 */
export const layerCollisions: CollisionDetection = (args) => {
  const kind = String(args.active.id).slice(0, 1);
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => {
      const k = String(c.id).slice(0, 1);
      return kind === "s" ? k === "s" : true;
    }),
  });
};

/** Arrow-key navigation across the visible rows of the tree (roving focus). */
function onTreeKey(e: KeyboardEvent<HTMLElement>) {
  const row = (e.target as HTMLElement).closest<HTMLElement>("[role=treeitem]");
  const tree = e.currentTarget;
  if (!row || (e.target as HTMLElement).tagName === "INPUT") return;
  const rows = [...tree.querySelectorAll<HTMLElement>("[role=treeitem]")];
  const i = rows.indexOf(row);
  const go = (j: number) => {
    const next = rows[Math.max(0, Math.min(rows.length - 1, j))];
    if (!next) return;
    e.preventDefault();
    next.focus();
    next.click();
  };
  if (e.key === "ArrowDown") go(i + 1);
  else if (e.key === "ArrowUp") go(i - 1);
  else if (e.key === "Home") go(0);
  else if (e.key === "End") go(rows.length - 1);
}

interface RowProps {
  id: string;
  depth: 1 | 2;
  item: SelItem;
  label: string;
  icon?: ReactNode;
  actions?: ReactNode;
  dimmed?: boolean;
  draggable?: boolean;
  dragHint?: string;
  expanded?: boolean;
  onToggle?: () => void;
  onRename: (name: string) => void;
  onDelete?: () => void;
  children?: ReactNode;
}

function Row({
  id,
  depth,
  item,
  label,
  icon,
  actions,
  dimmed,
  draggable = true,
  dragHint,
  expanded,
  onToggle,
  onRename,
  onDelete,
  children,
}: RowProps) {
  const api = useDocStoreApi();
  const selected = useDocStore((s) => s.selection.some((x) => sameItem(x, item)));
  const hovered = useDocStore((s) => sameItem(s.hover, item));
  const first = useDocStore((s) => s.selection.length === 0 && depth === 1);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !draggable,
  });
  const [renaming, setRenaming] = useState(false);
  const self = useRef<HTMLDivElement | null>(null);
  return (
    <div
      role="treeitem"
      aria-level={depth}
      aria-selected={selected}
      aria-expanded={onToggle ? Boolean(expanded) : undefined}
      aria-label={label}
      tabIndex={selected || first ? 0 : -1}
      className="st-layer__item"
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          // Keyboard reordering (⌥↑/⌥↓), the same as on the canvas.
          e.preventDefault();
          e.stopPropagation();
          const s = api.getState();
          s.run(moveItems(s.doc, s.pageId, [item], e.key === "ArrowUp" ? -1 : 1));
          requestAnimationFrame(() => self.current?.focus());
          return;
        }
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          setRenaming(true);
        } else if ((e.key === "Backspace" || e.key === "Delete") && onDelete) {
          e.preventDefault();
          onDelete();
        } else if (e.key === "ArrowRight" && onToggle && !expanded) {
          e.preventDefault();
          onToggle();
        } else if (e.key === "ArrowLeft" && onToggle && expanded) {
          e.preventDefault();
          onToggle();
        }
      }}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest("[role=treeitem]") !== e.currentTarget) return;
        if (
          t === e.currentTarget ||
          t.closest(".st-layer__name") ||
          t.classList.contains("st-layer")
        )
          api.getState().select(item, { additive: e.shiftKey });
      }}
      ref={self}
    >
      <div
        ref={setNodeRef}
        className={cx(
          "st-layer",
          `st-layer--d${depth - 1}`,
          selected && "is-selected",
          hovered && "is-hovered",
          dimmed && "is-dimmed",
          isDragging && "is-dragging",
        )}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        onPointerEnter={() => api.getState().setHover(item)}
        onPointerLeave={() => api.getState().setHover(null)}
      >
        {draggable ? (
          <button
            type="button"
            className="st-layer__grip"
            aria-label={`Reorder ${label}`}
            {...attributes}
            {...listeners}
            tabIndex={-1}
          >
            <GripVertical aria-hidden="true" />
          </button>
        ) : (
          <span className="st-layer__grip" title={dragHint} />
        )}
        {onToggle ? (
          <button
            type="button"
            tabIndex={-1}
            className={cx("st-layer__twisty", expanded && "is-open")}
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            onClick={onToggle}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        ) : (
          <span className="st-layer__twisty" />
        )}
        {renaming ? (
          <input
            className="st-layer__rename"
            aria-label={item.kind === "section" ? "Section name" : "Block name"}
            defaultValue={label}
            // biome-ignore lint/a11y/noAutofocus: renaming starts by double-clicking the name
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => {
              onRename(e.currentTarget.value);
              setRenaming(false);
              self.current?.focus();
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setRenaming(false);
                self.current?.focus();
              }
            }}
          />
        ) : (
          // biome-ignore lint/a11y/noStaticElementInteractions: double-click is a shortcut; Enter/F2 on the tree item renames too
          <span
            className="st-layer__name"
            onDoubleClick={() => setRenaming(true)}
            title="Double-click to rename"
          >
            {icon}
            <span>{label}</span>
          </span>
        )}
        <span className="st-layer__actions">{actions}</span>
      </div>
      {children}
    </div>
  );
}

function BlockLayer({ section, block }: { section: Section; block: Block }) {
  const api = useDocStoreApi();
  const s = () => api.getState();
  const grid = section.layout.mode === "grid";
  return (
    <Row
      id={bid(block.id)}
      depth={2}
      item={{ kind: "block", id: block.id }}
      label={blockName(block)}
      icon={<BlockIcon type={block.type} />}
      dimmed={section.hidden || block.hidden}
      draggable={!grid}
      dragHint={grid ? "Arrange grid blocks on the canvas" : undefined}
      onRename={(name) => s().run(renameBlock(s().doc, s().pageId, block, name))}
      onDelete={() => s().run(deleteItems(s().doc, s().pageId, [{ kind: "block", id: block.id }]))}
      actions={
        <IconButton
          size="sm"
          tabIndex={-1}
          label={block.hidden ? "Show block" : "Hide block"}
          icon={block.hidden ? <EyeOff /> : <Eye />}
          active={block.hidden ? true : undefined}
          className={cx(block.hidden && "is-on")}
          onClick={() => s().run(toggleBlockHidden(s().doc, s().pageId, block))}
        />
      }
    />
  );
}

function SectionLayer({
  doc,
  section,
  index,
  isFooter,
}: {
  doc: SiteDocument;
  section: Section;
  index: number;
  isFooter: boolean;
}) {
  const api = useDocStoreApi();
  const [open, setOpen] = useState(true);
  const label = sectionLabel(doc, section, index);
  const blocks = readingOrder(section);
  const run = (fn: (d: SiteDocument, p: string) => ReturnType<typeof toggleHidden>) => {
    const s = api.getState();
    s.run(fn(s.doc, s.pageId));
  };
  return (
    <Row
      id={sid(section.id)}
      depth={1}
      item={{ kind: "section", id: section.id }}
      label={label}
      dimmed={section.hidden}
      draggable={!isFooter}
      dragHint={isFooter ? "The footer is always last" : undefined}
      expanded={open}
      onToggle={blocks.length ? () => setOpen((o) => !o) : undefined}
      onRename={(name) => run((d, p) => renameSection(d, p, section, name))}
      onDelete={
        isFooter
          ? undefined
          : () => run((d, p) => deleteItems(d, p, [{ kind: "section", id: section.id }]))
      }
      actions={
        <>
          {!isFooter && (
            <IconButton
              size="sm"
              tabIndex={-1}
              label={section.hidden ? "Show section" : "Hide section"}
              icon={section.hidden ? <EyeOff /> : <Eye />}
              active={section.hidden ? true : undefined}
              className={cx(section.hidden && "is-on")}
              onClick={() => run((d, p) => toggleHidden(d, p, section))}
            />
          )}
          <IconButton
            size="sm"
            tabIndex={-1}
            label={section.locked ? "Unlock for editors" : "Lock for editors"}
            icon={section.locked ? <Lock /> : <LockOpen />}
            active={section.locked ? true : undefined}
            className={cx(section.locked && "is-on")}
            onClick={() => run((d, p) => toggleLocked(d, p, section))}
          />
        </>
      }
    >
      {open && blocks.length > 0 && (
        <SortableContext
          items={blocks.map((b) => bid(b.id))}
          strategy={verticalListSortingStrategy}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: ARIA tree group */}
          <div role="group">
            {blocks.map((b) => (
              <BlockLayer key={b.id} section={section} block={b} />
            ))}
          </div>
        </SortableContext>
      )}
    </Row>
  );
}

/**
 * Layers: the page's sections and their blocks in reading order (footer last), as an ARIA tree.
 * Drag (or arrow-key the grip) to reorder sections, or stack blocks within and across sections;
 * arrows move through rows, Enter or F2 renames, ⌫ deletes; hide blocks and sections, lock
 * sections for editors.
 */
export function LayersPanel() {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (!page) return null;

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const s = api.getState();
    const t = dropTarget(s.doc, s.pageId, String(e.active.id), String(e.over.id));
    if (!t) return;
    if (t.kind === "section") s.run(moveSectionTo(s.pageId, t.section, t.at));
    else s.run(moveBlockTo(s.doc, s.pageId, t.block, { section: t.section, at: t.at }));
  };

  return (
    <div className="st-layers">
      <p className="st-layers__page">{page.title}</p>
      <DndContext sensors={sensors} collisionDetection={layerCollisions} onDragEnd={onDragEnd}>
        <div
          role="tree"
          aria-label="Sections and blocks"
          className="st-layers__tree"
          onKeyDown={onTreeKey}
        >
          <SortableContext
            items={page.sections.map((s) => sid(s.id))}
            strategy={verticalListSortingStrategy}
          >
            {page.sections.map((section, i) => (
              <SectionLayer
                key={section.id}
                doc={doc}
                section={section}
                index={i}
                isFooter={false}
              />
            ))}
          </SortableContext>
          <div className="st-layers__footer">
            <SortableContext items={[sid(doc.site.footer.id)]}>
              <SectionLayer
                doc={doc}
                section={doc.site.footer}
                index={page.sections.length}
                isFooter
              />
            </SortableContext>
          </div>
        </div>
      </DndContext>
      <p className="st-layers__note">
        Double-click a name to rename it. Grid blocks are arranged on the canvas.
      </p>
    </div>
  );
}
