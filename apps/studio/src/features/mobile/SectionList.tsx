import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
import type { Section, SiteDocument } from "@openspace/schema";
import { EyeOff, GripVertical, LayoutGrid, Lock, PanelTop, Pencil, Plus } from "lucide-react";
import { Button, cx } from "../../ui";
import { useAddSection } from "../add-section/blockMenuStore";
import { moveSectionTo } from "../editor/model/actions";
import { useDocStore, useDocStoreApi } from "../editor/model/context";
import { sectionLabel } from "../editor/model/selection";
import { useInspectorRole } from "../inspector/env";
import { capabilities } from "../inspector/model/permissions";
import "./mobile.css";

import { sectionSummary } from "./helpers";

function SortableSection({
  section,
  index,
  doc,
  canReorder,
  onOpen,
}: {
  section: Section;
  index: number;
  doc: SiteDocument;
  canReorder: boolean;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id, disabled: !canReorder });
  const name = sectionLabel(doc, section, index);
  return (
    <li
      ref={setNodeRef}
      className={cx("st-mob__srow", isDragging && "is-dragging")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="st-mob__grip"
        aria-label={`Reorder ${name}`}
        disabled={!canReorder}
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden="true" />
      </button>
      <button type="button" className="st-mob__row st-mob__row--section" onClick={onOpen}>
        <span className="st-mob__row-text">
          <span className="st-mob__row-title">
            {name}
            {section.hidden && <EyeOff aria-label="Hidden" className="st-mob__flag" />}
            {section.locked && <Lock aria-label="Locked" className="st-mob__flag" />}
            {section.layout.mode === "grid" && (
              <LayoutGrid aria-label="Grid section" className="st-mob__flag" />
            )}
          </span>
          <span className="st-mob__row-sub">{sectionSummary(section)}</span>
        </span>
        <Pencil aria-hidden="true" className="st-mob__chev" />
      </button>
    </li>
  );
}

/** Where a dragged section lands (its final index), or null when nothing moves. */
export function dropIndex(
  ids: readonly string[],
  active: string,
  over: string | null,
): number | null {
  if (!over || active === over || !ids.includes(active)) return null;
  const to = ids.indexOf(over);
  return to < 0 ? null : to;
}

export function SectionList({ onOpen }: { onOpen: (sectionId: string) => void }) {
  const api = useDocStoreApi();
  const doc = useDocStore((s) => s.doc);
  const pageId = useDocStore((s) => s.pageId);
  const role = useInspectorRole();
  const page = doc.pages[pageId as keyof SiteDocument["pages"]];
  const caps = capabilities(role);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (!page) return null;
  const ids = page.sections.map((s) => s.id as string);
  const onDragEnd = (e: DragEndEvent) => {
    const to = dropIndex(ids, String(e.active.id), e.over ? String(e.over.id) : null);
    if (to !== null) api.getState().run(moveSectionTo(pageId, String(e.active.id), to));
  };
  return (
    <div className="st-mob__screen" data-testid="mobile-sections">
      <h1 className="st-mob__h1">{page.title}</h1>
      <p className="st-mob__lede">
        Tap a section to edit its words and photos. Drag the handle to reorder.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="st-mob__list" aria-label={`Sections on ${page.title}`}>
            {page.sections.map((s, i) => (
              <SortableSection
                key={s.id}
                section={s}
                index={i}
                doc={doc}
                canReorder={caps.structure}
                onOpen={() => onOpen(s.id)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <ul className="st-mob__list st-mob__list--footer" aria-label="On every page">
        <li>
          <button type="button" className="st-mob__row" onClick={() => onOpen(doc.site.footer.id)}>
            <PanelTop aria-hidden="true" className="st-mob__row-icon st-mob__flip" />
            <span className="st-mob__row-text">
              <span className="st-mob__row-title">Footer</span>
              <span className="st-mob__row-sub">On every page</span>
            </span>
            <Pencil aria-hidden="true" className="st-mob__chev" />
          </button>
        </li>
      </ul>
      {caps.structure && (
        <div className="st-mob__actions">
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={() => useAddSection.getState().openAt("end")}
          >
            Add section
          </Button>
        </div>
      )}
    </div>
  );
}
