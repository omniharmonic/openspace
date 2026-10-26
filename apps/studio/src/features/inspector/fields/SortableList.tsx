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
import { ArrowDown, ArrowUp, ChevronRight, CopyPlus, GripVertical, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Tooltip } from "../../../ui";

export interface SortableRow {
  title: string;
  badge?: ReactNode;
  body: () => ReactNode;
}

function Row({
  id,
  index,
  count,
  row,
  open,
  onToggle,
  onMove,
  onRemove,
  onDuplicate,
  noun,
  disabled,
}: {
  id: string;
  index: number;
  count: number;
  row: SortableRow;
  open: boolean;
  onToggle: () => void;
  onMove: (from: number, to: number) => void;
  onRemove?: () => void;
  onDuplicate?: () => void;
  noun: string;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      className="st-ip-item"
      data-dragging={isDragging ? "" : undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="st-ip-item__head">
        <button
          type="button"
          className="st-ip-item__grip"
          aria-label={`Reorder ${row.title}`}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" />
        </button>
        <button type="button" className="st-ip-item__title" aria-expanded={open} onClick={onToggle}>
          <ChevronRight
            aria-hidden="true"
            className="st-ip-sec__chev"
            style={{ transform: open ? "rotate(90deg)" : undefined, marginRight: 4 }}
          />
          {row.badge}
          {row.title}
        </button>
        <Tooltip content="Move up">
          <button
            type="button"
            className="st-ip-icon-btn"
            aria-label={`Move ${row.title} up`}
            disabled={disabled || index === 0}
            onClick={() => onMove(index, index - 1)}
          >
            <ArrowUp aria-hidden="true" />
          </button>
        </Tooltip>
        <Tooltip content="Move down">
          <button
            type="button"
            className="st-ip-icon-btn"
            aria-label={`Move ${row.title} down`}
            disabled={disabled || index === count - 1}
            onClick={() => onMove(index, index + 1)}
          >
            <ArrowDown aria-hidden="true" />
          </button>
        </Tooltip>
        {onDuplicate && (
          <Tooltip content={`Duplicate ${noun}`}>
            <button
              type="button"
              className="st-ip-icon-btn"
              aria-label={`Duplicate ${row.title}`}
              disabled={disabled}
              onClick={onDuplicate}
            >
              <CopyPlus aria-hidden="true" />
            </button>
          </Tooltip>
        )}
        {onRemove && (
          <Tooltip content={`Remove ${noun}`}>
            <button
              type="button"
              className="st-ip-icon-btn"
              aria-label={`Remove ${row.title}`}
              disabled={disabled}
              onClick={onRemove}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
      {open && <div className="st-ip-item__body">{row.body()}</div>}
    </li>
  );
}

/**
 * A reorderable list of collapsible rows: drag the grip (pointer or keyboard: space, arrows,
 * space), or use the move buttons. Rows are positional; the open row follows a move.
 */
export function SortableList({
  rows,
  label,
  noun = "item",
  onMove,
  onRemove,
  onDuplicate,
  disabled,
  openIndex,
  onOpenIndex,
}: {
  rows: SortableRow[];
  label: string;
  noun?: string;
  onMove: (from: number, to: number) => void;
  onRemove?: (index: number) => void;
  onDuplicate?: (index: number) => void;
  disabled?: boolean;
  openIndex?: number | null;
  onOpenIndex?: (index: number | null) => void;
}) {
  const [ownOpen, setOwnOpen] = useState<number | null>(null);
  const open = openIndex !== undefined ? openIndex : ownOpen;
  const setOpen = onOpenIndex ?? setOwnOpen;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = rows.map((_, i) => `row-${i}`);
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= rows.length) return;
    onMove(from, to);
    if (open === from) setOpen(to);
    else if (open !== null && from < open && to >= open) setOpen(open - 1);
    else if (open !== null && from > open && to <= open) setOpen(open + 1);
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    move(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="st-ip-list" aria-label={label}>
          {rows.map((row, i) => (
            <Row
              key={ids[i]}
              id={ids[i] as string}
              index={i}
              count={rows.length}
              row={row}
              noun={noun}
              disabled={disabled}
              open={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
              onMove={move}
              {...(onRemove
                ? {
                    onRemove: () => {
                      onRemove(i);
                      if (open === i) setOpen(null);
                      else if (open !== null && open > i) setOpen(open - 1);
                    },
                  }
                : {})}
              {...(onDuplicate ? { onDuplicate: () => onDuplicate(i) } : {})}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
