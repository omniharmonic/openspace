import {
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
import { type KeyboardEvent, type ReactNode, useState } from "react";
import { cx, IconButton } from "../../../ui";
import { BlockIcon } from "../blockIcons";
import {
  moveBlockTo,
  moveSectionTo,
  renameSection,
  toggleHidden,
  toggleLocked,
} from "../model/actions";
import { useDocStore, useDocStoreApi } from "../model/context";
import { blockLabel, readingOrder, type SelItem, sameItem, sectionLabel } from "../model/selection";

const sid = (id: string) => `s:${id}`;
const bid = (id: string) => `b:${id}`;

/** Where a dragged layer was dropped, as an editor command target (pure, for tests). */
export function dropTarget(
  doc: SiteDocument,
  pageId: string,
  active: string,
  over: string,
):
  | { kind: "section"; section: string; at: { before: string } | { after: string } }
  | {
      kind: "block";
      block: string;
      section: string;
      at: "end" | { before: string } | { after: string };
    }
  | null {
  if (active === over) return null;
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  if (!page) return null;
  const sections = page.sections;
  const [ak, aid] = [active.slice(0, 1), active.slice(2)];
  const [ok, oid] = [over.slice(0, 1), over.slice(2)];
  if (ak === "s") {
    if (ok !== "s") return null;
    const from = sections.findIndex((s) => s.id === aid);
    const to = sections.findIndex((s) => s.id === oid);
    if (from < 0 || to < 0) return null;
    return { kind: "section", section: aid, at: from < to ? { after: oid } : { before: oid } };
  }
  const all = [...sections, doc.site.footer];
  const home = all.find((s) => s.blocks.some((b) => b.id === aid));
  if (!home) return null;
  if (ok === "s") {
    const target = all.find((s) => s.id === oid);
    return target ? { kind: "block", block: aid, section: oid, at: "end" } : null;
  }
  const target = all.find((s) => s.blocks.some((b) => b.id === oid));
  if (!target) return null;
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

function Row({
  id,
  depth,
  item,
  label,
  icon,
  actions,
  dimmed,
  draggable = true,
  expanded,
  onToggle,
  onRename,
}: {
  id: string;
  depth: 0 | 1;
  item: SelItem;
  label: string;
  icon?: ReactNode;
  actions?: ReactNode;
  dimmed?: boolean;
  draggable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onRename?: (name: string) => void;
}) {
  const api = useDocStoreApi();
  const selected = useDocStore((s) => s.selection.some((x) => sameItem(x, item)));
  const hovered = useDocStore((s) => sameItem(s.hover, item));
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !draggable,
  });
  const [renaming, setRenaming] = useState(false);
  const select = (additive: boolean) => api.getState().select(item, { additive });
  return (
    <div
      ref={setNodeRef}
      className={cx(
        "st-layer",
        `st-layer--d${depth}`,
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
        >
          <GripVertical aria-hidden="true" />
        </button>
      ) : (
        <span className="st-layer__grip" />
      )}
      {onToggle ? (
        <button
          type="button"
          className={cx("st-layer__twisty", expanded && "is-open")}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      ) : (
        <span className="st-layer__twisty" />
      )}
      {renaming && onRename ? (
        <input
          className="st-layer__rename"
          aria-label="Section name"
          defaultValue={label}
          // biome-ignore lint/a11y/noAutofocus: renaming starts by double-clicking the name
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={(e) => {
            onRename(e.currentTarget.value);
            setRenaming(false);
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setRenaming(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="st-layer__name"
          aria-pressed={selected}
          onClick={(e) => select(e.shiftKey)}
          onDoubleClick={() => onRename && setRenaming(true)}
          onKeyDown={(e) => {
            if (e.key === "F2" && onRename) setRenaming(true);
          }}
          title={onRename ? "Double-click to rename" : undefined}
        >
          {icon}
          <span>{label}</span>
        </button>
      )}
      <span className="st-layer__actions">{actions}</span>
    </div>
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
    <li className="st-layers__section">
      <Row
        id={sid(section.id)}
        depth={0}
        item={{ kind: "section", id: section.id }}
        label={label}
        dimmed={section.hidden}
        draggable={!isFooter}
        expanded={open}
        onToggle={blocks.length ? () => setOpen((o) => !o) : undefined}
        onRename={(name) => run((d, p) => renameSection(d, p, section, name))}
        actions={
          <>
            {!isFooter && (
              <IconButton
                size="sm"
                label={section.hidden ? "Show section" : "Hide section"}
                icon={section.hidden ? <EyeOff /> : <Eye />}
                active={section.hidden ? true : undefined}
                className={cx(section.hidden && "is-on")}
                onClick={() => run((d, p) => toggleHidden(d, p, section))}
              />
            )}
            <IconButton
              size="sm"
              label={section.locked ? "Unlock for editors" : "Lock for editors"}
              icon={section.locked ? <Lock /> : <LockOpen />}
              active={section.locked ? true : undefined}
              className={cx(section.locked && "is-on")}
              onClick={() => run((d, p) => toggleLocked(d, p, section))}
            />
          </>
        }
      />
      {open && blocks.length > 0 && (
        <SortableContext
          items={blocks.map((b) => bid(b.id))}
          strategy={verticalListSortingStrategy}
        >
          <ul>
            {blocks.map((b: Block) => (
              <li key={b.id}>
                <Row
                  id={bid(b.id)}
                  depth={1}
                  item={{ kind: "block", id: b.id }}
                  label={blockLabel(b.type)}
                  icon={<BlockIcon type={b.type} />}
                  dimmed={section.hidden}
                />
              </li>
            ))}
          </ul>
        </SortableContext>
      )}
    </li>
  );
}

/**
 * Layers: the page's sections and their blocks (footer last). Drag to reorder sections, or
 * blocks within and across sections; toggle visibility and editor locks; double-click a
 * section to rename it.
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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={page.sections.map((s) => sid(s.id))}
          strategy={verticalListSortingStrategy}
        >
          <ul className="st-layers__tree" aria-label="Sections and blocks">
            {page.sections.map((section, i) => (
              <SectionLayer
                key={section.id}
                doc={doc}
                section={section}
                index={i}
                isFooter={false}
              />
            ))}
          </ul>
        </SortableContext>
        <ul className="st-layers__tree st-layers__tree--footer" aria-label="Footer">
          <SortableContext items={[sid(doc.site.footer.id)]}>
            <SectionLayer
              doc={doc}
              section={doc.site.footer}
              index={page.sections.length}
              isFooter
            />
          </SortableContext>
        </ul>
      </DndContext>
      <p className="st-layers__note">
        Blocks are named by type. Rename sections by double-clicking them.
      </p>
    </div>
  );
}
